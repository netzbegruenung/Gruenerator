/**
 * Strips leading/trailing hyphens. Scanned rather than matched: `/^-+|-+$/g` is
 * quadratic in the input length on a long run of hyphens, because the engine
 * retries the unanchored `-+$` alternative from every position (CodeQL
 * js/polynomial-redos).
 */
function trimHyphens(input: string): string {
  let start = 0;
  let end = input.length;
  while (start < end && input[start] === '-') start += 1;
  while (end > start && input[end - 1] === '-') end -= 1;
  return input.slice(start, end);
}

export function nameToSubdomain(name: string): string {
  const transliterated = name
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss');

  const raw = trimHyphens(transliterated.toLowerCase().replace(/[^a-z0-9]+/g, '-'));

  return sanitizeSubdomain(raw);
}

export function sanitizeSubdomain(input: string): string {
  return trimHyphens(
    input
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/--+/g, '-')
  ).slice(0, 50);
}

export function sanitizeEmail(input: string): string {
  return input.trim().slice(0, 254);
}

export function sanitizeUrl(input: string): string {
  return input.trim();
}

export function sanitizePhone(input: string): string {
  return input.trim().slice(0, 30);
}
