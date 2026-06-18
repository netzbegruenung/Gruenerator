import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
} from '@gruenerator/ui';
import { useEffect, useState } from 'react';
import { HiClipboardCopy, HiCheck, HiExternalLink, HiDownload } from 'react-icons/hi';

import { useAuthStore } from '../../stores/authStore';
import { getDocsUrl } from '../../utils/docsUrl';

import { cn } from '@/utils/cn';

const MCP_URL = 'https://mcp.gruenerator.eu/mcp';
const API_BASE_URL = 'https://api.gruenerator.eu/api/v1/notebooks';
const API_CONTACT_EMAIL = 'kontakt@gruenerator.eu';

const API_USAGE_EXAMPLES = [
  {
    id: 'curl-ask',
    name: 'curl — Frage stellen',
    note: 'POST /api/v1/notebooks/ask',
    code: `curl -X POST ${API_BASE_URL}/ask \\
  -H "Authorization: Bearer DEIN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "question": "Wie steht ihr zum Mietendeckel?",
    "landesverband": "HH"
  }'`,
  },
  {
    id: 'curl-list',
    name: 'curl — Verfügbare Landesverbände',
    note: 'GET /api/v1/notebooks',
    code: `curl ${API_BASE_URL} \\
  -H "Authorization: Bearer DEIN_API_KEY"`,
  },
  {
    id: 'curl-search',
    name: 'curl — Rohe Treffer ohne KI-Antwort',
    note: 'POST /api/v1/notebooks/search',
    code: `curl -X POST ${API_BASE_URL}/search \\
  -H "Authorization: Bearer DEIN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "Klimaschutz",
    "landesverband": "BY"
  }'`,
  },
];

const CONNECT_PLATFORMS = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    note: 'Plus, Pro oder Team Plan',
    steps: [
      'Öffne chatgpt.com und logge dich ein.',
      'Klicke oben rechts auf dein Profil → Settings.',
      'Wähle in der Sidebar Connectors.',
      'Aktiviere unter Advanced den Developer Mode, damit du eigene Verbindungen hinzufügen kannst.',
      'Klicke auf Create bzw. Add custom connector.',
      'Trage als Name „Grünerator" ein und als URL die oben kopierte MCP-URL. Auth leer lassen.',
      'Speichern — der Grünerator steht nun in normalen Chats und in Deep Research als Datenquelle zur Verfügung.',
    ],
  },
  {
    id: 'claude',
    name: 'Claude',
    note: null,
    steps: [
      'Öffne claude.ai und logge dich ein.',
      'Klicke oben rechts auf dein Profil → Settings.',
      'Gehe in der linken Sidebar auf Integrations.',
      'Klicke auf Add integration.',
      'Trage als Name „Grünerator" ein und als URL die oben kopierte MCP-URL. Auth leer lassen.',
      'Speichern — Claude nutzt den Grünerator nun automatisch, wenn es zu deiner Anfrage passt.',
    ],
  },
  {
    id: 'mistral',
    name: 'Mistral Le Chat',
    note: null,
    steps: [
      'Öffne chat.mistral.ai und logge dich ein.',
      'Gehe in der linken Sidebar auf Connectors (oder über Profil → Settings → Connectors).',
      'Klicke auf Add Connector und wähle den Tab Custom MCP Connector.',
      'Trage als Name „Grünerator" ein und als URL die oben kopierte MCP-URL. Auth leer lassen.',
      'Speichern.',
      'Im Chat den Grünerator unter Connectors anhaken oder im Prompt /Grünerator eingeben.',
    ],
  },
  {
    id: 'openwebui',
    name: 'OpenWebUI',
    note: 'Ab Version 0.6 — selbst gehostete Chat-Oberfläche',
    steps: [
      'Öffne die OpenWebUI-Einstellungen → Tools → MCP Servers.',
      'Füge einen neuen Server hinzu: Name „Grünerator", URL die oben kopierte MCP-URL.',
      'Speichern und im Chat als Tool aktivieren.',
    ],
  },
];

