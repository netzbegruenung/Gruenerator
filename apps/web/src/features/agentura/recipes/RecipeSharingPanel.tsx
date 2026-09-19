/**
 * Die Freigabe-Bedienelemente eines eigenen Rezepts: Sichtbarkeit (privat /
 * Projekte / mit Anmeldung), die Projekte, in die es geteilt ist, und die
 * Listung „Von der Basis" samt Eigentumsfrage.
 *
 * Eine Fläche, zwei Aufrufer — {@link ShareRecipeModal} (Detailseite) und der
 * Teilen-Tab des {@link RecipeEditor}. Vorher stand derselbe Block zweimal im
 * Code, und die beiden Kopien liefen bereits auseinander: nur eine hängte die
 * Beschriftungen wirklich an ihre Bedienelemente, und beide vergaben dieselbe
 * feste `id` für den Schalter — zwei gleiche `id`s auf einer Seite, sobald
 * jemand den Dialog über dem Editor öffnet. Die `id`s kommen deshalb jetzt aus
 * `useId`.
 *
 * Nichts hier ist lokaler Zustand: jede Änderung geht sofort zum Server, und
 * ein Fehlschlag steht in der Zeile oben. Die Formulierung stammt vom Server
 * (`useRecipeSharing` trägt sie mit) — ein angepasstes System-Rezept ist keine
 * eigene Textform, und nur sein Satz erklärt, warum die Freigabe abgelehnt wird.
 *
 * Nur für Eigentümer*innen: Aufrufer prüfen das vorher.
 */
import { type PublicOwnership, type TextFormShareMode } from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@gruenerator/ui';
import { useId, useMemo } from 'react';
import { HiTrash } from 'react-icons/hi';

import { useMyGroupsForSharing } from '../hooks/useMyGroupsForSharing';

import { useShareRecipeWithGroup, useUnshareRecipeFromGroup } from './api';
import {
  useRecipeGroupShares,
  useRecipeShareSettings,
  useSetRecipeIsPublic,
  useSetRecipeShareMode,
} from './useRecipeSharing';

import { cn } from '@/utils/cn';

interface RecipeSharingPanelProps {
  /** The recipe's mention — its handle on every sharing endpoint. */
  mention: string;
  /** Whether the surface holding the panel is on screen; gates the queries. */
  enabled: boolean;
}

const SHARE_MODE_LABELS: Record<TextFormShareMode, string> = {
  private: 'Privat — nur ich',
  groups: 'Mit Projekten geteilt',
  authenticated: 'Mit Anmeldung — alle eingeloggten Nutzer*innen',
};

const OWNERSHIP_LABELS: Record<PublicOwnership, { title: string; hint: string }> = {
  owner: {
    title: 'Ich besitze die Inhalte',
    hint: '… oder habe die Rechte zur Veröffentlichung',
  },
  public_data: {
    title: 'Inhalte sind öffentlich verfügbar',
    hint: 'z.B. offizielle Inhalte, Pressematerial',
  },
};

/**
 * Die Fehlermeldung, die jemand lesen kann. Bei 400/409 sagt der Server selbst,
 * was im Weg steht. Alles andere (500, Netzfehler) ist keine Auskunft für
 * Nutzer*innen und bekommt die Sammelzeile.
 */
function shareErrorText(error: unknown): string {
  const explained = isApiErrorWithStatus(error, 400) || isApiErrorWithStatus(error, 409);
  if (explained && error instanceof Error && error.message) return error.message;
  return 'Die Freigabe konnte nicht geändert werden.';
}

