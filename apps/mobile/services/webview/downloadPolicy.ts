/**
 * Where a file delivered over the WebView bridge is allowed to land, and under
 * what name.
 *
 * Pure functions, deliberately separate from the code that performs the write —
 * the same split, and the same reason, as `navigationPolicy.ts`: this decides
 * what happens with page-supplied bytes, so it should be checkable without a
 * device. Keeping it free of expo imports is also what lets the node test lane
 * see it at all.
 */

/** Longest cache file name we will create, extension included. */
const MAX_FILENAME_LENGTH = 120;

/**
 * Turns a page-supplied name into one that is safe to join onto the cache
 * directory.
 *
 * `shareBytesAsFile` and `base64ToFileUri` both do `new File(Paths.cache, name)`
 * with no checking of their own. Until now every caller passed a name this app
 * built itself; a name that crossed the WebView bridge is the first one the
 * page chose, so `../../../../Documents/x` has to stop here.
 *
 * `parseWebViewMessage` already rejects separators and control characters, and
 * this repeats the work on purpose: validation proves the value is a string,
 * not that it is a base name, and this also guards the direct callers that
 * never went through the parser.
 */
export function safeCacheFilename(raw: string, fallbackExtension = 'bin'): string {
  // Take the last path segment, so a name that is a path collapses to its base.
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  // A leading dot makes a hidden file, and `.`/`..` address directories.
  const withoutLeadingDots = cleaned.replace(/^\.+/, '');
  if (withoutLeadingDots.length === 0) return `export_${Date.now()}.${fallbackExtension}`;
  if (withoutLeadingDots.length <= MAX_FILENAME_LENGTH) return withoutLeadingDots;

  // Truncate the stem, never the extension: iOS picks the target app from the
  // extension, so losing it lands the file nowhere.
  const dot = withoutLeadingDots.lastIndexOf('.');
  if (dot <= 0) return withoutLeadingDots.slice(0, MAX_FILENAME_LENGTH);
  const extension = withoutLeadingDots.slice(dot);
  const stemBudget = Math.max(1, MAX_FILENAME_LENGTH - extension.length);
  return withoutLeadingDots.slice(0, stemBudget) + extension;
}

/**
 * Where a file of this type should go. Images belong in the gallery, where the
 * user looks for a sharepic; everything else goes to the share sheet, which can
 * hand it to any app that understands the type.
 */
export function pickTarget(mime: string): 'gallery' | 'share' {
  return mime.toLowerCase().startsWith('image/') ? 'gallery' : 'share';
}
