import { useEditorStore } from '../../stores/editorStore';

import { AboutSectionEditor } from './sections/AboutSectionEditor';
import { ActionsSectionEditor } from './sections/ActionsSectionEditor';
import { ContactSectionEditor } from './sections/ContactSectionEditor';
import { HeroImageSectionEditor } from './sections/HeroImageSectionEditor';
import { HeroSectionEditor } from './sections/HeroSectionEditor';
import { SocialFeedSectionEditor } from './sections/SocialFeedSectionEditor';
import { ThemesSectionEditor } from './sections/ThemesSectionEditor';

function ActiveEditor() {
  const activeSection = useEditorStore((s) => s.activeSection);
  switch (activeSection) {
    case 'hero':
      return <HeroSectionEditor />;
    case 'about':
      return <AboutSectionEditor />;
    case 'heroImage':
      return <HeroImageSectionEditor />;
    case 'themes':
      return <ThemesSectionEditor />;
    case 'actions':
      return <ActionsSectionEditor />;
    case 'socialFeed':
      return <SocialFeedSectionEditor />;
    case 'contact':
      return <ContactSectionEditor />;
    case 'settings':
    case 'legal':
    case null:
      return null;
  }
}

export function SectionEditorContainer() {
  const activeSection = useEditorStore((s) => s.activeSection);
  return (
    <div className="p-md animate-[slide-in_0.2s_ease]" key={activeSection}>
      <ActiveEditor />
    </div>
  );
}
