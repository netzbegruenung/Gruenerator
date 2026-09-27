'use client';

import { useAuiState } from '@assistant-ui/store';
import { type NotebookDepth } from '@gruenerator/contracts';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from '@gruenerator/ui';
import { BookOpen, Telescope, Zap } from 'lucide-react';
import { LuSettings2 } from 'react-icons/lu';

import {
  NOTEBOOK_ANSWER_MODES,
  NOTEBOOK_COMPOSER_MODES,
  notebookComposerModeDef,
  type NotebookComposerMode,
  type NotebookComposerModeDef,
} from '../../lib/notebookAnswerMode';
import {
  NOTEBOOK_DEPTHS,
  notebookDepthDef,
  type NotebookDepthIconKey,
} from '../../lib/notebookDepth';
import { composerToolbarButtonClass } from '../../lib/utils';
import { type ComposerOption, ComposerOptionPicker } from '../thread/ComposerOptionPicker';
import { GrueneratorComposer } from '../thread/GrueneratorComposer';

import { type CategoryFilterField } from './CategoryFilterDropdown';
import { type SourceFilterCollection } from './SourceFilterDropdown';

/** Semantic icon key → lucide component. The registry stays renderer-agnostic. */
const DEPTH_ICONS: Record<NotebookDepthIconKey, typeof Zap> = {
  fast: Zap,
  deep: BookOpen,
  ultra: Telescope,
};

const toOption = (m: NotebookComposerModeDef): ComposerOption<NotebookComposerMode> => ({
  id: m.mode,
  name: m.label,
  description: m.description,
  ...(m.recommended ? { recommendedLabel: 'Empfohlen' } : {}),
});
const ANSWER_MODE_OPTIONS = NOTEBOOK_ANSWER_MODES.map(toOption);
const COMPOSER_MODE_OPTIONS = NOTEBOOK_COMPOSER_MODES.map(toOption);

export interface SourceFilterConfig {
  collections: SourceFilterCollection[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll?: () => void;
  onSelectNone?: () => void;
}

export interface CategoryFilterConfig {
  fields: CategoryFilterField[];
  activeFilters: Record<string, string[]>;
  onToggle: (field: string, value: string) => void;
  onClearAll?: () => void;
}

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
}

function CategoryFilterItems({
  field,
  values,
  activeValues,
  onToggle,
  valueLabels,
}: {
  field: string;
  values: CategoryFilterField['values'];
  activeValues: string[];
  onToggle: (field: string, value: string) => void;
  valueLabels?: Record<string, string>;
}) {
  return (
    <>
      {values.map(({ value, count }) => {
        const isChecked = activeValues.length === 0 || activeValues.includes(value);
        return (
          <DropdownMenuCheckboxItem
            key={value}
            checked={isChecked}
            onCheckedChange={() => onToggle(field, value)}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="truncate">{valueLabels?.[value] ?? value}</span>
              {count != null && (
                <span className="shrink-0 text-[10px] text-foreground-muted">{count}</span>
              )}
            </div>
          </DropdownMenuCheckboxItem>
        );
      })}
    </>
  );
}

