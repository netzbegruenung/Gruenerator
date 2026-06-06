import { useEditorStore, SECTION_ORDER, SECTION_LABELS } from '../../stores/editorStore';

import { cn } from '../../utils/cn';

interface SectionNavigationProps {
  className?: string;
}

export function SectionNavigation({ className }: SectionNavigationProps) {
  const { activeSection, navigateToSection } = useEditorStore();

  return (
    <nav
      className={cn(
        'flex gap-0.5 p-sm bg-background-pure border-b border-grey-200 dark:border-grey-700 overflow-x-auto',
        className
      )}
      role="tablist"
    >
      {SECTION_ORDER.map((section) => (
        <button
          key={section}
          role="tab"
          aria-selected={activeSection === section}
          className={cn(
            'px-4 py-2.5 border-none bg-transparent rounded-lg cursor-pointer transition-colors text-grey-600 dark:text-grey-400 text-[13px] font-medium whitespace-nowrap hover:bg-grey-100 dark:hover:bg-grey-800 hover:text-foreground',
            activeSection === section && 'bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900'
          )}
          onClick={() => navigateToSection(section)}
        >
          {SECTION_LABELS[section]}
        </button>
      ))}
    </nav>
  );
}
