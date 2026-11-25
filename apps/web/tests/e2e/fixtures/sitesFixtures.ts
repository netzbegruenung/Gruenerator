/**
 * Stateful stub of the candidate-site API for `sites.spec.ts`, plus the public
 * side: `https://sites.test/<handle>` is answered with the REAL output of
 * `renderSitePage()` and the REAL `site.css` — only the host is invented.
 *
 * Boundary: no API, no database, no Hocuspocus. Matching is a path predicate on
 * `/api/sites`, never a glob over all API paths (see the header of
 * `recipes.spec.ts`). Everything else stays with `installApiFixtures`.
 *
 * The collaborative draft is not stubbed but served: `startDraftServer` runs a
 * bare in-memory Hocuspocus on the port the Vite `/ws` proxy forwards to.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildSiteSnapshot,
  siteDraftFromSite,
  siteDraftToSnapshotSource,
  type PublishedSiteSnapshot,
  type SiteMember,
  type SiteDraft,
  type SiteSnapshotSource,
  type Site,
  type SiteLegalDraft,
  type SupportedLocale,
  type WebsiteContent,
} from '@gruenerator/contracts';
import { decodeSiteDraft, encodeSiteSeed } from '@gruenerator/contracts/site-ydoc';
import { renderSitePage } from '@gruenerator/sites-design/server';
import { Server } from '@hocuspocus/server';
import { type BrowserContext, type Page, type Route } from '@playwright/test';
import * as Y from 'yjs';

export const PUBLIC_ORIGIN = 'https://sites.test';
export const HANDLE = 'e2e-kandidatin';
const SITE_ID = '5a1e0000-0000-4000-8000-000000000001';
const ZEITPUNKT = '2026-11-19T10:00:00.000Z';

export const GENERATED: WebsiteContent = {
  hero: { heading: 'Anna Beispiel', text: 'Für ein lebenswertes Musterstadt' },
  about: {
    title: 'Wer ich bin',
    content: 'Ich bin Stadträtin und setze mich seit zehn Jahren für Klimaschutz ein.',
  },
  hero_image: { title: 'Zusammen anpacken', subtitle: 'Für Musterstadt' },
  themes: [
    { title: 'Klimaschutz', content: 'Wir bauen Solaranlagen auf jedes öffentliche Dach.' },
    { title: 'Wohnen', content: 'Bezahlbarer Wohnraum für alle Generationen.' },
  ],
  actions: [{ text: 'Kontakt aufnehmen', link: '#kontakt' }],
  contact: { title: 'Kontakt', email: 'anna@example.org' },
};

export const LEGAL: SiteLegalDraft = {
  name: 'Anna Beispiel',
  street: 'Musterstraße 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'anna@example.org',
};

export interface SitesStubState {
  site: Site | null;
  snapshot: PublishedSiteSnapshot | null;
  published: boolean;
  createBodies: unknown[];
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
});

export function makeSite(over: Partial<Site> = {}): Site {
  return {
    id: SITE_ID,
    user_id: '00000000-0000-4000-a000-000000000001',
    subdomain: HANDLE,
    is_published: false,
    site_title: GENERATED.hero.heading,
    tagline: GENERATED.hero.text,
    contact_email: GENERATED.contact.email,
    contact_phone: null,
    contact_website: null,
    social_links: {},
    theme: null,
    accent_color: null,
    profile_image: null,
    background_image: null,
    sections: {
      blocks: [
        { id: 'hero', type: 'hero' },
        {
          id: 'about',
          type: 'about',
          title: GENERATED.about.title,
          content: doc(GENERATED.about.content),
        },
        {
          id: 'banner',
          type: 'heroImage',
          imageUrl: '',
          title: 'Gemeinsam für eine nachhaltige Zukunft!',
          subtitle: '',
        },
        {
          id: 'themes',
          type: 'themes',
          items: GENERATED.themes.map((t, i) => ({
            id: `theme-${i + 1}`,
            imageUrl: '',
            title: t.title,
            content: doc(t.content),
          })),
        },
        {
          id: 'actions',
          type: 'actions',
          items: GENERATED.actions.map((a, i) => ({
            id: `action-${i + 1}`,
            imageUrl: '',
            text: a.text,
            link: a.link,
          })),
        },
        {
          id: 'feed',
          type: 'socialFeed',
          title: 'Instagram',
          instagramUsername: '',
          hidden: true,
        },
        {
          id: 'contact',
          type: 'contact',
          title: GENERATED.contact.title,
          backgroundImageUrl: '',
        },
      ],
    },
    created_at: ZEITPUNKT,
    updated_at: ZEITPUNKT,
    last_published: null,
    visit_count: 0,
    meta_description: null,
    meta_keywords: null,
    legal: LEGAL,
    moderation: 'ok',
    has_unpublished_changes: false,
    published_snapshot: null,
    ...over,
  };
}

/** What the server does on publish: build the snapshot from the draft row. */
export function publishFromDraft(
  state: SitesStubState,
  locale: SupportedLocale,
  source?: SiteSnapshotSource
): ReturnType<typeof buildSiteSnapshot> {
  if (!state.site) throw new Error('no site to publish');
  const built = buildSiteSnapshot(source ?? state.site, locale);
  if (built.ok) {
    state.snapshot = built.snapshot;
    state.published = true;
    state.site = {
      ...state.site,
      is_published: true,
      last_published: ZEITPUNKT,
      published_snapshot: built.snapshot,
    };
  }
  return built;
}

