/**
 * Die Freigabe eines eigenen Agents oder Rezepts als drei Fragen, jede für
 * sich beantwortbar: In welchen Projekten? Alle mit Anmeldung? Im Marktplatz
 * gelistet? Dazu der Link.
 *
 * `share_mode` sieht hier niemand mehr. Die Fläche leitet ihn ab: „Alle mit
 * Anmeldung" an heisst `authenticated`; aus heisst `groups`, solange Projekte
 * da sind, sonst `private` — und „privat" löscht der Server samt
 * Projekt-Freigaben, die Liste zeigt also nie eine Freigabe, die nicht wirkt.
 * Ein Projekt hinzuzufügen hebt ein privates Ding serverseitig auf `groups`.
 *
 * Eine Fläche für beide Arten — {@link ShareAgentModal} und
 * {@link RecipeSharingPanel} reichen nur ihre Hooks herein, wie
 * `SharingControls` in der App. Die Regeln (Beschriftungen, Listung,
 * Fehlertexte) kommen aus `@gruenerator/shared/grueneratoren`.
 *
 * Nichts hier ist Serverzustand im Komponentenspeicher: jede Änderung geht
 * sofort zum Server. Lokal sind nur die offene Eigentumsfrage und der letzte
 * Fehlschlag, der in der Zeile oben steht.
 *
 * Nur für Eigentümer*innen: Aufrufer prüfen das vorher.
 */
