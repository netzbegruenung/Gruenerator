import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type ReactNode } from 'react';
import { FaAndroid, FaApple, FaLinux } from 'react-icons/fa';
import { HiCheck, HiClipboardCopy, HiDownload, HiExternalLink } from 'react-icons/hi';
import { HiDevicePhoneMobile } from 'react-icons/hi2';

import { useAuthStore } from '../../stores/authStore';
import { getDocsUrl } from '../../utils/docsUrl';
import { getVisitorDevice, type VisitorDevice } from '../../utils/platform';

import { cn } from '@/utils/cn';

const MCP_URL = 'https://mcp.gruenerator.eu/mcp';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=de.gruenerator.app';
// TestFlight-only so far — set once the app is public on the App Store.
const APP_STORE_URL = null as string | null;

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

type DeviceId = Exclude<VisitorDevice, null>;

const DEVICE_NAMES: Record<DeviceId, string> = {
  macos: 'macOS',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android',
};

const DEVICE_CTAS: Record<DeviceId, string> = {
  macos: 'Für macOS laden',
  linux: 'Für Linux laden',
  ios: 'Im App Store öffnen',
  android: 'Bei Google Play öffnen',
};

const FAQ_ITEMS = [
  {
    id: 'what',
    question: 'Was ist der Grünerator MCP-Server?',
    answer:
      'Über das Model Context Protocol (MCP) kann dein KI-Client die Grünerator-Tools direkt nutzen — Texte, Anträge, Recherche und mehr. Der Server spricht Streamable HTTP nach MCP-Standard; eine Anmeldung ist nicht notwendig.',
  },
  {
    id: 'claude',
    question: 'Wie verbinde ich Claude?',
    answer:
      'Öffne in Claude die Einstellungen → Connectors → „Eigenen Connector hinzufügen". Füge die Server-URL ein und bestätige — fertig.',
  },
  {
    id: 'chatgpt',
    question: 'Wie verbinde ich ChatGPT?',
    answer:
      'Öffne die Einstellungen → Connectors → „Erstellen" (Developer Mode nötig). Füge die Server-URL ein und wähle „Keine Authentifizierung".',
  },
  {
    id: 'mistral',
    question: 'Wie verbinde ich Mistral Le Chat?',
    answer:
      'Gehe zu Intelligence → Connectors → „Connector hinzufügen". Füge die Server-URL ein und aktiviere den Connector.',
  },
  {
    id: 'openwebui',
    question: 'Wie verbinde ich OpenWebUI?',
    answer:
      'Öffne die Admin-Einstellungen → Externe Tools → „+". Wähle als Typ „MCP (Streamable HTTP)", füge die Server-URL ein und speichere.',
  },
  {
    id: 'other',
    question: 'Mein Client ist nicht dabei — was nun?',
    answer:
      'Jeder MCP-fähige Client funktioniert: Füge die Server-URL als Streamable-HTTP-Endpunkt hinzu — ohne Authentifizierung. Mehr braucht es nicht.',
  },
];

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
// 404 = no release published in this channel — a valid empty answer, not an error.
const useReleaseManifest = (channel: ReleaseChannel, enabled: boolean) =>
  useQuery<ReleaseManifest | null>({
    queryKey: ['releaseManifest', channel],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/releases/${channel}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ReleaseManifest;
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    meta: { silent: true },
  });

