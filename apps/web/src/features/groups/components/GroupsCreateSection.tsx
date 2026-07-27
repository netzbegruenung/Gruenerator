import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import React, { useState, useEffect, useCallback } from 'react';
import { PiUser, PiUsersThree, PiX } from 'react-icons/pi';

type ProjektType = 'personal' | 'standard';

interface GroupsCreateSectionProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateGroup: (groupName: string, groupType: ProjektType, inviteEmails: string[]) => void;
  isCreatingGroup: boolean;
  isCreateGroupError: boolean;
  createGroupError: Error | null;
  /** Type the dialog opens on — lets the "Projekt" / "Gruppe" tile preselect
   *  its type. Defaults to 'personal'. */
  initialProjektType?: ProjektType;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TYPE_OPTIONS: {
  value: ProjektType;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: 'personal',
    title: 'Projekt',
    desc: 'Nur für dich — organisiere deine Chats & Inhalte.',
    icon: PiUser,
  },
  {
    value: 'standard',
    title: 'Gruppe',
    desc: 'Mit Team — Mitglieder, geteilte Inhalte & Beitritt.',
    icon: PiUsersThree,
  },
];

const GroupsCreateSection: React.FC<GroupsCreateSectionProps> = ({
  isOpen,
  onOpenChange,
  onCreateGroup,
  isCreatingGroup,
  isCreateGroupError,
  createGroupError,
  initialProjektType = 'personal',
}) => {
  const [step, setStep] = useState<1 | 2>(2);
  const [projektType, setProjektType] = useState<ProjektType>(initialProjektType);
  const [groupName, setGroupName] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (isOpen) {
      // The landing tiles already pick Projekt vs. Gruppe, so open on the name
      // step; "Zurück" still exposes the type choice.
      // Reset as a reaction to the modal opening (isOpen toggle), not a
      // render-derived value.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProjektType(initialProjektType);
      setStep(2);
      setGroupName('');
      setEmails([]);
      setEmailDraft('');
      setEmailError('');
    }
  }, [isOpen, initialProjektType]);

  const isTeam = projektType === 'standard';

  const chooseType = useCallback((value: ProjektType) => {
    setProjektType(value);
    setStep(2);
  }, []);

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
        isTeam && pending && EMAIL_RE.test(pending) && !emails.includes(pending)
          ? [...emails, pending]
          : emails;
      onCreateGroup(groupName, projektType, isTeam ? finalEmails : []);
    },
    [emailDraft, emails, groupName, projektType, isTeam, onCreateGroup]
  );

  const submitLabel = isCreatingGroup
    ? 'Wird erstellt...'
    : isTeam
      ? emails.length > 0
        ? 'Erstellen & einladen'
        : 'Gruppe erstellen'
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
          <DialogTitle>
            {step === 1 ? 'Neu erstellen' : `Neue${isTeam ? ' Gruppe' : 's Projekt'}`}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? 'Wähle, ob du alleine oder mit einem Team arbeiten möchtest.'
              : isTeam
                ? 'Eine Gruppe bündelt Chats, Anweisungen und Wissen für dein Team.'
                : 'Ein Projekt bündelt deine Chats, Anweisungen und Inhalte an einem Ort.'}
          </DialogDescription>
        </DialogHeader>

        {isCreateGroupError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-md text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {createGroupError?.message || 'Fehler beim Erstellen'}
          </div>
        )}

        {step === 1 ? (
          <div className="grid grid-cols-1 gap-sm" role="radiogroup" aria-label="Art">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => chooseType(opt.value)}
                className="flex items-start gap-sm rounded-lg border border-grey-300 p-md text-left transition-colors hover:border-primary-500 hover:bg-primary-50 dark:border-grey-600 dark:hover:bg-primary-950/30"
              >
                <opt.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary-600 dark:text-primary-400" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{opt.title}</span>
                  <span className="text-xs text-grey-500">{opt.desc}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} id="create-group-form" className="flex flex-col gap-md">
            <label className="flex flex-col gap-xs">
              <span className="text-sm font-medium">Name</span>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full rounded-md border border-grey-300 dark:border-grey-600 bg-background px-sm py-xs text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                placeholder={isTeam ? 'Name der Gruppe' : 'Name des Projekts'}
                maxLength={100}
                required
                autoFocus
                disabled={isCreatingGroup}
              />
            </label>

            {isTeam && (
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
                    Mit Enter oder Komma hinzufügen. Eingeladene erhalten eine E-Mail mit
                    Beitrittslink.
                  </span>
                )}
              </div>
            )}
          </form>
        )}

        <DialogFooter>
          {step === 1 ? (
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isCreatingGroup}
            >
              Abbrechen
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isCreatingGroup}>
                Zurück
              </Button>
              <Button
                type="submit"
                form="create-group-form"
                disabled={isCreatingGroup || !groupName.trim()}
              >
                {submitLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

GroupsCreateSection.displayName = 'GroupsCreateSection';

export default GroupsCreateSection;
