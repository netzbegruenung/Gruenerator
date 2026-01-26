import { SectionEditorContainer } from './SectionEditorContainer';
import { SectionNavigation } from './SectionNavigation';

import type { CandidateData } from '../../types/candidate';
import '../../styles/components/section-editor.css';

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
      <SectionNavigation />
      <SectionEditorContainer
        candidateData={candidateData}
        onUpdate={onUpdate}
        onSave={onSave}
        isSaving={isSaving}
      />
    </>
  );
}
