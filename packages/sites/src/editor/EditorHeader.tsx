import { Button } from '@gruenerator/ui';
import { type ReactNode, type Ref } from 'react';
import { FiEye, FiFileText, FiSettings } from 'react-icons/fi';

import { BackButton } from '../components/common/BackButton';
import { SaveStatusChip } from '../components/common/SaveStatusChip';
import { type SaveStatus } from '../draft/useSiteDraftSession';
import { useEditorStore } from '../stores/editorStore';

interface EditorHeaderProps {
  save: SaveStatus;
  onPreview: () => void;
  onBack?: () => void;
  previewButtonRef?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

export function EditorHeader({
  save,
  onPreview,
  onBack,
  previewButtonRef,
  children,
}: EditorHeaderProps) {
  const openDialog = useEditorStore((s) => s.openDialog);
  return (
    <header className="flex flex-row items-center gap-sm py-sm px-md max-sm:gap-xs max-sm:px-sm bg-background-pure border-b border-grey-200 dark:border-grey-700 min-h-14">
      {onBack && <BackButton onBack={onBack} />}
      <h1 className="sr-only">Website bearbeiten</h1>
      <div className="flex items-center gap-xs max-sm:gap-0">
        <Button variant="ghost" onClick={() => openDialog('settings')} title="Einstellungen">
          <FiSettings aria-hidden="true" />
          <span className="hidden md:inline">Einstellungen</span>
        </Button>
        <Button variant="ghost" onClick={() => openDialog('legal')} title="Impressum">
          <FiFileText aria-hidden="true" />
          <span className="hidden md:inline">Impressum</span>
        </Button>
      </div>
      <div className="flex items-center gap-xs shrink-0 ml-auto">
        <SaveStatusChip status={save} />
        <Button ref={previewButtonRef} onClick={onPreview} title="Vorschau">
          <FiEye />
          <span className="hidden md:inline">Vorschau</span>
        </Button>
        {children}
      </div>
    </header>
  );
}
