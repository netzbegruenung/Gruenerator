import { type NotebookEditorSavePayload } from '@gruenerator/contracts';

import NotebookCreateWizard from './NotebookCreateWizard';
import NotebookEditForm from './NotebookEditForm';
import type { NotebookCollection } from './shared';
import { useNotebookEditorState } from './useNotebookEditorState';

interface NotebookEditorProps {
  onSave: (data: NotebookEditorSavePayload) => Promise<void>;
  editingCollection?: NotebookCollection | null;
  loading?: boolean;
  onCancel?: () => void;
}

const NotebookEditor = ({
  onSave,
  editingCollection = null,
  loading = false,
  onCancel,
}: NotebookEditorProps) => {
  const state = useNotebookEditorState({ onSave, editingCollection, loading, onCancel });
  return editingCollection ? (
    <NotebookEditForm state={state} />
  ) : (
    <NotebookCreateWizard state={state} />
  );
};

export default NotebookEditor;
