'use client';

import { useComposerRuntime } from '@assistant-ui/react';
import { useEditorStore } from '@gruenerator/docs';

interface DocsQuickActionsProps {
  documentId: string;
}

const ACTIONS: Array<{ label: string; prompt: (hasSelection: boolean) => string }> = [
  {
    label: 'Zusammenfassen',
    prompt: (hasSelection) =>
      hasSelection
        ? 'Fasse die Auswahl prägnant zusammen.'
        : 'Fasse das aktuelle Dokument prägnant zusammen.',
  },
  {
    label: 'Formaler',
    prompt: (hasSelection) =>
      hasSelection
        ? 'Schreibe die Auswahl in einem formaleren Ton um.'
        : 'Schreibe das Dokument in einem formaleren Ton um.',
  },
  {
    label: 'Verbessern',
    prompt: (hasSelection) =>
      hasSelection
        ? 'Verbessere Stil und Lesbarkeit der Auswahl.'
        : 'Verbessere Stil und Lesbarkeit des Dokuments.',
  },
  {
    label: 'Weiterschreiben',
    prompt: () => 'Schreibe den Text an der aktuellen Position natürlich weiter.',
  },
];

export function DocsQuickActions({ documentId }: DocsQuickActionsProps) {
  const composer = useComposerRuntime();

  const handleClick = (promptFn: (hasSelection: boolean) => string) => {
    const editor = useEditorStore.getState().getEditor(documentId);
    const hasSelection = !!editor?.getSelectedText();
    composer.setText(promptFn(hasSelection));
    composer.send();
  };

  return (
    <div className="mt-1 flex flex-wrap gap-1 px-2 pb-2">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => handleClick(action.prompt)}
          className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-foreground-muted transition-colors hover:border-primary/40 hover:text-foreground"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
