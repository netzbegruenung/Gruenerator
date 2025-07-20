import express from 'express';
import passport from '../config/passportSetup.mjs';
import { createRequire } from 'module';

// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);

// Import the simplified Node.js SDK mem0Service directly
const mem0Service = require('../services/mem0Service');
const authMiddlewareModule = require('../middleware/authMiddleware');

const { requireAuth } = authMiddlewareModule;
const router = express.Router();

// Add Passport session middleware for auth routes (same pattern as authCore.mjs)
router.use(passport.session());

// Helper function to extract and format generator data for memory
const extractGeneratorData = (reqBody, generatorType) => {
  const {
    thema,
    details,
    platforms,
    customPrompt,
    // Antrag-specific
    idee,
    gliederung,
    // Universal-specific
    textForm,
    sprache,
    // Press-specific
    zitatgeber,
    pressekontakt
  } = reqBody;

  const baseData = {
    generatorType,
    thema: thema || idee, // Anträge use 'idee' instead of 'thema'
    details,
    platforms,
    customPrompt
  };

  // Add generator-specific additional data
  switch (generatorType) {
    case 'antrag':
      baseData.additionalData = { gliederung };
      break;
    case 'universal':
      baseData.additionalData = { textForm, sprache };
      break;
    case 'social_media':
      baseData.additionalData = { 
        zitatgeber, 
        pressekontakt,
        hasPress: platforms?.includes('pressemitteilung')
      };
      break;
  }

  return baseData;
};

// Format generator data into memory content
const formatGeneratorMemory = ({ generatorType, thema, details, platforms = [], additionalData = {} }) => {
  // Create concise, valuable memory content
  let memoryContent = `User created ${generatorType} content`;
  
  if (thema) {
    memoryContent += ` about "${thema}"`;
  }
  
  if (platforms && platforms.length > 0) {
    memoryContent += ` for ${platforms.join(', ')}`;
  }
  
  if (details) {
    // Limit details to prevent token bloat
    const truncatedDetails = details.length > 200 ? 
      details.substring(0, 200) + '...' : details;
    memoryContent += `. Details: "${truncatedDetails}"`;
  }

  // Add generator-specific context
  switch (generatorType) {
    case 'social_media':
      if (platforms.includes('pressemitteilung')) {
        memoryContent += ' (including press release)';
      }
      break;
    case 'antrag':
      if (additionalData.gliederung) {
        memoryContent += ` with structure: "${additionalData.gliederung}"`;
      }
      break;
    case 'gruenejugend':
      memoryContent += ' (youth-focused)';
      break;
  }

  return memoryContent;
};

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const health = await mem0Service.healthCheck();
    res.json({
      success: true,
      data: health,
      message: 'Mem0 service is healthy'
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      error: error.message,
      message: 'Mem0 service is not available'
    });
  }
});

