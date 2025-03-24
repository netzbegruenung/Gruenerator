import React, { useContext, useEffect } from 'react';
import BaseForm from '../../../components/common/BaseForm';
import { FormProvider, FormContext } from '../../../components/utils/FormContext';
const GENERATED_CONTENT = `Hier ist ein Beispieltext für deinen Editor.
Du kannst diesen Text jetzt direkt bearbeiten und anpassen.`;

const EmptyEditorContent = () => {
  const { setGeneratedContent } = useContext(FormContext);

  useEffect(() => {
    setGeneratedContent(GENERATED_CONTENT);
  }, [setGeneratedContent]);

  return (
    <BaseForm
      title="Editor"
      onSubmit={() => {}}
      loading={false}
      generatedContent={GENERATED_CONTENT}
      alwaysEditing={true}
    >
      <div />
    </BaseForm>
  );
};

const EmptyEditor = () => (
  <div className="empty-editor-container with-header">
    <div className="base-container editing-mode">
      <FormProvider initialEditingMode={true}>
        <EmptyEditorContent />
      </FormProvider>
    </div>
  </div>
);

export default EmptyEditor; 