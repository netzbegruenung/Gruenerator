/**
 * Von der gespeicherten Share-URL zu der, die ein Bild-Element laden kann.
 *
 * `POST /api/media/upload` antwortet mit `shareUrl: '/share/<token>'` — der
 * **Seite**, die ein Mensch öffnet, nicht der Datei. Beim Anlegen einer Vorlage
 * landet genau dieser String als `images[].url` und als `thumbnail_url` in der
 * Datenbank (`userTemplatesContractRouter.ts`). Wer ihn unverändert in ein
 * `<img src>` bzw. expo-image steckt, fragt die SPA nach ihrer `index.html`
 * (Web: 200 text/html, also ein kaputtes Bild) oder ins Leere (Mobile).
 *
 * Die Bytes liegen einen Endpunkt weiter und **unter** dem `/api`-Präfix:
 * `GET /api/share/<token>/preview?w=&fmt=`.
 *
 * Aufgefallen ist das nie, weil der Normalfall in der Vorlagen-Galerie das
 * gecrawlte Canva-`og:image` ist — absolut, geht unverändert durch. Kaputt
 * waren nur die Vorlagen mit selbst hochgeladenen Bildern (#2845).
 */

/** `/share/<token>` — die Seiten-URL, exakt und ohne Query/Fragment. */
const SHARE_PAGE_RE = /^\/share\/([^/?#]+)\/?$/;

export interface SharedMediaPreviewOptions {
  /** API-Basis **inklusive** `/api`. Vorgabe `/api` (gleiche Herkunft, Web). */
  baseUrl?: string;
  /** Variantenbreite; muss zu den vorgenerierten Breiten der API passen. */
  width?: number;
  fmt?: 'webp' | 'avif';
}

/** Der Share-Token aus einer `/share/<token>`-Seiten-URL, sonst `null`. */
export function shareTokenFromShareUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return SHARE_PAGE_RE.exec(url)?.[1] ?? null;
}

/** Die Bild-URL einer Share-Variante: `<base>/share/<token>/preview?w=&fmt=`. */
export function sharedMediaPreviewUrl(
  shareToken: string,
  { baseUrl = '/api', width = 400, fmt = 'webp' }: SharedMediaPreviewOptions = {}
): string {
  return `${baseUrl.replace(/\/$/, '')}/share/${shareToken}/preview?w=${width}&fmt=${fmt}`;
}

/**
 * Eine gespeicherte Bild-URL in eine ladbare übersetzen: `/share/<token>` wird
 * zur Vorschau-Variante, alles andere (absolute Crawler-URLs, `data:`) geht
 * unverändert durch.
 */
export function resolveStoredImageUrl(
  url: string | null | undefined,
  options: SharedMediaPreviewOptions = {}
): string | null {
  if (!url) return null;
  const token = shareTokenFromShareUrl(url);
  return token ? sharedMediaPreviewUrl(token, options) : url;
}