export function installSitesApi(
  page: Page,
  options: {
    unlocked: boolean;
    locale?: SupportedLocale;
    /** The live draft, when a room serves one: publish builds the snapshot from it, as the API does. */
    readDraft?: () => SiteDraft | null;
    /** The caller's role on the site (default `admin`). */
    role?: 'admin' | 'editor' | 'viewer';
    /** The project a project site belongs to (default none). */
    group?: { id: string; name: string } | null;
    members?: SiteMember[];
  }
): { state: SitesStubState } {
  const locale = options.locale ?? 'de-DE';
  const role = options.role ?? 'admin';
  const group = options.group ?? null;
  const state: SitesStubState = { site: null, snapshot: null, published: false, createBodies: [] };

  if (options.unlocked) {
    // The bypass session is built in the browser and has no `sites_unlocked`;
    // there is no status request to answer. Patch the store the gate reads, on
    // every document, as soon as a user is in it.
    page.on('domcontentloaded', () => {
      void page
        .evaluate(async (loc) => {
          type AuthUser = Record<string, unknown>;
          interface AuthStoreModule {
            useAuthStore: {
              getState: () => { user: AuthUser | null };
              setState: (state: { user: AuthUser }) => void;
              subscribe: (listener: () => void) => void;
            };
          }
          const storePath = '/src/stores/authStore.ts';
          const { useAuthStore } = (await import(storePath)) as AuthStoreModule;
          const patch = () => {
            const { user } = useAuthStore.getState();
            if (user && user.sites_unlocked !== true) {
              useAuthStore.setState({ user: { ...user, sites_unlocked: true, locale: loc } });
            }
          };
          patch();
          useAuthStore.subscribe(patch);
        }, locale)
        .catch(() => undefined);
    });
  }

  const isSitesApi = (url: URL) =>
    url.pathname === '/api/sites' || url.pathname.startsWith('/api/sites/');
  void page.route(isSitesApi, async (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const method = request.method();
    const tail = pathname.replace('/api/sites/', '');

    if (method === 'GET' && pathname === '/api/sites') {
      const sites = state.site
        ? [{ ...state.site, role, group, is_creator: role === 'admin' }]
        : [];
      return json(route, { sites, public_origin: PUBLIC_ORIGIN, limit: 25 });
    }
    if (method === 'GET' && tail.startsWith('by-handle/')) {
      const handle = decodeURIComponent(tail.slice('by-handle/'.length));
      const site = state.site;
      if (!site || (site.subdomain !== handle && site.id !== handle)) {
        return json(route, { error: 'Website nicht gefunden' }, 404);
      }
      return json(route, { site, role, group, public_origin: PUBLIC_ORIGIN });
    }
    if (method === 'GET' && tail === 'my-site') {
      return json(route, { site: state.site, public_origin: PUBLIC_ORIGIN });
    }
    if (method === 'GET' && tail === 'check-subdomain') {
      return json(route, { available: searchParams.get('subdomain') !== '' });
    }
    if (method === 'POST' && tail === 'generate') {
      const frame = (event: unknown) =>
        `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`;
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          frame({ type: 'start', steps: ['analyze', 'write'] }),
          frame({ type: 'step', step: 'analyze' }),
          frame({ type: 'step', step: 'write' }),
          frame({ type: 'done', content: GENERATED }),
        ].join(''),
      });
    }
    if (method === 'POST' && tail === 'create') {
      const body = request.postDataJSON() as Partial<Site> & { subdomain: string };
      state.createBodies.push(body);
      state.site = makeSite({
        subdomain: body.subdomain,
        site_title: body.site_title ?? '',
        tagline: body.tagline ?? null,
        contact_email: body.contact_email ?? null,
        sections: body.sections ?? null,
        legal: null,
      });
      return json(route, { site: state.site });
    }

    const [id, action] = tail.split('/');
    if (!state.site || id !== state.site.id) return json(route, { error: 'Not found' }, 404);

    if (method === 'GET' && action === 'members') {
      return json(route, { members: options.members ?? [] });
    }
    if (method === 'GET' && action === 'groups') return json(route, { groups: [] });

    if (method === 'PUT' && !action) {
      const body = request.postDataJSON() as Partial<Site>;
      state.site = { ...state.site, ...body, has_unpublished_changes: state.published };
      return json(route, { site: state.site });
    }
    if (method === 'POST' && action === 'draft') return json(route, { seeded: true });
    if (method === 'POST' && action === 'publish') {
      const { publish } = request.postDataJSON() as { publish: boolean };
      if (!publish) {
        state.snapshot = null;
        state.published = false;
        state.site = { ...state.site, is_published: false, published_snapshot: null };
        return json(route, { site: state.site });
      }
      const draft = options.readDraft?.() ?? null;
      const built = publishFromDraft(
        state,
        locale,
        draft ? siteDraftToSnapshotSource(draft, state.site.legal) : undefined
      );
      if (!built.ok)
        return json(route, { error: 'Veröffentlichen nicht möglich', issues: built.issues }, 422);
      return json(route, { site: state.site });
    }
    return route.fallback();
  });

  return { state };
}

