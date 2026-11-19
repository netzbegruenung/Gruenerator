import { cn } from '@gruenerator/shared/utils';

import { useDraft } from '../../draft/SiteDraftContext';
import { useEditorStore, SECTION_ORDER, SECTION_LABELS } from '../../stores/editorStore';

const EXTRA_PANELS = [
  { panel: 'settings', label: 'Einstellungen' },
  { panel: 'legal', label: 'Impressum' },
] as const;

function itemClass(active: boolean): string {
  return cn(
    'px-4 py-2.5 border-none bg-transparent rounded-lg cursor-pointer transition-colors text-grey-600 dark:text-grey-400 text-[13px] font-medium whitespace-nowrap hover:bg-grey-100 dark:hover:bg-grey-800 hover:text-foreground',
    active &&
      'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900'
  );
}

interface SectionNavigationProps {
  className?: string;
}

export function SectionNavigation({ className }: SectionNavigationProps) {
  const activeSection = useEditorStore((s) => s.activeSection);
  const navigateToSection = useEditorStore((s) => s.navigateToSection);
  const setActiveSection = useEditorStore((s) => s.setActiveSection);
  const hidden = useDraft((d) => d.hidden);

  return (
    // Kein tablist/tab: `navigateToSection` tauscht keine Panels, es scrollt die
    // Vorschau zum Abschnitt (`pendingScrollTo`). Ein Tab-Widget verspräche
    // Pfeiltasten-Navigation und `aria-controls`, die es hier nicht gibt —
    // `aria-current` sagt dasselbe für eine Navigationsleiste korrekt.
    <nav
      aria-label="Abschnitte"
      className={cn(
        'flex gap-0.5 p-sm bg-background-pure border-b border-grey-200 dark:border-grey-700 overflow-x-auto',
        className
      )}
    >
      {SECTION_ORDER.map((section) => (
        <button
          key={section}
          type="button"
          {...(activeSection === section ? { 'aria-current': 'true' as const } : {})}
          className={itemClass(activeSection === section)}
          onClick={() => navigateToSection(section)}
        >
          {SECTION_LABELS[section]}
          {hidden.some((h) => h === section) && (
            <span className="ml-1.5 rounded-sm bg-grey-200 px-1.5 py-0.5 text-[11px] font-normal text-grey-700 dark:bg-grey-700 dark:text-grey-200">
              ausgeblendet
            </span>
          )}
        </button>
      ))}
      {EXTRA_PANELS.map(({ panel, label }) => (
        <button
          key={panel}
          type="button"
          {...(activeSection === panel ? { 'aria-current': 'true' as const } : {})}
          className={itemClass(activeSection === panel)}
          onClick={() => setActiveSection(panel)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}
