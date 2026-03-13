import { GruenOMatDialog, GruenOMatModal, useChatConfigStore } from '@gruenerator/chat';
import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '@/utils/cn';

const COLLECTIONS = [
  { id: 'gruene-de-system', name: 'gruene.de', label: 'gruene.de' },
  { id: 'grundsatz-system', name: 'Grundsatzprogramm', label: 'Grundsatzprogramm' },
  { id: 'bundestagsfraktion-system', name: 'Bundestagsfraktion', label: 'Bundestagsfraktion' },
  { id: 'hamburg-system', name: 'Grüne Hamburg', label: 'Hamburg' },
  { id: 'bayern-system', name: 'Grüne Bayern', label: 'Bayern' },
  { id: 'berlin-system', name: 'Grüne Berlin', label: 'Berlin' },
  { id: 'kommunalwiki-system', name: 'KommunalWiki', label: 'KommunalWiki' },
  { id: 'boell-stiftung-system', name: 'Heinrich-Böll-Stiftung', label: 'Böll-Stiftung' },
] as const;

const POSITIONS = ['bottom-right', 'bottom-left'] as const;

type CodeTab = 'react' | 'script' | 'iframe';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-md border border-grey-200 bg-background-pure text-foreground-muted transition-colors hover:text-foreground dark:border-grey-700"
      aria-label="Code kopieren"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}

function CodeBlock({ code, language = 'html' }: { code: string; language?: string }) {
  return (
    <div className="relative">
      <CopyButton text={code} />
      <pre className="overflow-x-auto rounded-lg border border-grey-200 bg-grey-50 p-4 text-xs leading-relaxed text-foreground dark:border-grey-700 dark:bg-grey-900">
        <code data-language={language}>{code}</code>
      </pre>
    </div>
  );
}

