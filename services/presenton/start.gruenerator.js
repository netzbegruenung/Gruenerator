/**
 * Grünerator Presenton Startup Script
 *
 * Starts FastAPI + Next.js + Nginx.
 * No Ollama, no MCP server — we use LiteLLM as our LLM proxy.
 */

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fastapiDir = join(__dirname, 'servers/fastapi');
const nextjsDir = join(__dirname, 'servers/nextjs');

const fastapiPort = 8000;
const nextjsPort = 3000;

const userConfigPath = join(process.env.APP_DATA_DIRECTORY || '/app_data', 'userConfig.json');
const userDataDir = dirname(userConfigPath);

if (!existsSync(userDataDir)) {
  mkdirSync(userDataDir, { recursive: true });
}

process.env.USER_CONFIG_PATH = userConfigPath;

const setupUserConfigFromEnv = () => {
  let existingConfig = {};

  if (existsSync(userConfigPath)) {
    try {
      existingConfig = JSON.parse(readFileSync(userConfigPath, 'utf8'));
    } catch {
      // corrupted config, start fresh
    }
  }

  const userConfig = {
    LLM: process.env.LLM || existingConfig.LLM || 'custom',
    CUSTOM_LLM_URL:
      process.env.CUSTOM_LLM_URL ||
      existingConfig.CUSTOM_LLM_URL ||
      'https://litellm.netzbegruenung.verdigado.net/v1',
    CUSTOM_LLM_API_KEY:
      process.env.LITELLM_API_KEY ||
      process.env.CUSTOM_LLM_API_KEY ||
      existingConfig.CUSTOM_LLM_API_KEY,
    CUSTOM_MODEL:
      process.env.CUSTOM_MODEL || existingConfig.CUSTOM_MODEL || 'mistral/mistral-small-latest',
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER || existingConfig.IMAGE_PROVIDER || 'gruenerator',
    REGOLO_API_KEY: process.env.REGOLO_API_KEY || existingConfig.REGOLO_API_KEY,
    TOOL_CALLS: process.env.TOOL_CALLS || existingConfig.TOOL_CALLS,
    DISABLE_THINKING: process.env.DISABLE_THINKING || existingConfig.DISABLE_THINKING,
  };

  writeFileSync(userConfigPath, JSON.stringify(userConfig));

  // Also set env vars directly — when CAN_CHANGE_KEYS=false, the middleware
  // skips loading from userConfig.json, so FastAPI needs these in env.
  for (const [key, value] of Object.entries(userConfig)) {
    if (value != null) {
      process.env[key] = String(value);
    }
  }
};

const startServers = async () => {
  const fastApiProcess = spawn(
    'python',
    ['server.py', '--port', fastapiPort.toString(), '--reload', 'false'],
    {
      cwd: fastapiDir,
      stdio: 'inherit',
      env: process.env,
    }
  );

  fastApiProcess.on('error', (err) => {
    console.error('FastAPI process failed to start:', err);
  });

  const nextjsProcess = spawn(
    'npm',
    ['run', 'start', '--', '-H', '0.0.0.0', '-p', nextjsPort.toString()],
    {
      cwd: nextjsDir,
      stdio: 'inherit',
      env: process.env,
    }
  );

  nextjsProcess.on('error', (err) => {
    console.error('Next.js process failed to start:', err);
  });

  const exitCode = await Promise.race([
    new Promise((resolve) => fastApiProcess.on('exit', resolve)),
    new Promise((resolve) => nextjsProcess.on('exit', resolve)),
  ]);

  console.log(`One of the processes exited. Exit code: ${exitCode}`);
  process.exit(exitCode);
};

const startNginx = () => {
  const nginxProcess = spawn('service', ['nginx', 'start'], {
    stdio: 'inherit',
    env: process.env,
  });

  nginxProcess.on('error', (err) => {
    console.error('Nginx process failed to start:', err);
  });
};

const main = async () => {
  setupUserConfigFromEnv();
  startServers();
  startNginx();
};

main();
