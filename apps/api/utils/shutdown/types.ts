/**
 * Shutdown Handler Types
 */

import type { Server } from 'http';
import type { Worker } from 'cluster';

export interface ShutdownableResource {
  shutdown?(): Promise<void>;
  close?(cb?: (err?: Error) => void): void;
  quit?(): Promise<void>;
  terminate?(): Promise<number>;
  isOpen?: boolean;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

export interface ShutdownOptions {
  timeout?: number;
  logger?: Logger;
}

export interface MasterShutdownOptions extends ShutdownOptions {
  workerTimeout?: number;
  onWorkerShutdown?: (pid: number) => void;
  onComplete?: () => void;
}

export interface WorkerShutdownOptions extends ShutdownOptions {
  resources: ShutdownableResource[];
  server?: Server;
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
