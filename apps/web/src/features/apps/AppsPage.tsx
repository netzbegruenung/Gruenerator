import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@gruenerator/ui';
import { useState } from 'react';
import { HiClipboardCopy, HiCheck, HiExternalLink } from 'react-icons/hi';

import { getDocsUrl } from '../../utils/docsUrl';

import { cn } from '@/utils/cn';

const MCP_URL = 'https://mcp.gruenerator.eu/mcp';

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

      {/* Desktop App — coming soon */}
      <section className="flex w-full flex-col items-center">
        <h2 className="mb-2 text-lg font-bold text-foreground-heading">Desktop-App</h2>
        <p className="text-sm text-grey-500">Bald verfügbar.</p>
      </section>
    </div>
  );
};

export default AppsPage;
