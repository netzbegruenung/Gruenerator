/**
 * The retrieve-then-synthesize method, published to MCP clients.
 *
 * No tool on this server writes a finished dossier for the party corpus — the
 * calling model does that itself, because it is the one holding the
 * conversation. What it was missing was our method: which tools in which order,
 * and the citation protocol the app's own notebook answers obey.
 *
 * Everything protocol-shaped is DERIVED from `agents/langgraph/prompts.ts` via
 * the `mcp` surface rather than restated here. A restated copy would drift, and
 * the notebook prompt already lives in enough places.
 */
import {
  buildDraftPromptGeneral,
  buildDraftPromptGrundsatz,
} from '../../agents/langgraph/prompts.js';
import { getMcpExposedCollections } from '../../config/systemCollectionsConfig.js';

/** MCP prompts carry only user/assistant turns — there is no system role. */
export interface PromptMessage {
  role: 'user' | 'assistant';
  content: { type: 'text'; text: string };
}

const CORPUS_WORKFLOW = [
  '## ABLAUF',
  '',
  '1. **Land klären.** DE oder AT — nicht raten. Steht es nicht fest, frage nach.',
  '2. **Mehrfach suchen, nicht einmal.** Rufe `gruenerator_search` mit 2–4 Varianten des Themas auf: der wichtigste Begriff allein, dann eine Zusammensetzung, dann ein Synonym. Zusammengesetzte Sätze als Suchanfrage liefern schlechtere Treffer als einzelne Begriffe.',
  '3. **Vor gefilterter Suche `gruenerator_get_filters` aufrufen.** Filterwerte nie raten — sie unterscheiden sich pro Sammlung.',
  '4. **Sammlungen bewusst wählen.** Ohne `collection` wird nur die Standardsammlung durchsucht. Landesverbände, KommunalWiki und Böll-Stiftung musst du explizit anfragen.',
  '5. **Erst danach schreiben.** Die Synthese ist deine Aufgabe; es gibt kein Tool, das sie dir abnimmt.',
].join('\n');

const NOTEBOOK_WORKFLOW = [
  '## ABLAUF',
  '',
  '1. **`notebooks` mit `action="list"`** — die IDs stammen immer von dort, nie aus einer Vermutung.',
  '2. **`notebooks` mit `action="search"`, `id` und `query`.** Diese Aktion liefert bereits eine belegte Antwort samt Quellenliste: Die Suche über den eigenen Quellenbestand läuft serverseitig mit Rerank und Zitatprüfung.',
  '3. **Mehrere Fragen stellen, wenn das Thema mehrere Aspekte hat** — je Aufruf eine Frage, dann selbst zusammenführen.',
  '4. **Marker und Quellen weitergeben.** Die `[n]` aus dem Tool-Ergebnis behalten ihre Nummer; hänge die zugehörige Quellenliste an deine Antwort.',
].join('\n');

/**
 * The corpus protocol. `Grundsatz` (political) is the right base for the party
 * corpus; the notebook variant uses the general one because a user's own
 * collection is not necessarily political.
 */
function corpusProtocol(): string {
  return buildDraftPromptGrundsatz('Grüne Programme und Beschlüsse', 'mcp').system;
}

function notebookProtocol(notebookName: string): string {
  return buildDraftPromptGeneral(notebookName, 'mcp').system;
}

export function buildCorpusMethodText(): string {
  return `${corpusProtocol()}\n\n${CORPUS_WORKFLOW}`;
}

export function buildNotebookMethodText(notebookName: string): string {
  return `${notebookProtocol(notebookName)}\n\n${NOTEBOOK_WORKFLOW}`;
}

/** Wrap a protocol plus the concrete question as an MCP prompt exchange. */
function asPromptMessages(protocol: string, question: string): PromptMessage[] {
  return [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `${protocol}\n\n---\n*Arbeite ab jetzt nach diesem Protokoll.*`,
      },
    },
    {
      role: 'assistant',
      content: {
        type: 'text',
        text: 'Verstanden. Ich recherchiere zuerst über die Tools und schreibe die Antwort anschließend belegt aus den Treffern.',
      },
    },
    { role: 'user', content: { type: 'text', text: question } },
  ];
}

export function buildRecherchePrompt(frage: string, land: 'DE' | 'AT'): PromptMessage[] {
  const landHint =
    land === 'AT'
      ? 'Land: Österreich (AT). Nutze die österreichischen Sammlungen (`oesterreich`, `gruene-at`).'
      : 'Land: Deutschland (DE). Nutze die deutschen Sammlungen (`deutschland`, `bundestagsfraktion`, `gruene-de`).';
  return asPromptMessages(`${buildCorpusMethodText()}\n\n${landHint}`, frage);
}

export function buildNotizbuchPrompt(frage: string, notizbuch?: string): PromptMessage[] {
  const name = notizbuch?.trim() || 'das gewählte Notizbuch';
  const hint = notizbuch?.trim()
    ? `Gefragt ist das Notizbuch „${notizbuch.trim()}". Finde seine ID über \`notebooks\` mit \`action="list"\`.`
    : 'Frage die Person, welches Notizbuch gemeint ist, falls `notebooks` mit `action="list"` mehrere zurückgibt.';
  return asPromptMessages(`${buildNotebookMethodText(name)}\n\n${hint}`, frage);
}

/**
 * The collection catalog as a readable resource. Derived from the canonical
 * config, so a new collection shows up here without a second edit.
 */
export function buildCollectionCatalog(): string {
  const collections = getMcpExposedCollections();
  const rows = collections.map((c) => {
    const filters = (c.filterableFields ?? []).map((f) => f.field);
    const filterCell = filters.length > 0 ? filters.join(', ') : '—';
    return `| \`${c.key}\` | ${c.country ?? '—'} | ${c.name} | ${c.description} | ${filterCell} |`;
  });
  return [
    '# Sammlungen des Grünerator-MCP',
    '',
    `${collections.length} Sammlungen sind über \`gruenerator_search\` erreichbar.`,
    'Ohne `collection`-Parameter wird nur die Standardsammlung durchsucht — Landesverbände,',
    'KommunalWiki und Böll-Stiftung musst du explizit anfragen.',
    '',
    '| Schlüssel | Land | Name | Inhalt | Filterfelder |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
    'Filterwerte niemals raten — `gruenerator_get_filters` nennt die tatsächlich belegten Werte',
    'samt Trefferzahl. Landesverbände teilen sich intern eine Qdrant-Sammlung und bekommen',
    'ihren Filter automatisch; du musst ihn nicht setzen.',
  ].join('\n');
}

/** The full method document, for clients that read resources rather than prompts. */
export function buildMethodDocument(): string {
  return [
    '# Methode: mehrere Quellen abrufen, dann belegt zusammenfassen',
    '',
    'Dieser Server liefert Belege, keine fertigen Texte — mit einer Ausnahme:',
    '`notebooks` mit `action="search"` synthetisiert serverseitig, weil dort Rerank',
    'und Zitatprüfung über den eigenen Quellenbestand laufen. Für alles andere ist die',
    'Synthese deine Aufgabe, und zwar nach dem folgenden Protokoll.',
    '',
    '---',
    '',
    '## A) Programme und Beschlüsse der Grünen',
    '',
    buildCorpusMethodText(),
    '',
    '---',
    '',
    '## B) Eigener Quellenbestand (Notizbücher)',
    '',
    buildNotebookMethodText('das gewählte Notizbuch'),
    '',
    '---',
    '',
    'Die Sammlungsliste steht unter `gruenerator://sammlungen`.',
  ].join('\n');
}
