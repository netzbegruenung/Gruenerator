/**
 * Runtime toggle between the legacy react-markdown renderer and the
 * Streamdown renderer for assistant messages (CitationMarkdownText).
 *
 * Read once per render from localStorage, so flipping it in the browser
 * console + reloading is enough for QA — no build-time plumbing, no server
 * round-trip:
 *
 *   localStorage.setItem('gruenerator-chat-renderer', 'streamdown')
 *   localStorage.setItem('gruenerator-chat-renderer', 'legacy')
 *   localStorage.removeItem('gruenerator-chat-renderer')  // back to default
 *
 * Default is `streamdown`; `legacy` stays available per browser as the
 * rollback for QA. The legacy branch is deleted once the Streamdown path has
 * held up in production.
 */
const RENDERER_KEY = 'gruenerator-chat-renderer';
const DEFAULT_STREAMDOWN = true;

export function isStreamdownRendererEnabled(): boolean {
  if (typeof window === 'undefined') return DEFAULT_STREAMDOWN;
  const value = window.localStorage.getItem(RENDERER_KEY);
  if (value === 'streamdown') return true;
  if (value === 'legacy') return false;
  return DEFAULT_STREAMDOWN;
}
