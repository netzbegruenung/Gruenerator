import {
  SectionHeader,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardActionsMenu,
} from '../../packages/ui/src/index';

// Explicit 3-column grid — CardGrid's responsive columns collapse to 2 at the
// card viewport, wrapping/clipping the third notebook.
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 16,
  alignItems: 'start',
  marginTop: 12,
};

// Recreation of the workplace NotebooksSection ("Notebooks"): a titled grid of
// notebook cards (colored cover + title + source count + an actions menu),
// with a create affordance in the header.
const NOTEBOOKS = [
  { title: 'Wahlprogramm 2026', sources: 14, color: '#52907A' },
  { title: 'Pressearbeit', sources: 8, color: '#5F8575' },
  { title: 'Kommunalwahl Musterstadt', sources: 23, color: '#3F6B5A' },
];

export function WorkplaceNotebooks() {
  return (
    <div style={{ width: '100%' }}>
      <SectionHeader title="Notebooks" onCreate={() => {}} createLabel="Neues Notebook" />
      <div style={grid}>
        {NOTEBOOKS.map((nb) => (
          <Card key={nb.title} style={{ overflow: 'hidden' }}>
            <div
              style={{ height: 88, background: `linear-gradient(135deg, ${nb.color}, #2C4A3E)` }}
            />
            <CardHeader>
              <CardTitle>{nb.title}</CardTitle>
              <CardDescription>{nb.sources} Quellen</CardDescription>
              <CardAction>
                <CardActionsMenu onShare={() => {}} onDelete={() => {}} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <span style={{ fontSize: 13, color: 'var(--color-muted-foreground, #71717a)' }}>
                Zuletzt geöffnet vor 3 Tagen
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