const scrollToCard = (id: DeviceId) => {
  document
    .getElementById(`app-card-${id}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

const DeviceHero = ({ device }: { device: VisitorDevice }) => {
  const storeHref = device === 'android' ? PLAY_STORE_URL : device === 'ios' ? APP_STORE_URL : null;
  // No CTA for iOS while the app has no public App Store listing — the label
  // would promise an action the card below can't deliver.
  const showCta = device !== null && (device !== 'ios' || storeHref !== null);

  return (
    <div className="mb-9 flex flex-wrap items-center gap-5 rounded-2xl border border-grey-200 bg-background p-5 dark:border-grey-700 sm:p-7">
      <div className="min-w-60 flex-1">
        <div className="mb-1.5 text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
          {device ? 'Dein Gerät erkannt' : 'Grünerator App'}
        </div>
        <h2 className="text-lg font-bold text-foreground-heading sm:text-2xl">
          {device ? `Grünerator für ${DEVICE_NAMES[device]}` : 'Grünerator für dein Gerät'}
        </h2>
        <div className="mt-1 text-sm text-grey-600 dark:text-grey-400">
          {device
            ? 'Direkt loslegen — die passende App für dieses Gerät.'
            : 'Wähle unten die App für dein Gerät.'}
        </div>
      </div>
      {showCta &&
        device &&
        (storeHref ? (
          <Button asChild variant="brand" size="lg" className="w-full sm:w-auto">
            <a href={storeHref} target="_blank" rel="noopener noreferrer">
              {DEVICE_CTAS[device]}
            </a>
          </Button>
        ) : (
          <Button
            variant="brand"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => scrollToCard(device)}
          >
            {DEVICE_CTAS[device]}
          </Button>
        ))}
    </div>
  );
};

const AppCard = ({
  id,
  title,
  sub,
  icon,
  detected,
  qrUrl,
  children,
}: {
  id: DeviceId;
  title: string;
  sub: string;
  icon: ReactNode;
  detected: boolean;
  qrUrl: string | null;
  children: ReactNode;
}) => (
  <div
    id={`app-card-${id}`}
    className={cn(
      'flex flex-col gap-3 rounded-2xl border bg-background p-5',
      detected
        ? 'border-green-600/60 dark:border-green-500/60'
        : 'border-grey-200 dark:border-grey-700'
    )}
  >
    <div className="flex items-start justify-between gap-2.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        {icon}
      </span>
      {qrUrl && (
        <span className="hidden rounded-lg border border-grey-200 bg-white p-1 dark:border-grey-600 sm:block">
          <QRCodeSVG value={qrUrl} size={52} title={`QR-Code: ${title}-App herunterladen`} />
        </span>
      )}
    </div>
    <div className="flex-1">
      <h3 className="text-base font-bold text-foreground-heading">{title}</h3>
      <div className="mt-0.5 text-[13px] text-grey-600 dark:text-grey-400">{sub}</div>
    </div>
    {children}
  </div>
);

type ManifestStatus = 'loading' | 'error' | 'ready';

// Desktop card footer — login-gated downloads from the release manifest.
const DesktopDownloads = ({
  entries,
  version,
  channel,
  status,
  detected,
  loggedIn,
}: {
  entries: Array<[string, ReleasePlatform]>;
  version: string | null;
  channel: ReleaseChannel;
  status: ManifestStatus;
  detected: boolean;
  loggedIn: boolean;
}) => {
  if (!loggedIn) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button variant={detected ? 'brand' : 'brand-outline'} size="sm" disabled>
          Herunterladen
        </Button>
        <p className="text-xs text-grey-500">Zum Download bitte anmelden.</p>
      </div>
    );
  }
  if (entries.length === 0) {
    if (status === 'loading') {
      return <p className="text-sm text-grey-500">Lade Download-Informationen…</p>;
    }
    if (status === 'error') {
      return (
        <p className="text-sm text-grey-500">
          Downloads derzeit nicht verfügbar. Bitte versuche es später erneut.
        </p>
      );
    }
    return <p className="text-sm text-grey-500">Bald verfügbar.</p>;
  }
  const variant = detected ? 'brand' : 'brand-outline';
  const downloadHref = (key: string) => `${API_BASE}/releases/${channel}/download/${key}`;
  return (
    <div className="flex flex-col gap-2">
      {entries.length === 1 ? (
        <Button asChild variant={variant} size="sm" className="gap-1.5">
          <a href={downloadHref(entries[0][0])}>
            <HiDownload />
            {entries[0][1].label}
          </a>
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={variant} size="sm" className="gap-1.5">
              <HiDownload />
              Herunterladen
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-52">
            {entries.map(([key, p]) => (
              <DropdownMenuItem key={key} asChild>
                <a href={downloadHref(key)} className="cursor-pointer">
                  <HiDownload />
                  {p.label}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {version && (
        <p className="text-xs text-grey-500">
          Version {version}
          {channel === 'beta' ? ' (Beta)' : ''}
        </p>
      )}
    </div>
  );
};

const AppCardsGrid = ({ device }: { device: VisitorDevice }) => {
  const user = useAuthStore((s) => s.user);
  const loggedIn = Boolean(user);
  const stableQuery = useReleaseManifest('stable', loggedIn);
  const betaQuery = useReleaseManifest('beta', loggedIn);

  // Prefer the signed stable release once one exists; fall back to the beta
  // pre-release channel until then.
  const stable = stableQuery.data ?? null;
  const beta = betaQuery.data ?? null;
  const channel: ReleaseChannel =
    stable && Object.keys(stable.platforms).length > 0 ? 'stable' : 'beta';
  const manifest = channel === 'stable' ? stable : beta;

  const status: ManifestStatus =
    stableQuery.isLoading || betaQuery.isLoading
      ? 'loading'
      : !manifest && (stableQuery.isError || betaQuery.isError)
        ? 'error'
        : 'ready';

  const platformEntries = manifest ? Object.entries(manifest.platforms) : [];
  const macEntries = platformEntries.filter(([key]) => key.startsWith('mac-'));
  const linuxEntries = platformEntries.filter(([key]) => key.startsWith('linux-'));
  const version = manifest?.version ?? null;

  return (
    <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AppCard
        id="macos"
        title="macOS"
        sub=".dmg · Apple Silicon & Intel"
        icon={<FaApple className="text-[22px]" />}
        detected={device === 'macos'}
        qrUrl={null}
      >
        <DesktopDownloads
          entries={macEntries}
          version={version}
          channel={channel}
          status={status}
          detected={device === 'macos'}
          loggedIn={loggedIn}
        />
      </AppCard>

      <AppCard
        id="linux"
        title="Linux"
        sub=".AppImage & .deb · x64"
        icon={<FaLinux className="text-[22px]" />}
        detected={device === 'linux'}
        qrUrl={null}
      >
        <DesktopDownloads
          entries={linuxEntries}
          version={version}
          channel={channel}
          status={status}
          detected={device === 'linux'}
          loggedIn={loggedIn}
        />
      </AppCard>

      <AppCard
        id="ios"
        title="iOS"
        sub="App Store · iPhone & iPad"
        icon={<HiDevicePhoneMobile className="text-[22px]" />}
        detected={device === 'ios'}
        qrUrl={APP_STORE_URL}
      >
        {APP_STORE_URL ? (
          <Button asChild variant={device === 'ios' ? 'brand' : 'brand-outline'} size="sm">
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
              Im App Store
            </a>
          </Button>
        ) : (
          <p className="text-sm text-grey-500">Bald verfügbar.</p>
        )}
      </AppCard>

      <AppCard
        id="android"
        title="Android"
        sub="Play Store · Open Beta"
        icon={<FaAndroid className="text-[22px]" />}
        detected={device === 'android'}
        qrUrl={PLAY_STORE_URL}
      >
        <Button asChild variant={device === 'android' ? 'brand' : 'brand-outline'} size="sm">
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
            Bei Google Play
          </a>
        </Button>
      </AppCard>
    </div>
  );
};

const McpSection = () => {
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
    <section>
      <h2 className="mb-1.5 text-lg font-bold text-foreground-heading sm:text-xl">
        Mit dem MCP-Server verbinden
      </h2>
      <p className="mb-4 text-sm text-grey-600 dark:text-grey-400">
        Nutze die Grünerator-Tools direkt in deinem KI-Client. Kein Login notwendig.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3.5 rounded-2xl border border-grey-200 bg-background p-5 dark:border-grey-700">
        <div className="flex min-w-52 flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-grey-600 dark:text-grey-400">
            Server-URL
          </span>
          <code className="text-sm text-foreground [overflow-wrap:anywhere] sm:text-base">
            {MCP_URL}
          </code>
        </div>
        <Badge variant="secondary">Kein Login nötig</Badge>
        <Button variant="brand" className="w-full gap-1.5 sm:w-auto" onClick={handleCopy}>
          {copied ? <HiCheck /> : <HiClipboardCopy />}
          {copied ? 'Kopiert' : 'URL kopieren'}
        </Button>
      </div>

      <div className="rounded-2xl border border-grey-200 bg-background px-5 py-1.5 dark:border-grey-700">
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.id} value={item.id} className="last:border-b-0">
              <AccordionTrigger className="text-sm font-semibold text-foreground-heading">
                {item.question}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-grey-600 dark:text-grey-400">{item.answer}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <a
        href={`${getDocsUrl()}/docs/integrationen/ki-chat-einrichten`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-flex items-center gap-1.5 text-sm text-link underline underline-offset-2 hover:opacity-80"
      >
        Ausführliche Einrichtungsanleitung
        <HiExternalLink className="text-sm" />
      </a>
    </section>
  );
};

const AppsPage = () => {
  const device = getVisitorDevice();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12 lg:px-10">
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground-heading sm:text-3xl">
        Apps & Connect
      </h1>
      <p className="mb-7 max-w-prose text-sm text-grey-600 dark:text-grey-400 sm:text-base">
        Hol dir den Grünerator auf deine Geräte — und verbinde deine KI-Clients direkt mit dem
        Grünerator MCP-Server.
      </p>

      <DeviceHero device={device} />

      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <h2 className="text-lg font-bold text-foreground-heading sm:text-xl">
          Apps für deine Geräte
        </h2>
        <Badge variant="outline">Experimentell</Badge>
      </div>
      <p className="mb-4 max-w-prose text-sm text-grey-600 dark:text-grey-400">
        Die Apps befinden sich noch in einer experimentellen Phase — es kann vereinzelt zu Fehlern
        kommen. Feedback hilft uns, sie besser zu machen.
      </p>

      <AppCardsGrid device={device} />

      <McpSection />
    </div>
  );
};

export default AppsPage;
