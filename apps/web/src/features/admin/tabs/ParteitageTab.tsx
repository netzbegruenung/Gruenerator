import {
  type ConventionDetail,
  type ConventionStatus,
  type ParteitageAdminSummary,
} from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Input,
  Skeleton,
} from '@gruenerator/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { ParteitagImportPanel } from './ParteitagImportPanel';

/**
 * Admin-Reiter „Parteitage“: importieren, Status, Passwort, Reden ausblenden oder löschen.
 *
 * Die Liste meldet `hasPassword`, und `get` liefert Admins `moderation` und
 * `hiddenReason` je Rede; angeboten wird nur die passende Aktion.
 */
const LIST_KEY = ['admin', 'parteitage'] as const;

const STATUS_LABEL: Record<ConventionStatus, string> = {
  draft: 'Entwurf',
  published: 'Veröffentlicht',
  hidden: 'Ausgeblendet',
};

const selectCls =
  'h-11 rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

type ApiResult = { status: number; body: unknown };

async function expectOk(promise: Promise<ApiResult>, fallback: string): Promise<void> {
  const result = await promise;
  if (result.status === 200) return;
  const error = (result.body as { error?: unknown } | null)?.error;
  throw new Error(typeof error === 'string' && error ? error : fallback);
}

function useInvalidate() {
  const queryClient = useQueryClient();
  // The public archive caches the same conventions (hide, delete, status change).
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'parteitage'] }),
      queryClient.invalidateQueries({ queryKey: ['parteitage'] }),
    ]);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Das hat nicht geklappt.';
}

