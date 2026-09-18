/**
 * Freigabe-Dialog für ein eigenes Rezept: Sichtbarkeit (privat / Projekte /
 * mit Anmeldung), die Projekte, in die es geteilt ist, und die Listung „Von
 * der Basis".
 *
 * Schwesterdialog zu {@link ShareAgentModal} und bewusst gleich aufgebaut —
 * mit zwei Unterschieden: die Beschriftungen hängen hier wirklich an ihren
 * Bedienelementen (`Label htmlFor`, `aria-pressed` auf der Eigentumsfrage,
 * benannte Gruppe), und ein 409 wird erklärt statt verschluckt. Ein
 * angepasstes System-Rezept ist keine eigene Textform: der Server lehnt jede
 * Freigabe dafür ab, und ohne diese Zeile sähe das wie ein Fehlschlag ohne
 * Grund aus.
 *
 * Nur für Eigentümer*innen: Aufrufer prüfen das vorher — der Server antwortet
 * zwar ohnehin mit 404/403, den Dialog trotzdem zu zeigen wäre irreführend.
 */
import { type PublicOwnership, type TextFormShareMode } from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
} from '@gruenerator/ui';
import { useMemo } from 'react';
import { HiTrash } from 'react-icons/hi';
import { PiLink } from 'react-icons/pi';

import { useMyGroupsForSharing } from '../hooks/useMyGroupsForSharing';
import { useShareRecipeWithGroup, useUnshareRecipeFromGroup } from '../recipes/api';
import {
  useRecipeGroupShares,
  useRecipeShareSettings,
  useSetRecipeIsPublic,
  useSetRecipeShareMode,
} from '../recipes/useRecipeSharing';

import { cn } from '@/utils/cn';

interface ShareRecipeModalProps {
  /** The recipe's mention — its handle on every sharing endpoint. */
  mention: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
 * Die Fehlermeldung, die jemand lesen kann. Der Datenzugriff wirft `ApiError`
 * mit einer englischen Sammelzeile, nicht mit dem Text des Servers — die
 * beiden Fälle, die wirklich vorkommen, stehen deshalb hier im Wortlaut der
 * API (`textFormRouterHelpers.sharingFailure`).
 */
function shareErrorText(error: unknown): string {
  if (isApiErrorWithStatus(error, 409)) {
    return 'Angepasste System-Rezepte lassen sich nicht teilen — nur eigene Rezepte.';
  }
  if (isApiErrorWithStatus(error, 400)) {
    return 'Bitte bestätige die Quelle der Inhalte (Eigentum oder öffentlich).';
  }
  return 'Die Freigabe konnte nicht geändert werden.';
}

export function ShareRecipeModal({ mention, open, onOpenChange }: ShareRecipeModalProps) {
  const settingsQuery = useRecipeShareSettings(open ? mention : null);
  const groupShares = useRecipeGroupShares(open ? mention : null);
  const myGroupsQuery = useMyGroupsForSharing(open);

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

  const handleCopyLink = () => {
    void navigator.clipboard?.writeText(window.location.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[42rem]">
        <DialogHeader>
          <DialogTitle>Rezept teilen</DialogTitle>
          <DialogDescription>
            Lege fest, wer dieses Rezept sehen und im Chat nutzen darf.
          </DialogDescription>
        </DialogHeader>

        {settingsQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Keine Berechtigung, die Freigabe-Einstellungen zu verwalten.
          </p>
        ) : null}

        {settingsQuery.isLoading ? (
          <p className="text-sm text-grey-500">Wird geladen…</p>
        ) : settingsQuery.data ? (
          <div className="-mx-2 flex max-h-[70vh] flex-col gap-md overflow-y-auto px-2">
            {mutationError ? (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {shareErrorText(mutationError)}
              </p>
            ) : null}

            <div>
              <Label htmlFor="recipe-share-mode" className="mb-xs block text-sm font-semibold">
                Sichtbarkeit
              </Label>
              <Select
                value={shareMode}
                onValueChange={(v) => setShareMode.mutate(v as TextFormShareMode)}
                disabled={setShareMode.isPending}
              >
                <SelectTrigger id="recipe-share-mode" className="w-full">
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
                <p className="mb-xs text-sm font-semibold" id="recipe-share-projects">
                  Projekte
                </p>
                {groupShares.length > 0 ? (
                  <ul
                    aria-labelledby="recipe-share-projects"
                    className="mb-xs flex flex-col gap-xs"
                  >
                    {groupShares.map((share) => (
                      <li
                        key={share.groupId}
                        className="flex items-center justify-between rounded-md border border-grey-200 bg-background p-xs dark:border-grey-700"
                      >
                        <span className="truncate text-sm">{share.groupName}</span>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            unshareFromGroup.mutate({ mention, groupId: share.groupId })
                          }
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
                    <Label htmlFor="recipe-share-add-project" className="sr-only">
                      Projekt hinzufügen
                    </Label>
                    <Select
                      value=""
                      onValueChange={(v) => {
                        if (v) shareWithGroup.mutate({ mention, groupId: v });
                      }}
                      disabled={shareWithGroup.isPending}
                    >
                      <SelectTrigger id="recipe-share-add-project" className="w-full">
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
              <p className="text-xs text-grey-500">
                Sichtbar nur für eingeloggte Nutzer*innen aus deinem Land.
              </p>
            ) : null}

            {/* „Von der Basis" — in jedem Sichtbarkeitsmodus zu sehen, damit die
                Listung auffindbar bleibt. Aus einem niedrigeren Modus heraus
                hebt das Aktivieren zuerst die Sichtbarkeit auf „Mit Anmeldung"
                (die Bedingung des Servers für eine Listung) und listet dann. */}
            <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
              <div className="space-y-xs">
                <Label htmlFor="recipe-agentura-toggle" className="text-sm">
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
                id="recipe-agentura-toggle"
                checked={isPublic}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    setIsPublic.mutate({ is_public: false, public_ownership: null });
                    return;
                  }
                  // Beim ersten Aktivieren „owner" — der häufigste Fall; die
                  // Frage darunter lässt das ändern.
                  const list = () =>
                    setIsPublic.mutate({
                      is_public: true,
                      public_ownership: publicOwnership ?? 'owner',
                    });
                  if (shareMode !== 'authenticated') {
                    void setShareMode.mutateAsync('authenticated').then(list);
                  } else {
                    list();
                  }
                }}
                disabled={setIsPublic.isPending || setShareMode.isPending}
              />
            </div>

            {isPublic ? (
              <div className="space-y-sm">
                <p className="text-sm text-foreground-heading" id="recipe-ownership-label">
                  Bitte bestätige:
                </p>
                <div
                  role="group"
                  aria-labelledby="recipe-ownership-label"
                  className="grid grid-cols-1 gap-sm sm:grid-cols-2"
                >
                  {(['owner', 'public_data'] as const).map((choice: PublicOwnership) => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={publicOwnership === choice}
                      onClick={() =>
                        setIsPublic.mutate({ is_public: true, public_ownership: choice })
                      }
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

            <Separator />

            <Button variant="outline" size="sm" className="self-start" onClick={handleCopyLink}>
              <PiLink className="mr-xs" />
              Link kopieren
            </Button>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
