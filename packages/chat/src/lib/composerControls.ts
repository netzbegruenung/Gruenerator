import { getSystemAgent } from '@gruenerator/shared/agents';

import { type SearchMode, type ThreadMode, type ToolKey } from '../stores/chatStore';

/**
 * Semantic icon keys for composer controls. The shared layer stays renderer-agnostic
 * (no lucide / Ionicons imports here); each platform maps these keys to its own icon
 * set — web → lucide, mobile → Ionicons.
 */
export type ComposerIconKey = 'chat' | 'notebook' | 'custom';

export interface ComposerModeDef {
  mode: ThreadMode;
  /** User-facing label (German, du-form). Shared so web and mobile never relabel independently. */
  label: string;
  icon: ComposerIconKey;
}

/**
 * Single source of truth for the chat composer's selectable modes — label + semantic
 * icon per mode. Web and mobile each render their own (platform-specific) control UI
 * *from this list* and may choose which subset to surface, but the mode set, labels,
 * and icon semantics live here so the composer tool UI can't silently drift between
 * platforms. (Model options already follow this pattern via `MODEL_OPTIONS`.)
 *
 * Change a mode here → both platforms follow.
 */
export const COMPOSER_MODES: ComposerModeDef[] = [
  { mode: 'chat', label: 'Chat', icon: 'chat' },
  // NOTIZBUCHMODUS — vorerst nicht weiterverfolgt (08/2026).
  //
  // Als WÄHLBARER Modus stillgelegt: er stand im Plusmenü gleichrangig neben
  // Chat und Rolle, obwohl er etwas anderes tut als beide — er schickt den Turn
  // an einen anderen Endpunkt (`/notebook/stream`, siehe
  // `buildRequestBody`/`GrueneratorModelAdapter`). Ein Notizbuch als QUELLE
  // erreicht man weiterhin per `@mention`; die läuft über `notebookIds` durch
  // den normalen Chat-Endpunkt und ist von dieser Zeile nicht betroffen.
  //
  // `ThreadMode` behält `'notebook'` und der Transportweg bleibt vollständig
  // intakt: `apps/mobile/app/(focused)/chat-conversation.tsx` setzt den Modus
  // beim Einstieg aus einem Notizbuch selbst — Mobile hat, anders als Web
  // (`NotebookModelAdapter`), keine eigene Notizbuch-Oberfläche. Diese Zeile
  // wieder einkommentieren stellt die Auswahl her, mehr braucht es nicht.
  // { mode: 'notebook', label: 'Notebook', icon: 'notebook' },
  { mode: 'eigener', label: 'Eigener Chat', icon: 'custom' },
];

export type ComposerToolIconKey = 'document' | 'globe' | 'research';

/**
 * A row in the plus menu's bottom group. Two kinds, deliberately side by side:
 *
 * - `toggle` flips an `enabledTools` key and STAYS set across turns. It renders
 *   with a check, because that check is the only thing telling a user the state
 *   outlives this message.
 * - `once` inserts an @mention and applies to THIS message only. No check.
 *
 * Both kinds sat in the old menu as identical click-items, which is how a
 * one-shot `@recherche` and a sticky search setting became indistinguishable.
 * Keep the union — do not destructure `kind` at the call site, or the branches
 * stop narrowing.
 */
export type ComposerToolDef =
  | {
      kind: 'toggle';
      key: ToolKey;
      /** User-facing label (German, du-form). */
      label: string;
      /** Grey secondary text; says what the row does, not that it exists. */
      description: string;
      icon: ComposerToolIconKey;
    }
  | {
      kind: 'once';
      /** `mention` slug resolved via `resolveMentionable` at render time. */
      mention: string;
      label: string;
      description: string;
      icon: ComposerToolIconKey;
    };

/**
 * Single source of truth for the composer's switch group, following the
 * COMPOSER_MODES pattern: the set, labels, and icon semantics live here so the
 * list can't drift between platforms.
 *
 * `research` also gates the internal `web` key (see chatStore `toggleTool`) —
 * one user-facing switch, two backend gates. The `examples` and
 * `pressemitteilung_examples` keys keep their defaults and their @mentions but
 * are no longer switches: they are corpus lookups the classifier picks, not
 * something a user reaches for per message.
 */
export const COMPOSER_TOOLS: ComposerToolDef[] = [
  {
    kind: 'toggle',
    key: 'research',
    label: 'Websuche',
    description: 'Aktuelles aus dem Web',
    icon: 'globe',
  },
  {
    kind: 'once',
    mention: 'deepresearch',
    label: 'Tiefenrecherche',
    description: 'Mehrere Suchläufe, langes Dossier',
    icon: 'research',
  },
  {
    kind: 'toggle',
    key: 'search',
    label: 'Dokumentensuche',
    description: 'Deine Dateien & Notizbücher',
    icon: 'document',
  },
];

export type SearchDepthIconKey = 'fast' | 'deep';

export interface SearchDepthDef {
  mode: SearchMode;
  label: string;
  description: string;
  icon: SearchDepthIconKey;
}

/**
 * Whether the Recherchetiefe control applies at all.
 *
 * It does not belong to the composer in general: `buildRequestBody` puts
 * `searchMode` on the wire ONLY on the search route, so anywhere else the
 * control is decoration that silently does nothing. The rule therefore is the
 * agent's `routeTo`, and it lives here rather than in either platform's
 * component so web and mobile cannot answer it differently — mobile showed the
 * section unconditionally for exactly as long as the rule was web-local.
 *
 * Notebook depth is a *different* control on a different endpoint; it belongs to
 * the notebook page, not to this one (see `NOTEBOOK_DEPTHS` below).
 */
export function showsSearchDepth(agentId: string | null | undefined): boolean {
  return (agentId ? getSystemAgent(agentId)?.routeTo : null) === 'search';
}

/** Search depth (Recherchetiefe) options — shared copy for web + mobile. */
export const SEARCH_DEPTHS: SearchDepthDef[] = [
  {
    mode: 'web',
    label: 'Schnell',
    description: 'Web + Dokumente, sofortige Antwort',
    icon: 'fast',
  },
  {
    mode: 'deep',
    label: 'Tiefe Recherche',
    description: 'Mehrere Suchläufe, längeres Dossier',
    icon: 'deep',
  },
];

// Notebook retrieval depth (Klein/Mittel/Ultra) follows the same
// one-registry-for-both-platforms rule, but lives in `./notebookDepth` — it is a
// notebook-page control, and its default is read by `chatStore`, which this
// module already reads back.
