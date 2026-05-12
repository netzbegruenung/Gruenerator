export type ScraperErrorKind =
  | 'timeout'
  | 'http_404'
  | 'http_5xx'
  | 'network'
  | 'layout_changed'
  | 'unknown';

export interface ClassifiedScraperError {
  kind: ScraperErrorKind;
  lvFacingMessage: string;
  hint?: string;
}

const TIMEOUT_PATTERNS = [/timeout/i, /etimedout/i, /timed out/i, /aborted/i];
const NETWORK_PATTERNS = [
  /econnrefused/i,
  /econnreset/i,
  /enotfound/i,
  /network/i,
  /dns/i,
  /getaddrinfo/i,
  /tls/i,
  /certificate/i,
];
const LAYOUT_PATTERNS = [
  /selector .* did not match/i,
  /no listing items/i,
  /could not extract/i,
  /no articles found/i,
  /parse error/i,
];

function extractStatusCode(message: string): number | null {
  const match = message.match(/\b(?:HTTP|status)[\s:]*(\d{3})\b/i);
  if (match) return parseInt(match[1], 10);
  const bare = message.match(/\b(4\d{2}|5\d{2})\b/);
  return bare ? parseInt(bare[1], 10) : null;
}

export function classifyScraperError(error: unknown): ClassifiedScraperError {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (TIMEOUT_PATTERNS.some((re) => re.test(message))) {
    return {
      kind: 'timeout',
      lvFacingMessage: 'Eure Website hat heute zu lange gebraucht, um zu antworten.',
      hint: 'Falls das öfter passiert, prüft bitte eure Server-Antwortzeiten oder eventuelle Bot-Sperren.',
    };
  }

  const status = extractStatusCode(message);
  if (status === 404) {
    return {
      kind: 'http_404',
      lvFacingMessage:
        'Eine eurer Übersichtsseiten erreicht uns nicht mehr (Fehler 404 — Seite nicht gefunden).',
      hint: 'Wurde eine URL umbenannt oder ein Bereich entfernt? Wir schauen uns das gerne mit euch an.',
    };
  }
  if (status !== null && status >= 500 && status < 600) {
    return {
      kind: 'http_5xx',
      lvFacingMessage: `Eure Website hat heute mit einem Server-Fehler geantwortet (HTTP ${status}).`,
      hint: 'Das ist meist ein temporäres Problem auf eurer Seite. Falls es anhält, kontaktiert bitte euer Hosting.',
    };
  }

  if (NETWORK_PATTERNS.some((re) => re.test(message))) {
    return {
      kind: 'network',
      lvFacingMessage: 'Wir konnten eure Website heute technisch nicht erreichen.',
      hint: 'Manchmal liegt das an DNS- oder Zertifikats-Problemen. Falls es anhält, melden wir uns mit Details.',
    };
  }

  if (LAYOUT_PATTERNS.some((re) => re.test(message))) {
    return {
      kind: 'layout_changed',
      lvFacingMessage: 'Das Layout eurer Übersichtsseiten scheint sich geändert zu haben.',
      hint: 'Wir prüfen das von unserer Seite und passen die Erkennung an. Eine kurze Info, falls ihr kürzlich umgestellt habt, hilft uns sehr.',
    };
  }

  return {
    kind: 'unknown',
    lvFacingMessage: 'Wir konnten eure Inhalte heute nicht abrufen.',
    hint: 'Wir prüfen das von unserer Seite. Bei wiederholten Problemen melden wir uns.',
  };
}
