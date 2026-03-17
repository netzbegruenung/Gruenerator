import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Module mocks (hoisted before imports) ────────────────────

const mockQuery = vi.fn();

vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: mockQuery }),
}));

vi.mock('../../routes/docs/constants.js', () => ({
  COLLAB_SUBTYPES: [
    'blank',
    'antrag',
    'pressemitteilung',
    'protokoll',
    'notizen',
    'redaktionsplan',
    'checkliste',
    'einladung',
    'boards',
  ],
}));

// ─── Import after mocks ──────────────────────────────────────

const { parseDocumentResponse, createDocumentWithContent, DOCUMENT_GENERATION_PROMPT } =
  await import('./DocGenerationService.js');

// ─── Tests ───────────────────────────────────────────────────

describe('DocGenerationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DOCUMENT_GENERATION_PROMPT', () => {
    it('includes all valid subtypes', () => {
      expect(DOCUMENT_GENERATION_PROMPT).toContain('antrag');
      expect(DOCUMENT_GENERATION_PROMPT).toContain('pressemitteilung');
      expect(DOCUMENT_GENERATION_PROMPT).toContain('protokoll');
      expect(DOCUMENT_GENERATION_PROMPT).toContain('checkliste');
      expect(DOCUMENT_GENERATION_PROMPT).toContain('einladung');
    });

    it('requires JSON-only output', () => {
      expect(DOCUMENT_GENERATION_PROMPT).toContain('NUR das JSON-Objekt');
    });
  });

  describe('parseDocumentResponse', () => {
    it('parses valid JSON with all fields', () => {
      const input = JSON.stringify({
        title: 'Klimaschutz-Antrag',
        subtype: 'antrag',
        content: '<h1>Antrag</h1><p>Inhalt</p>',
      });

      const result = parseDocumentResponse(input);
      expect(result).toEqual({
        title: 'Klimaschutz-Antrag',
        subtype: 'antrag',
        content: '<h1>Antrag</h1><p>Inhalt</p>',
      });
    });

    it('extracts JSON from surrounding text', () => {
      const input =
        'Here is the result:\n{"title":"Test","subtype":"blank","content":"<p>Hi</p>"}\nDone.';

      const result = parseDocumentResponse(input);
      expect(result.title).toBe('Test');
      expect(result.content).toBe('<p>Hi</p>');
    });

    it('falls back to defaults on invalid JSON', () => {
      const result = parseDocumentResponse('not valid json at all');

      expect(result).toEqual({
        title: 'Neues Dokument',
        subtype: 'blank',
        content: '',
      });
    });

    it('falls back to blank for unknown subtype', () => {
      const input = JSON.stringify({
        title: 'Test',
        subtype: 'unknown_type',
        content: '<p>Content</p>',
      });

      const result = parseDocumentResponse(input);
      expect(result.subtype).toBe('blank');
      expect(result.title).toBe('Test');
      expect(result.content).toBe('<p>Content</p>');
    });

    it('handles missing fields gracefully', () => {
      const input = JSON.stringify({});

      const result = parseDocumentResponse(input);
      expect(result.title).toBe('Neues Dokument');
      expect(result.subtype).toBe('blank');
      expect(result.content).toBe('');
    });

    it('accepts all valid subtypes', () => {
      const subtypes = [
        'blank',
        'antrag',
        'pressemitteilung',
        'protokoll',
        'notizen',
        'redaktionsplan',
        'checkliste',
        'einladung',
      ];

      for (const subtype of subtypes) {
        const input = JSON.stringify({ title: 'T', subtype, content: '' });
        const result = parseDocumentResponse(input);
        expect(result.subtype).toBe(subtype);
      }
    });

    it('handles content with nested braces', () => {
      const input = JSON.stringify({
        title: 'Test',
        subtype: 'blank',
        content: '<p>Some {curly} braces in content</p>',
      });

      const result = parseDocumentResponse(input);
      expect(result.content).toBe('<p>Some {curly} braces in content</p>');
    });
  });

  describe('createDocumentWithContent', () => {
    it('inserts document with correct parameters', async () => {
      const mockDoc = {
        id: 'doc-123',
        title: 'Generated Doc',
        content: '<h1>Hello</h1>',
        document_subtype: 'antrag',
        created_by: 'user-1',
      };
      mockQuery.mockResolvedValueOnce([mockDoc]);

      const result = await createDocumentWithContent(
        'Generated Doc',
        '<h1>Hello</h1>',
        'antrag',
        'user-1'
      );

      expect(mockQuery).toHaveBeenCalledOnce();

      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO collaborative_documents');
      expect(sql).toContain('content');
      expect(sql).toContain('RETURNING *');

      expect(params[0]).toBe('Generated Doc');
      expect(params[1]).toBe('<h1>Hello</h1>');
      expect(params[2]).toBe('user-1');
      expect(params[3]).toBe('antrag');

      const permissions = JSON.parse(params[4]);
      expect(permissions['user-1'].level).toBe('owner');

      expect(result).toEqual(mockDoc);
    });
  });
});
