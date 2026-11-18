import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useRef, useState } from 'react';
import {
  PiBookOpen,
  PiFileText,
  PiLink,
  PiNotebook,
  PiPaperclip,
  PiPlus,
  PiRobot,
  PiTextT,
} from 'react-icons/pi';

import { type CategoryId } from './AddContentToGroupModal';
import { ProjectFileUploadButton, type ProjectFileUploadHandle } from './ProjectFileUploadButton';
import { ProjectTextAddButton } from './ProjectTextAddButton';

interface ProjectAddMenuProps {
  groupId: string;
  /** Opens the „Inhalte hinzufügen" dialog, optionally in one category. */
  onPickExisting: (category: CategoryId) => void;
  /** Links can only be added by project admins. */
  canAddLink: boolean;
  onFileAdded: (count: number) => void;
  onTextAdded: () => void;
  onError: (message: string) => void;
}

/**
 * Das eine „Hinzufügen" der Projektseite: Datei und Text entstehen neu (und
 * liegen danach im Wissen des Projekts), alles andere wählt man aus dem, was
 * man schon hat.
 */
export function ProjectAddMenu({
  groupId,
  onPickExisting,
  canAddLink,
  onFileAdded,
  onTextAdded,
  onError,
}: ProjectAddMenuProps) {
  const fileRef = useRef<ProjectFileUploadHandle>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="brand"
            disabled={uploading}
            className="max-sm:size-9 max-sm:rounded-full max-sm:p-0"
          >
            <PiPlus aria-hidden />
            <span className="max-sm:sr-only">
              {uploading ? 'Wird hochgeladen …' : 'Hinzufügen'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => fileRef.current?.open()}>
            <PiPaperclip aria-hidden className="mr-xs size-4" />
            Datei
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTextOpen(true)}>
            <PiTextT aria-hidden className="mr-xs size-4" />
            Text
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPickExisting('notebooks')}>
            <PiBookOpen aria-hidden className="mr-xs size-4" />
            Notebook
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPickExisting('recipes')}>
            <PiNotebook aria-hidden className="mr-xs size-4" />
            Rezept
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPickExisting('agents')}>
            <PiRobot aria-hidden className="mr-xs size-4" />
            Agent
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPickExisting('collabDocs')}>
            <PiFileText aria-hidden className="mr-xs size-4" />
            Doc, Sheet, Board …
          </DropdownMenuItem>
          {canAddLink && (
            <DropdownMenuItem onSelect={() => onPickExisting('links')}>
              <PiLink aria-hidden className="mr-xs size-4" />
              Link
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectFileUploadButton
        ref={fileRef}
        hideTrigger
        groupId={groupId}
        onBusyChange={setUploading}
        onAdded={onFileAdded}
        onError={onError}
      />
      <ProjectTextAddButton
        groupId={groupId}
        open={textOpen}
        onOpenChange={setTextOpen}
        onAdded={onTextAdded}
        onError={onError}
      />
    </>
  );
}
