import { FeatureToggle } from '@gruenerator/ui';

// icon is a ComponentType<{className?}> — forward className so the DS color/size
// classes (text-[1.1rem], secondary-600 when active) apply. 1em sizing follows font-size.
const PenIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);
const CloudIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.5 19a4.5 4.5 0 0 0 0-9h-1.8A7 7 0 1 0 4 16.7" />
    <path d="M12 12v9M8 17l4-4 4 4" />
  </svg>
);
const ShieldIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

// On vs. off — the switch + active-icon coloring differ.
export function OnOff() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 380 }}>
      <FeatureToggle
        isActive
        label="Handschrift erkennen"
        icon={PenIcon}
        description="Erkennt handschriftliche Texte. Daten werden an einen externen Dienst (Mistral) gesendet."
      />
      <FeatureToggle
        isActive={false}
        label="Wolke-Synchronisation"
        icon={CloudIcon}
        description="Speichert deine Dokumente automatisch in der grünen Wolke."
      />
    </div>
  );
}

// Without description, and a disabled toggle.
export function Variants() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 380 }}>
      <FeatureToggle isActive label="Öffentlich teilen" icon={ShieldIcon} />
      <FeatureToggle
        isActive={false}
        label="Premium-Funktion"
        icon={ShieldIcon}
        description="Nur für verifizierte Mandatsträger:innen verfügbar."
        disabled
      />
    </div>
  );
}
