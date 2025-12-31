/**
 * Database Health Check Middleware
 * Ensures proper error responses when database is unavailable
 */

import { getPostgresInstance } from '../database/services/PostgresService.js';

/**
 * Middleware to check database health before processing requests
 * Returns proper HTTP status codes instead of letting the app crash
 */
export function databaseHealthCheck(req, res, next) {
    const postgres = getPostgresInstance();
    const health = postgres.getHealth();
    
    // If database is healthy, continue normally
    if (health.isHealthy) {
        return next();
    }
    
    // If database is initializing, return 503 Service Unavailable
    if (health.status === 'connecting' || health.status === 'schema_sync' || health.status === 'initializing') {
        return res.status(503).json({
            error: 'Service Temporarily Unavailable',
            message: 'Database is initializing. Please try again in a moment.',
            status: health.status,
            retry_after: 5
        });
    }
    
    // If database has an error, return 503 Service Unavailable
    if (health.status === 'error') {
        return res.status(503).json({
            error: 'Database Service Unavailable',
            message: 'Database connection is currently unavailable. Our team has been notified.',
            status: health.status,
            retry_after: 30
        });
    }
    
    // For any other status, continue but log warning
    console.warn('[HealthCheck] Database health unknown, continuing with request:', health);
    next();
}

/**
 * Health check endpoint for monitoring
 */
export function healthCheckEndpoint(req, res) {
    const postgres = getPostgresInstance();
    const health = postgres.getHealth();
    
    const response = {
        service: 'gruenerator-backend',
        database: {
            status: health.status,
            healthy: health.isHealthy,
            initialized: health.isInitialized,
            lastError: health.lastError,
            pool: health.pool
        },
        timestamp: new Date().toISOString()
    };
    
    // Return appropriate status code
    if (health.isHealthy) {
        res.status(200).json(response);
    } else if (health.status === 'connecting' || health.status === 'schema_sync' || health.status === 'initializing') {
        res.status(503).json(response);
    } else {
        res.status(503).json(response);
    }
}

/**
 * Middleware specifically for database-dependent routes
 * Only apply to routes that actually need database access
 */
export function requireHealthyDatabase(req, res, next) {
    const postgres = getPostgresInstance();
    const health = postgres.getHealth();
    
    if (!health.isHealthy) {
        return res.status(503).json({
            error: 'Database Required',
            message: 'This feature requires database access which is currently unavailable.',
            status: health.status,
            retry_after: health.status === 'error' ? 30 : 5
        });
    }
    
    next();
}

export default {
    databaseHealthCheck,
    healthCheckEndpoint,
    requireHealthyDatabase
};