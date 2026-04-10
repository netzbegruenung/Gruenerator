/**
 * Shutdown Handler Types
 */

import type { Worker } from 'cluster';
import type { Server } from 'http';

export interface ShutdownableResource {
  shutdown?(): Promise<void>;
  close?(cb?: (err?: Error) => void): void;
  quit?(): Promise<unknown>;
  terminate?(): Promise<number>;
  isOpen?: boolean | undefined;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface ShutdownOptions {
  timeout?: number | undefined;
  logger?: Logger | undefined;
}

export interface MasterShutdownOptions extends ShutdownOptions {
  workerTimeout?: number | undefined;
  onWorkerShutdown?: (pid: number) => void;
  onComplete?: () => void;
}

export interface WorkerShutdownOptions extends ShutdownOptions {
  resources: ShutdownableResource[];
  server?: Server | undefined;
  onComplete?: () => void;
}

export interface ShutdownHandler {
  inProgress: boolean;
  shutdown: (signal: string) => Promise<void>;
}

export interface MasterShutdownHandler extends ShutdownHandler {
  registerSignalHandlers: () => void;
}

export interface WorkerShutdownHandler extends ShutdownHandler {
  handleMessage: (msg: { type: string }) => Promise<void>;
  registerSignalHandlers: () => void;
}

export interface ClusterMessage {
  type: string;
  [key: string]: unknown;
}
