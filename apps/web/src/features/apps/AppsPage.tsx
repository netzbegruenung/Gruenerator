import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Badge,
  Button,
} from '@gruenerator/ui';
import { QRCodeSVG } from 'qrcode.react';
import { useState, type ReactNode } from 'react';
import { FaAndroid, FaApple } from 'react-icons/fa';
import { HiCheck, HiClipboardCopy, HiExternalLink } from 'react-icons/hi';

import { getDocsUrl } from '../../utils/docsUrl';
import { getVisitorDevice, type VisitorDevice } from '../../utils/platform';

import { cn } from '@/utils/cn';

const MCP_URL = 'https://mcp.gruenerator.eu/mcp';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=de.gruenerator.app';
// TestFlight-only so far — set once the app is public on the App Store.
const APP_STORE_URL = null as string | null;

type DeviceId = Exclude<VisitorDevice, null>;

const STORE_URLS: Record<DeviceId, string | null> = {
  ios: APP_STORE_URL,
  android: PLAY_STORE_URL,
};

const DEVICE_NAMES: Record<DeviceId, string> = {
  ios: 'iPhone & iPad',
  android: 'Android',
};

const DEVICE_CTAS: Record<DeviceId, string> = {
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

const scrollToCard = (id: DeviceId) => {
  document
    .getElementById(`app-card-${id}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// QR codes only ever point at a store that actually has a listing. A detected
// visitor sees their own platform (and nothing if it isn't published yet — a
// foreign store's QR would be a dead end); desktop visitors see every live one.
const heroQrCodes = (device: VisitorDevice): Array<{ id: DeviceId; url: string }> => {
  const live = (['ios', 'android'] as const).flatMap((id) => {
    const url = STORE_URLS[id];
    return url ? [{ id, url }] : [];
  });
  return device ? live.filter((entry) => entry.id === device) : live;
};

const Hero = ({ device }: { device: VisitorDevice }) => {
  const storeHref = device ? STORE_URLS[device] : null;
  const qrCodes = heroQrCodes(device);

  return (
    <div className="mb-10 flex flex-wrap items-center gap-6 rounded-3xl border border-grey-200 bg-gradient-to-br from-green-50/80 to-background p-6 dark:border-grey-700 dark:from-green-950/30 sm:gap-8 sm:p-9">
      <div className="min-w-60 flex-1">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-green-700 dark:text-green-400">
          {device ? 'Dein Gerät erkannt' : 'Grünerator App'}
        </div>
        <h2 className="flex flex-wrap items-center gap-2.5 text-xl font-bold text-foreground-heading sm:text-3xl">
          {device ? `Grünerator für ${DEVICE_NAMES[device]}` : 'Grünerator aufs Handy holen'}
          {device && !storeHref && (
            <Badge variant="outline" className="font-normal">
              Bald verfügbar
            </Badge>
          )}
        </h2>
        <p className="mt-2 max-w-md text-sm text-grey-600 dark:text-grey-400 sm:text-base">
          {!device
            ? 'Die App gibt es für iPhone und Android. Scanne den QR-Code oder öffne die Seite auf deinem Handy.'
            : storeHref
              ? 'Direkt loslegen — die passende App für dieses Gerät.'
              : 'Die App für dein Gerät ist noch nicht im Store. Bis dahin läuft der Grünerator hier im Browser — die App melden wir, sobald sie da ist.'}
        </p>

        {/* Only ever a CTA that leads somewhere: a live store listing, or (for
            undetected desktop visitors) the card of the platform in question. */}
        {(storeHref || !device) && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            {device && storeHref && (
              <Button asChild variant="brand" size="lg">
                <a href={storeHref} target="_blank" rel="noopener noreferrer">
                  {DEVICE_CTAS[device]}
                </a>
              </Button>
            )}
            {!device && (
              <>
                <Button
                  asChild
                  variant="brand"
                  size="lg"
                  className="gap-2"
                  aria-label="Android-App bei Google Play öffnen"
                >
                  <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
                    <FaAndroid className="text-lg" />
                    Android
                  </a>
                </Button>
                <Button
                  variant="brand-outline"
                  size="lg"
                  className="gap-2"
                  onClick={() => scrollToCard('ios')}
                >
                  <FaApple className="text-lg" />
                  iPhone & iPad
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {qrCodes.length > 0 && (
        <div className="hidden shrink-0 gap-4 sm:flex">
          {qrCodes.map(({ id, url }) => (
            <div key={id} className="flex flex-col items-center gap-2">
              <span className="rounded-2xl border border-grey-200 bg-white p-3 dark:border-grey-600">
                <QRCodeSVG
                  value={url}
                  size={116}
                  title={`QR-Code: Grünerator-App für ${DEVICE_NAMES[id]} herunterladen`}
                />
              </span>
              <span className="text-xs text-grey-500">
                {device ? 'Mit dem Handy scannen' : `${DEVICE_NAMES[id]} scannen`}
              </span>
            </div>
          ))}
        </div>
      )}
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
  status,
  children,
}: {
  id: DeviceId;
  title: string;
  sub: string;
  icon: ReactNode;
  detected: boolean;
  qrUrl: string | null;
  status?: string;
  children: ReactNode;
}) => (
  <div
    id={`app-card-${id}`}
    className={cn(
      'flex flex-col gap-4 rounded-2xl border bg-background p-6 sm:p-7',
      detected
        ? 'border-green-600/60 dark:border-green-500/60'
        : 'border-grey-200 dark:border-grey-700'
    )}
  >
    <div className="flex items-start justify-between gap-3">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        {icon}
      </span>
      {qrUrl ? (
        <span className="hidden rounded-xl border border-grey-200 bg-white p-1.5 dark:border-grey-600 sm:block">
          <QRCodeSVG value={qrUrl} size={60} title={`QR-Code: ${title}-App herunterladen`} />
        </span>
      ) : (
        status && <Badge variant="outline">{status}</Badge>
      )}
    </div>
    <div className="flex-1">
      <h3 className="flex items-center gap-2 text-lg font-bold text-foreground-heading">
        {title}
        {detected && (
          <Badge variant="secondary" className="font-normal">
            Dein Gerät
          </Badge>
        )}
      </h3>
      <div className="mt-1 text-sm text-grey-600 dark:text-grey-400">{sub}</div>
    </div>
    {children}
  </div>
);

const AppCardsGrid = ({ device }: { device: VisitorDevice }) => (
  <div className="mb-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
    <AppCard
      id="ios"
      title="iOS"
      sub="iPhone & iPad · ab iOS 16"
      icon={<FaApple className="text-[26px]" />}
      detected={device === 'ios'}
      qrUrl={APP_STORE_URL}
      status="Bald verfügbar"
    >
      {APP_STORE_URL ? (
        <Button asChild variant={device === 'ios' ? 'brand' : 'brand-outline'}>
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
            Im App Store
          </a>
        </Button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Button variant="brand-outline" disabled>
            Im App Store
          </Button>
          <p className="text-xs text-grey-500">Noch nicht öffentlich im App Store.</p>
        </div>
      )}
    </AppCard>

    <AppCard
      id="android"
      title="Android"
      sub="Play Store · Open Beta"
      icon={<FaAndroid className="text-[26px]" />}
      detected={device === 'android'}
      qrUrl={PLAY_STORE_URL}
    >
      <Button asChild variant={device === 'android' ? 'brand' : 'brand-outline'}>
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer">
          Bei Google Play
        </a>
      </Button>
    </AppCard>
  </div>
);

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
        Hol dir den Grünerator aufs Smartphone — und verbinde deine KI-Clients direkt mit dem
        Grünerator MCP-Server.
      </p>

      <Hero device={device} />

      <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
        <h2 className="text-lg font-bold text-foreground-heading sm:text-xl">
          Apps für dein Smartphone
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
