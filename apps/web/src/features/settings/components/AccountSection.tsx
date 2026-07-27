/**
 * Das Konto in „Allgemein": eine Zeile zum Ansehen, ein Knopf zum Löschen.
 *
 * Beides stand vorher in einem eigenen Tab. Der bestand aber nur aus drei
 * schreibgeschützten Spiegeln des Grünen Logins — ein Reiter, hinter dem sich
 * nichts einstellen ließ. Die Identität ist damit zu einer einzigen Zeile
 * zusammengezogen (Name, Benutzername, E-Mail untereinander im Wertfeld), und
 * das Löschen sitzt am Ende von „Allgemein", getrennt von allem, was man
 * versehentlich anklickt.
 */
import { Button, toast } from '@gruenerator/ui';
import { useState, type ChangeEvent, type FormEvent } from 'react';

import SettingsRow from './SettingsRow';

import TextInput from '@/components/common/Form/Input/TextInput';
import Spinner from '@/components/common/Spinner';
import { useProfile } from '@/features/auth/hooks/useProfileData';
import {
  initializeProfileFormFields,
  type Profile,
} from '@/features/auth/services/profileApiService';
import { useOptimizedAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';

/**
 * Name, Benutzername und E-Mail in einer Zeile.
 *
 * Ohne eigene Beschriftung je Wert: die drei sind an ihrer Form erkennbar, und
 * drei Zeilen mit je einem nicht änderbaren Wert waren genau das, was den alten
 * Tab so leer wirken ließ. Für Screenreader tragen die <dt> die Bedeutung nach.
 */
export const AccountIdentityRow = () => {
  const authUser = useAuthStore((s) => s.user);
  const { user: optimizedUser } = useOptimizedAuth();
  const user = optimizedUser || authUser;
  const { data: profileData, isLoading, isError, refetch } = useProfile(user?.id);
  const profile = profileData as Profile | undefined;

  if (!user) return null;

  const fields =
    profile && !isLoading
      ? initializeProfileFormFields(profile, user)
      : { displayName: '', username: '', email: '' };

  return (
    <SettingsRow id="allgemein.konto">
      {isError ? (
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Erneut laden
        </Button>
      ) : isLoading ? (
        <div className="flex animate-pulse flex-col items-end gap-1.5 py-0.5">
          <div className="h-3.5 w-32 rounded bg-grey-200 dark:bg-grey-700" />
          <div className="h-3 w-20 rounded bg-grey-200 dark:bg-grey-700" />
          <div className="h-3 w-40 rounded bg-grey-200 dark:bg-grey-700" />
        </div>
      ) : (
        <dl className="m-0 flex flex-col items-end gap-0.5 text-right">
          <div>
            <dt className="sr-only">Anzeigename</dt>
            <dd className="m-0 text-sm font-medium text-foreground">{fields.displayName || '—'}</dd>
          </div>
          <div>
            <dt className="sr-only">Benutzername</dt>
            <dd className="m-0 text-xs text-grey-500 dark:text-grey-400">
              {fields.username ? `@${fields.username}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="sr-only">E-Mail</dt>
            <dd className="m-0 text-xs text-grey-500 dark:text-grey-400">{fields.email || '—'}</dd>
          </div>
        </dl>
      )}
    </SettingsRow>
  );
};

/**
 * Kontolöschung — bewusst als letztes Element der Seite und in Grau, bis man
 * sie anfasst.
 */
export const DeleteAccountSection = () => {
  const { deleteAccount, canManageAccount } = useOptimizedAuth();
  const [showForm, setShowForm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const expectedText = 'löschen';
    if ((confirmText || '').trim().toLowerCase() !== expectedText) {
      setError(`Bitte gib "${expectedText}" zur Bestätigung ein.`);
      return;
    }
    setIsDeleting(true);
    try {
      const result = await deleteAccount({ confirm: expectedText });
      if (result.success) {
        toast.success('Konto gelöscht. Du wirst automatisch weitergeleitet …');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen des Kontos.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canManageAccount()) return null;

  if (!showForm) {
    return (
      <Button
        variant="ghost"
        className="w-full text-sm text-grey-400 hover:text-red-600 dark:hover:text-red-400"
        onClick={() => {
          setShowForm(true);
          setConfirmText('');
          setError('');
        }}
      >
        Konto löschen
      </Button>
    );
  }

  return (
    <div className="rounded-lg bg-red-50 p-lg dark:bg-red-900/10">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-md">
          <div className="text-base font-semibold text-red-700 dark:text-red-400">
            Konto löschen
          </div>
          <p className="m-0 text-sm text-grey-600 dark:text-grey-400">
            <strong>Warnung:</strong> Diese Aktion kann nicht rückgängig gemacht werden. Alle deine
            Daten werden permanent gelöscht.
          </p>
          {error && (
            <div className="rounded-md bg-red-100 p-sm text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-xxs">
            <label htmlFor="deleteConfirmText" className="text-sm">
              Um fortzufahren, gib &quot;löschen&quot; ein:
            </label>
            <TextInput
              id="deleteConfirmText"
              type="text"
              value={confirmText}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmText(e.target.value)}
              placeholder="löschen"
              aria-label="Bestätigung: löschen"
              disabled={isDeleting}
            />
          </div>
        </div>
        <div className="mt-lg flex justify-end gap-sm">
          <Button variant="destructive" type="submit" disabled={isDeleting}>
            {isDeleting ? <Spinner size="small" /> : 'Konto unwiderruflich löschen'}
          </Button>
          <Button
            variant="outline"
            type="button"
            onClick={() => setShowForm(false)}
            disabled={isDeleting}
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
};
