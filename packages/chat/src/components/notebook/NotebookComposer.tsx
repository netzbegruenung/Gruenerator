'use client';

import { useAuiState } from '@assistant-ui/store';
import { type NotebookDepth } from '@gruenerator/contracts';

import {
  NOTEBOOK_ANSWER_MODES,
  NOTEBOOK_COMPOSER_MODES,
  notebookComposerModeDef,
  type MagicIntent,
  type NotebookComposerMode,
  type NotebookComposerModeDef,
} from '../../lib/notebookAnswerMode';
import { type ComposerOption, ComposerOptionPicker } from '../thread/ComposerOptionPicker';
import { GrueneratorComposer } from '../thread/GrueneratorComposer';

import {
  NotebookSettingsPopover,
  type CategoryFilterConfig,
  type SourceFilterConfig,
} from './NotebookSettingsPopover';

const toOption = (m: NotebookComposerModeDef): ComposerOption<NotebookComposerMode> => ({
  id: m.mode,
  name: m.label,
  ...(m.shortLabel ? { shortName: m.shortLabel } : {}),
  description: m.description,
  ...(m.recommended ? { recommendedLabel: 'Empfohlen' } : {}),
});
const ANSWER_MODE_OPTIONS = NOTEBOOK_ANSWER_MODES.map(toOption);
const COMPOSER_MODE_OPTIONS = NOTEBOOK_COMPOSER_MODES.map(toOption);
const MAGIC_INTENT_LABELS: Record<MagicIntent, string> = { suche: 'Suche', chat: 'Chat' };

export { type CategoryFilterConfig, type SourceFilterConfig } from './NotebookSettingsPopover';

interface NotebookComposerProps {
  placeholder?: string;
  sourceFilters?: SourceFilterConfig;
  categoryFilters?: CategoryFilterConfig;
  mode?: NotebookDepth;
  onModeChange?: (mode: NotebookDepth) => void;
  /** Answer mode picker beside the send button — only where the surface offers it. */
  answerMode?: NotebookComposerMode;
  onAnswerModeChange?: (mode: NotebookComposerMode) => void;
  /** Offers „Manuell“ in the picker; while it is selected the composer searches
   *  instead of asking the model and hands the text here. */
  onManualSubmit?: (text: string) => void;
  /** What Magic Search („auto“) recognised in the typed text — only on the
   *  start page. „suche“ searches like „Manuell“, „chat“ sends. */
  magicIntent?: MagicIntent | null;
  /** Hands a chat question elsewhere instead of into this thread (the start
   *  page opens it in a new tab). Searches are not affected. */
  onChatSubmit?: (text: string) => void;
  /** Classes for the settings panel, which is portalled out of the surface's
   *  accent scope. */
  settingsClassName?: string;
}

export function NotebookComposer({
  placeholder = 'Stellen Sie eine Frage...',
  sourceFilters,
  categoryFilters,
  mode,
  onModeChange,
  answerMode,
  onAnswerModeChange,
  onManualSubmit,
  magicIntent,
  onChatSubmit,
  settingsClassName,
}: NotebookComposerProps) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  // Without a manual handler `manuell` is not on offer, and a stored one falls
  // back to the default — the picker then shows what will actually be sent.
  const activeAnswerMode = answerMode
    ? notebookComposerModeDef(answerMode === 'manuell' && !onManualSubmit ? null : answerMode)
    : null;
  const isManual = activeAnswerMode?.mode === 'manuell';
  // Magic Search can only search where the surface can.
  const activeMagicIntent =
    activeAnswerMode?.mode === 'auto' && onManualSubmit ? (magicIntent ?? null) : null;
  const searches = isManual || activeMagicIntent === 'suche';
  const magicSuffix = activeMagicIntent ? MAGIC_INTENT_LABELS[activeMagicIntent] : null;

  return (
    <GrueneratorComposer
      isRunning={isRunning}
      variant="pill"
      placeholder={placeholder}
      disclaimer={
        searches
          ? 'Treffer kommen direkt aus den Quellen, ohne KI.'
          : 'KI-generierte Antworten können ungenau sein — bitte vor der Veröffentlichung prüfen.'
      }
      {...(searches ? { disclaimerCompact: 'Treffer direkt aus den Quellen, ohne KI.' } : {})}
      showMentions={false}
      showPlusMenu={false}
      showToolToggles={false}
      // Zwei Regler mit denselben Namen (Klein/Mittel/Ultra) standen
      // nebeneinander und meinten Verschiedenes. Im Notebook löst 'Automatisch'
      // ohnehin immer auf Ultra auf — die Suchtiefe ist hier die Qualitätswahl.
      showModelPicker={false}
      {...(searches && onManualSubmit ? { onSearchSubmit: onManualSubmit } : {})}
      {...(!searches && onChatSubmit ? { onChatSubmit } : {})}
      slots={{
        leading: (
          <NotebookSettingsPopover
            mode={mode}
            onModeChange={onModeChange}
            sourceFilters={sourceFilters}
            categoryFilters={categoryFilters}
            {...(settingsClassName ? { className: settingsClassName } : {})}
          />
        ),
        ...(activeAnswerMode && onAnswerModeChange
          ? {
              sendAdornment: (
                <ComposerOptionPicker
                  options={onManualSubmit ? COMPOSER_MODE_OPTIONS : ANSWER_MODE_OPTIONS}
                  value={activeAnswerMode.mode}
                  onChange={onAnswerModeChange}
                  sheetTitle="Antwortmodus wählen"
                  sectionTitle="Antwortmodus"
                  // The short name only — what Magic Search recognised shows
                  // on the send button, the label would squeeze the input.
                  triggerLabel={activeAnswerMode.shortLabel ?? activeAnswerMode.label}
                  ariaLabel={`Antwortmodus wählen – ${activeAnswerMode.label}${magicSuffix ? ` · ${magicSuffix}` : ''}`}
                />
              ),
            }
          : {}),
      }}
    />
  );
}
