import { WordCloud, type WordCloudItem } from '@gruenerator/ui';

const themen: WordCloudItem[] = [
  { key: 'klima', label: 'Klimaschutz', value: 100, color: 'var(--secondary-600, #5F8575)' },
  { key: 'energie', label: 'Energiewende', value: 86, color: 'var(--primary-500, #52907A)' },
  { key: 'verkehr', label: 'Verkehrswende', value: 72 },
  { key: 'soziales', label: 'Soziale Gerechtigkeit', value: 64 },
  { key: 'bildung', label: 'Bildung', value: 58 },
  { key: 'wohnen', label: 'Bezahlbares Wohnen', value: 52 },
  { key: 'natur', label: 'Artenvielfalt', value: 44 },
  { key: 'demokratie', label: 'Demokratie', value: 40 },
  { key: 'landwirtschaft', label: 'Landwirtschaft', value: 34 },
  { key: 'digitales', label: 'Digitalisierung', value: 28 },
  { key: 'europa', label: 'Europa', value: 22 },
  { key: 'gesundheit', label: 'Gesundheit', value: 18 },
];

// The Themen-Wolke from a Mitglieder-Umfrage: weight drives font size and
// opacity, so the dominant issues read largest.
export function Themenwolke() {
  return (
    <div
      style={{
        width: 480,
        padding: 24,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--foreground)',
      }}
    >
      <WordCloud items={themen} />
    </div>
  );
}
