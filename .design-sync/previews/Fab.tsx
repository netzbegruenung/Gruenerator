import { Fab } from '@gruenerator/ui';

const ChatIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const PlusIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const SparkleIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
  </svg>
);

// The FAB is fixed bottom-right by default; inline `position:'static'` keeps it
// in-card (inline style overrides the class). Default vs. active (panel-open) state.
export function States() {
  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'center', padding: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Fab icon={<ChatIcon />} style={{ position: 'static' }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>Standard</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Fab icon={<SparkleIcon />} active style={{ position: 'static' }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>Aktiv</span>
      </div>
    </div>
  );
}

// A FAB with a status dot — e.g. the KI-Board-Assistent signalling a new hint.
export function WithStatusDot() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32, padding: 8 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Fab icon={<PlusIcon />} showDot style={{ position: 'static' }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>Neuer Antrag</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <Fab icon={<ChatIcon />} active showDot style={{ position: 'static' }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>Assistent</span>
      </div>
    </div>
  );
}
