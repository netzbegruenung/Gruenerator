import express from 'express';
import crypto from 'crypto';
import { supabaseService } from '../../utils/supabaseClient.js';

const router = express.Router();

// Add debugging middleware to all webhook routes
router.use((req, res, next) => {
  console.log(`[Canva Webhooks] ${req.method} ${req.originalUrl}`);
  next();
});

/**
 * Middleware to verify Canva webhook signature (optional for basic functionality)
 */
function verifyWebhookSignature(req, res, next) {
  try {
    const webhookSecret = process.env.CANVA_WEBHOOK_SECRET;
    
    // If no webhook secret is configured, skip verification (for basic functionality)
    if (!webhookSecret) {
      console.warn('[Canva Webhooks] CANVA_WEBHOOK_SECRET not configured - skipping signature verification (not recommended for production)');
      return next();
    }
    
    const signature = req.headers['canva-signature'];
    const timestamp = req.headers['canva-timestamp'];
    
    if (!signature || !timestamp) {
      console.error('[Canva Webhooks] Missing signature or timestamp headers');
      return res.status(401).json({
        success: false,
        error: 'Missing required webhook headers'
      });
    }
    
    // Get raw body for signature verification
    const rawBody = JSON.stringify(req.body);
    
    // Create expected signature
    const payload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    // Compare signatures
    const receivedSignature = signature.replace('v1=', '');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    )) {
      console.error('[Canva Webhooks] Invalid webhook signature');
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature'
      });
    }
    
    // Check timestamp to prevent replay attacks (within 5 minutes)
    const requestTime = parseInt(timestamp);
    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(currentTime - requestTime);
    
    if (timeDiff > 300) { // 5 minutes
      console.error('[Canva Webhooks] Webhook timestamp too old:', timeDiff);
      return res.status(401).json({
        success: false,
        error: 'Webhook timestamp too old'
      });
    }
    
    console.log('[Canva Webhooks] Signature verification passed');
    next();
    
  } catch (error) {
    console.error('[Canva Webhooks] Signature verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook verification failed',
      details: error.message
    });
  }
}

/**
 * Handle collaboration events
 * POST /api/canva/webhooks/collaboration
 */
router.post('/collaboration', verifyWebhookSignature, async (req, res) => {
  try {
    const { event_type, collaboration, design, user } = req.body;
    
    console.log(`[Canva Webhooks] Collaboration event: ${event_type}`, {
      designId: design?.id,
      userId: user?.id,
      collaborationId: collaboration?.id
    });
    
    // Handle different collaboration event types
    switch (event_type) {
      case 'collaboration:created':
        await handleCollaborationCreated(collaboration, design, user);
        break;
        
      case 'collaboration:updated':
        await handleCollaborationUpdated(collaboration, design, user);
        break;
        
      case 'collaboration:deleted':
        await handleCollaborationDeleted(collaboration, design, user);
        break;
        
      default:
        console.warn(`[Canva Webhooks] Unknown collaboration event type: ${event_type}`);
    }
    
    res.json({
      success: true,
      message: 'Collaboration event processed successfully'
    });
    
  } catch (error) {
    console.error('[Canva Webhooks] Error processing collaboration event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process collaboration event',
      details: error.message
    });
  }
});

/**
 * Handle design events
 * POST /api/canva/webhooks/design
 */
router.post('/design', verifyWebhookSignature, async (req, res) => {
  try {
    const { event_type, design, user } = req.body;
    
    console.log(`[Canva Webhooks] Design event: ${event_type}`, {
      designId: design?.id,
      userId: user?.id,
      designTitle: design?.title
    });
    
    // Handle different design event types
    switch (event_type) {
      case 'design:created':
        await handleDesignCreated(design, user);
        break;
        
      case 'design:updated':
        await handleDesignUpdated(design, user);
        break;
        
      case 'design:deleted':
        await handleDesignDeleted(design, user);
        break;
        
      default:
        console.warn(`[Canva Webhooks] Unknown design event type: ${event_type}`);
    }
    
    res.json({
      success: true,
      message: 'Design event processed successfully'
    });
    
  } catch (error) {
    console.error('[Canva Webhooks] Error processing design event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process design event',
      details: error.message
    });
  }
});

/**
 * Handle asset events
 * POST /api/canva/webhooks/asset
 */
router.post('/asset', verifyWebhookSignature, async (req, res) => {
  try {
    const { event_type, asset, user } = req.body;
    
    console.log(`[Canva Webhooks] Asset event: ${event_type}`, {
      assetId: asset?.id,
      userId: user?.id,
      assetName: asset?.name
    });
    
    // Handle different asset event types
    switch (event_type) {
      case 'asset:created':
        await handleAssetCreated(asset, user);
        break;
        
      case 'asset:updated':
        await handleAssetUpdated(asset, user);
        break;
        
      case 'asset:deleted':
        await handleAssetDeleted(asset, user);
        break;
        
      default:
        console.warn(`[Canva Webhooks] Unknown asset event type: ${event_type}`);
    }
    
    res.json({
      success: true,
      message: 'Asset event processed successfully'
    });
    
  } catch (error) {
    console.error('[Canva Webhooks] Error processing asset event:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process asset event',
      details: error.message
    });
  }
});

