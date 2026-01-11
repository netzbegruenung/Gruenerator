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
