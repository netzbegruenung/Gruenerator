import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useRef, useState } from 'react';
import { type IconType } from 'react-icons';
import { FiGrid, FiMonitor } from 'react-icons/fi';
import { HiDocumentText } from 'react-icons/hi';
import {
  PiLink,
  PiPlus,
  PiPlusSquare,
  PiSquaresFour,
  PiTextT,
  PiUploadSimple,
} from 'react-icons/pi';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { NEW_IN_PROJECT, type NewInProjectKind, createInProject } from '../createInProject';

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
  /** Runder Icon-Knopf statt „Hinzufügen“ — für Kartenköpfe wie „Wissen“. */
  compact?: boolean;
}

const NEW_ICON: Record<NewInProjectKind, IconType> = {
  doc: HiDocumentText,
  sheet: FiGrid as IconType,
  pres: FiMonitor as IconType,
  board: PiSquaresFour as IconType,
};

/**
 * Das eine „Hinzufügen" der Projektseite: Vorhandenes wählt man im Picker; Doc,
 * Sheet, Präsentation und Board entstehen direkt im Projekt und öffnen sich; Datei,
 * Text und Link entstehen neu.
 */
export function ProjectAddMenu({
  groupId,
  onPickExisting,
  onAddLink,
  onFileAdded,
  onTextAdded,
  onError,
  compact = false,
}: ProjectAddMenuProps) {
  const fileRef = useRef<ProjectFileUploadHandle>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const locale = useAuthStore((s) => s.locale);

  const createNew = async (kind: NewInProjectKind) => {
    setCreating(true);
    try {
      void navigate(await createInProject(kind, groupId, locale));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Konnte nicht angelegt werden.');
    } finally {
      setCreating(false);
    }
  };
  // Der Picker hängt als Popover am selben Knopf. Öffnete er schon in `onSelect`, hielte
  // das Menü den Fokus während seiner Schließanimation fest: der Picker schloss sich als
  // „Fokus außerhalb“, und das Suchfeld bekam keinen Fokus. Deshalb öffnet er erst, wenn
  // das Menü ganz zu ist (`onCloseAutoFocus`), und der Fokus geht nicht an den Knopf zurück.
  const pickAfterClose = useRef(false);
  const busyLabel = uploading ? 'Wird hochgeladen …' : creating ? 'Wird angelegt …' : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              disabled={uploading || creating}
              aria-label={busyLabel ?? 'Zum Projekt hinzufügen'}
              title={busyLabel ?? 'Hinzufügen'}
            >
              <PiPlus aria-hidden />
            </Button>
          ) : (
            <Button
              variant="brand"
              disabled={uploading || creating}
              className="max-sm:size-9 max-sm:rounded-full max-sm:p-0"
            >
              <PiPlus aria-hidden />
              <span className="max-sm:sr-only">{busyLabel ?? 'Hinzufügen'}</span>
            </Button>
          )}
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
          {NEW_IN_PROJECT.map(({ kind, label }) => {
            const Icon = NEW_ICON[kind];
            return (
              <DropdownMenuItem key={kind} onSelect={() => void createNew(kind)}>
                <Icon aria-hidden className="mr-xs size-4" />
                {label}
              </DropdownMenuItem>
            );
          })}
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
