/**
 * Ein kleiner Browser-Ersatz für die Formulare von antragsgruen.de: Cookies
 * über Weiterleitungen und Subdomains hinweg, CSRF-Token aus der Seite.
 *
 * Antragsgrün hat für das Anlegen einer Seite und das Eintragen von Personen
 * keine REST-API — nur die HTML-Formulare, mit Yii-Session und `_csrf`. Das
 * Session-Cookie gilt für `.antragsgruen.de`, also auch auf der neuen
 * Subdomain; das `_csrf`-Cookie gilt nur für den Host, der es gesetzt hat.
 */
import * as cheerio from 'cheerio';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface StoredCookie {
  name: string;
  value: string;
  /** `Domain=`-Attribut ohne Punkt; `null` = nur der setzende Host. */
  domain: string | null;
  host: string;
}

export class AntragsgruenFormError extends Error {
  constructor(
    message: string,
    readonly step: string,
    /** Gesetzt, wenn die Seite schon steht und erst ein späterer Schritt scheiterte. */
    readonly siteUrl: string | null = null
  ) {
    super(message);
    this.name = 'AntragsgruenFormError';
  }
}

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 20_000;

function hostMatches(cookie: StoredCookie, host: string): boolean {
  if (cookie.domain === null) return cookie.host === host;
  return host === cookie.domain || host.endsWith(`.${cookie.domain}`);
}

export class FormClient {
  readonly #cookies: StoredCookie[] = [];

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly userAgent = 'Gruenerator (gruenerator.eu)'
  ) {}

  #store(url: URL, headers: Headers): void {
    for (const line of headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const domainAttr = attrs
        .map((a) => a.trim())
        .find((a) => a.toLowerCase().startsWith('domain='));
      const domain = domainAttr ? domainAttr.slice(7).replace(/^\./, '').toLowerCase() : null;
      const deleted = value === '' || value === 'deleted';
      const at = this.#cookies.findIndex(
        (c) => c.name === name && c.domain === domain && (domain !== null || c.host === url.host)
      );
      if (at >= 0) this.#cookies.splice(at, 1);
      if (!deleted) this.#cookies.push({ name, value, domain, host: url.host });
    }
  }

  #cookieHeader(url: URL): string {
    return this.#cookies
      .filter((c) => hostMatches(c, url.hostname) || hostMatches(c, url.host))
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
  }

  /** Ein Aufruf mit Cookies; Weiterleitungen werden selbst verfolgt, damit kein Cookie verloren geht. */
  async request(
    url: string,
    init: {
      method?: 'GET' | 'POST';
      form?: URLSearchParams;
      /** JSON-Body samt CSRF-Token (Kopf `X-CSRF-Token`) für die Admin-Endpunkte, die keine REST-Controller sind. */
      json?: { body: unknown; csrf?: string };
      /** JWT für die REST-API (`Authorization: Bearer`). */
      bearer?: string;
    } = {}
  ): Promise<{ status: number; url: string; html: string; redirected: boolean }> {
    let target = new URL(url);
    let method = init.method ?? 'GET';
    let body: string | null = init.json
      ? JSON.stringify(init.json.body)
      : init.form
        ? init.form.toString()
        : null;
    const contentType = init.json ? 'application/json' : 'application/x-www-form-urlencoded';
    let redirected = false;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers: Record<string, string> = { 'user-agent': this.userAgent };
      const cookie = this.#cookieHeader(target);
      if (cookie) headers.cookie = cookie;
      if (body) headers['content-type'] = contentType;
      if (body && init.json?.csrf) headers['x-csrf-token'] = init.json.csrf;
      if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;
      const res = await this.fetchImpl(target.toString(), {
        method,
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      this.#store(target, res.headers);
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        target = new URL(location, target);
        method = 'GET';
        body = null;
        redirected = true;
        continue;
      }
      return { status: res.status, url: target.toString(), html: await res.text(), redirected };
    }
    throw new AntragsgruenFormError('Zu viele Weiterleitungen', 'redirect');
  }
}

/** Das CSRF-Token eines Formulars (Yii: `<input name="_csrf">` bzw. `<meta name="csrf-token">`). */
export function csrfOf(html: string): string | null {
  const $ = cheerio.load(html);
  return (
    $('input[name="_csrf"]').first().attr('value') ??
    $('meta[name="csrf-token"]').attr('content') ??
    null
  );
}

/**
 * Die Werte eines Formulars, wie der Browser sie absenden würde: angehakte
 * Kästchen und Optionen, gewählte Einträge, Textfelder. Antragsgrün speichert
 * Einstellungen als ganzes Formular — ein fehlendes Kästchen heisst „aus".
 * Wer ein einzelnes Feld ändern will, schickt deshalb alles andere unverändert mit.
 */
export function formValuesOf(html: string, formSelector: string): URLSearchParams | null {
  const $ = cheerio.load(html);
  const form = $(formSelector).first();
  if (form.length === 0) return null;
  const out = new URLSearchParams();
  form.find('input, select, textarea').each((_, el) => {
    const $el = $(el);
    const name = $el.attr('name');
    if (!name || $el.is('[disabled]')) return;
    if (el.tagName === 'select') {
      const chosen = $el.find('option[selected]');
      const options = chosen.length ? chosen : $el.find('option').first();
      options.each((__, o) => {
        out.append(name, $(o).attr('value') ?? $(o).text());
      });
      return;
    }
    if (el.tagName === 'textarea') {
      out.append(name, $el.text());
      return;
    }
    const type = ($el.attr('type') ?? 'text').toLowerCase();
    if (['submit', 'button', 'image', 'reset', 'file'].includes(type)) return;
    if ((type === 'checkbox' || type === 'radio') && !$el.is('[checked]')) return;
    out.append(name, $el.attr('value') ?? (type === 'checkbox' || type === 'radio' ? 'on' : ''));
  });
  return out;
}

/** Fehlermeldungen, wie Antragsgrün sie über Formularen zeigt. */
export function alertsOf(html: string): string[] {
  const $ = cheerio.load(html);
  return $('.alert-danger')
    .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
    .get()
    .filter(Boolean);
}
