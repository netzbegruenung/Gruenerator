/**
 * Placeholder Text Constants
 *
 * Centralized placeholder text for new pages in multi-page canvas templates.
 * These provide example content so users see meaningful text when adding new pages.
 */

export const PLACEHOLDER_TEXT = {
  // Simple template
  headline: 'Ihre Überschrift hier',
  subtext: 'Hier steht Ihre Botschaft',

  // Zitat templates
  quote: 'Hier steht Ihr Zitat.\nEin gutes Zitat inspiriert.',
  name: 'Maxi Mustermensch',

  // Info template
  header: 'Wussten Sie schon?',
  body: 'Hier können Sie Ihren Text einfügen.',

  // Dreizeilen template
  line1: 'Erste Zeile',
  line2: 'Zweite Zeile',
  line3: 'Dritte Zeile',

  // Veranstaltung template
  eventTitle: 'VERANSTALTUNG',
  beschreibung: 'Beschreibung hier eingeben',
  weekday: 'MI',
  date: '15.01.',
  time: '19 UHR',
  locationName: 'Veranstaltungsort',
  address: 'Musterstraße 1, 12345 Stadt',
} as const;

/**
 * Get a placeholder value by key with type-safe lookup.
 * Returns empty string if key doesn't exist.
 */
export function getPlaceholder(key: string): string {
  return PLACEHOLDER_TEXT[key as keyof typeof PLACEHOLDER_TEXT] ?? '';
}
