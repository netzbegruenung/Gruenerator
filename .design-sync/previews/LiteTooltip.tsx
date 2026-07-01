import { Button, LiteTooltip } from '@gruenerator/ui';

// LiteTooltip is a CSS/state-based tooltip: it shows its label only while the
// pointer hovers the trigger (internal `show` state, no `open`/`defaultOpen`
// prop). It cannot render its tooltip surface statically, so we render the real
// component wrapping its triggers in the resting state — the sensible static
// state per the authoring guide. See learnings for the open-surface limitation.
const Info = () => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </svg>
);

export function TriggerZeile() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
      <LiteTooltip label="Pressemitteilung kopieren" side="top">
        <Button variant="outline" size="sm">
          Kopieren
        </Button>
      </LiteTooltip>
      <LiteTooltip label="Als Vorlage speichern" side="bottom">
        <Button variant="brand" size="sm">
          Speichern
        </Button>
      </LiteTooltip>
      <LiteTooltip label="Mehr Informationen" side="right">
        <Button variant="ghost" size="icon-sm">
          <Info />
        </Button>
      </LiteTooltip>
    </div>
  );
}