function ConfigPlayground({
  collectionId,
  setCollectionId,
  position,
  setPosition,
  titleText,
  setTitleText,
}: {
  collectionId: string;
  setCollectionId: (id: string) => void;
  position: (typeof POSITIONS)[number];
  setPosition: (p: (typeof POSITIONS)[number]) => void;
  titleText: string;
  setTitleText: (t: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Quelle</label>
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className="w-full rounded-lg border border-grey-200 bg-background-pure px-3 py-2 text-sm text-foreground dark:border-grey-700"
        >
          {COLLECTIONS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Position</label>
        <div className="flex gap-2">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors',
                position === p
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-grey-200 text-foreground hover:bg-surface-hover dark:border-grey-700'
              )}
            >
              {p === 'bottom-right' ? 'Rechts unten' : 'Links unten'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Titel</label>
        <input
          type="text"
          value={titleText}
          onChange={(e) => setTitleText(e.target.value)}
          className="w-full rounded-lg border border-grey-200 bg-background-pure px-3 py-2 text-sm text-foreground dark:border-grey-700"
        />
      </div>
    </div>
  );
}

export default function GruenOMatDemoPage() {
  const [collectionId, setCollectionId] = useState('gruene-de-system');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('bottom-right');
  const [titleText, setTitleText] = useState('Grün-O-Mat');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<CodeTab>('script');

  const selectedCollection = useMemo(
    () => COLLECTIONS.find((c) => c.id === collectionId) || COLLECTIONS[0],
    [collectionId]
  );

  useEffect(() => {
    const store = useChatConfigStore.getState();
    if (!store.fetch) {
      store.configure({
        fetch: (url, opts) => fetch(url, { ...opts, credentials: 'include' }),
        onUnauthorized: () => {},
      });
    }
  }, []);

  const codeSnippets: Record<CodeTab, string> = useMemo(
    () => ({
      script: `<!-- Grün-O-Mat Widget -->
<script
  src="https://gruen-o-mat.eu/embed.js"
  data-collection="${collectionId}"
  data-position="${position}"
  data-title="${titleText}"
  data-mode="widget"
></script>`,
      react: `import { GruenOMatModal } from '@gruenerator/chat';

function App() {
  return (
    <GruenOMatModal
      collectionId="${collectionId}"
      collectionName="${selectedCollection.name}"
      title="${titleText}"
      position="${position}"
      endpoint="/api/gruen-o-mat/stream"
    />
  );
}`,
      iframe: `<iframe
  src="https://gruen-o-mat.eu/embed/${collectionId}"
  style="width: 100%; height: 600px; border: none; border-radius: 12px;"
  allow="clipboard-write"
  title="${titleText}"
></iframe>`,
    }),
    [collectionId, position, titleText, selectedCollection]
  );

  const tabs: { key: CodeTab; label: string }[] = [
    { key: 'script', label: 'Script Tag' },
    { key: 'react', label: 'React' },
    { key: 'iframe', label: 'iframe' },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-lg px-md py-lg">
      <div className="mb-lg">
        <h1 className="mb-2 text-2xl font-bold text-foreground-heading">Grün-O-Mat einbetten</h1>
        <p className="text-foreground-muted">
          Binde den Grün-O-Mat auf deiner Website ein — als Widget, Dialog oder direkt per iframe.
          Besucher*innen können Fragen zu grüner Politik stellen und erhalten quellenbasierte
          Antworten.
        </p>
      </div>

      {/* Live demos */}
      <section className="mb-lg">
        <h2 className="mb-sm text-lg font-semibold text-foreground-heading">Live-Demos</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-grey-200 p-md dark:border-grey-700">
            <h3 className="mb-2 text-sm font-medium text-foreground">Widget (Bubble)</h3>
            <p className="mb-3 text-xs text-foreground-muted">
              Erscheint als schwebender Button unten rechts auf dieser Seite. Klicke darauf, um den
              Chat zu öffnen.
            </p>
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs text-primary">
              Aktiv — schau nach unten rechts
            </span>
          </div>

          <div className="rounded-xl border border-grey-200 p-md dark:border-grey-700">
            <h3 className="mb-2 text-sm font-medium text-foreground">Dialog (Modal)</h3>
            <p className="mb-3 text-xs text-foreground-muted">
              Zentrierter Dialog, den du programmatisch öffnen kannst.
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              Modal öffnen
            </button>
          </div>
        </div>
      </section>

      {/* Config playground */}
      <section className="mb-lg">
        <h2 className="mb-sm text-lg font-semibold text-foreground-heading">Konfiguration</h2>
        <div className="rounded-xl border border-grey-200 p-md dark:border-grey-700">
          <ConfigPlayground
            collectionId={collectionId}
            setCollectionId={setCollectionId}
            position={position}
            setPosition={setPosition}
            titleText={titleText}
            setTitleText={setTitleText}
          />
        </div>
      </section>

      {/* Code snippets */}
      <section className="mb-lg">
        <h2 className="mb-sm text-lg font-semibold text-foreground-heading">Integrations-Code</h2>
        <div className="rounded-xl border border-grey-200 dark:border-grey-700">
          <div className="flex border-b border-grey-200 dark:border-grey-700">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium transition-colors',
                  activeTab === tab.key
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-foreground-muted hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="p-4">
            <CodeBlock
              code={codeSnippets[activeTab]}
              language={activeTab === 'react' ? 'tsx' : 'html'}
            />
          </div>
        </div>
      </section>

      {/* Configuration reference */}
      <section className="mb-lg">
        <h2 className="mb-sm text-lg font-semibold text-foreground-heading">
          Konfigurations-Referenz
        </h2>
        <div className="overflow-hidden rounded-xl border border-grey-200 dark:border-grey-700">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-grey-200 bg-grey-50 dark:border-grey-700 dark:bg-grey-900">
                <th className="px-4 py-3 font-medium text-foreground">Attribut / Prop</th>
                <th className="px-4 py-3 font-medium text-foreground">Standard</th>
                <th className="px-4 py-3 font-medium text-foreground">Beschreibung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-200 dark:divide-grey-700">
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-primary">
                  data-collection / collectionId
                </td>
                <td className="px-4 py-3 text-foreground-muted">gruene-de-system</td>
                <td className="px-4 py-3 text-foreground">Quellensammlung für die Antworten</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-primary">
                  data-position / position
                </td>
                <td className="px-4 py-3 text-foreground-muted">bottom-right</td>
                <td className="px-4 py-3 text-foreground">Position des Widget-Buttons</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-primary">data-title / title</td>
                <td className="px-4 py-3 text-foreground-muted">Grün-O-Mat</td>
                <td className="px-4 py-3 text-foreground">Titel in der Kopfzeile</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-primary">data-color</td>
                <td className="px-4 py-3 text-foreground-muted">#316049</td>
                <td className="px-4 py-3 text-foreground">
                  Farbe des Buttons und Headers (nur embed.js)
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-primary">data-mode</td>
                <td className="px-4 py-3 text-foreground-muted">widget</td>
                <td className="px-4 py-3 text-foreground">
                  <code className="rounded bg-grey-100 px-1 dark:bg-grey-800">widget</code>{' '}
                  (Bubble), <code className="rounded bg-grey-100 px-1 dark:bg-grey-800">modal</code>{' '}
                  (API-gesteuert),{' '}
                  <code className="rounded bg-grey-100 px-1 dark:bg-grey-800">inline</code> (direkt
                  im Container)
                </td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-mono text-xs text-primary">data-container</td>
                <td className="px-4 py-3 text-foreground-muted">—</td>
                <td className="px-4 py-3 text-foreground">CSS-Selektor für inline-Modus</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal mode API reference */}
      <section>
        <h2 className="mb-sm text-lg font-semibold text-foreground-heading">
          JavaScript API (Modal-Modus)
        </h2>
        <p className="mb-3 text-sm text-foreground-muted">
          Im{' '}
          <code className="rounded bg-grey-100 px-1 dark:bg-grey-800">
            data-mode=&quot;modal&quot;
          </code>
          -Modus wird kein Button angezeigt. Stattdessen steuerst du den Dialog über die globale
          API:
        </p>
        <CodeBlock
          code={`<!-- Grün-O-Mat im Modal-Modus -->
<script
  src="https://gruen-o-mat.eu/embed.js"
  data-collection="${collectionId}"
  data-mode="modal"
  data-title="${titleText}"
></script>

<!-- Eigener Button zum Öffnen -->
<button onclick="GruenOMat.open()">Frag den Grün-O-Mat</button>

<script>
  // Verfügbare Methoden:
  GruenOMat.open();    // Dialog öffnen
  GruenOMat.close();   // Dialog schließen
  GruenOMat.toggle();  // Umschalten
</script>`}
        />
      </section>

      {/* Live widget */}
      <GruenOMatModal
        key={`${collectionId}-${position}-${titleText}`}
        collectionId={collectionId}
        collectionName={selectedCollection.name}
        title={titleText}
        position={position}
      />

      {/* Dialog */}
      <GruenOMatDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        collectionId={collectionId}
        collectionName={selectedCollection.name}
        title={titleText}
      />
    </div>
  );
}
