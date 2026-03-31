import { spawn } from "child_process";
import { localhost, logsDir, userDataDir } from "./constants";
import http from "http";
import fs from "fs";

// @ts-ignore
import handler from "serve-handler";
import path from "path";

export async function startFastApiServer(
  directory: string,
  port: number,
  env: FastApiEnv,
  isDev: boolean,
) {
  // Start FastAPI server
  let command: string;
  let args: string[];

  if (isDev) {
    command = "uv";
    args = ["run", "python", "server.py", "--port", port.toString(), "--reload", "true"];
  } else {
    const binary = process.platform === "win32" ? "fastapi.exe" : "fastapi";
    command = path.join(directory, binary);
    args = ["--port", port.toString()];
  }

  const safeLog = (data: Buffer | string, logPath: string) => {
    try {
      fs.appendFileSync(logPath, data);
    } catch {
      /* ignore if logs dir not writable */
    }
  };
  const fastapiLogPath = path.join(logsDir, "fastapi-server.log");

  const fastApiProcess = spawn(
    command,
    args,
    {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
      windowsHide: process.platform === "win32" && !isDev,
    }
  );
  fastApiProcess.stdout.on("data", (data: any) => {
    safeLog(data, fastapiLogPath);
    console.log(`FastAPI: ${data}`);
  });
  fastApiProcess.stderr.on("data", (data: any) => {
    safeLog(data, fastapiLogPath);
    console.error(`FastAPI: ${data}`);
  });
  fastApiProcess.on("error", (err) => {
    safeLog(`Spawn error: ${err.message}\n`, fastapiLogPath);
  });
  return {
    process: fastApiProcess,
    ready: waitForServer(`${localhost}:${port}/docs`),
  };
}

export async function startNextJsServer(
  directory: string,
  port: number,
  env: NextJsEnv,
  isDev: boolean,
) {
  let nextjsProcess;

  if (isDev) {
    // Windows: npm is npm.cmd; spawn() needs a shell or ENOENT.
    nextjsProcess = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "dev", "--", "-p", port.toString()],
      {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...env },
        shell: process.platform === "win32",
      }
    );
    const nextjsLogPath = path.join(logsDir, "nextjs-server.log");
    const safeNextLog = (d: Buffer | string) => {
      try {
        fs.appendFileSync(nextjsLogPath, d);
      } catch {
        /* ignore */
      }
    };
    nextjsProcess.stdout.on("data", (data: any) => {
      safeNextLog(data);
      console.log(`NextJS: ${data}`);
    });
    nextjsProcess.stderr.on("data", (data: any) => {
      safeNextLog(data);
      console.error(`NextJS: ${data}`);
    });
    nextjsProcess.on("error", (err: Error) => {
      safeNextLog(`Spawn error: ${err.message}\n`);
      console.error(`NextJS spawn error: ${err.message}`);
    });
    nextjsProcess.on("exit", (code: number | null, signal: string | null) => {
      console.error(`NextJS process exited unexpectedly: code=${code}, signal=${signal}`);
    });
  } else {
    // Start NextJS build server
    nextjsProcess = await startNextjsBuildServer(directory, port);
  }

  return {
    process: nextjsProcess,
    ready: waitForServer(`${localhost}:${port}`),
  };
}

function startNextjsBuildServer(directory: string, port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      return handler(req, res, {
        public: directory,
        cleanUrls: true,
      });
    });
    server.on("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}


async function waitForServer(url: string, timeout = 120000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
            resolve();
          } else {
            reject(new Error(`Unexpected status code: ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error('Request timed out'));
        });
      });
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Server did not start within ${timeout}ms`);
}