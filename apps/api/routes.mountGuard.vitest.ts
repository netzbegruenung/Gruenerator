import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Two mount-order invariants that no type check can see, both of which have
 * already failed in production once:
 *
 *  1. `/api/internal` must be gated on the PREFIX, before any internal route
 *     registers. Gating per sub-router looks equivalent and is not: every
 *     router added later inherits "open" as its default, which is how
 *     route-stats and gruene-api ended up answering anonymous callers while
 *     their siblings required an admin token.
 *  2. A guard added AFTER a ts-rest mount never runs for that contract's
 *     routes — createExpressEndpoints registers handlers directly on `app`
 *     with absolute paths, bypassing later prefix middleware. That is what
 *     once left /api/exports open, and the same shape gates image-picker and
 *     unsplash today.
 *
 * The check reads the source rather than booting the app: it is the mount
 * ORDER that carries the guarantee, and order is what a diff silently changes.
 */
const routesSource = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'routes.ts'),
  'utf8'
);

const firstIndexOf = (needle: string): number => routesSource.indexOf(needle);

/** Escapes every regex metacharacter, backslash first — a partial escape is
 *  the classic `js/incomplete-sanitization` finding. */
const escapeRegExp = (value: string): string => value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

describe('routes.ts mount order', () => {
  it('gates the whole /api/internal prefix before any internal route registers', () => {
    const gate = firstIndexOf("app.use('/api/internal', requireAdminToken)");
    expect(gate).toBeGreaterThan(-1);

    const otherInternalMounts = [...routesSource.matchAll(/app\.use\('\/api\/internal[^']*'/g)]
      .map((m) => m.index ?? -1)
      .filter((i) => i !== gate);

    for (const index of otherInternalMounts) {
      expect(index).toBeGreaterThan(gate);
    }
  });

  it('gates /api/database with the admin token', () => {
    expect(routesSource).toContain("app.use('/api/database', requireAdminToken");
  });

  it('gates contract-router prefixes before their mount call', () => {
    const cases = [
      { prefix: '/api/image-picker', mount: 'mountImagePickerContractRouter(app)' },
      { prefix: '/api/unsplash', mount: 'mountUnsplashContractRouter(app)' },
      { prefix: '/api/exports', mount: 'mountExportsContractRouter(app)' },
      { prefix: '/api/sharepic/text', mount: 'mountSharepicTextContractRouter(app)' },
      { prefix: '/api/translation', mount: 'mountTranslationContractRouter(app)' },
      { prefix: '/api/voice', mount: 'mountSpeechContractRouter(app)' },
    ];

    for (const { prefix, mount } of cases) {
      // `requireAuth` need not be the FIRST middleware — /api/sharepic/text
      // puts `aiGenerationLimiter` in front of it — only in the same call.
      const guard = routesSource.search(
        new RegExp(`app\\.use\\('${escapeRegExp(prefix)}',[^)]*requireAuth`)
      );
      const mountCall = firstIndexOf(mount);

      expect(guard, `${prefix} has no requireAuth on its prefix`).toBeGreaterThan(-1);
      expect(mountCall).toBeGreaterThan(-1);
      expect(guard, `${prefix} guard must precede ${mount}`).toBeLessThan(mountCall);
    }
  });

  /**
   * Endpoints that call a model are rate-limited on their own sub-path rather
   * than on the prefix, so that listing and reading the surrounding CRUD does
   * not spend the AI budget. Same mount-order rule as above: a limiter added
   * after the ts-rest mount never runs for the contract's routes.
   */
  it('rate-limits the AI sub-paths before their contract mount', () => {
    const cases = [
      { path: '/api/user-agents/draft', mount: 'mountUserAgentsContractRouter(app)' },
      { path: '/api/text-forms/analyze', mount: 'mountUserTextFormsContractRouter(app)' },
      { path: '/api/text-forms/draft', mount: 'mountUserTextFormsContractRouter(app)' },
    ];

    for (const { path: subPath, mount } of cases) {
      const limiter = routesSource.search(
        new RegExp(`app\\.use\\('${escapeRegExp(subPath)}',[^)]*aiGenerationLimiter`)
      );
      const mountCall = firstIndexOf(mount);

      expect(limiter, `${subPath} has no aiGenerationLimiter`).toBeGreaterThan(-1);
      expect(mountCall).toBeGreaterThan(-1);
      expect(limiter, `${subPath} limiter must precede ${mount}`).toBeLessThan(mountCall);
    }
  });

  /**
   * Art.-9-Einwilligung on the AI sub-paths of otherwise non-AI prefixes. Two
   * orderings carry it: the consent gate must come after the prefix's auth
   * (`requireAiConsent` passes callers without `req.user` through), and before
   * the contract mount (see invariant 2 above). Gating the whole prefix instead
   * would lock a user who revoked consent out of reading their own data.
   */
  it('gates AI consent after auth and before the contract mount', () => {
    const cases = [
      {
        path: '/api/auth/user-templates/describe-image',
        auth: "app.use('/api/auth/user-templates', requireAuth",
        mount: 'mountUserTemplatesContractRouter(app)',
      },
      {
        path: '/api/auth/notebook/:id/ask',
        auth: "app.use('/api/auth/notebook', optionalAuth",
        mount: 'mountNotebookContractRouter(app)',
      },
      {
        path: '/api/documents/upload-manual',
        auth: "app.use('/api/documents', requireAuth",
        mount: "app.use('/api/documents', publicReadLimiter, documentsRouter)",
      },
      {
        path: '/api/reisekosten/extract-beleg',
        auth: "app.use('/api/reisekosten', requireAuth",
        mount: 'mountReisekostenContractRouter(app)',
      },
      {
        path: '/api/chat-service/threads/:threadId/generate-title',
        auth: "app.use('/api/chat-service/threads', requireAuth",
        mount: 'mountThreadsContractRouter(app)',
      },
      {
        path: '/api/user-agents/draft',
        auth: "app.use('/api/user-agents', requireAuth",
        mount: 'mountUserAgentsContractRouter(app)',
      },
      {
        path: '/api/text-forms/analyze',
        auth: "app.use('/api/text-forms', requireAuth",
        mount: 'mountUserTextFormsContractRouter(app)',
      },
      {
        path: '/api/text-forms/draft',
        auth: "app.use('/api/text-forms', requireAuth",
        mount: 'mountUserTextFormsContractRouter(app)',
      },
      {
        path: '/api/recurring-tasks/:id/run',
        auth: "app.use('/api/recurring-tasks', requireAuth",
        mount: 'mountRecurringTasksContractRouter(app)',
      },
      {
        path: '/api/docs/generate',
        auth: "app.use('/api/docs', requireAuth",
        mount: 'mountDocsContractRouter(app)',
      },
      {
        path: '/api/docs/ai',
        auth: "app.use('/api/docs', requireAuth",
        mount: "app.use('/api/docs', authenticatedReadLimiter, docsRouter)",
      },
      {
        path: '/api/boards/generate',
        auth: "app.use('/api/boards', requireAuth",
        mount: 'mountBoardsContractRouter(app)',
      },
      {
        path: '/api/boards/:boardId/cards/:cardId/agent-run',
        auth: "app.use('/api/boards', requireAuth",
        mount: 'mountBoardAgentContractRouter(app)',
      },
      {
        path: '/api/board-schedules/:boardId/schedules/:scheduleId/run',
        auth: "app.use('/api/board-schedules', requireAuth",
        mount: 'mountBoardSchedulesContractRouter(app)',
      },
      {
        path: '/api/sheets/:id/ai',
        auth: "app.use('/api/sheets', requireAuth",
        mount: 'mountSheetsContractRouter(app)',
      },
      {
        path: '/api/presentations/:id/ai',
        auth: "app.use('/api/presentations', requireAuth",
        mount: 'mountPresentationsContractRouter(app)',
      },
      {
        path: '/api/video/transcribe',
        auth: "app.use('/api/video', requireAuth",
        mount: 'mountVideoContractRouter(app)',
      },
      {
        path: '/api/auth/notebook/public/:token/ask',
        auth: "app.use('/api/auth/notebook', optionalAuth",
        mount: 'mountNotebookContractRouter(app)',
      },
      {
        path: '/api/documents/upload-default',
        auth: "app.use('/api/documents', requireAuth",
        mount: "app.use('/api/documents', publicReadLimiter, documentsRouter)",
      },
      {
        path: '/api/documents/upload-only',
        auth: "app.use('/api/documents', requireAuth",
        mount: "app.use('/api/documents', publicReadLimiter, documentsRouter)",
      },
      {
        path: '/api/documents/wolke/import',
        auth: "app.use('/api/documents', requireAuth",
        mount: "app.use('/api/documents', publicReadLimiter, documentsRouter)",
      },
      {
        path: '/api/docs/from-import',
        auth: "app.use('/api/docs', requireAuth",
        mount: "app.use('/api/docs', authenticatedReadLimiter, docsRouter)",
      },
      {
        path: '/api/docs/from-wolke',
        auth: "app.use('/api/docs', requireAuth",
        mount: "app.use('/api/docs', authenticatedReadLimiter, docsRouter)",
      },
      {
        path: '/api/board-schedules/:boardId/runs/:taskId/redo',
        auth: "app.use('/api/board-schedules', requireAuth",
        mount: 'mountBoardSchedulesContractRouter(app)',
      },
      {
        path: '/api/sheets/generate',
        auth: "app.use('/api/sheets', requireAuth",
        mount: 'mountSheetsContractRouter(app)',
      },
      {
        path: '/api/presentations/generate',
        auth: "app.use('/api/presentations', requireAuth",
        mount: 'mountPresentationsContractRouter(app)',
      },
    ];

    for (const { path: aiPath, auth, mount } of cases) {
      // The gate may list several paths in one `app.use([...], requireAiConsent)`.
      const gate = routesSource.search(
        new RegExp(`app\\.use\\(\\s*\\[?[^)]*'${escapeRegExp(aiPath)}'[^)]*requireAiConsent`)
      );
      const authCall = firstIndexOf(auth);
      const mountCall = firstIndexOf(mount);

      expect(gate, `${aiPath} has no requireAiConsent`).toBeGreaterThan(-1);
      expect(authCall, `${auth} not found`).toBeGreaterThan(-1);
      expect(mountCall, `${mount} not found`).toBeGreaterThan(-1);
      expect(gate, `${aiPath} consent must follow its auth`).toBeGreaterThan(authCall);
      expect(gate, `${aiPath} consent must precede ${mount}`).toBeLessThan(mountCall);
    }
  });

  /**
   * The inverse invariant. `/api/thumbs` must stay OPEN: a native `<Image>` and
   * a plain `<img>` cannot send an Authorization header, so the permission
   * travels in the URL as an HMAC minted by an endpoint that already checked
   * access. Adding auth here looks like hardening and is a total outage of
   * every preview in the mobile app — which is exactly how reel thumbnails were
   * broken before this endpoint existed.
   */
  it('leaves /api/thumbs unauthenticated', () => {
    const mounts = [...routesSource.matchAll(/app\.use\('\/api\/thumbs[^)]*\)/g)].map((m) => m[0]);
    expect(mounts.length).toBeGreaterThan(0);
    for (const mount of mounts) {
      expect(mount, 'thumbnails must render without a session').not.toMatch(
        /requireAuth|optionalAuth|requireAdminToken/
      );
    }
  });
});
