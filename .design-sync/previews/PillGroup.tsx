import { PillGroup } from '@gruenerator/ui';

// Single-select pill group (radio semantics) with a label — picking the
// active content mode. The selected pill is tinted in brand green.
export function ModusAuswahl() {
  const config = {
    key: 'modus',
    label: 'Modus',
    multiple: false,
    options: [
      { id: 'pressemitteilung', label: 'Pressemitteilung' },
      { id: 'newsletter', label: 'Newsletter' },
      { id: 'antrag', label: 'Antrag' },
      { id: 'rede', label: 'Rede' },
    ],
  };
  return (
    <div style={{ width: 360 }}>
      <PillGroup config={config} value="newsletter" onChange={() => {}} />
    </div>
  );
}

// Multi-select pill group (checkbox semantics) — Themen-Tags where several
// are active at once.
export function ThemenTags() {
  const config = {
    key: 'themen',
    label: 'Themen',
    multiple: true,
    options: [
      { id: 'klima', label: 'Klimaschutz' },
      { id: 'mobilitaet', label: 'Mobilität' },
      { id: 'bildung', label: 'Bildung' },
      { id: 'soziales', label: 'Soziales' },
      { id: 'energie', label: 'Energie' },
      { id: 'digital', label: 'Digitalisierung' },
    ],
  };
  return (
    <div style={{ width: 380 }}>
      <PillGroup config={config} value={['klima', 'mobilitaet', 'energie']} onChange={() => {}} />
    </div>
  );
}