function Speeches({ slug, conventionId }: { slug: string; conventionId: string }) {
  const invalidate = useInvalidate();
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const reasonBase = useId();

  const detail = useQuery({
    queryKey: [...LIST_KEY, 'detail', conventionId],
    queryFn: async (): Promise<ConventionDetail> => {
      const result = await getContractsClient().parteitage.get({ params: { slug } });
      if (result.status === 200) return result.body;
      throw new Error('Die Reden konnten nicht geladen werden.');
    },
    retry: false,
  });

  const hide = useMutation({
    mutationFn: async (vars: { speechId: string; hidden: boolean; reason: string }) => {
      await expectOk(
        getContractsClient().parteitageAdmin.setSpeechHidden({
          params: { speechId: vars.speechId },
          body: { hidden: vars.hidden, reason: vars.reason },
        }),
        'Die Rede konnte nicht geändert werden.'
      );
      return vars;
    },
    onSuccess: () => invalidate(),
  });

  const del = useMutation({
    mutationFn: (speechId: string) =>
      expectOk(
        getContractsClient().parteitageAdmin.deleteSpeech({ params: { speechId } }),
        'Die Rede konnte nicht gelöscht werden.'
      ),
    onSuccess: () => invalidate(),
  });

  if (detail.isPending) return <Skeleton className="h-16 w-full" />;
  if (detail.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(detail.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <ul className="flex flex-col gap-sm">
      {detail.data.speeches.map((sp) => {
        const name = `${sp.firstName} ${sp.lastName}`;
        const isHidden = sp.moderation === 'hidden';
        const inputId = `${reasonBase}-${sp.id}`;
        return (
          <li key={sp.id} className="flex flex-wrap items-center gap-sm">
            <span className="min-w-48 text-sm">{name}</span>
            {isHidden && (
              <span className="text-sm text-muted-foreground">
                ausgeblendet: {sp.hiddenReason ?? ''}
              </span>
            )}
            {isHidden ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={`${name} einblenden`}
                disabled={hide.isPending}
                onClick={() => hide.mutate({ speechId: sp.id, hidden: false, reason: '' })}
              >
                Einblenden
              </Button>
            ) : (
              <>
                <label htmlFor={inputId} className="sr-only">
                  Grund für {name}
                </label>
                <Input
                  id={inputId}
                  className="w-56"
                  placeholder="Grund"
                  value={reasons[sp.id] ?? ''}
                  onChange={(e) => setReasons((prev) => ({ ...prev, [sp.id]: e.target.value }))}
                />
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${name} ausblenden`}
                  disabled={!(reasons[sp.id] ?? '').trim() || hide.isPending}
                  onClick={() =>
                    hide.mutate({
                      speechId: sp.id,
                      hidden: true,
                      reason: (reasons[sp.id] ?? '').trim(),
                    })
                  }
                >
                  Ausblenden
                </Button>
              </>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={`${name} löschen`}>
                  Löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Rede endgültig löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Reel, Transkript und Wortzeiten werden gelöscht. Ein erneuter Import holt die
                    Rede nicht zurück.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={() => del.mutate(sp.id)}>
                    Endgültig löschen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </li>
        );
      })}
      {(hide.isError || del.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(hide.error ?? del.error)}</AlertDescription>
        </Alert>
      )}
    </ul>
  );
}

function ConventionRow({ convention }: { convention: ParteitageAdminSummary }) {
  const invalidate = useInvalidate();
  const [password, setPassword] = useState('');
  const [open, setOpen] = useState(false);
  const passwordId = useId();
  const statusId = useId();

  const update = useMutation({
    mutationFn: (body: { status?: ConventionStatus; password?: string | null }) =>
      expectOk(
        getContractsClient().parteitageAdmin.update({ params: { id: convention.id }, body }),
        'Die Änderung konnte nicht gespeichert werden.'
      ),
    onSuccess: () => {
      setPassword('');
      return invalidate();
    },
  });

  const del = useMutation({
    mutationFn: () =>
      expectOk(
        getContractsClient().parteitageAdmin.deleteConvention({ params: { id: convention.id } }),
        'Der Parteitag konnte nicht gelöscht werden.'
      ),
    onSuccess: () => invalidate(),
  });

  return (
    <section aria-label={convention.title} className="flex flex-col gap-md rounded-md border p-md">
      <header className="flex flex-wrap items-baseline justify-between gap-sm">
        <h3 className="text-base font-semibold">{convention.title}</h3>
        <span className="text-sm text-muted-foreground">
          {STATUS_LABEL[convention.status]} · {convention.speechCount} Reden
        </span>
      </header>

      <div className="flex flex-wrap items-end gap-sm">
        <div className="flex flex-col gap-xs">
          <label htmlFor={statusId} className="text-sm">
            Status
          </label>
          <select
            id={statusId}
            className={selectCls}
            value={convention.status}
            disabled={update.isPending}
            onChange={(e) => update.mutate({ status: e.target.value as ConventionStatus })}
          >
            {(Object.keys(STATUS_LABEL) as ConventionStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-xs">
          <label htmlFor={passwordId} className="text-sm">
            Passwort
          </label>
          <Input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            minLength={1}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          disabled={password.length < 1 || update.isPending}
          onClick={() => update.mutate({ password })}
        >
          Passwort setzen
        </Button>
        <p className="text-sm">
          {convention.hasPassword ? 'Passwort gesetzt' : 'Offen für alle Eingeloggten'}
        </p>
        {convention.hasPassword && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost">Passwort entfernen</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Passwort entfernen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Danach sehen alle Eingeloggten diesen Parteitag.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={() => update.mutate({ password: null })}>
                  Passwort entfernen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="flex flex-wrap gap-sm">
        <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? 'Reden verbergen' : 'Reden verwalten'}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm">
              Parteitag löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Parteitag endgültig löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Der Parteitag wird mit allen Reden gelöscht: Reels, Transkripte und Wortzeiten. Das
                lässt sich nicht rückgängig machen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction onClick={() => del.mutate()}>Endgültig löschen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {(update.isError || del.isError) && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage(update.error ?? del.error)}</AlertDescription>
        </Alert>
      )}

      {open && <Speeches slug={convention.slug} conventionId={convention.id} />}
    </section>
  );
}

export default function ParteitageTab() {
  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const result = await getContractsClient().parteitageAdmin.listAll();
      if (result.status === 200) return result.body.conventions;
      throw new Error('Die Parteitage konnten nicht geladen werden.');
    },
    retry: false,
  });

  if (list.isPending) return <Skeleton className="h-32 w-full" />;
  if (list.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{errorMessage(list.error)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-md">
      <ParteitagImportPanel />
      {list.data.length === 0 && <p className="text-sm">Noch keine Parteitage importiert.</p>}
      {list.data.map((c) => (
        <ConventionRow key={c.id} convention={c} />
      ))}
    </div>
  );
}