const ConnectSection = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  };

  return (
    <section className="flex w-full max-w-[40rem] flex-col items-center gap-6">
      <h2 className="text-xl font-bold text-foreground-heading">Mit ChatGPT & co verwenden</h2>
      <p className="text-center text-sm text-grey-600 dark:text-grey-400">
        Du kannst den Grünerator direkt in ChatGPT, Claude, Mistral Le Chat oder OpenWebUI
        verwenden. Dein KI-Assistent kann dann grüne Parteiprogramme durchsuchen und dir beim
        Erstellen politischer Texte helfen.
      </p>

      {/* MCP URL with copy button */}
      <div className="flex w-full items-center gap-2 rounded-lg border border-grey-200 bg-background-alt px-4 py-3 dark:border-grey-700">
        <code className="min-w-0 flex-1 truncate text-sm text-foreground">{MCP_URL}</code>
        <button
          onClick={handleCopy}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            copied
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-grey-100 text-grey-600 hover:bg-grey-200 dark:bg-grey-800 dark:text-grey-300 dark:hover:bg-grey-700'
          )}
        >
          {copied ? (
            <>
              <HiCheck className="text-sm" />
              Kopiert
            </>
          ) : (
            <>
              <HiClipboardCopy className="text-sm" />
              Kopieren
            </>
          )}
        </button>
      </div>

      {/* Platform setup accordions */}
      <Accordion type="single" collapsible className="w-full">
        {CONNECT_PLATFORMS.map((platform) => (
          <AccordionItem key={platform.id} value={platform.id}>
            <AccordionTrigger className="text-sm font-semibold text-foreground-heading">
              <div className="flex flex-col items-start gap-0.5">
                <span>{platform.name}</span>
                {platform.note && (
                  <span className="text-xs font-normal text-grey-400 dark:text-grey-500">
                    {platform.note}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-grey-600 dark:text-grey-400">
                {platform.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {/* Link to full docs */}
      <a
        href={`${getDocsUrl()}/docs/integrationen/ki-chat-einrichten`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-link underline underline-offset-2 hover:opacity-80"
      >
        Ausführliche Einrichtungsanleitung
        <HiExternalLink className="text-sm" />
      </a>
    </section>
  );
};

const ApiAccessSection = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback handled by user selecting the text manually.
    }
  };

  return (
    <section className="flex w-full max-w-[40rem] flex-col items-center gap-6">
      <h2 className="text-xl font-bold text-foreground-heading">Programmatischer Zugriff (API)</h2>
      <p className="text-center text-sm text-grey-600 dark:text-grey-400">
        Du baust eine eigene Integration? Über unsere REST-API kannst du Notebook-Inhalte je
        Landesverband direkt abfragen — mit Authentifizierung über einen API-Key.
      </p>

      <div className="flex w-full items-center gap-2 rounded-lg border border-grey-200 bg-background-alt px-4 py-3 dark:border-grey-700">
        <code className="min-w-0 flex-1 truncate text-sm text-foreground">{API_BASE_URL}</code>
        <button
          onClick={() => copy('base', API_BASE_URL)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            copiedId === 'base'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-grey-100 text-grey-600 hover:bg-grey-200 dark:bg-grey-800 dark:text-grey-300 dark:hover:bg-grey-700'
          )}
        >
          {copiedId === 'base' ? (
            <>
              <HiCheck className="text-sm" />
              Kopiert
            </>
          ) : (
            <>
              <HiClipboardCopy className="text-sm" />
              Kopieren
            </>
          )}
        </button>
      </div>

      <div className="w-full rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-grey-700 dark:border-yellow-900/40 dark:bg-yellow-900/20 dark:text-grey-300">
        API-Keys werden derzeit auf Anfrage vergeben. Schreib uns eine kurze Mail mit deinem
        Anwendungsfall und den benötigten Landesverbänden —{' '}
        <a
          href={`mailto:${API_CONTACT_EMAIL}?subject=API-Key%20Anfrage`}
          className="text-link underline underline-offset-2 hover:opacity-80"
        >
          {API_CONTACT_EMAIL}
        </a>
        .
      </div>

      <Accordion type="single" collapsible className="w-full">
        {API_USAGE_EXAMPLES.map((ex) => (
          <AccordionItem key={ex.id} value={ex.id}>
            <AccordionTrigger className="text-sm font-semibold text-foreground-heading">
              <div className="flex flex-col items-start gap-0.5">
                <span>{ex.name}</span>
                <span className="text-xs font-normal text-grey-400 dark:text-grey-500">
                  {ex.note}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="relative">
                <pre className="overflow-x-auto rounded-md bg-grey-900 p-3 text-xs text-grey-100">
                  <code>{ex.code}</code>
                </pre>
                <button
                  onClick={() => copy(ex.id, ex.code)}
                  className={cn(
                    'absolute right-2 top-2 flex items-center gap-1 rounded px-2 py-1 text-xs',
                    copiedId === ex.id
                      ? 'bg-green-700 text-green-100'
                      : 'bg-grey-700 text-grey-200 hover:bg-grey-600'
                  )}
                >
                  {copiedId === ex.id ? <HiCheck /> : <HiClipboardCopy />}
                </button>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <p className="text-center text-xs text-grey-500">
        Auch direkt als MCP-Server nutzbar: dieselbe URL wie oben +{' '}
        <code>Authorization: Bearer</code> Header — die Tools <code>notebooks_list</code>,{' '}
        <code>notebooks_ask</code>, <code>notebooks_search</code> und{' '}
        <code>notebooks_get_filters</code> erscheinen dann automatisch.
      </p>
    </section>
  );
};

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

interface ReleasePlatform {
  label: string;
  filename: string;
}

interface ReleaseManifest {
  version: string;
  name: string;
  notes: string;
  publishedAt: string;
  platforms: Record<string, ReleasePlatform>;
}

type ReleaseChannel = 'stable' | 'beta';

// Fetch a channel's download manifest from the API. Manifests are derived from
// GitHub Releases server-side, so a new release appears here with no redeploy.
const useReleaseManifest = (channel: ReleaseChannel, enabled: boolean) => {
  const [manifest, setManifest] = useState<ReleaseManifest | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/releases/${channel}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ReleaseManifest;
        if (!cancelled) setManifest(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, enabled]);

  return { manifest, failed };
};

const ReleaseDownloadButtons = ({
  channel,
  manifest,
}: {
  channel: ReleaseChannel;
  manifest: ReleaseManifest;
}) => {
  const platforms = Object.entries(manifest.platforms);
  if (platforms.length === 0) return null;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-grey-400">
        Wähle die Version für deinen Mac
      </p>
      {platforms.map(([key, p]) => (
        <Button key={key} asChild variant="brand" size="brand" className="w-full max-w-sm gap-2">
          <a href={`${API_BASE}/releases/${channel}/download/${key}`}>
            <HiDownload className="text-lg" />
            {p.label}
          </a>
        </Button>
      ))}
      <p className="text-xs text-grey-500">Version {manifest.version}</p>
    </div>
  );
};

// Desktop download — gated to authenticated users. The stable channel is the
// signed + notarized release; the beta channel (latest pre-release) is shown
// below when one exists. Both manifests come from the API, so publishing a
// GitHub release updates this page with no frontend redeploy.
const DesktopDownloadSection = () => {
  const user = useAuthStore((s) => s.user);
  const { manifest: stable, failed: stableFailed } = useReleaseManifest('stable', Boolean(user));
  const { manifest: beta } = useReleaseManifest('beta', Boolean(user));

  // Public visitors (and logged-out) see only the "coming soon" note.
  if (!user) {
    return (
      <section className="flex w-full flex-col items-center">
        <h2 className="mb-2 text-lg font-bold text-foreground-heading">Desktop-App</h2>
        <p className="text-sm text-grey-500">Bald verfügbar.</p>
      </section>
    );
  }

  return (
    <section className="flex w-full max-w-[40rem] flex-col items-center gap-6">
      <h2 className="text-xl font-bold text-foreground-heading">Desktop-App</h2>
      <p className="text-center text-sm text-grey-600 dark:text-grey-400">
        Der Grünerator als native Mac-App — signiert und von Apple notarisiert.
        {stable?.notes ? ` ${stable.notes}` : ''}
      </p>

      {stable && Object.keys(stable.platforms).length > 0 ? (
        <ReleaseDownloadButtons channel="stable" manifest={stable} />
      ) : stableFailed ? (
        <p className="text-sm text-grey-500">
          Aktuell ist keine Version verfügbar. Schau bald wieder vorbei.
        </p>
      ) : (
        <p className="text-sm text-grey-500">Lade Download-Informationen…</p>
      )}

      {beta && Object.keys(beta.platforms).length > 0 ? (
        <div className="mt-2 flex w-full flex-col items-center gap-3 border-t border-grey-200 pt-6 dark:border-grey-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground-heading">Beta-Kanal</h3>
            <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
              Beta
            </span>
          </div>
          <p className="text-center text-xs text-grey-500">
            Vorabversion zum Testen — kann Fehler enthalten. Bitte melde uns Probleme.
            {beta.notes ? ` ${beta.notes}` : ''}
          </p>
          <ReleaseDownloadButtons channel="beta" manifest={beta} />
        </div>
      ) : null}
    </section>
  );
};

const AppsPage = () => {
  return (
    <div className="flex min-h-[60vh] flex-col items-center px-4 py-12">
      <h1 className="mb-2 text-center text-2xl font-bold text-foreground-heading">
        Apps & Connect
      </h1>
      <p className="mb-10 text-center text-sm text-grey-500">
        Den Grünerator mit ChatGPT & co verwenden.
      </p>

      <ConnectSection />

      <hr className="my-12 w-full max-w-[40rem] border-grey-200 dark:border-grey-700" />

      <ApiAccessSection />

      <hr className="my-12 w-full max-w-[40rem] border-grey-200 dark:border-grey-700" />

      <DesktopDownloadSection />
    </div>
  );
};

export default AppsPage;