import { type PublicOwnership } from '@gruenerator/contracts';
import {
  OWNERSHIP_CHOICES,
  OWNERSHIP_LABELS,
  UNLIST,
  planListing,
  shareErrorText,
  type ShareMode,
} from '@gruenerator/shared/grueneratoren';
import {
  Button,
  CopyLinkRow,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@gruenerator/ui';
import { useId, useMemo, useState } from 'react';
import { HiTrash } from 'react-icons/hi';

import { cn } from '@/utils/cn';

export interface ShareSettingsView {
  share_mode: ShareMode;
  is_public: boolean;
  public_ownership: PublicOwnership | null;
}

export interface SharingPanelProps {
  /** „Agent" oder „Rezept" — für die Sätze, die das Ding beim Namen nennen. */
  noun: 'Agent' | 'Rezept';
  settings: ShareSettingsView | null;
  settingsLoading: boolean;
  settingsError: boolean;
  groupShares: ReadonlyArray<{ id: string; name: string }>;
  /** `null`, solange die eigenen Projekte laden. */
  myGroups: ReadonlyArray<{ id: string; name: string }> | null;
  shareUrl: string;
  setMode: (mode: ShareMode) => Promise<unknown>;
  setListing: (input: {
    is_public: boolean;
    public_ownership: PublicOwnership | null;
  }) => Promise<unknown>;
  addGroup: (groupId: string) => Promise<unknown>;
  removeGroup: (groupId: string) => Promise<unknown>;
  pending: { mode: boolean; listing: boolean; groups: boolean };
}

export function SharingPanel(props: SharingPanelProps) {
  const { noun, settings, pending } = props;
  const linkToggleId = useId();
  const projectsHeadingId = useId();
  const addProjectId = useId();
  const listingToggleId = useId();
  const ownershipHeadingId = useId();

  const [error, setError] = useState<string | null>(null);
  // Schalter an, Eigentumsfrage noch offen: gelistet wird erst mit der Antwort.
  const [askingOwnership, setAskingOwnership] = useState(false);

  const sharedIds = useMemo(() => new Set(props.groupShares.map((g) => g.id)), [props.groupShares]);
  const available = useMemo(
    () => (props.myGroups ?? []).filter((g) => !sharedIds.has(g.id)),
    [props.myGroups, sharedIds]
  );

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(shareErrorText(err));
      return false;
    }
  };

  if (props.settingsError) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        Keine Berechtigung, die Freigabe-Einstellungen zu verwalten.
      </p>
    );
  }

  if (props.settingsLoading || !settings) {
    return <p className="text-sm text-grey-500">Wird geladen…</p>;
  }

  const shareMode = settings.share_mode;
  const isPublic = settings.is_public;
  const linkOpen = shareMode === 'authenticated';
  const listingBusy = pending.listing || pending.mode;
  const thing = noun === 'Agent' ? 'den Agent' : 'das Rezept';

  // Aus: der Server stuft ab (und nimmt eine Listung mit) — auf `groups`,
  // solange Projekte da sind, sonst auf `private`.
  const toggleLink = (checked: boolean) => {
    const next: ShareMode = checked
      ? 'authenticated'
      : props.groupShares.length > 0
        ? 'groups'
        : 'private';
    void run(() => props.setMode(next));
  };

  const toggleListing = (checked: boolean) => {
    if (checked) {
      setAskingOwnership(true);
      return;
    }
    if (askingOwnership && !isPublic) {
      setAskingOwnership(false);
      return;
    }
    void run(() => props.setListing(UNLIST)).then((ok) => ok && setAskingOwnership(false));
  };

  const chooseOwnership = (choice: PublicOwnership) => {
    if (isPublic) {
      void run(() => props.setListing({ is_public: true, public_ownership: choice }));
      return;
    }
    const plan = planListing(shareMode, choice);
    void run(async () => {
      // Der Server listet nur aus „Mit Anmeldung" — erst heben, dann listen.
      if (plan.promote) await props.setMode('authenticated');
      await props.setListing(plan.listing);
    }).then((ok) => ok && setAskingOwnership(false));
  };

  return (
    <div className="flex flex-col gap-md">
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      <div>
        <p className="text-sm font-semibold" id={projectsHeadingId}>
          Projekte und Gruppen
        </p>
        <p className="mb-xs text-xs text-grey-500">
          {`Mitglieder dieser Projekte und Gruppen sehen ${thing} und können ${noun === 'Agent' ? 'ihn' : 'es'} im Chat nutzen.`}
        </p>
        {props.groupShares.length > 0 ? (
          <ul aria-labelledby={projectsHeadingId} className="mb-xs flex flex-col gap-xs">
            {props.groupShares.map((share) => (
              <li
                key={share.id}
                className="flex items-center justify-between rounded-md border border-grey-200 bg-background p-xs dark:border-grey-700"
              >
                <span className="truncate text-sm">{share.name}</span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void run(() => props.removeGroup(share.id))}
                  disabled={pending.groups}
                  aria-label={`${share.name} entfernen`}
                >
                  <HiTrash size={14} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-xs text-xs text-grey-500">In keinem Projekt und keiner Gruppe.</p>
        )}
        {available.length > 0 ? (
          <>
            <Label htmlFor={addProjectId} className="sr-only">
              Projekt oder Gruppe hinzufügen
            </Label>
            <Select
              value=""
              onValueChange={(v) => {
                if (v) void run(() => props.addGroup(v));
              }}
              disabled={pending.groups}
            >
              <SelectTrigger id={addProjectId} className="w-full">
                <SelectValue placeholder="Projekt oder Gruppe hinzufügen…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : props.myGroups && props.myGroups.length === 0 ? (
          <p className="text-xs text-grey-500">
            {`Du bist noch in keinem Projekt und keiner Gruppe. Tritt einem Projekt oder einer Gruppe bei, um ${noun === 'Agent' ? 'Agents' : 'Rezepte'} zu teilen.`}
          </p>
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
        <div className="space-y-xs">
          <Label htmlFor={linkToggleId} className="text-sm">
            Alle mit Anmeldung
          </Label>
          <p className="text-xs text-grey-500 dark:text-grey-400">
            {`Alle eingeloggten Nutzer*innen mit dem Link können ${thing} öffnen und im Chat nutzen.`}
          </p>
        </div>
        <Switch
          id={linkToggleId}
          checked={linkOpen}
          onCheckedChange={toggleLink}
          disabled={pending.mode}
        />
      </div>

      <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
        <div className="space-y-xs">
          <Label htmlFor={listingToggleId} className="text-sm">
            Im Marktplatz listen
          </Label>
          <p className="text-xs text-grey-500 dark:text-grey-400">
            {`Dein ${noun} erscheint dann im Marktplatz unter „Öffentlich“.`}
          </p>
          {!isPublic && !linkOpen ? (
            <p className="text-xs text-grey-500 dark:text-grey-400">
              Schaltet „Alle mit Anmeldung“ mit ein.
            </p>
          ) : null}
        </div>
        <Switch
          id={listingToggleId}
          checked={isPublic || askingOwnership}
          onCheckedChange={toggleListing}
          disabled={listingBusy}
        />
      </div>

      {isPublic || askingOwnership ? (
        <div className="space-y-sm">
          <p className="text-sm text-foreground-heading" id={ownershipHeadingId}>
            Bitte bestätige:
          </p>
          {!isPublic ? (
            <p className="text-xs text-grey-500 dark:text-grey-400">
              Gelistet wird erst, wenn du eine Antwort wählst.
            </p>
          ) : null}
          <div
            role="group"
            aria-labelledby={ownershipHeadingId}
            className="grid grid-cols-1 gap-sm sm:grid-cols-2"
          >
            {OWNERSHIP_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={settings.public_ownership === choice}
                onClick={() => chooseOwnership(choice)}
                disabled={listingBusy}
                className={cn(
                  'flex flex-col gap-xs rounded-lg border p-md text-left transition-colors',
                  settings.public_ownership === choice
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

      <div>
        <p className="mb-xs text-sm font-semibold">Link</p>
        <CopyLinkRow value={props.shareUrl} copyLabel="Link kopieren" copiedLabel="Kopiert" />
        <p className="mt-xs text-xs text-grey-500">
          {linkOpen
            ? 'Alle Eingeloggten mit dem Link können die Seite öffnen.'
            : props.groupShares.length > 0
              ? 'Den Link öffnen nur du und die Mitglieder der Projekte und Gruppen oben.'
              : 'Den Link kannst nur du öffnen.'}
        </p>
      </div>
    </div>
  );
}
