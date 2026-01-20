/**
 * Maps component names to document types for the save-to-library API
 * Ensures consistent type categorization across all text generators
 */

export const DOCUMENT_TYPE_MAP: Record<string, string> = {
  // Texte tab (main generator) - uses 'text' to match existing saved data
  'texte-generator': 'text',

  // Universal generators
  'universal-text': 'universal',
  'rede': 'rede',
  'wahlprogramm': 'wahlprogramm',
  'buergeranfragen': 'buergeranfragen',

  // Antrag generators
  'antrag-generator': 'antrag',
  'kleine-anfrage': 'kleine_anfrage',
  'grosse-anfrage': 'grosse_anfrage',

  // Press and social
  'presse-social': 'press',
  'pressemitteilung': 'pressemitteilung',

  // Campaign generators
  'kampagnen-generator': 'social',
  'weihnachten': 'social',

  // Accessibility generators
  'leichte-sprache': 'text',
  'alt-text': 'text',
  'accessibility-generator': 'accessibility',
  'barrierefreiheit': 'accessibility',

  // Other generators
  'website-generator': 'text',
  'texteditor': 'text',
  'notebook': 'text',
  'ask': 'text',
  'ask-grundsatz': 'text',

  // Youth generators
  'gruene-jugend': 'gruene_jugend',
};

/**
 * Get the document type for a given component name
 * @param componentName - The component identifier
 * @returns The document type string for the API
 */
export function getDocumentType(componentName: string): string {
  return DOCUMENT_TYPE_MAP[componentName] || 'text';
}

/**
 * Check if a component supports auto-save
 * Currently all text generators support it
 * @param componentName - The component identifier
 * @returns true if auto-save is supported
 */
export function supportsAutoSave(componentName: string): boolean {
  // All generators in the map support auto-save
  return componentName in DOCUMENT_TYPE_MAP || componentName.includes('generator') || componentName.includes('text');
}
