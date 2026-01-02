/**
 * Authentication Middleware for Keycloak SSO
 * Supports both JWT tokens (mobile) and Express sessions (web)
 */

import { Response, NextFunction } from 'express';
import jwtAuthMiddleware from './jwtAuthMiddleware.js';
import { BRAND } from '../utils/domainUtils.js';
import { AuthenticatedRequest } from './types.js';

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    // SECURITY: Fail-fast if dev bypass is enabled in production
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
        console.error('[CRITICAL SECURITY ALERT] Dev auth bypass is enabled in PRODUCTION environment - this is a critical security vulnerability!');
        console.error('[CRITICAL SECURITY ALERT] Blocking all requests. Set ALLOW_DEV_AUTH_BYPASS=false immediately!');
        res.status(500).json({
            error: 'Critical security misconfiguration detected',
            message: 'Contact system administrator immediately'
        });
        return;
    }

    // Development-only auth bypass (requires explicit token)
    if (process.env.NODE_ENV === 'development' &&
        process.env.ALLOW_DEV_AUTH_BYPASS === 'true' &&
        process.env.DEV_AUTH_BYPASS_TOKEN) {

        const bypassToken = req.headers['x-dev-auth-bypass'] || req.query.dev_auth_token;

        if (bypassToken && bypassToken === process.env.DEV_AUTH_BYPASS_TOKEN) {
            console.warn('[Auth] DEV AUTH BYPASS USED - Development only!');
            req.user = {
                id: 'dev-user-123',
                email: BRAND.devEmail,
                display_name: 'Development User',
                avatar_robot_id: 1,
                beta_features: {},
                user_defaults: {},
                igel_modus: false,
                groups_enabled: false,
                custom_generators: false,
                database_access: false,
                collab: false,
                notebook: false,
                sharepic: false,
                anweisungen: false,
                canva: false,
                labor_enabled: false,
                sites_enabled: false,
                chat: false,
                interactive_antrag_enabled: false,
                auto_save_on_export: false,
                vorlagen: false,
                video_editor: false,
                created_at: new Date(),
                updated_at: new Date()
            };
            return next();
        }
    }

    jwtAuthMiddleware(req as any, res, (jwtError?: any) => {
        if (!req.user && req.session?.passport?.user) {
            try {
                req.user = req.session.passport.user;
                if (typeof req.isAuthenticated !== 'function') {
                    (req as any).isAuthenticated = () => true;
                }
            } catch (attachErr) {
                // Continue to standard checks/logging
            }
        }

        if (req.isAuthenticated && req.isAuthenticated()) {
            return next();
        }

        // For API calls (JSON requests)
        if (req.headers['content-type'] === 'application/json' ||
            req.headers.accept === 'application/json' ||
            req.originalUrl.startsWith('/api/')) {
            res.status(401).json({
                error: 'Authentication required',
                redirectUrl: '/auth/login'
            });
            return;
        }

        // For browser requests
        res.redirect('/auth/login');
    });
}

function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
        return requireAuth(req, res, next);
    }
    return next();
}

export { requireAuth, requireAdmin };
export default { requireAuth, requireAdmin };
