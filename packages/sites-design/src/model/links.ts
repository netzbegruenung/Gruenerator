const PLAIN_EMAIL = /^[^\s@?]+@[^\s@?]+$/;

export function safeHref(value: string): string | null {
  const href = value.trim();
  if (/^https?:/i.test(href)) {
    try {
      const url = new URL(href);
      const isHttp = url.protocol === 'https:' || url.protocol === 'http:';
      return isHttp && url.username === '' && url.password === '' ? href : null;
    } catch {
      return null;
    }
  }
  if (/^mailto:/i.test(href)) {
    const address = href.slice('mailto:'.length);
    return PLAIN_EMAIL.test(address) ? href : null;
  }
  if (/^tel:\+?[0-9]{3,20}$/.test(href)) return href;
  if (/^#[a-z][a-z0-9-]*$/.test(href)) return href;
  return null;
}

export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 3) return null;
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

export function reportHref(email: string, pageUrl: string): string | null {
  if (!PLAIN_EMAIL.test(email)) return null;
  const subject = encodeURIComponent('Meldung einer Website');
  return `mailto:${email}?subject=${subject}&body=${encodeURIComponent(pageUrl)}`;
}
