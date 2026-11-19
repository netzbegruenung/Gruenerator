type ConsentStorage = Pick<Storage, 'getItem' | 'setItem'>;

const STORAGE_KEY = 'gruenerator-sites-embed-consent';
const EMBED_SRC = /^https:\/\/www\.instagram\.com\/[A-Za-z0-9._]{1,30}\/embed$/;

function readConsent(storage: ConsentStorage | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function isGranted(storage: ConsentStorage | null): boolean {
  const entry = readConsent(storage)['instagram'];
  return (
    typeof entry === 'object' && entry !== null && (entry as { granted?: unknown }).granted === true
  );
}

function load(block: Element, doc: Document): void {
  const src = block.getAttribute('data-embed-src') ?? '';
  const target = block.querySelector('[data-consent-target]');
  if (!EMBED_SRC.test(src) || !target || target.querySelector('iframe')) return;
  const frame = doc.createElement('iframe');
  frame.src = src;
  frame.title = block.getAttribute('data-embed-title') ?? '';
  frame.loading = 'lazy';
  frame.setAttribute('allow', 'encrypted-media');
  frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  frame.className = 'site:block site:min-h-[28rem] site:w-full site:rounded-card site:border-0';
  target.appendChild(frame);
  block.querySelector('[data-consent-prompt]')?.setAttribute('hidden', '');
  frame.focus();
}

export function initSiteConsent(doc: Document, storage: ConsentStorage | null): void {
  const root = doc.documentElement;
  if (root.hasAttribute('data-site-consent-ready')) return;
  root.setAttribute('data-site-consent-ready', '');

  for (const block of doc.querySelectorAll('[data-site-consent="instagram"]')) {
    if (isGranted(storage)) load(block, doc);
    block.querySelector('[data-consent-load]')?.addEventListener('click', () => {
      const remember = block.querySelector<HTMLInputElement>('[data-consent-remember]');
      if (remember?.checked && storage) {
        try {
          storage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              ...readConsent(storage),
              instagram: { granted: true, remember: true, timestamp: new Date().toISOString() },
            })
          );
        } catch {
          // storage refused: the choice just is not remembered
        }
      }
      load(block, doc);
    });
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

initSiteConsent(document, safeLocalStorage());
