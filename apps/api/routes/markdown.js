import express from 'express';
import { createLogger } from '../utils/logger.js';
const log = createLogger('markdown');

const router = express.Router();
import { markdownToHtml, 
  markdownToPlainText, 
  markdownForExport, 
  isMarkdownContent } from '../services/markdown/index.js';

/**
 * POST /api/markdown/to-html
 * Convert markdown content to HTML
 */
router.post('/to-html', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content is required' 
      });
    }
    
    const html = markdownToHtml(content);
    
    res.json({ 
      success: true, 
      html,
      isMarkdown: isMarkdownContent(content)
    });
    
  } catch (error) {
    log.error('[markdown] to-html error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to convert markdown to HTML',
      error: error.message 
    });
  }
});

/**
 * POST /api/markdown/to-plain-text
 * Convert markdown content to plain text
 */
router.post('/to-plain-text', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content is required' 
      });
    }
    
    const plainText = markdownToPlainText(content);
    
    res.json({ 
      success: true, 
      plainText,
      isMarkdown: isMarkdownContent(content)
    });
    
  } catch (error) {
    log.error('[markdown] to-plain-text error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to convert markdown to plain text',
      error: error.message 
    });
  }
});

/**
 * POST /api/markdown/for-export
 * Convert and format markdown for document exports
 */
router.post('/for-export', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content is required' 
      });
    }
    
    const exportHtml = markdownForExport(content);
    
    res.json({ 
      success: true, 
      html: exportHtml,
      isMarkdown: isMarkdownContent(content)
    });
    
  } catch (error) {
    log.error('[markdown] for-export error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to format markdown for export',
      error: error.message 
    });
  }
});

/**
 * POST /api/markdown/check
 * Check if content contains markdown syntax
 */
router.post('/check', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ 
        success: false, 
        message: 'Content is required' 
      });
    }
    
    const isMarkdown = isMarkdownContent(content);
    
    res.json({ 
      success: true, 
      isMarkdown
    });
    
  } catch (error) {
    log.error('[markdown] check error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check markdown content',
      error: error.message 
    });
  }
});

export default router;