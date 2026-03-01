import { SectionEditorContainer } from './SectionEditorContainer';
import { SectionNavigation } from './SectionNavigation';

import type { CandidateData } from '../../types/candidate';

interface EditorSidebarProps {
  candidateData: CandidateData;
  onUpdate: (data: Partial<CandidateData>) => void;
  onSave: () => void;
  isSaving?: boolean;
}

export function EditorSidebar({
  candidateData,
  onUpdate,
  onSave,
  isSaving = false,
}: EditorSidebarProps) {
  return (
    <>
      <SectionNavigation className="lg:hidden" />
      <SectionEditorContainer
        candidateData={candidateData}
        onUpdate={onUpdate}
        onSave={onSave}
        isSaving={isSaving}
      />
    </>
  );
}
