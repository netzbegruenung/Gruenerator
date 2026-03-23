'use client';

import { useAuiState } from '@assistant-ui/store';
import { BookOpen, Settings, Zap } from 'lucide-react';
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

import { type CategoryFilterField } from './CategoryFilterDropdown';
import { type SourceFilterCollection } from './SourceFilterDropdown';
import { composerToolbarButtonClass } from '../../lib/utils';
import { MODEL_ICONS } from '../../lib/modelIcons';
import { MODEL_OPTIONS } from '../../stores/chatStore';
import { GrueneratorComposer } from '../thread/GrueneratorComposer';

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
  mode?: 'fast' | 'deep';
  onModeChange?: (mode: 'fast' | 'deep') => void;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
}

function CategoryFilterItems({
  field,
  values,
  activeValues,
  onToggle,
}: {
  field: string;
  values: CategoryFilterField['values'];
  activeValues: string[];
  onToggle: (field: string, value: string) => void;
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
              <span className="truncate">{value}</span>
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
  selectedModel = 'mistral',
  onModelChange,
}: {
  mode?: 'fast' | 'deep';
  onModeChange?: (mode: 'fast' | 'deep') => void;
  sourceFilters?: SourceFilterConfig;
  categoryFilters?: CategoryFilterConfig;
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
}) {
  const currentModel = MODEL_OPTIONS.find((m) => m.id === selectedModel) || MODEL_OPTIONS[0];
  const CurrentModelIcon = MODEL_ICONS[currentModel.icon];
  const isLimitedContext = selectedModel === 'litellm';
  const categoryActiveCount = categoryFilters
    ? Object.values(categoryFilters.activeFilters).reduce((sum, arr) => sum + arr.length, 0)
    : 0;
  const sourceActiveCount = sourceFilters
    ? sourceFilters.collections.length - sourceFilters.selectedIds.length
    : 0;
  const hasActiveBadge = categoryActiveCount > 0 || sourceActiveCount > 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={composerToolbarButtonClass}>
          <Settings className="h-4 w-4" />
          {hasActiveBadge && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
              {categoryActiveCount + sourceActiveCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="w-52">
        {mode && onModeChange && (
          <>
            <DropdownMenuLabel className="text-xs text-foreground-muted">Modus</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(v) => onModeChange(v as 'fast' | 'deep')}
            >
              <DropdownMenuRadioItem value="fast">
                <Zap className="h-3.5 w-3.5" />
                Schnell
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="deep" disabled={isLimitedContext}>
                <BookOpen className="h-3.5 w-3.5" />
                Tiefenrecherche
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}

        {onModelChange && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CurrentModelIcon className="h-3.5 w-3.5" />
                Modell
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={selectedModel}
                  onValueChange={(v) => onModelChange(v)}
                >
                  {MODEL_OPTIONS.map((m) => {
                    const Icon = MODEL_ICONS[m.icon];
                    return (
                      <DropdownMenuRadioItem key={m.id} value={m.id}>
                        <Icon className="h-3.5 w-3.5" />
                        {m.name}
                      </DropdownMenuRadioItem>
                    );
                  })}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
  selectedModel,
  onModelChange,
}: NotebookComposerProps) {
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <GrueneratorComposer
      isRunning={isRunning}
      placeholder={placeholder}
      disclaimer="Antworten können ungenau sein. Wichtige Infos bitte prüfen."
      showMentions={false}
      showPlusMenu={false}
      showToolToggles={false}
      toolbarExtra={
        <NotebookSettingsDropdown
          mode={mode}
          onModeChange={onModeChange}
          sourceFilters={sourceFilters}
          categoryFilters={categoryFilters}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
      }
    />
  );
}
