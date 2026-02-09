import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { Response, NextFunction } from 'express';

// ─── Module mocks (hoisted before imports) ────────────────────

const mockQuery = vi.fn();

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

vi.mock('../../middleware/authMiddleware.js', () => ({
  requireAuth: (_req: AuthenticatedRequest, _res: Response, next: NextFunction) => next(),
}));

const mockValidateAndSanitizeHtml = vi.fn((html: string) => html);
const mockExtractTitleFromHtml = vi.fn(() => 'Extracted Title');

vi.mock('../../services/tiptap/contentConverter.js', () => ({
  validateAndSanitizeHtml: (html: string) => mockValidateAndSanitizeHtml(html),
  extractTitleFromHtml: (html: string) => mockExtractTitleFromHtml(html),
}));

// ─── Import router after mocks are in place ──────────────────

const { default: router } = await import('./exportToDocsController.js');

// Extract the POST /from-export handler from the router stack
const routeLayer = router.stack.find(
  (layer: any) => layer.route?.path === '/from-export' && layer.route?.methods?.post
);
const handler = routeLayer!.route!.stack.at(-1)!.handle as (
  req: AuthenticatedRequest,
  res: Response
) => Promise<void>;

// ─── Test helpers ─────────────────────────────────────────────

function createMockReq(body: Record<string, unknown> = {}, userId?: string): AuthenticatedRequest {
  const req: Partial<AuthenticatedRequest> = {
    body,
    user: userId ? ({ id: userId } as AuthenticatedRequest['user']) : undefined,
  };
  return req as AuthenticatedRequest;
}

function createMockRes() {
  const jsonFn = vi.fn();
  const statusFn = vi.fn(() => ({ json: jsonFn }));
  const res = { status: statusFn, json: jsonFn } as unknown as Response;
  return { res, statusFn, jsonFn };
}

// ─── Tests ────────────────────────────────────────────────────

describe('exportToDocsController – POST /from-export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateAndSanitizeHtml.mockImplementation((html: string) => html);
    mockExtractTitleFromHtml.mockReturnValue('Extracted Title');
  });

  // ── Authentication ───────────────────────────────────────

  describe('Authentication', () => {
    it('returns 401 when user is not on the request', async () => {
      const req = createMockReq({ content: '<p>Hello</p>' });
      const { res, statusFn, jsonFn } = createMockRes();

      await handler(req, res);

      expect(statusFn).toHaveBeenCalledWith(401);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  // ── Validation ───────────────────────────────────────────

  describe('Validation', () => {
    it('returns 400 when content is missing', async () => {
      const req = createMockReq({}, 'user-123');
      const { res, statusFn, jsonFn } = createMockRes();

      await handler(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Content is required' });
    });

    it('returns 400 when content is empty string', async () => {
      const req = createMockReq({ content: '' }, 'user-123');
      const { res, statusFn, jsonFn } = createMockRes();

      await handler(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Content is required' });
    });

    it('returns 400 when HTML sanitization fails', async () => {
      mockValidateAndSanitizeHtml.mockImplementation(() => {
        throw new Error('Invalid HTML: contains script tags');
      });
      const req = createMockReq({ content: '<script>alert("xss")</script>' }, 'user-123');
      const { res, statusFn, jsonFn } = createMockRes();

      await handler(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Invalid HTML: contains script tags' });
    });
  });

  // ── Happy path ───────────────────────────────────────────

  describe('Happy path', () => {
    const sampleDoc = { id: 'doc-abc-123', title: 'Test' };

    beforeEach(() => {
      mockQuery.mockResolvedValue([sampleDoc]);
    });

    it('returns 201 with documentId and url', async () => {
      const req = createMockReq({ content: '<p>Hello world</p>', title: 'My Doc' }, 'user-123');
      const { res, statusFn, jsonFn } = createMockRes();

      await handler(req, res);

      expect(statusFn).toHaveBeenCalledWith(201);
      expect(jsonFn).toHaveBeenCalledWith({
        documentId: 'doc-abc-123',
        url: '/document/doc-abc-123',
        success: true,
      });
    });

    it('inserts with document_subtype "blank" (not "docs")', async () => {
      const req = createMockReq({ content: '<p>Test</p>' }, 'user-123');
      const { res } = createMockRes();

      await handler(req, res);

      expect(mockQuery).toHaveBeenCalledOnce();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("'blank'");
      expect(sql).not.toContain("'docs'");
    });

    it('uses provided title directly', async () => {
      const req = createMockReq({ content: '<p>Test</p>', title: 'Custom Title' }, 'user-123');
      const { res } = createMockRes();

      await handler(req, res);

      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toBe('Custom Title');
    });

    it('generates title from HTML when not provided', async () => {
      mockExtractTitleFromHtml.mockReturnValue('Auto Title');
      const req = createMockReq({ content: '<h1>Auto Title</h1><p>Body</p>' }, 'user-123');
      const { res } = createMockRes();

      await handler(req, res);

      const params = mockQuery.mock.calls[0][1];
      expect(params[0]).toContain('Auto Title');
      expect(params[0]).toMatch(/\d{1,2}\.\d{1,2}\.\d{4}/);
    });

    it('sets created_by and last_edited_by to the authenticated user', async () => {
      const req = createMockReq({ content: '<p>Test</p>', title: 'T' }, 'user-456');
      const { res } = createMockRes();

      await handler(req, res);

      const params = mockQuery.mock.calls[0][1];
      expect(params[2]).toBe('user-456');
    });

    it('sets owner permissions for the authenticated user', async () => {
      const req = createMockReq({ content: '<p>Test</p>', title: 'T' }, 'user-789');
      const { res } = createMockRes();

      await handler(req, res);

      const params = mockQuery.mock.calls[0][1];
      const permissions = JSON.parse(params[3]);
      expect(permissions['user-789'].level).toBe('owner');
      expect(permissions['user-789'].granted_at).toBeDefined();
    });

    it('sanitizes HTML content before inserting', async () => {
      mockValidateAndSanitizeHtml.mockReturnValue('<p>Cleaned</p>');
      const req = createMockReq(
        { content: '<p>Dirty <script>bad</script></p>', title: 'T' },
        'user-123'
      );
      const { res } = createMockRes();

      await handler(req, res);

      expect(mockValidateAndSanitizeHtml).toHaveBeenCalledWith('<p>Dirty <script>bad</script></p>');
      const params = mockQuery.mock.calls[0][1];
      expect(params[1]).toBe('<p>Cleaned</p>');
    });
  });

  // ── Error handling ───────────────────────────────────────

  describe('Error handling', () => {
    it('returns 413 when content is too large', async () => {
      mockQuery.mockRejectedValue(new Error('Content too large'));
      const req = createMockReq({ content: '<p>Huge</p>', title: 'T' }, 'user-123');
      const { res, statusFn, jsonFn } = createMockRes();

      await handler(req, res);

      expect(statusFn).toHaveBeenCalledWith(413);
      expect(jsonFn).toHaveBeenCalledWith({
        error: 'Content too large',
        message: 'The content exceeds the maximum size limit of 1MB',
      });
    });

    it('returns 500 for unexpected database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Connection refused'));
      const req = createMockReq({ content: '<p>Test</p>', title: 'T' }, 'user-123');
      const { res, statusFn, jsonFn } = createMockRes();

      await handler(req, res);

      expect(statusFn).toHaveBeenCalledWith(500);
      expect(jsonFn).toHaveBeenCalledWith({
        error: 'Failed to create document',
        message: 'An error occurred while creating the document. Please try again.',
      });
    });
  });
});
