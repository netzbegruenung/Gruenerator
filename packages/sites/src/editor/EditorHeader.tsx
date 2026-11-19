import { Button } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { FiEye } from 'react-icons/fi';

import { BackButton } from '../components/common/BackButton';
import { SaveStatusChip } from '../components/common/SaveStatusChip';
import { SectionNavigation } from '../components/editor';
import { type SaveStatus } from '../draft/useSiteDraftSession';

interface EditorHeaderProps {
  save: SaveStatus;
  onPreview: () => void;
  onBack?: () => void;
  children?: ReactNode;
}

export function EditorHeader({ save, onPreview, onBack, children }: EditorHeaderProps) {
  return (
    <header className="flex flex-row items-center gap-sm py-sm px-md bg-background-pure border-b border-grey-200 dark:border-grey-700 min-h-14">
      {onBack && <BackButton onBack={onBack} />}
      <h1 className="sr-only">Website bearbeiten</h1>
      <div className="flex-1 hidden lg:block overflow-x-auto">
        <SectionNavigation />
      </div>
      <div className="flex items-center gap-xs shrink-0 ml-auto">
        <SaveStatusChip status={save} />
        <Button onClick={onPreview} title="Vorschau">
          <FiEye />
          <span className="hidden md:inline">Vorschau</span>
        </Button>
        {children}
      </div>
    </header>
  );
}
