import { useEditorStore } from '../../stores/editorStore';

import { AboutSectionEditor } from './sections/AboutSectionEditor';
import { ActionsSectionEditor } from './sections/ActionsSectionEditor';
import { ContactSectionEditor } from './sections/ContactSectionEditor';
import { HeroImageSectionEditor } from './sections/HeroImageSectionEditor';
import { HeroSectionEditor } from './sections/HeroSectionEditor';
import { SocialFeedSectionEditor } from './sections/SocialFeedSectionEditor';
import { ThemesSectionEditor } from './sections/ThemesSectionEditor';

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
          <HeroSectionEditor data={candidateData.hero} onChange={(hero) => onUpdate({ hero })} />
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
    <div className="p-md animate-[slide-in_0.2s_ease]" key={activeSection}>
      {renderEditor()}

      <button
        className="flex items-center justify-center gap-2 w-full py-3.5 border-none bg-primary-600 text-white rounded-lg cursor-pointer text-base font-semibold transition-colors mt-lg hover:bg-primary-700 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        onClick={onSave}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <span className="w-[18px] h-[18px] border-2 border-grey-200 border-t-white rounded-full animate-[spin_0.8s_linear_infinite]" />
            Wird gespeichert...
          </>
        ) : (
          'Änderungen speichern'
        )}
      </button>
    </div>
  );
}
