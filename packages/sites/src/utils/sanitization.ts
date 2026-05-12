export function nameToSubdomain(name: string): string {
  const transliterated = name
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss');

  const raw = transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitizeSubdomain(raw);
}

export function sanitizeSubdomain(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
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
