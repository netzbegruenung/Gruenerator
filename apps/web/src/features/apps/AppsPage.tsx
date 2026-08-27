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

/**
 * Aus dem eigenen Host abgeleitet, damit Beta die Beta-Adresse anzeigt statt
 * Nutzerinnen auf Produktion zu schicken. Alles, was nicht nach einer
 * Grünerator-Domain aussieht (localhost, Vorschau-Builds), fällt auf die
 * öffentliche Adresse zurück — dort gibt es ohnehin keinen lokalen MCP.
 */
const mcpUrl = (): string => {
  const host = typeof window === 'undefined' ? '' : window.location.hostname;
  return /(^|\.)gruenerator\.(eu|de|at)$/.test(host)
    ? `https://mcp.${host.replace(/^www\./, '')}`
    : 'https://mcp.gruenerator.eu';
};
// Die App-Sektion ist vorerst ausgeblendet — auf true stellen, um Hero und
// App-Karten (Play Store + TestFlight) wieder anzuzeigen. MCP bleibt immer sichtbar.
// Beim Wiederanschalten auch den Footer-Link in Header/menuData.tsx zurückbenennen
// (Connect → Apps & Connect).
const SHOW_APPS = false as boolean;

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=de.gruenerator.app';
// Public TestFlight beta link — swap for the App Store URL once the app is public.
const TESTFLIGHT_URL = 'https://testflight.apple.com/join/WZnQJzvU';

type DeviceId = Exclude<VisitorDevice, null>;

const STORE_URLS: Record<DeviceId, string> = {
  ios: TESTFLIGHT_URL,
  android: PLAY_STORE_URL,
};

const DEVICE_NAMES: Record<DeviceId, string> = {
  ios: 'iPhone & iPad',
  android: 'Android',
};

const DEVICE_CTAS: Record<DeviceId, string> = {
  ios: 'Beta über TestFlight laden',
  android: 'Bei Google Play öffnen',
};

const FAQ_ITEMS = [
  {
    id: 'what',
    question: 'Was ist der Grünerator MCP-Server?',
    answer:
      'Über das Model Context Protocol (MCP) kann dein KI-Client die Grünerator-Tools direkt nutzen — Recherche in Parteiprogrammen, Beispiele, Umfragen und deine eigenen Inhalte. Der Server spricht Streamable HTTP nach MCP-Standard. Beim Verbinden meldest du dich einmal an und stimmst zu, worauf der Client zugreifen darf; ein Passwort gibst du dabei nicht weiter.',
  },
  {
    id: 'claude',
    question: 'Wie verbinde ich Claude?',
    answer:
      'Öffne in Claude die Einstellungen → Connectors → „Eigenen Connector hinzufügen". Füge die Server-URL ein, klicke auf „Verbinden", melde dich an und stimme zu — fertig.',
  },
  {
    id: 'chatgpt',
    question: 'Wie verbinde ich ChatGPT?',
    answer:
      'Öffne die Einstellungen → Connectors → „Erstellen" (Developer Mode nötig). Füge die Server-URL ein und wähle „OAuth". Client-ID und Geheimnis bleiben leer — ChatGPT meldet sich selbst an.',
  },
  {
    id: 'mistral',
    question: 'Wie verbinde ich Mistral Le Chat?',
    answer:
      'Gehe zu Intelligence → Connectors → „Connector hinzufügen". Füge die Server-URL ein, wähle „OAuth", melde dich an und aktiviere den Connector.',
  },
  {
    id: 'openwebui',
    question: 'Wie verbinde ich OpenWebUI?',
    answer:
      'Öffne die Admin-Einstellungen → Externe Tools → „+". Wähle als Typ „MCP (Streamable HTTP)", füge die Server-URL ein, wähle „OAuth" und speichere.',
  },
  {
    id: 'other',
    question: 'Mein Client ist nicht dabei — was nun?',
    answer:
      'Jeder MCP-fähige Client mit OAuth-Unterstützung funktioniert: Füge die Server-URL als Streamable-HTTP-Endpunkt hinzu. Der Client registriert sich selbst und führt dich durch die Anmeldung. Für Skripte und Automatisierungen gibt es Zugangsschlüssel — melde dich dafür beim Grünerator-Team.',
  },
];