function NotebookSettingsDropdown({
  mode,
  onModeChange,
  sourceFilters,
  categoryFilters,
}: {
  mode?: NotebookDepth;
  onModeChange?: (mode: NotebookDepth) => void;
  sourceFilters?: SourceFilterConfig;
  categoryFilters?: CategoryFilterConfig;
}) {
  const categoryActiveCount = categoryFilters
    ? Object.values(categoryFilters.activeFilters).reduce((sum, arr) => sum + arr.length, 0)
    : 0;
  const sourceActiveCount = sourceFilters
    ? sourceFilters.collections.length - sourceFilters.selectedIds.length
    : 0;
  const hasActiveBadge = categoryActiveCount > 0 || sourceActiveCount > 0;
  const activeDepth = notebookDepthDef(mode);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={composerToolbarButtonClass()}
          aria-label={mode ? `Einstellungen — Suchtiefe: ${activeDepth.label}` : 'Einstellungen'}
          title={mode ? `Einstellungen · Suchtiefe: ${activeDepth.label}` : 'Einstellungen'}
        >
          {/* Always the settings glyph: the tier's own icon (a book for „Mittel“)
              did not read as „this opens the options“. The tier stays in the
              label and tooltip. */}
          <LuSettings2 className="h-4 w-4" />
          {hasActiveBadge && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {categoryActiveCount + sourceActiveCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-64">
        {mode && onModeChange && (
          <>
            <DropdownMenuLabel className="text-xs text-foreground-muted">
              Suchtiefe
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(v) => onModeChange(v as NotebookDepth)}
            >
              {NOTEBOOK_DEPTHS.map((depth) => {
                const Icon = DEPTH_ICONS[depth.icon];
                return (
                  <DropdownMenuRadioItem key={depth.depth} value={depth.depth}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex flex-col">
                      <span>{depth.label}</span>
                      <span className="text-[11px] leading-tight text-foreground-muted">
                        {depth.description}
                      </span>
                    </span>
                  </DropdownMenuRadioItem>
                );
              })}
            </DropdownMenuRadioGroup>
          </>
        )}

        {sourceFilters && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Quellen
                {sourceActiveCount > 0 && (
                  <span className="ml-auto text-[10px] text-primary">
                    {sourceFilters.selectedIds.length}/{sourceFilters.collections.length}
                  </span>
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-72 max-h-[20rem] overflow-y-auto">
                {sourceFilters.collections.map((collection) => (
                  <DropdownMenuCheckboxItem
                    key={collection.id}
                    checked={sourceFilters.selectedIds.includes(collection.id)}
                    onCheckedChange={() => sourceFilters.onToggle(collection.id)}
                  >
                    <div className="flex flex-col">
                      <span>{collection.name}</span>
                      {(collection.documentCount || collection.description) && (
                        <span className="text-xs text-foreground-muted">
                          {collection.documentCount
                            ? `${collection.documentCount} Dokumente`
                            : collection.description}
                        </span>
                      )}
                    </div>
                  </DropdownMenuCheckboxItem>
                ))}
                {(sourceFilters.onSelectAll || sourceFilters.onSelectNone) && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="flex items-center justify-end gap-2 px-2 py-1.5">
                      {sourceFilters.onSelectAll && (
                        <button
                          type="button"
                          onClick={sourceFilters.onSelectAll}
                          className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          Alle
                        </button>
                      )}
                      {sourceFilters.onSelectNone && (
                        <button
                          type="button"
                          onClick={sourceFilters.onSelectNone}
                          className="text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
                        >
                          Keine
                        </button>
                      )}
                    </div>
                  </>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}

        {categoryFilters && categoryFilters.fields.length > 0 && (
          <>
            {(mode || sourceFilters) && <DropdownMenuSeparator />}
            {categoryFilters.fields.length === 1 ? (
              <>
                <DropdownMenuLabel className="text-xs text-foreground-muted">
                  {categoryFilters.fields[0].label}
                </DropdownMenuLabel>
                <CategoryFilterItems
                  field={categoryFilters.fields[0].field}
                  values={categoryFilters.fields[0].values}
                  activeValues={
                    categoryFilters.activeFilters[categoryFilters.fields[0].field] || []
                  }
                  onToggle={categoryFilters.onToggle}
                  valueLabels={categoryFilters.fields[0].valueLabels}
                />
              </>
            ) : (
              categoryFilters.fields.map((fieldConfig) => (
                <DropdownMenuSub key={fieldConfig.field}>
                  <DropdownMenuSubTrigger>
                    {fieldConfig.label}
                    {categoryFilters.activeFilters[fieldConfig.field]?.length > 0 && (
                      <span className="ml-auto text-[10px] text-primary">
                        {categoryFilters.activeFilters[fieldConfig.field].length}
                      </span>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="max-h-[20rem] overflow-y-auto">
                    <CategoryFilterItems
                      field={fieldConfig.field}
                      values={fieldConfig.values}
                      activeValues={categoryFilters.activeFilters[fieldConfig.field] || []}
                      onToggle={categoryFilters.onToggle}
                      valueLabels={fieldConfig.valueLabels}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))
            )}

            {categoryFilters.onClearAll && categoryActiveCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-end px-2 py-1.5">
                  <button
                    type="button"
                    onClick={categoryFilters.onClearAll}
                    className="text-xs font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Filter zurücksetzen
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
}: NotebookComposerProps) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  // Without a manual handler `manuell` is not on offer, and a stored one falls
  // back to the default — the picker then shows what will actually be sent.
  const activeAnswerMode = answerMode
    ? notebookComposerModeDef(answerMode === 'manuell' && !onManualSubmit ? null : answerMode)
    : null;
  const isManual = activeAnswerMode?.mode === 'manuell';

  return (
    <GrueneratorComposer
      isRunning={isRunning}
      variant="pill"
      placeholder={placeholder}
      disclaimer={
        isManual
          ? 'Treffer kommen direkt aus den Quellen, ohne KI.'
          : 'KI-generierte Antworten können ungenau sein — bitte vor der Veröffentlichung prüfen.'
      }
      showMentions={false}
      showPlusMenu={false}
      showToolToggles={false}
      // Zwei Regler mit denselben Namen (Klein/Mittel/Ultra) standen
      // nebeneinander und meinten Verschiedenes. Im Notebook löst 'Automatisch'
      // ohnehin immer auf Ultra auf — die Suchtiefe ist hier die Qualitätswahl.
      showModelPicker={false}
      {...(isManual && onManualSubmit ? { onSearchSubmit: onManualSubmit } : {})}
      slots={{
        leading: (
          <NotebookSettingsDropdown
            mode={mode}
            onModeChange={onModeChange}
            sourceFilters={sourceFilters}
            categoryFilters={categoryFilters}
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
                  ariaLabel={`Antwortmodus wählen – ${activeAnswerMode.label}`}
                />
              ),
            }
          : {}),
      }}
    />
  );
}
