import { SettingsDropdown } from '@gruenerator/ui';

// SettingsDropdown renders a pill trigger that opens a Popover (desktop) / Sheet
// (mobile) of options. The open state is internal `useState` with no
// `open`/`defaultOpen` prop, so a static screenshot shows the resting trigger
// pill — active (primary fill) when something is selected, inactive otherwise.
// The label reflects the current selection. Handlers are no-ops.

// Tiny inline icons for the option set (component sizes child svgs).
const Newspaper = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9h4M18 14h-8M15 18h-5M10 6h8v4h-8Z" />
  </svg>
);
const Camera = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const formate = {
  key: 'platforms',
  label: 'Formate',
  multiple: true,
  options: [
    { id: 'pressemitteilung', label: 'Pressemitteilung', icon: <Newspaper /> },
    { id: 'instagram', label: 'Instagram', icon: <Camera /> },
    { id: 'facebook', label: 'Facebook', icon: <Camera /> },
    { id: 'linkedin', label: 'LinkedIn', icon: <Newspaper /> },
  ],
};

const art = {
  key: 'requestType',
  label: 'Art',
  multiple: false,
  options: [
    { id: 'antrag', label: 'Antrag' },
    { id: 'kleine_anfrage', label: 'Kleine Anfrage' },
    { id: 'grosse_anfrage', label: 'Große Anfrage' },
  ],
};

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' };

// Active vs. inactive trigger pills (multi-select "Formate") side by side.
export function FormatAuswahl() {
  return (
    <div style={row}>
      <SettingsDropdown config={formate} value={['instagram', 'pressemitteilung']} onChange={() => {}} />
      <SettingsDropdown config={formate} value={[]} onChange={() => {}} />
    </div>
  );
}

// Single-select trigger ("Art" eines Antrags) with a chosen value.
export function AntragsArt() {
  return (
    <div style={row}>
      <SettingsDropdown config={art} value="kleine_anfrage" onChange={() => {}} />
    </div>
  );
}
