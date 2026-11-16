/**
 * „Antragsgrün" (experimental) — the sites the Grünerator created for the
 * person on antragsgruen.de, and the way to take its access away again.
 *
 * Antragsgrün does not let a site admin remove itself, so the Grünerator
 * cannot leave a site on its own. The person removes its account on their
 * site; this section says which account, links the page, and checks the
 * result live. "Aus der Liste entfernen" deletes our row: the Grünerator then
 * stores nothing about the site and never acts on it again.
 */
import { type AntragsgruenSite, type AntragsgruenSiteAccess } from '@gruenerator/contracts';
import { Button, SectionHeader } from '@gruenerator/ui';
import { useState } from 'react';
import { HiClipboardList, HiExternalLink } from 'react-icons/hi';

import {
  useAntragsgruenSiteAccess,
  useAntragsgruenSites,
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

function formatCreated(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `angelegt am ${d.toLocaleDateString('de-DE')}`;
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

function SiteCard({ site, access, botAccount, onCheck, checking }: SiteCardProps) {
  const forget = useForgetAntragsgruenSite();
  const [revoking, setRevoking] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const stillAdmin = access !== 'removed';

  return (
    <div className="flex flex-col gap-sm rounded-xl border border-grey-200 bg-background p-md dark:border-grey-800">
      <div className="flex flex-col gap-sm sm:flex-row sm:items-center">
        <HiClipboardList
          size={18}
          className="shrink-0 text-secondary-600 dark:text-secondary-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground" title={site.url}>
            {site.title}
          </div>
          <div className="mt-[2px] text-xs text-grey-500">
            {hostOf(site.url)} · {formatCreated(site.createdAt)}
          </div>
          <div className="mt-xs">
            <AccessLine access={access} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-xs">
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
          <ol className="m-0 flex flex-col gap-1 pl-md">
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
    </div>
  );
}

export default function AntragsgruenSection() {
  const { data, isPending, isError } = useAntragsgruenSites();
  const hasSites = (data?.sites.length ?? 0) > 0;
  const access = useAntragsgruenSiteAccess(hasSites);

  // Ohne eingerichtetes Bot-Konto (oder in Österreich) gibt es nichts anzulegen;
  // wer trotzdem Seiten hat, muss sie verwalten können.
  if (isPending || (data && !data.enabled && !hasSites)) return null;

  return (
    <section className="flex flex-col gap-md">
      <SectionHeader
        title="Antragsgrün"
        actions={
          <span className="flex items-center gap-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary-100 bg-secondary-50 px-2.5 py-1 text-xs font-semibold text-secondary-700 dark:border-secondary-600 dark:bg-secondary-900/30 dark:text-secondary-300">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-secondary-500" />
              Experimentell
            </span>
            {data && hasSites && (
              <span className="text-sm text-grey-500">
                {data.sites.length} von {data.limit}
              </span>
            )}
          </span>
        }
      />

      <div className="flex flex-col gap-xs text-sm text-grey-500">
        <p className="m-0">
          Antragsgrün-Seiten, die der Grünerator für dich auf antragsgruen.de angelegt hat. Solange
          er dort Admin ist, kann er im Chat Anträge einreichen und die Tagesordnung pflegen –
          jeweils erst, wenn du bestätigst.
        </p>
        <p className="m-0 text-xs">
          Beim Anlegen gehen dein Name und deine E-Mail-Adresse an antragsgruen.de, dort bekommst du
          ein eigenes Konto. Der Grünerator speichert nur Titel und Adresse der Seite. Die Funktion
          ist noch in Erprobung.
        </p>
      </div>

      {isError ? (
        <p className="m-0 text-sm text-grey-500">
          Antragsgrün-Seiten konnten nicht geladen werden.
        </p>
      ) : !hasSites ? (
        <p className="m-0 rounded-xl border border-dashed border-grey-300 p-md text-sm text-grey-500 dark:border-grey-700">
          Noch keine Seite. Schreib im Chat zum Beispiel: „Leg mir eine Antragsgrün-Seite für unsere
          Kreismitgliederversammlung an.“
        </p>
      ) : (
        <div className="flex flex-col gap-sm">
          {data?.sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              botAccount={data.botAccount}
              access={access.isFetching ? 'checking' : (access.data?.[site.id] ?? 'unknown')}
              checking={access.isFetching}
              onCheck={() => void access.refetch()}
            />
          ))}
        </div>
      )}
    </section>
  );
}