/** The room the editor opens for a site (`site-<lowercase uuid>`, see `useSiteDraftSession`). */
export const SITE_ROOM = `site-${SITE_ID.toLowerCase()}`;
/** Where the Vite proxy forwards `/ws`; a bare server here needs no URL wiring. */
const HOCUSPOCUS_PORT = 1240;

/**
 * A bare in-memory Hocuspocus (no auth, no persistence) holding the site's
 * draft room, seeded from the same codec the API uses. Stands in for
 * `services/hocuspocus`, which is exercised by its own tests.
 */
export async function startDraftServer(site: Site): Promise<{
  /** The draft the room was seeded with. */
  seeded: SiteDraft;
  readDraft: () => SiteDraft | null;
  close: () => Promise<void>;
}> {
  const seeded = siteDraftFromSite(site);
  const seed = encodeSiteSeed(seeded, ZEITPUNKT);
  const server = new Server({
    port: HOCUSPOCUS_PORT,
    quiet: true,
    stopOnSignals: false,
    async onLoadDocument({ document }) {
      Y.applyUpdate(document, seed);
    },
  });
  await server.listen();
  return {
    seeded,
    readDraft: () => {
      const doc = server.hocuspocus.documents.get(SITE_ROOM);
      return doc ? decodeSiteDraft(doc) : null;
    },
    close: () => server.destroy(),
  };
}

const SITE_DESIGN = new URL('../../../../../packages/sites-design/', import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, SITE_DESIGN)));

/**
 * `https://sites.test/<handle>`: the renderer's own output as served by the API,
 * with its own stylesheet and nothing of the app. Host gate, CSP and caching
 * are covered on the API side (`sitesHostGate.vitest.ts`, `sitePages.vitest.ts`).
 */
export async function installPublicSite(
  context: BrowserContext,
  state: SitesStubState
): Promise<void> {
  await context.route(
    (url) => url.origin === PUBLIC_ORIGIN,
    (route) => {
      const { pathname } = new URL(route.request().url());
      if (pathname === '/_site/site.css') {
        return route.fulfill({ status: 200, contentType: 'text/css', body: read('dist/site.css') });
      }
      const font = /^\/_site\/fonts\/(.+)$/.exec(pathname);
      if (font) {
        try {
          return route.fulfill({
            status: 200,
            contentType: 'font/woff2',
            body: read(`assets/fonts/${font[1]}`),
          });
        } catch {
          return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
        }
      }
      if (pathname === `/${HANDLE}` && state.snapshot) {
        const { html } = renderSitePage({
          snapshot: state.snapshot,
          handle: HANDLE,
          document: 'home',
          origin: PUBLIC_ORIGIN,
          stylesheetHref: '/_site/site.css',
          fontUrl: (file) => `/_site/fonts/${file}`,
          consentScriptSrc: '/_site/consent.js',
          reportEmail: 'melden@example.org',
          robots: 'noindex',
        });
        return route.fulfill({ status: 200, contentType: 'text/html', body: html });
      }
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    }
  );
}
