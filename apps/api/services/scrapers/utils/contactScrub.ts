/**
 * Strip third-party contact data out of Wolke share document text before it is
 * stored. A production check of LV Berlin's Wahlprüfsteine share found private
 * third-party e-mail addresses (posteo/web.de/riseup) sitting in the extracted
 * text next to the party's own function addresses, plus labeled phone numbers.
 * Pure and side-effect-free so it is testable without a document pipeline.
 */

/** Party function addresses live under a domain containing "gruen" (gruene-berlin.de, grueneberlin.de, gruene.de, …). */
function isPartyDomain(domain: string): boolean {
  return domain.toLowerCase().includes('gruen');
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Longest label first so a plain "Tel" doesn't shadow "Telefon" before
// backtracking gets a chance to try it.
const PHONE_RE = /\b(Telefon|Tel\.|Tel|Mobil|Handy|Fon|Fax)(:?\s*)[+\d][\d\s/()-]*\d/gi;

export function scrubThirdPartyContacts(text: string): { text: string; redactions: number } {
  let redactions = 0;

  let scrubbed = text.replace(EMAIL_RE, (match) => {
    const domain = match.slice(match.lastIndexOf('@') + 1);
    if (isPartyDomain(domain)) return match;
    redactions++;
    return '[E-Mail entfernt]';
  });

  scrubbed = scrubbed.replace(PHONE_RE, (_match, label: string, sep: string) => {
    redactions++;
    return `${label}${sep}[Telefon entfernt]`;
  });

  return { text: scrubbed, redactions };
}
