import { DOCUMENT_UPLOAD_EXTENSIONS } from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@gruenerator/ui';
import React, { useState, useEffect, useCallback } from 'react';
import { PiPaperclip, PiX } from 'react-icons/pi';

/** Was die Erstellung über den Namen hinaus mitgibt. */
export interface CreateGroupExtras {
  /** „Worum geht es in diesem Projekt?" — wird zur Beschreibung. */
  description: string;
  /** Dateien, die gleich nach dem Anlegen ins Projekt kommen. */
  files: File[];
}

export const GROUP_DESCRIPTION_MAX = 500;

interface GroupsCreateSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateGroup: (groupName: string, inviteEmails: string[], extras: CreateGroupExtras) => void;
  isCreatingGroup: boolean;
  isCreateGroupError: boolean;
  createGroupError: Error | null;
  /** Name, mit dem das Feld startet (aus dem Erstellen-Feld der Übersicht). */
  initialName?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GroupsCreateSection: React.FC<GroupsCreateSectionProps> = ({
  isOpen,
  onOpenChange,
  onCreateGroup,
  isCreatingGroup,
  isCreateGroupError,
  createGroupError,
  initialName = '',
}) => {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (isOpen) {
      // Reset as a reaction to the modal opening (isOpen toggle), not a
      // render-derived value.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroupName(initialName);
      setDescription('');
      setFiles([]);
      setEmails([]);
      setEmailDraft('');
      setEmailError('');
    }
  }, [isOpen, initialName]);

  const addEmail = useCallback(() => {
    const value = emailDraft.trim().toLowerCase();
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setEmailError('Ungültige E-Mail-Adresse.');
      return;
    }
    setEmails((prev) => (prev.includes(value) ? prev : [...prev, value]));
    setEmailDraft('');
    setEmailError('');
  }, [emailDraft]);

  const handleEmailKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addEmail();
      } else if (e.key === 'Backspace' && !emailDraft && emails.length > 0) {
        setEmails((prev) => prev.slice(0, -1));
      }
    },
    [addEmail, emailDraft, emails.length]
  );

  const removeEmail = useCallback((email: string) => {
    setEmails((prev) => prev.filter((e) => e !== email));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      // Fold a half-typed address into the invite list before submitting.
      const pending = emailDraft.trim().toLowerCase();
      const finalEmails =
        pending && EMAIL_RE.test(pending) && !emails.includes(pending)
          ? [...emails, pending]
          : emails;
      onCreateGroup(groupName, finalEmails, {
        description: description.trim(),
        files,
      });
    },
    [emailDraft, emails, groupName, description, files, onCreateGroup]
  );

  const submitLabel = isCreatingGroup
    ? 'Wird erstellt...'
    : emails.length > 0
      ? 'Erstellen & einladen'
      : 'Projekt erstellen';

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isCreatingGroup) onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>Neues Projekt</DialogTitle>
          <DialogDescription>
            Ein Projekt bündelt Chats, Anweisungen und Wissen — allein oder mit anderen. Mitglieder
            kannst du jederzeit einladen.
          </DialogDescription>
        </DialogHeader>

        {isCreateGroupError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {createGroupError?.message || 'Fehler beim Erstellen'}
          </div>
        )}

        <form onSubmit={handleSubmit} id="create-group-form" className="flex flex-col gap-md">
          <label className="flex flex-col gap-xs">
            <span className="text-sm font-medium">Name</span>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
              placeholder="Name des Projekts"
              maxLength={100}
              required
              autoFocus
              disabled={isCreatingGroup}
            />
          </label>

          <label className="flex flex-col gap-xs">
            <span className="text-sm font-medium">
              Worum geht es in diesem Projekt?{' '}
              <span className="font-normal text-grey-500">(optional)</span>
            </span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={GROUP_DESCRIPTION_MAX}
              placeholder="Zum Beispiel: Material und Texte für den Kommunalwahlkampf im Ortsverband."
              disabled={isCreatingGroup}
            />
          </label>

          <div className="flex flex-col gap-xs">
            <span className="text-sm font-medium">
              Dateien <span className="font-normal text-grey-500">(optional)</span>
            </span>
            {files.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center justify-between gap-sm rounded-md bg-grey-100 px-sm py-1 text-sm dark:bg-grey-800"
                  >
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                      disabled={isCreatingGroup}
                      aria-label={`${file.name} entfernen`}
                      className="rounded-full p-0.5 hover:bg-grey-300/50"
                    >
                      <PiX className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="inline-flex w-fit cursor-pointer items-center gap-xs rounded-md border border-grey-300 px-sm py-xs text-sm hover:bg-grey-100 dark:border-grey-600 dark:hover:bg-grey-800">
              <PiPaperclip aria-hidden />
              Dateien auswählen
              <input
                type="file"
                multiple
                hidden
                accept={DOCUMENT_UPLOAD_EXTENSIONS.join(',')}
                aria-label="Dateien für das Projekt auswählen"
                disabled={isCreatingGroup}
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  setFiles((prev) => [...prev, ...picked]);
                }}
              />
            </label>
            <span className="text-xs text-grey-500">
              Kommen nach dem Anlegen ins Projekt; Chats darin nutzen sie, sobald sie eingelesen
              sind.
            </span>
          </div>

          <div className="flex flex-col gap-xs">
            <span className="text-sm font-medium">
              Mitglieder einladen <span className="font-normal text-grey-500">(optional)</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500">
              {emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-800 dark:bg-primary-900/40 dark:text-primary-200"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    disabled={isCreatingGroup}
                    aria-label={`${email} entfernen`}
                    className="rounded-full p-0.5 hover:bg-primary-500/20"
                  >
                    <PiX className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={emailDraft}
                onChange={(e) => {
                  setEmailDraft(e.target.value);
                  if (emailError) setEmailError('');
                }}
                onKeyDown={handleEmailKeyDown}
                onBlur={addEmail}
                className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm focus:outline-none"
                placeholder={emails.length === 0 ? 'name@beispiel.de' : ''}
                disabled={isCreatingGroup}
              />
            </div>
            {emailError ? (
              <span className="text-xs text-red-600 dark:text-red-400">{emailError}</span>
            ) : (
              <span className="text-xs text-grey-500">
                Mit Enter oder Komma hinzufügen. Eingeladene erhalten eine E-Mail mit Beitrittslink.
              </span>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreatingGroup}>
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="create-group-form"
            disabled={isCreatingGroup || !groupName.trim()}
          >
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

GroupsCreateSection.displayName = 'GroupsCreateSection';

export default GroupsCreateSection;
