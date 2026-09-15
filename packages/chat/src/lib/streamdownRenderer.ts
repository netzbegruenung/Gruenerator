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
 * Default is `legacy` until the Streamdown path is validated in production;
 * the default flips in a follow-up and the legacy branch is deleted after
 * (see the migration PR).
 */
const RENDERER_KEY = 'gruenerator-chat-renderer';
const DEFAULT_STREAMDOWN = false;

export function isStreamdownRendererEnabled(): boolean {
  if (typeof window === 'undefined') return DEFAULT_STREAMDOWN;
  const value = window.localStorage.getItem(RENDERER_KEY);
  if (value === 'streamdown') return true;
  if (value === 'legacy') return false;
  return DEFAULT_STREAMDOWN;
}
