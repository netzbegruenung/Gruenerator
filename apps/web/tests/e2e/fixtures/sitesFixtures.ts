/**
 * Stateful stub of the candidate-site API for `sites.spec.ts`, plus the public
 * side: `https://sites.test/<handle>` is answered with the REAL output of
 * `renderSitePage()` and the REAL `site.css` — only the host is invented.
 *
 * Boundary: no API, no database, no Hocuspocus. Matching is a path predicate on
 * `/api/sites`, never a glob over all API paths (see the header of
 * `recipes.spec.ts`). Everything else stays with `installApiFixtures`.
 *
 * Not stubbed, and therefore not covered: the collaborative draft. The editor
 * opens a Hocuspocus connection after `prepareSiteDraft`; there is no server
 * for it here, so the editor shell cannot reach its `ready` state.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildSiteSnapshot,
  type PublishedSiteSnapshot,
  type Site,
  type SiteLegalDraft,
  type SupportedLocale,
  type WebsiteContent,
} from '@gruenerator/contracts';
import { renderSitePage } from '@gruenerator/sites-design/server';
import { type BrowserContext, type Page, type Route } from '@playwright/test';

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
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
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
      about: { title: GENERATED.about.title, content: doc(GENERATED.about.content) },
      themes: GENERATED.themes.map((t) => ({
        imageUrl: '',
        title: t.title,
        content: doc(t.content),
      })),
      actions: GENERATED.actions.map((a) => ({ imageUrl: '', text: a.text, link: a.link })),
      contact: { title: GENERATED.contact.title, backgroundImageUrl: '' },
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
  locale: SupportedLocale
): ReturnType<typeof buildSiteSnapshot> {
  if (!state.site) throw new Error('no site to publish');
  const built = buildSiteSnapshot(state.site, locale);
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
  options: { unlocked: boolean; locale?: SupportedLocale }
): { state: SitesStubState } {
  const locale = options.locale ?? 'de-DE';
  const state: SitesStubState = { site: null, snapshot: null, published: false, createBodies: [] };

  if (options.unlocked) {
    // The bypass session is built in the browser and has no `sites_unlocked`;
    // there is no status request to answer. Patch the store the gate reads, on
    // every document, as soon as a user is in it.
    page.on('domcontentloaded', () => {
      void page
        .evaluate(async (loc) => {
          const { useAuthStore } = await import('/src/stores/authStore.ts');
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

  const isSitesApi = (url: URL) => url.pathname.startsWith('/api/sites/');
  void page.route(isSitesApi, async (route) => {
    const request = route.request();
    const { pathname, searchParams } = new URL(request.url());
    const method = request.method();
    const tail = pathname.replace('/api/sites/', '');

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
      const built = publishFromDraft(state, locale);
      if (!built.ok)
        return json(route, { error: 'Veröffentlichen nicht möglich', issues: built.issues }, 422);
      return json(route, { site: state.site });
    }
    return route.fallback();
  });

  return { state };
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
