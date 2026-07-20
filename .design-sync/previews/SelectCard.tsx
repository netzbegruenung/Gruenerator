import { SelectCard } from '@gruenerator/ui';

const IconCircle = ({ children, bg }: { children: React.ReactNode; bg: string }) => (
  <span
    style={{
      display: 'flex',
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 999,
      background: bg,
      color: '#fff',
    }}
  >
    {children}
  </span>
);

const LeafIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
    <path d="M2 21c0-3 1.85-5.36 5.08-6" />
  </svg>
);

const MegaphoneIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);

const UsersIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

// A selectable option card in both selected (brand border/tint) and default states.
export function SelectionStates() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
      <SelectCard
        label="Klimaschutz"
        description="Themenschwerpunkt für deine Kampagne"
        icon={
          <IconCircle bg="#52907A">
            <LeafIcon />
          </IconCircle>
        }
        selected
        onClick={() => {}}
      />
      <SelectCard
        label="Mobilität & Verkehr"
        description="Themenschwerpunkt für deine Kampagne"
        icon={
          <IconCircle bg="#5F8575">
            <MegaphoneIcon />
          </IconCircle>
        }
        onClick={() => {}}
      />
    </div>
  );
}

// A grid of role pickers (Landesverband-Hub style), one selected.
export function RolePicker() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 560 }}>
      <SelectCard
        label="Pressesprecher:in"
        description="Pressemitteilungen und O-Töne"
        icon={
          <IconCircle bg="#52907A">
            <MegaphoneIcon />
          </IconCircle>
        }
        selected
        onClick={() => {}}
      />
      <SelectCard
        label="Mitgliederbetreuung"
        description="Anfragen und Veranstaltungen"
        icon={
          <IconCircle bg="#7c3aed">
            <UsersIcon />
          </IconCircle>
        }
        onClick={() => {}}
      />
    </div>
  );
}

// Compact variant without descriptions — label-only option list.
export function LabelOnly() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
      <SelectCard label="Deutschland (de-DE)" selected onClick={() => {}} />
      <SelectCard label="Österreich (de-AT)" onClick={() => {}} />
    </div>
  );
}
