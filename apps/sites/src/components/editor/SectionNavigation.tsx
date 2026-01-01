import { useEditorStore, SECTION_ORDER, SECTION_LABELS } from '../../stores/editorStore';

export function SectionNavigation() {
  const { activeSection, navigateToSection } = useEditorStore();

  return (
    <nav className="section-navigation" role="tablist">
      {SECTION_ORDER.map((section) => (
        <button
          key={section}
          role="tab"
          aria-selected={activeSection === section}
          className={`section-nav-item ${activeSection === section ? 'section-nav-item--active' : ''}`}
          onClick={() => navigateToSection(section)}
        >
          {SECTION_LABELS[section]}
        </button>
      ))}
    </nav>
  );
}
