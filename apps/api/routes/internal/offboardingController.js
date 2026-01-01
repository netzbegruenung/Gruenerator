import express from 'express';
import { OffboardingService } from '../../services/offboardingService.js';
import { createLogger } from '../../utils/logger.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const log = createLogger('offboarding');


const router = express.Router();

/**
 * Middleware to check admin authentication
 * Adjust this according to your authentication system
 */
const requireAdmin = (req, res, next) => {
  // TODO: Implement proper admin authentication
  // For now, this is a placeholder that checks for a specific header or token
  const adminToken = req.headers['x-admin-token'];
  
  if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
    return res.status(403).json({
      error: 'Admin authentication required',
      message: 'This endpoint requires admin privileges'
    });
  }
  
  next();
};

/**
 * POST /internal/offboarding/run
 * Manually trigger the offboarding process
 */
router.post('/run', requireAdmin, async (req, res) => {
  try {
    // Validate configuration before starting
    OffboardingService.validateConfig();
    
    const service = new OffboardingService();
    
    // Run offboarding in the background and return immediately
    // In a production environment, you might want to use a job queue
    const startTime = new Date();
    
    res.status(202).json({
      message: 'Offboarding process started',
      startTime: startTime.toISOString(),
      status: 'running'
    });

    // Run the actual offboarding process
    const success = await service.runOffboarding();
    
    const endTime = new Date();
    const duration = endTime - startTime;
    
    log.debug(`Offboarding process completed in ${duration}ms with status: ${success ? 'success' : 'failed'}`);
    
  } catch (error) {
    log.error('Offboarding process failed:', error.message);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Configuration error',
        message: error.message
      });
    }
  }
});

/**
 * GET /internal/offboarding/status
 * Check the status of the offboarding service configuration
 */
router.get('/status', requireAdmin, async (req, res) => {
  try {
    OffboardingService.validateConfig();
    
    res.json({
      status: 'ready',
      message: 'Offboarding service is properly configured',
      config: {
        apiBaseUrl: process.env.GRUENE_API_BASEURL || 'https://app.gruene.de',
        hasAuthentication: !!(process.env.GRUENE_API_KEY || 
                             (process.env.GRUENE_API_USERNAME && process.env.GRUENE_API_PASSWORD)),
        hasSupabase: !!require('../../utils/supabaseClient').supabaseService
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      config: {
        apiBaseUrl: process.env.GRUENE_API_BASEURL || 'https://app.gruene.de',
        hasAuthentication: !!(process.env.GRUENE_API_KEY || 
                             (process.env.GRUENE_API_USERNAME && process.env.GRUENE_API_PASSWORD)),
        hasSupabase: !!require('../../utils/supabaseClient').supabaseService
      }
    });
  }
});

/**
 * POST /internal/offboarding/dry-run
 * Perform a dry run to see which users would be affected
 */
router.post('/dry-run', requireAdmin, async (req, res) => {
  try {
    OffboardingService.validateConfig();
    
    const { limit = 10 } = req.body;
    const service = new OffboardingService();
    
    const results = [];
    let count = 0;
    
    for await (const user of service.fetchOffboardingUsers()) {
      if (count >= limit) break;
      
      const grueneratorUser = await service.grueneratorOffboarding.findUserInGruenerator(user);
      
      results.push({
        grueneNetUser: {
          id: user.id,
          username: user.username,
          email: user.email,
          sherpa_id: user.sherpa_id
        },
        grueneratorUser: grueneratorUser ? {
          id: grueneratorUser.id,
          email: grueneratorUser.email,
          username: grueneratorUser.username
        } : null,
        action: grueneratorUser ? 'would_be_processed' : 'not_found'
      });
      
      count++;
    }
    
    res.json({
      message: `Dry run completed for ${results.length} users`,
      limit,
      results
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Dry run failed',
      message: error.message
    });
  }
});

/**
 * GET /internal/offboarding/documentation
 * Return documentation about the offboarding process
 */
router.get('/documentation', (req, res) => {
  res.json({
    title: 'Grünerator Offboarding Service',
    description: 'Service for handling user offboarding from the Grünes Netz',
    version: '1.0.0',
    endpoints: {
      'POST /internal/offboarding/run': {
        description: 'Manually trigger the offboarding process',
        authentication: 'Admin token required',
        response: 'Starts process and returns immediately'
      },
      'GET /internal/offboarding/status': {
        description: 'Check configuration status',
        authentication: 'Admin token required',
        response: 'Configuration validation results'
      },
      'POST /internal/offboarding/dry-run': {
        description: 'Preview which users would be affected',
        authentication: 'Admin token required',
        parameters: { limit: 'Number of users to check (default: 10)' },
        response: 'List of users that would be processed'
      }
    },
    configuration: {
      required_env_vars: [
        'GRUENE_API_BASEURL (default: https://app.gruene.de)',
        'ADMIN_TOKEN (for API access)',
        'Either GRUENE_API_KEY or (GRUENE_API_USERNAME + GRUENE_API_PASSWORD)',
        'Supabase configuration (VITE_TEMPLATES_SUPABASE_*)'
      ]
    },
    process: {
      description: 'The offboarding process fetches users from the Grüne API, searches for them in the Grünerator database, attempts to delete them (or anonymize if deletion fails), and reports the results back to the API.',
      retry_mechanism: 'Failed API updates are saved to /var/tmp/gruenerator-offboarding-retry.json and retried on next run',
      logging: 'All operations are logged to logs/offboarding.log'
    }
  });
});

export default router;