// A detected visitor sees only their own platform's QR; desktop visitors see both.
const heroQrCodes = (device: VisitorDevice): Array<{ id: DeviceId; url: string }> => {
  const all = (['ios', 'android'] as const).map((id) => ({ id, url: STORE_URLS[id] }));
  return device ? all.filter((entry) => entry.id === device) : all;
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
        </h2>
        <p className="mt-2 max-w-md text-sm text-grey-600 dark:text-grey-400 sm:text-base">
          {device
            ? 'Direkt loslegen — die passende App für dieses Gerät.'
            : 'Die App gibt es für iPhone (TestFlight-Beta) und Android. Scanne den QR-Code oder öffne die Seite auf deinem Handy.'}
        </p>

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
                asChild
                variant="brand-outline"
                size="lg"
                className="gap-2"
                aria-label="iOS-Beta über TestFlight laden"
              >
                <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer">
                  <FaApple className="text-lg" />
                  iPhone & iPad
                </a>
              </Button>
            </>
          )}
        </div>
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
  title,
  sub,
  icon,
  detected,
  qrUrl,
  children,
}: {
  title: string;
  sub: string;
  icon: ReactNode;
  detected: boolean;
  qrUrl: string;
  children: ReactNode;
}) => (
  <div
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
      <span className="hidden rounded-xl border border-grey-200 bg-white p-1.5 dark:border-grey-600 sm:block">
        <QRCodeSVG value={qrUrl} size={60} title={`QR-Code: ${title}-App herunterladen`} />
      </span>
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
      title="iOS"
      sub="TestFlight · Beta · ab iOS 16"
      icon={<FaApple className="text-[26px]" />}
      detected={device === 'ios'}
      qrUrl={TESTFLIGHT_URL}
    >
      <div className="flex flex-col gap-1.5">
        <Button asChild variant={device === 'ios' ? 'brand' : 'brand-outline'}>
          <a href={TESTFLIGHT_URL} target="_blank" rel="noopener noreferrer">
            Über TestFlight
          </a>
        </Button>
        <p className="text-xs text-grey-500">
          Der Link führt zu Apples TestFlight — die kostenlose TestFlight-App wird dabei
          mitinstalliert, falls sie fehlt.
        </p>
      </div>
    </AppCard>

    <AppCard
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
  const url = mcpUrl();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
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
        Nutze die Grünerator-Tools direkt in deinem KI-Client — inklusive deiner eigenen Dokumente,
        Boards und Notebooks. Beim Verbinden meldest du dich mit deinem Grünerator-Konto an und
        entscheidest, worauf der Client zugreifen darf.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3.5 rounded-2xl border border-grey-200 bg-background p-5 dark:border-grey-700">
        <div className="flex min-w-52 flex-1 flex-col gap-1">
          <span className="text-xs font-bold uppercase tracking-wider text-grey-600 dark:text-grey-400">
            Server-URL
          </span>
          <code className="text-sm text-foreground [overflow-wrap:anywhere] sm:text-base">
            {url}
          </code>
        </div>
        <Badge variant="secondary">Anmeldung mit Grünerator-Konto</Badge>
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
        {SHOW_APPS ? 'Apps & Connect' : 'Connect'}
      </h1>
      <p className="mb-7 max-w-prose text-sm text-grey-600 dark:text-grey-400 sm:text-base">
        {SHOW_APPS
          ? 'Hol dir den Grünerator aufs Smartphone — und verbinde deine KI-Clients direkt mit dem Grünerator MCP-Server.'
          : 'Verbinde deine KI-Clients direkt mit dem Grünerator MCP-Server.'}
      </p>

      {SHOW_APPS && (
        <>
          <Hero device={device} />

          <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-bold text-foreground-heading sm:text-xl">
              Apps für dein Smartphone
            </h2>
            <Badge variant="outline">Experimentell</Badge>
          </div>
          <p className="mb-4 max-w-prose text-sm text-grey-600 dark:text-grey-400">
            Die Apps befinden sich noch in einer experimentellen Phase — es kann vereinzelt zu
            Fehlern kommen. Feedback hilft uns, sie besser zu machen.
          </p>

          <AppCardsGrid device={device} />
        </>
      )}

      <McpSection />
    </div>
  );
};

export default AppsPage;
