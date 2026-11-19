import { Button } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { FiEye } from 'react-icons/fi';

import { SaveStatusChip } from '../components/common/SaveStatusChip';
import { SectionNavigation } from '../components/editor';
import { type SaveStatus } from '../draft/useSiteDraftSession';

interface EditorHeaderProps {
  save: SaveStatus;
  onPreview: () => void;
  children?: ReactNode;
}

export function EditorHeader({ save, onPreview, children }: EditorHeaderProps) {
  return (
    <header className="flex flex-row items-center gap-sm py-sm pl-14 pr-md bg-background-pure border-b border-grey-200 dark:border-grey-700 min-h-14">
      <h1 className="text-base text-primary-600 dark:text-primary-400 m-0 whitespace-nowrap shrink-0">
        Grünerator Sites
      </h1>
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
