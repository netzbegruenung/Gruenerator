/**
 * Settings tab „Antragsgrün" (experimental) — the person's sites on
 * antragsgruen.de (created by the Grünerator or connected by the person), the
 * way to connect an existing one, and the way to take its access away again.
 *
 * Antragsgrün does not let a site admin remove itself, so the Grünerator
 * cannot leave a site on its own. The person removes its account on their
 * site; this section says which account, links the page, and checks the
 * result live. "Aus der Liste entfernen" deletes our row: the Grünerator then
 * stores nothing about the site and never acts on it again.
 */
import { type AntragsgruenSite, type AntragsgruenSiteAccess } from '@gruenerator/contracts';
import { Button, Input } from '@gruenerator/ui';
import { type QueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { HiClipboardList, HiExternalLink } from 'react-icons/hi';

import { SettingsCardsSkeleton } from '../components/SettingsSkeleton';
import {
  antragsgruenSitesQuery,
  useAntragsgruenSiteAccess,
  useAntragsgruenSites,
  useConnectAntragsgruenSite,
  useForgetAntragsgruenSite,
} from '../hooks/useAntragsgruenSites';

import { cn } from '@/utils/cn';

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatCreated(site: AntragsgruenSite): string {
  const d = new Date(site.createdAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${site.kind === 'connected' ? 'verbunden' : 'angelegt'} am ${d.toLocaleDateString('de-DE')}`;
}

const ACCESS_LABEL: Record<AntragsgruenSiteAccess, string> = {
  admin: 'Der Grünerator ist dort Admin',
  removed: 'Der Grünerator hat dort keinen Zugriff mehr',
  unknown: 'Status gerade nicht abrufbar',
};

function AccessLine({ access }: { access: AntragsgruenSiteAccess | 'checking' }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-grey-500">
      <span
        aria-hidden
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          access === 'admin' && 'bg-primary-500',
          access === 'removed' && 'bg-grey-400',
          access === 'unknown' && 'bg-amber-500',
          access === 'checking' && 'bg-grey-300 animate-pulse'
        )}
      />
      {access === 'checking' ? 'Status wird geprüft …' : ACCESS_LABEL[access]}
    </span>
  );
}

interface SiteCardProps {
  site: AntragsgruenSite;
  access: AntragsgruenSiteAccess | 'checking';
  botAccount: string | null;
  onCheck: () => void;
  checking: boolean;
}

// One flat list row per site (settings list pattern: no card, hairline between
// rows). The revoke and forget steps open underneath the row they belong to.
function SiteRow({ site, access, botAccount, onCheck, checking }: SiteCardProps) {
  const forget = useForgetAntragsgruenSite();
  const [revoking, setRevoking] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const stillAdmin = access !== 'removed';

  return (
    <li className="flex flex-col gap-sm py-3">
      {/* Icon and text always side by side; on narrow screens the actions
          wrap below, indented under the text instead of under the icon. */}
      <div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-md gap-y-sm sm:grid-cols-[30px_minmax(0,1fr)_auto]">
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200"
        >
          <HiClipboardList size={16} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm text-foreground" title={site.url}>
            {site.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-sm gap-y-0.5 text-xs text-grey-500">
            <span>
              {hostOf(site.url)} · {formatCreated(site)}
            </span>
            <AccessLine access={access} />
          </div>
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-xs sm:col-start-3">
          <Button asChild variant="outline" size="sm">
            <a href={site.url} target="_blank" rel="noopener noreferrer">
              <HiExternalLink size={12} aria-hidden />
              Öffnen
            </a>
          </Button>
          {stillAdmin ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={revoking}
              onClick={() => {
                setRevoking((v) => !v);
                setConfirmForget(false);
              }}
            >
              Zugriff entziehen
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmForget(true)}>
              Aus der Liste entfernen
            </Button>
          )}
        </div>
      </div>

      {revoking && stillAdmin && !confirmForget && (
        <div className="flex flex-col gap-sm rounded-lg bg-background-alt p-sm text-xs text-grey-600 dark:text-grey-300">
          <p className="m-0">
            Antragsgrün lässt den Grünerator sich nicht selbst austragen. Das machst du als
            Seiten-Admin:
          </p>
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-md">
            <li>
              <a
                href={site.usersUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
              >
                Personenverwaltung deiner Seite öffnen
              </a>
            </li>
            <li>
              Dort das Konto{' '}
              {botAccount ? (
                <strong className="font-medium text-foreground">{botAccount}</strong>
              ) : (
                'des Grünerators'
              )}{' '}
              entfernen.
            </li>
            <li>Hier prüfen, ob der Zugriff weg ist.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-xs">
            <Button type="button" size="sm" onClick={onCheck} disabled={checking}>
              {checking ? 'Wird geprüft …' : 'Prüfen'}
            </Button>
            <Button type="button" variant="link" size="sm" onClick={() => setConfirmForget(true)}>
              Nur aus der Liste entfernen
            </Button>
          </div>
        </div>
      )}

      {confirmForget && (
        <div
          role="group"
          aria-label={`${site.title} aus der Liste entfernen`}
          className="flex flex-col gap-sm rounded-lg bg-background-alt p-sm text-xs text-grey-600 dark:text-grey-300"
        >
          <p className="m-0">
            Der Grünerator speichert danach nichts mehr über diese Seite und bearbeitet sie nicht
            mehr. Die Seite selbst bleibt auf antragsgruen.de bestehen.
            {stillAdmin && (
              <>
                {' '}
                <strong className="font-medium text-foreground">
                  Das Grünerator-Konto bleibt dort Admin, bis du es austrägst.
                </strong>
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-xs">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={forget.isPending}
              onClick={() => forget.mutate(site.id)}
            >
              {forget.isPending ? 'Wird entfernt …' : 'Entfernen'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmForget(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Connect a site the person created themselves. The Grünerator account must be
 * a site admin there first, and the person too, under the email address of
 * their Grünerator account — the server checks both.
 */
function ConnectSite({ botAccount }: { botAccount: string | null }) {
  const connect = useConnectAntragsgruenSite();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const inputId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    connect.mutate(url.trim(), {
      onSuccess: () => {
        setUrl('');
        setOpen(false);
      },
    });
  };

  if (!open) {
    return (
      <div className="border-t border-grey-200 pt-sm dark:border-grey-800">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Bestehende Seite verbinden
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Bestehende Antragsgrün-Seite verbinden"
      className="flex flex-col gap-sm border-t border-grey-200 pt-sm text-sm dark:border-grey-800"
    >
      <h3 className="m-0 text-sm font-semibold text-foreground">Bestehende Seite verbinden</h3>
      <ol className="m-0 flex max-w-[64ch] list-decimal flex-col gap-1 pl-md text-xs text-grey-600 dark:text-grey-300">
        <li>
          Öffne auf deiner Seite <em>Einstellungen → Registrierte Benutzer*innen</em> und trage das
          Konto{' '}
          {botAccount ? (
            <strong className="font-medium text-foreground">{botAccount}</strong>
          ) : (
            'des Grünerators'
          )}{' '}
          in die Gruppe „Seiten-Admin“ ein.
        </li>
        <li>Du selbst musst dort Admin sein – mit der E-Mail-Adresse deines Grünerator-Kontos.</li>
        <li>Füge die Adresse deiner Seite hier ein.</li>
      </ol>
      <label htmlFor={inputId} className="sr-only">
        Adresse der Antragsgrün-Seite
      </label>
      <div className="flex flex-wrap items-center gap-xs">
        <Input
          id={inputId}
          type="url"
          inputMode="url"
          placeholder="https://kv-beispiel.antragsgruen.de/kmv"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={connect.isError}
          className="min-w-0 flex-1 basis-64"
        />
        <Button type="submit" size="sm" disabled={connect.isPending || !url.trim()}>
          {connect.isPending ? 'Wird geprüft …' : 'Verbinden'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Abbrechen
        </Button>
      </div>
      {connect.isError && (
        <p role="alert" className="m-0 text-xs text-red-700 dark:text-red-300">
          {connect.error.message}
        </p>
      )}
    </form>
  );
}

export const prefetch = (queryClient: QueryClient) => {
  void queryClient.prefetchQuery(antragsgruenSitesQuery);
};

export default function AntragsgruenTab() {
  const { data, isPending, isError } = useAntragsgruenSites();
  const hasSites = (data?.sites.length ?? 0) > 0;
  const createdCount = data?.sites.filter((s) => s.kind === 'created').length ?? 0;
  const access = useAntragsgruenSiteAccess(hasSites);

  if (isPending) return <SettingsCardsSkeleton cards={2} />;

  return (
    // Settings design: no tab title, the section heading carries the name.
    <div className="flex flex-col">
      <div className="flex flex-wrap items-baseline gap-x-sm gap-y-xs pb-1">
        <h2 className="m-0 font-[Raleway] text-[15px] font-semibold text-foreground-heading">
          Antragsgrün
        </h2>
        <span className="self-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-200">
          Experimentell
        </span>
        {data && createdCount > 0 && (
          <span className="text-sm tabular-nums text-grey-500">
            {createdCount} von {data.limit} Seiten
          </span>
        )}
      </div>

      <div className="flex max-w-[64ch] flex-col gap-xs pb-sm text-sm text-grey-500">
        <p className="m-0">
          Antragsgrün-Seiten, die der Grünerator für dich auf antragsgruen.de angelegt hat oder die
          du mit ihm verbunden hast. Solange er dort Admin ist, kann er im Chat Anträge einreichen
          und die Tagesordnung pflegen – jeweils erst, wenn du bestätigst.
        </p>
        <p className="m-0 text-xs">
          Beim Anlegen gehen dein Name und deine E-Mail-Adresse an antragsgruen.de, dort bekommst du
          ein eigenes Konto. Der Grünerator speichert nur Titel und Adresse der Seite. Die Funktion
          ist noch in Erprobung.
        </p>
      </div>

      {isError ? (
        <p className="m-0 border-t border-grey-200 py-md text-sm text-grey-500 dark:border-grey-800">
          Antragsgrün-Seiten konnten nicht geladen werden.
        </p>
      ) : !hasSites ? (
        <p className="m-0 border-t border-grey-200 py-md text-sm text-grey-500 dark:border-grey-800">
          Noch keine Seite. Schreib im Chat zum Beispiel: „Leg mir eine Antragsgrün-Seite für unsere
          Kreismitgliederversammlung an.“
        </p>
      ) : (
        <ul className="m-0 list-none divide-y divide-grey-200 border-t border-grey-200 p-0 dark:divide-grey-800 dark:border-grey-800">
          {data?.sites.map((site) => (
            <SiteRow
              key={site.id}
              site={site}
              botAccount={data.botAccount}
              access={access.isFetching ? 'checking' : (access.data?.[site.id] ?? 'unknown')}
              checking={access.isFetching}
              onCheck={() => void access.refetch()}
            />
          ))}
        </ul>
      )}

      {data?.enabled && <ConnectSite botAccount={data.botAccount} />}
    </div>
  );
}
