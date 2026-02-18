/**
 * Markdown Routes
 * Convert markdown content to HTML, plain text, and export formats
 */

import express, { type Request, type Response } from 'express';

import {
  markdownToHtml,
  markdownToPlainText,
  markdownForExport,
  isMarkdownContent,
} from '../../services/markdown/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('markdown');

const router = express.Router();

interface ContentRequest {
  content: string;
}

interface MarkdownResponse {
  success: boolean;
  html?: string;
  plainText?: string;
  isMarkdown?: boolean;
  message?: string;
  error?: string;
}

/**
 * POST /api/markdown/to-html
 * Convert markdown content to HTML
 */
router.post(
  '/to-html',
  async (
    req: Request<Record<string, never>, MarkdownResponse, ContentRequest>,
    res: Response<MarkdownResponse>
  ) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required',
        });
      }

      const html = markdownToHtml(content);

      return res.json({
        success: true,
        html,
        isMarkdown: isMarkdownContent(content),
      });
    } catch (error) {
      const err = error as Error;
      log.error('[markdown] to-html error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to convert markdown to HTML',
        error: err.message,
      });
    }
  }
);

/**
 * POST /api/markdown/to-plain-text
 * Convert markdown content to plain text
 */
router.post(
  '/to-plain-text',
  async (
    req: Request<Record<string, never>, MarkdownResponse, ContentRequest>,
    res: Response<MarkdownResponse>
  ) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required',
        });
      }

      const plainText = markdownToPlainText(content);

      return res.json({
        success: true,
        plainText,
        isMarkdown: isMarkdownContent(content),
      });
    } catch (error) {
      const err = error as Error;
      log.error('[markdown] to-plain-text error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to convert markdown to plain text',
        error: err.message,
      });
    }
  }
);

/**
 * POST /api/markdown/for-export
 * Convert and format markdown for document exports
 */
router.post(
  '/for-export',
  async (
    req: Request<Record<string, never>, MarkdownResponse, ContentRequest>,
    res: Response<MarkdownResponse>
  ) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required',
        });
      }

      const exportHtml = markdownForExport(content);

      return res.json({
        success: true,
        html: exportHtml,
        isMarkdown: isMarkdownContent(content),
      });
    } catch (error) {
      const err = error as Error;
      log.error('[markdown] for-export error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to format markdown for export',
        error: err.message,
      });
    }
  }
);

/**
 * POST /api/markdown/check
 * Check if content contains markdown syntax
 */
router.post(
  '/check',
  async (
    req: Request<Record<string, never>, MarkdownResponse, ContentRequest>,
    res: Response<MarkdownResponse>
  ) => {
    try {
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({
          success: false,
          message: 'Content is required',
        });
      }

      const isMarkdown = isMarkdownContent(content);

      return res.json({
        success: true,
        isMarkdown,
      });
    } catch (error) {
      const err = error as Error;
      log.error('[markdown] check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check markdown content',
        error: err.message,
      });
    }
  }
);

export default router;
