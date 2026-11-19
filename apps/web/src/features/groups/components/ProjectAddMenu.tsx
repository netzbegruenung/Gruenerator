import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useRef, useState } from 'react';
import { PiLink, PiPlus, PiPlusSquare, PiTextT, PiUploadSimple } from 'react-icons/pi';

import { ProjectFileUploadButton, type ProjectFileUploadHandle } from './ProjectFileUploadButton';
import { ProjectTextAddButton } from './ProjectTextAddButton';

interface ProjectAddMenuProps {
  groupId: string;
  /** Öffnet den Picker „Vorhandenes hinzufügen“. */
  onPickExisting: () => void;
  /** Links dürfen nur Projekt-Admins anlegen; ohne Handler fehlt der Eintrag. */
  onAddLink?: () => void;
  onFileAdded: (count: number) => void;
  onTextAdded: () => void;
  onError: (message: string) => void;
}

/**
 * Das eine „Hinzufügen" der Projektseite: Vorhandenes wählt man im Picker, Datei,
 * Text und Link entstehen neu.
 */
export function ProjectAddMenu({
  groupId,
  onPickExisting,
  onAddLink,
  onFileAdded,
  onTextAdded,
  onError,
}: ProjectAddMenuProps) {
  const fileRef = useRef<ProjectFileUploadHandle>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  // Der Picker hängt als Popover am selben Knopf. Öffnete er schon in `onSelect`, hielte
  // das Menü den Fokus während seiner Schließanimation fest: der Picker schloss sich als
  // „Fokus außerhalb“, und das Suchfeld bekam keinen Fokus. Deshalb öffnet er erst, wenn
  // das Menü ganz zu ist (`onCloseAutoFocus`), und der Fokus geht nicht an den Knopf zurück.
  const pickAfterClose = useRef(false);

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
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(e) => {
            if (!pickAfterClose.current) return;
            pickAfterClose.current = false;
            e.preventDefault();
            onPickExisting();
          }}
        >
          <DropdownMenuItem
            onSelect={() => {
              pickAfterClose.current = true;
            }}
          >
            <PiPlusSquare aria-hidden className="mr-xs size-4" />
            Vorhandenes hinzufügen …
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => fileRef.current?.open()}>
            <PiUploadSimple aria-hidden className="mr-xs size-4" />
            Datei hochladen
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTextOpen(true)}>
            <PiTextT aria-hidden className="mr-xs size-4" />
            Text
          </DropdownMenuItem>
          {onAddLink && (
            <DropdownMenuItem onSelect={onAddLink}>
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
