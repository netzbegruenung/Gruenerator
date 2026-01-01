import { useEditorStore } from '../../stores/editorStore';
import { HeroSectionEditor } from './sections/HeroSectionEditor';
import { AboutSectionEditor } from './sections/AboutSectionEditor';
import { HeroImageSectionEditor } from './sections/HeroImageSectionEditor';
import { ThemesSectionEditor } from './sections/ThemesSectionEditor';
import { ActionsSectionEditor } from './sections/ActionsSectionEditor';
import { SocialFeedSectionEditor } from './sections/SocialFeedSectionEditor';
import { ContactSectionEditor } from './sections/ContactSectionEditor';
import type { CandidateData, SocialFeedSection } from '../../types/candidate';

interface SectionEditorContainerProps {
  candidateData: CandidateData;
  onUpdate: (data: Partial<CandidateData>) => void;
  onSave: () => void;
  isSaving?: boolean;
}

export function SectionEditorContainer({
  candidateData,
  onUpdate,
  onSave,
  isSaving = false,
}: SectionEditorContainerProps) {
  const { activeSection } = useEditorStore();

  const renderEditor = () => {
    switch (activeSection) {
      case 'hero':
        return (
          <HeroSectionEditor
            data={candidateData.hero}
            onChange={(hero) => onUpdate({ hero })}
          />
        );
      case 'about':
        return (
          <AboutSectionEditor
            data={candidateData.about}
            onChange={(about) => onUpdate({ about })}
          />
        );
      case 'heroImage':
        return (
          <HeroImageSectionEditor
            data={candidateData.heroImage}
            onChange={(heroImage) => onUpdate({ heroImage })}
          />
        );
      case 'themes':
        return (
          <ThemesSectionEditor
            data={candidateData.themes}
            onChange={(themes) => onUpdate({ themes })}
          />
        );
      case 'actions':
        return (
          <ActionsSectionEditor
            data={candidateData.actions}
            onChange={(actions) => onUpdate({ actions })}
          />
        );
      case 'socialFeed':
        return (
          <SocialFeedSectionEditor
            data={candidateData.socialFeed || { title: 'Instagram', showFeed: false }}
            onChange={(socialFeed: SocialFeedSection) => onUpdate({ socialFeed })}
          />
        );
      case 'contact':
        return (
          <ContactSectionEditor
            data={candidateData.contact}
            onChange={(contact) => onUpdate({ contact })}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="section-editor-panel" key={activeSection}>
      {renderEditor()}

      <button
        className="editor-save-button"
        onClick={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <span className="editor-loading-spinner" style={{ width: 18, height: 18 }} />
            Wird gespeichert...
          </>
        ) : (
          'Änderungen speichern'
        )}
      </button>
    </div>
  );
}
