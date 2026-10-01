import { type DocumentTemplate } from '@gruenerator/docs/templates';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { useDocsStore } from '../../stores/docsStore';

/**
 * Creating a document from a template or from a description, then opening it —
 * what `CreateDocSheet` hands back to whoever hosts it. `onStart` closes that
 * sheet: the sheet's own exit runs the action instead of `onClose`.
 */
export function useDocCreation(onStart: () => void) {
  const router = useRouter();
  const createDocument = useDocsStore((s) => s.createDocument);
  const generateDocument = useDocsStore((s) => s.generateDocument);
  const clearError = useDocsStore((s) => s.clearError);
  const [isCreating, setIsCreating] = useState(false);

  const run = async (create: () => Promise<{ id: string } | null>, failure: string) => {
    if (isCreating) return;
    setIsCreating(true);
    onStart();
    try {
      const doc = await create();
      if (doc) {
        router.push({ pathname: '/(fullscreen)/doc-editor', params: { id: doc.id } });
      } else {
        // The store swallows the failure into `error`; clearing it keeps a failed
        // create from replacing the whole list with the load-error screen.
        clearError();
        Alert.alert('Fehler', failure);
      }
    } catch {
      Alert.alert('Fehler', failure);
    } finally {
      setIsCreating(false);
    }
  };

  const createFromTemplate = (template: DocumentTemplate) =>
    run(
      () =>
        createDocument(template.defaultTitle, template.id === 'blank' ? undefined : template.id),
      'Dokument konnte nicht erstellt werden.'
    );

  const generate = (description: string) =>
    run(() => generateDocument(description), 'Dokument konnte nicht generiert werden.');

  return { isCreating, createFromTemplate, generate };
}
