import { ResponsiveMenuSection, ResponsiveMenuItem, ResponsiveMenuToggle } from '@gruenerator/ui';

// The ResponsiveMenu parent picks a DropdownMenu (desktop) or Sheet (mobile)
// surface and portals its content — it only opens on interaction, so a static
// card can't show it. Its exported building blocks (Section / Item / Toggle)
// ARE standalone presentational pieces, so we render the menu *structure* the
// way it appears inside an opened sheet: titled sections, items with icons and
// an active row, plus a settings toggle. We supply our own surface (the popover
// chrome the parent would normally provide) as inline-styled layout glue.

const Doc = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
  </svg>
);
const Mail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-10 5L2 7" />
  </svg>
);
const Calendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" />
  </svg>
);
const Moon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" />
  </svg>
);

const surface: React.CSSProperties = {
  width: 264,
  padding: 12,
  borderRadius: 12,
  border: '1px solid var(--grey-200, #e5e7eb)',
  background: 'var(--background, #fff)',
  boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
};

// The expanded menu surface: two titled sections of items (one row active) and
// a toggle row — exactly what the parent renders inside an opened dropdown/sheet.
export function SchnellzugriffMenue() {
  return (
    <div style={surface}>
      <ResponsiveMenuSection title="Erstellen">
        <ResponsiveMenuItem icon={<Doc />} active>
          Pressemitteilung
        </ResponsiveMenuItem>
        <ResponsiveMenuItem icon={<Mail />}>Newsletter</ResponsiveMenuItem>
        <ResponsiveMenuItem icon={<Calendar />}>Veranstaltung</ResponsiveMenuItem>
      </ResponsiveMenuSection>

      <ResponsiveMenuSection title="Einstellungen">
        <ResponsiveMenuToggle
          icon={<Moon />}
          label="Dunkler Modus"
          checked
          onCheckedChange={() => {}}
        />
        <ResponsiveMenuItem icon={<Calendar />} disabled>
          Erinnerungen (bald)
        </ResponsiveMenuItem>
      </ResponsiveMenuSection>
    </div>
  );
}

// A single section in isolation — items with the icon + label layout and the
// toggle in its off state, to show the unchecked switch styling.
export function ToggleZustaende() {
  return (
    <div style={surface}>
      <ResponsiveMenuSection title="Ansicht">
        <ResponsiveMenuToggle
          icon={<Moon />}
          label="Dunkler Modus"
          checked={false}
          onCheckedChange={() => {}}
        />
        <ResponsiveMenuItem icon={<Doc />}>Kompakte Liste</ResponsiveMenuItem>
      </ResponsiveMenuSection>
    </div>
  );
}
