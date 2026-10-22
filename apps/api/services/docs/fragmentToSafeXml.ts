import * as Y from 'yjs';

/**
 * `Y.XmlFragment.toString()` für HTML, das ein Browser rendert.
 *
 * Yjs serialisiert ohne jedes Escaping: getippter Text `<img src=x onerror=…>`
 * steht danach als Tag im String, und wer Schreibrecht hat, kann über rohe
 * Y-Updates Elemente und Marks beliebigen Namens anlegen (`iframe`, `img` …).
 * `blockNoteXmlToHtml` benennt nur um und reicht beides durch.
 *
 * Diese Fassung bildet `toString()` nach — gleiche Sortierung, Elementnamen
 * kleingeschrieben wie in Yjs —, escaped aber Text und Attributwerte, behält
 * nur die Namen, die `blockNoteXmlToHtml` umsetzt, und von den Attributen nur
 * `level`. Unbekannte Elemente und Marks werden ausgepackt: der Inhalt bleibt,
 * der Tag fällt weg.
 */

/** Element- und Mark-Namen (kleingeschrieben), die `blockNoteXmlToHtml` kennt. */
const KNOWN_NAMES = new Set([
  'blockgroup',
  'blockcontainer',
  'paragraph',
  'heading',
  'bulletlistitem',
  'numberedlistitem',
  'insertion',
  'deletion',
  'modification',
  'bold',
  'italic',
  'underline',
  'strike',
]);

/** Das einzige Attribut, das `blockNoteXmlToHtml` liest (`<heading level="1">`). */
const KEPT_ATTRIBUTES = new Set(['level']);

const escapeHtml = (value: unknown): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const attributesToString = (attributes: unknown): string => {
  if (typeof attributes !== 'object' || attributes === null) return '';
  const record = attributes as Record<string, unknown>;
  return Object.keys(record)
    .filter((key) => KEPT_ATTRIBUTES.has(key))
    .sort()
    .map((key) => ` ${key}="${escapeHtml(record[key])}"`)
    .join('');
};

const textToSafeXml = (text: Y.XmlText): string =>
  (text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[])
    .map(({ insert, attributes = {} }) => {
      const marks = Object.keys(attributes)
        .filter((name) => KNOWN_NAMES.has(name.toLowerCase()))
        .sort();
      const open = marks.map((name) => `<${name}${attributesToString(attributes[name])}>`).join('');
      const close = [...marks]
        .reverse()
        .map((name) => `</${name}>`)
        .join('');
      return `${open}${escapeHtml(insert)}${close}`;
    })
    .join('');

const nodeToSafeXml = (node: unknown): string => {
  if (node instanceof Y.XmlText) return textToSafeXml(node);
  if (node instanceof Y.XmlElement) {
    const inner = node.toArray().map(nodeToSafeXml).join('');
    const name = node.nodeName.toLocaleLowerCase();
    if (!KNOWN_NAMES.has(name)) return inner;
    return `<${name}${attributesToString(node.getAttributes())}>${inner}</${name}>`;
  }
  // Y.XmlHook u. a. haben keine HTML-Darstellung.
  return '';
};

export const fragmentToSafeXml = (fragment: Y.XmlFragment): string =>
  fragment.toArray().map(nodeToSafeXml).join('');
