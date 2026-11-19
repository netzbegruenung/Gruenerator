import { SectionEditorContainer } from './SectionEditorContainer';
import { SectionNavigation } from './SectionNavigation';

export function EditorSidebar() {
  return (
    <>
      <SectionNavigation className="lg:hidden" />
      <SectionEditorContainer />
    </>
  );
}