// Add generator memory (authenticated) - NEW ENDPOINT FOR PHASE 1
router.post('/add-generator', requireAuth, async (req, res) => {
  try {
    const { generatorType, ...generatorData } = req.body;
    const userId = req.user.id; // Use authenticated user's ID
    
    if (!generatorType) {
      return res.status(400).json({
        success: false,
        message: 'generatorType is required'
      });
    }

    // Extract and validate generator data
    const extractedData = extractGeneratorData(req.body, generatorType);
    const { customPrompt, thema, details } = extractedData;

    // Skip memory only if custom prompt is used AND no meaningful user input exists
    // This allows capturing user input even when knowledge system generates custom prompts
    if (customPrompt && !thema && !details) {
      console.log(`[Mem0 /add-generator] Skipping memory for ${generatorType} - custom prompt used without user input`);
      return res.json({
        success: false,
        skipped: true,
        reason: 'custom_prompt_without_user_input',
        message: 'Memory not added - custom prompt contains structured knowledge but no user input'
      });
    }

    // Don't store if no meaningful user input
    if (!thema && !details) {
      console.log(`[Mem0 /add-generator] Skipping memory for ${generatorType} - no meaningful input`);
      return res.json({
        success: false,
        skipped: true,
        reason: 'no_meaningful_input',
        message: 'Memory not added - no meaningful user input'
      });
    }

    // Format memory content
    const memoryContent = formatGeneratorMemory(extractedData);

    // Convert to messages format for mem0
    const messages = [
      { role: 'user', content: memoryContent }
    ];

    // Create metadata for better categorization
    const metadata = {
      source: 'generator_usage',
      generator_type: generatorType,
      topic: thema,
      timestamp: new Date().toISOString(),
      ...extractedData.additionalData
    };

    // Add platforms to metadata if present
    if (extractedData.platforms && extractedData.platforms.length > 0) {
      metadata.platforms = extractedData.platforms;
    }

    // Add to mem0
    const result = await mem0Service.addMemory(messages, userId, metadata);
    
    console.log(`[Mem0 /add-generator] Memory added for user ${userId}: ${memoryContent.substring(0, 100)}...`);
    
    res.json({
      success: result.success,
      data: result.data,
      message: result.success ? 'Generator memory added successfully' : result.message,
      memoryPreview: memoryContent.substring(0, 100) + '...'
    });

  } catch (error) {
    console.error(`[Mem0 /add-generator] Error:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to add generator memory'
    });
  }
});

// Add memory from conversation (authenticated)
router.post('/add', requireAuth, async (req, res) => {
  try {
    const { messages, metadata } = req.body;
    const userId = req.user.id; // Use authenticated user's ID
    
    if (!messages) {
      return res.status(400).json({
        success: false,
        message: 'messages are required'
      });
    }

    const result = await mem0Service.addMemory(messages, userId, metadata);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to add memory'
    });
  }
});

// Add memory from text input (authenticated)
router.post('/add-text', requireAuth, async (req, res) => {
  try {
    const { text, topic } = req.body;
    const userId = req.user.id; // Use authenticated user's ID
    
    if (!text || text.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'text is required'
      });
    }

    // Convert text to messages format for mem0
    const messages = [
      { role: 'user', content: text.trim() }
    ];
    
    const metadata = {
      source: 'manual_input',
      topic: topic || 'general',
      added_at: new Date().toISOString()
    };

    const result = await mem0Service.addMemory(messages, userId, metadata);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to add memory'
    });
  }
});

// Get all memories for user (authenticated)
router.get('/user/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own memories
    if (req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only view your own memories'
      });
    }
    
    const result = await mem0Service.getMemories(userId);
    
    // Transform the response to match frontend expectations
    if (result.success && result.data && result.data.results) {
      res.json({
        success: true,
        memories: result.data.results,
        message: result.message
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get memories'
    });
  }
});

// Get all memories (for testing - shows testuser memories)
router.get('/get-all', async (req, res) => {
  try {
    // Use hardcoded testuser for now
    const testUserId = 'testuser';
    const result = await mem0Service.getMemories(testUserId);
    
    // Transform the response to match frontend expectations
    if (result.success && result.data && result.data.results) {
      res.json({
        success: true,
        memories: result.data.results,
        message: result.message
      });
    } else {
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to get memories'
    });
  }
});

// Search memories (authenticated)
router.post('/search', requireAuth, async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.user.id; // Use authenticated user's ID
    
    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'query is required'
      });
    }

    const result = await mem0Service.searchMemories(query, userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to search memories'
    });
  }
});

// Delete memory (authenticated)
router.delete('/:memoryId', requireAuth, async (req, res) => {
  try {
    const { memoryId } = req.params;
    
    // Note: We should add ownership verification here
    // For now, we trust that the memory service will handle user-specific deletion
    const result = await mem0Service.deleteMemory(memoryId);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to delete memory'
    });
  }
});

export default router; 