/**
 * Webhook health check
 * GET /api/canva/webhooks/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Canva webhooks endpoint is healthy',
    timestamp: new Date().toISOString()
  });
});

// Event handlers

/**
 * Handle collaboration created event
 */
async function handleCollaborationCreated(collaboration, design, user) {
  try {
    console.log('[Canva Webhooks] Processing collaboration created');
    
    // Find user in our database by Canva user ID
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      // Log collaboration activity
      await logCanvaActivity(grueneratorUser.id, 'collaboration_created', {
        collaboration_id: collaboration.id,
        design_id: design.id,
        design_title: design.title,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling collaboration created:', error);
  }
}

/**
 * Handle collaboration updated event
 */
async function handleCollaborationUpdated(collaboration, design, user) {
  try {
    console.log('[Canva Webhooks] Processing collaboration updated');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'collaboration_updated', {
        collaboration_id: collaboration.id,
        design_id: design.id,
        design_title: design.title,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling collaboration updated:', error);
  }
}

/**
 * Handle collaboration deleted event
 */
async function handleCollaborationDeleted(collaboration, design, user) {
  try {
    console.log('[Canva Webhooks] Processing collaboration deleted');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'collaboration_deleted', {
        collaboration_id: collaboration.id,
        design_id: design.id,
        design_title: design.title,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling collaboration deleted:', error);
  }
}

/**
 * Handle design created event
 */
async function handleDesignCreated(design, user) {
  try {
    console.log('[Canva Webhooks] Processing design created');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'design_created', {
        design_id: design.id,
        design_title: design.title,
        design_type: design.design_type,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling design created:', error);
  }
}

/**
 * Handle design updated event
 */
async function handleDesignUpdated(design, user) {
  try {
    console.log('[Canva Webhooks] Processing design updated');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'design_updated', {
        design_id: design.id,
        design_title: design.title,
        design_type: design.design_type,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling design updated:', error);
  }
}

/**
 * Handle design deleted event
 */
async function handleDesignDeleted(design, user) {
  try {
    console.log('[Canva Webhooks] Processing design deleted');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'design_deleted', {
        design_id: design.id,
        design_title: design.title,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling design deleted:', error);
  }
}

/**
 * Handle asset created event
 */
async function handleAssetCreated(asset, user) {
  try {
    console.log('[Canva Webhooks] Processing asset created');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'asset_created', {
        asset_id: asset.id,
        asset_name: asset.name,
        asset_type: asset.type,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling asset created:', error);
  }
}

/**
 * Handle asset updated event
 */
async function handleAssetUpdated(asset, user) {
  try {
    console.log('[Canva Webhooks] Processing asset updated');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'asset_updated', {
        asset_id: asset.id,
        asset_name: asset.name,
        asset_type: asset.type,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling asset updated:', error);
  }
}

/**
 * Handle asset deleted event
 */
async function handleAssetDeleted(asset, user) {
  try {
    console.log('[Canva Webhooks] Processing asset deleted');
    
    const grueneratorUser = await findUserByCanvaId(user.id);
    
    if (grueneratorUser) {
      await logCanvaActivity(grueneratorUser.id, 'asset_deleted', {
        asset_id: asset.id,
        asset_name: asset.name,
        canva_user_id: user.id
      });
    }
    
  } catch (error) {
    console.error('[Canva Webhooks] Error handling asset deleted:', error);
  }
}

// Helper functions

/**
 * Find Grünerator user by Canva user ID
 */
async function findUserByCanvaId(canvaUserId) {
  try {
    const { data: user, error } = await supabaseService
      .from('profiles')
      .select('id, email, display_name')
      .eq('canva_user_id', canvaUserId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    
    return user;
    
  } catch (error) {
    console.error('[Canva Webhooks] Error finding user by Canva ID:', error);
    return null;
  }
}

/**
 * Log Canva activity for analytics and debugging
 */
async function logCanvaActivity(userId, activityType, data) {
  try {
    // For now, just log to console
    // In future, this could be stored in a database table for analytics
    console.log(`[Canva Activity] User ${userId}: ${activityType}`, data);
    
    // TODO: Implement database logging if needed
    // await supabaseService
    //   .from('canva_activities')
    //   .insert({
    //     user_id: userId,
    //     activity_type: activityType,
    //     activity_data: data,
    //     created_at: new Date().toISOString()
    //   });
    
  } catch (error) {
    console.error('[Canva Webhooks] Error logging activity:', error);
  }
}

export default router;