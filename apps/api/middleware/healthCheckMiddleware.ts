/**
 * Database Health Check Middleware
 * Ensures proper error responses when database is unavailable
 */

import { type Request, type Response, type NextFunction } from 'express';

import { getPostgresInstance } from '../database/services/PostgresService.js';

import { type DatabaseHealth } from './types.js';

/**
 * Middleware to check database health before processing requests
 * Returns proper HTTP status codes instead of letting the app crash
 */
export function databaseHealthCheck(req: Request, res: Response, next: NextFunction): void {
  const postgres = getPostgresInstance();
  const health = postgres.getHealth() as DatabaseHealth;

  if (health.isHealthy) {
    return next();
  }

  if (
    health.status === 'connecting' ||
    health.status === 'schema_sync' ||
    health.status === 'initializing'
  ) {
    res.status(503).json({
      error: 'Service Temporarily Unavailable',
      message: 'Database is initializing. Please try again in a moment.',
      status: health.status,
      retry_after: 5,
    });
    return;
  }

  if (health.status === 'error') {
    res.status(503).json({
      error: 'Database Service Unavailable',
      message: 'Database connection is currently unavailable. Our team has been notified.',
      status: health.status,
      retry_after: 30,
    });
    return;
  }

  console.warn('[HealthCheck] Database health unknown, continuing with request:', health);
  next();
}

/**
 * Health check endpoint for monitoring
 */
export function healthCheckEndpoint(req: Request, res: Response): void {
  const postgres = getPostgresInstance();
  const health = postgres.getHealth() as DatabaseHealth;

  const response = {
    service: 'gruenerator-backend',
    database: {
      status: health.status,
      healthy: health.isHealthy,
      initialized: health.isInitialized,
      lastError: health.lastError,
      pool: health.pool,
    },
    timestamp: new Date().toISOString(),
  };

  if (health.isHealthy) {
    res.status(200).json(response);
  } else if (
    health.status === 'connecting' ||
    health.status === 'schema_sync' ||
    health.status === 'initializing'
  ) {
    res.status(503).json(response);
  } else {
    res.status(503).json(response);
  }
}

/**
 * Middleware specifically for database-dependent routes
 * Only apply to routes that actually need database access
 */
export function requireHealthyDatabase(req: Request, res: Response, next: NextFunction): void {
  const postgres = getPostgresInstance();
  const health = postgres.getHealth() as DatabaseHealth;

  if (!health.isHealthy) {
    res.status(503).json({
      error: 'Database Required',
      message: 'This feature requires database access which is currently unavailable.',
      status: health.status,
      retry_after: health.status === 'error' ? 30 : 5,
    });
    return;
  }

  next();
}

export default {
  databaseHealthCheck,
  healthCheckEndpoint,
  requireHealthyDatabase,
};