export function RecipeSharingPanel({ mention, enabled }: RecipeSharingPanelProps) {
  const shareModeId = useId();
  const projectsHeadingId = useId();
  const addProjectId = useId();
  const listingToggleId = useId();
  const ownershipHeadingId = useId();

  const settingsQuery = useRecipeShareSettings(enabled ? mention : null);
  const groupShares = useRecipeGroupShares(enabled ? mention : null);
  const myGroupsQuery = useMyGroupsForSharing(enabled);

  const setShareMode = useSetRecipeShareMode(mention);
  const setIsPublic = useSetRecipeIsPublic(mention);
  const shareWithGroup = useShareRecipeWithGroup();
  const unshareFromGroup = useUnshareRecipeFromGroup();

  const shareMode = settingsQuery.data?.share_mode ?? 'private';
  const isPublic = settingsQuery.data?.is_public ?? false;
  const publicOwnership = settingsQuery.data?.public_ownership ?? null;

  const sharedGroupIds = useMemo(() => new Set(groupShares.map((g) => g.groupId)), [groupShares]);
  const availableGroups = useMemo(
    () => (myGroupsQuery.data ?? []).filter((g) => !sharedGroupIds.has(g.id)),
    [myGroupsQuery.data, sharedGroupIds]
  );

  const mutationError =
    setShareMode.error ?? setIsPublic.error ?? shareWithGroup.error ?? unshareFromGroup.error;

  if (settingsQuery.isError) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        Keine Berechtigung, die Freigabe-Einstellungen zu verwalten.
      </p>
    );
  }

  if (settingsQuery.isLoading || !settingsQuery.data) {
    return <p className="text-sm text-grey-500">Wird geladen…</p>;
  }

  return (
    <div className="flex flex-col gap-md">
      {mutationError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {shareErrorText(mutationError)}
        </p>
      ) : null}

      <div>
        <Label htmlFor={shareModeId} className="mb-xs block text-sm font-semibold">
          Sichtbarkeit
        </Label>
        <Select
          value={shareMode}
          onValueChange={(v) => setShareMode.mutate(v as TextFormShareMode)}
          disabled={setShareMode.isPending}
        >
          <SelectTrigger id={shareModeId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SHARE_MODE_LABELS) as TextFormShareMode[]).map((m) => (
              <SelectItem key={m} value={m}>
                {SHARE_MODE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shareMode === 'groups' ? (
        <div>
          <p className="mb-xs text-sm font-semibold" id={projectsHeadingId}>
            Projekte
          </p>
          {groupShares.length > 0 ? (
            <ul aria-labelledby={projectsHeadingId} className="mb-xs flex flex-col gap-xs">
              {groupShares.map((share) => (
                <li
                  key={share.groupId}
                  className="flex items-center justify-between rounded-md border border-grey-200 bg-background p-xs dark:border-grey-700"
                >
                  <span className="truncate text-sm">{share.groupName}</span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => unshareFromGroup.mutate({ mention, groupId: share.groupId })}
                    disabled={unshareFromGroup.isPending}
                    aria-label={`${share.groupName} entfernen`}
                  >
                    <HiTrash size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-xs text-xs text-grey-500">Noch keine Projekte hinzugefügt.</p>
          )}
          {availableGroups.length > 0 ? (
            <>
              <Label htmlFor={addProjectId} className="sr-only">
                Projekt hinzufügen
              </Label>
              <Select
                value=""
                onValueChange={(v) => {
                  if (v) shareWithGroup.mutate({ mention, groupId: v });
                }}
                disabled={shareWithGroup.isPending}
              >
                <SelectTrigger id={addProjectId} className="w-full">
                  <SelectValue placeholder="Projekt hinzufügen…" />
                </SelectTrigger>
                <SelectContent>
                  {availableGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          ) : myGroupsQuery.data && myGroupsQuery.data.length === 0 ? (
            <p className="text-xs text-grey-500">
              Du bist noch in keinem Projekt. Tritt einem Projekt bei, um Rezepte zu teilen.
            </p>
          ) : null}
        </div>
      ) : null}

      {shareMode === 'authenticated' ? (
        <p className="text-xs text-grey-500">Sichtbar nur für eingeloggte Nutzer*innen.</p>
      ) : null}

      {/* „Von der Basis" — in jedem Sichtbarkeitsmodus zu sehen, damit die
          Listung auffindbar bleibt. Aus einem niedrigeren Modus heraus hebt das
          Aktivieren zuerst die Sichtbarkeit auf „Mit Anmeldung" (die Bedingung
          des Servers für eine Listung) und listet dann. */}
      <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
        <div className="space-y-xs">
          <Label htmlFor={listingToggleId} className="text-sm">
            Auf „Von der Basis“ listen
          </Label>
          <p className="text-xs text-grey-500 dark:text-grey-400">
            Dein Rezept erscheint dann in der Agentura unter „Von der Basis“ zum Entdecken.
          </p>
          {!isPublic && shareMode !== 'authenticated' ? (
            <p className="text-xs text-grey-500 dark:text-grey-400">
              Beim Aktivieren wird die Sichtbarkeit auf „Mit Anmeldung — alle eingeloggten
              Nutzer*innen“ gesetzt.
            </p>
          ) : null}
        </div>
        <Switch
          id={listingToggleId}
          checked={isPublic}
          onCheckedChange={(checked) => {
            if (!checked) {
              setIsPublic.mutate({ is_public: false, public_ownership: null });
              return;
            }
            // Beim ersten Aktivieren „owner" — der häufigste Fall; die Frage
            // darunter lässt das ändern.
            const list = () =>
              setIsPublic.mutate({
                is_public: true,
                public_ownership: publicOwnership ?? 'owner',
              });
            if (shareMode !== 'authenticated') {
              // `.catch` nicht wegen der Anzeige — der Fehlschlag steht ohnehin
              // in `setShareMode.error` und damit in der Zeile oben —, sondern
              // damit eine abgelehnte Höherstufung keine unbehandelte Rejection
              // hinterlässt.
              void setShareMode
                .mutateAsync('authenticated')
                .then(list)
                .catch(() => {});
            } else {
              list();
            }
          }}
          disabled={setIsPublic.isPending || setShareMode.isPending}
        />
      </div>

      {isPublic ? (
        <div className="space-y-sm">
          <p className="text-sm text-foreground-heading" id={ownershipHeadingId}>
            Bitte bestätige:
          </p>
          <div
            role="group"
            aria-labelledby={ownershipHeadingId}
            className="grid grid-cols-1 gap-sm sm:grid-cols-2"
          >
            {(['owner', 'public_data'] as const).map((choice: PublicOwnership) => (
              <button
                key={choice}
                type="button"
                aria-pressed={publicOwnership === choice}
                onClick={() => setIsPublic.mutate({ is_public: true, public_ownership: choice })}
                disabled={setIsPublic.isPending}
                className={cn(
                  'flex flex-col gap-xs rounded-lg border p-md text-left transition-colors',
                  publicOwnership === choice
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                    : 'border-grey-200 hover:border-primary-300 dark:border-grey-700 dark:hover:border-primary-600'
                )}
              >
                <span className="text-sm font-medium text-foreground">
                  {OWNERSHIP_LABELS[choice].title}
                </span>
                <span className="text-xs text-grey-500">{OWNERSHIP_LABELS[choice].hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
