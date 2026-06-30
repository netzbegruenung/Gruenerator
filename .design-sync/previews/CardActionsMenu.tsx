import {
  CardActionsMenu,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@gruenerator/ui';

// CardActionsMenu is the three-dots overflow trigger pinned to a card. It only
// mounts its dropdown surface after a click (no `open`/`defaultOpen` prop), so
// statically it renders the trigger button. Shown here in its real context:
// the action affordance in the corner of a content card.
export function NotizbuchKarte() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <CardTitle>Wahlprogramm 2026</CardTitle>
            <CardDescription>Notizbuch · zuletzt bearbeitet vor 2 Std.</CardDescription>
          </div>
          <CardActionsMenu
            onShare={() => {}}
            onDelete={() => {}}
            shareLabel="Link kopieren"
            deleteLabel="Löschen"
          />
        </div>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          14 Quellen · 6 Kapitel im Entwurf. Klimaschutz, Verkehrswende und
          bezahlbares Wohnen als Schwerpunkte.
        </p>
      </CardContent>
    </Card>
  );
}

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  width: 360,
  padding: '12px 16px',
  border: '1px solid var(--grey-200, #e5e7eb)',
  borderRadius: 8,
  background: 'var(--background, #fff)',
} as const;

// The trigger pinned to compact list rows — the overflow affordance in its
// typical home, at the trailing edge of a saved item.
export function AktionenTrigger() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <div style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Klimaschutz vor Ort — Entwurf</span>
        <CardActionsMenu align="end" onShare={() => {}} onDelete={() => {}} />
      </div>
      <div style={rowStyle}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Newsletter Juni 2026</span>
        <CardActionsMenu align="end" onShare={() => {}} />
      </div>
    </div>
  );
}
