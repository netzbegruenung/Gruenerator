import { useCallback, useState } from 'react';
import { HiSparkles } from 'react-icons/hi';

import { useCanvasEditorServices } from '../../CanvasEditorProvider';
import { applyOperation } from '../../ai/applyOperation';
import { pickQuickPrompts } from '../../ai/quickPrompts';
import { Skeleton } from '@gruenerator/ui';

import { SIDEBAR_HINT, SIDEBAR_SECTION, SIDEBAR_SECTION_HINT } from '../primitives';

import type { CanvasAiOperation, CanvasAiSuggestion } from '@gruenerator/contracts';
import type { ApplyResult, CanvasAiActionsBase } from '../../ai/applyOperation';
import type { TemplateAiCapabilities } from '../../ai/types';

export interface AiSectionProps<
  TState = Record<string, unknown>,
  TActions extends CanvasAiActionsBase = CanvasAiActionsBase,
> {
  /** Canvas template id (e.g. 'simple'). */
  canvasType: string;
  /** Per-template AI capability declaration from FullCanvasConfig.ai. */
  capabilities: TemplateAiCapabilities<TState, TActions>;
  /** Template actions object — used by the applier to dispatch operations. */
  actions: TActions;
  /** Fresh state read; used by appliers that depend on current state. */
  getState: () => TState;
}

export function AiSection<TState, TActions extends CanvasAiActionsBase>({
  canvasType,
  capabilities,
  actions,
  getState,
}: AiSectionProps<TState, TActions>) {
  const services = useCanvasEditorServices();
  const generator = services.useGenerateCanvasSuggestions;

  if (!generator) {
    return (
      <div className={SIDEBAR_SECTION}>
        <div className={SIDEBAR_HINT}>KI-Vorschläge sind in dieser Umgebung nicht verfügbar.</div>
      </div>
    );
  }

  return (
    <AiSectionEnabled
      canvasType={canvasType}
      capabilities={capabilities}
      actions={actions}
      getState={getState}
      useGenerator={generator}
    />
  );
}

interface EnabledProps<TState, TActions extends CanvasAiActionsBase> extends AiSectionProps<
  TState,
  TActions
> {
  useGenerator: NonNullable<
    ReturnType<typeof useCanvasEditorServices>['useGenerateCanvasSuggestions']
  >;
}

function AiSectionEnabled<TState, TActions extends CanvasAiActionsBase>({
  canvasType,
  capabilities,
  actions,
  getState,
  useGenerator,
}: EnabledProps<TState, TActions>) {
  const { suggestions, loading, error, generate, clear } = useGenerator();
  const [prompt, setPrompt] = useState('');
  const [applyResults, setApplyResults] = useState<Record<string, ApplyResult[]>>({});
  // Pick once per AiSection mount so the rotation feels stable while the
  // user is in the section, but refreshes on next session.
  const [quickPrompts] = useState(() => pickQuickPrompts(canvasType, 4));

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = prompt.trim();
      if (!trimmed || loading) return;
      setApplyResults({});
      const snapshot = capabilities.describeForAi(getState());
      await generate(trimmed, {
        canvasType,
        canvasState: snapshot,
        capabilities: {
          supportedOperations: capabilities.supportedOperations,
          colorSchemes: capabilities.colorSchemes ?? null,
          illustrations: capabilities.illustrations ?? null,
          assets: capabilities.assets ?? null,
        },
      });
    },
    [prompt, loading, generate, capabilities, getState, canvasType]
  );

  const handleApply = useCallback(
    (s: CanvasAiSuggestion) => {
      const results = s.operations.map((op) =>
        applyOperation<TState, TActions>(op, actions, getState, capabilities)
      );
      setApplyResults((prev) => ({ ...prev, [s.id]: results }));
    },
    [actions, getState, capabilities]
  );

  return (
    <div className={SIDEBAR_SECTION}>
      <div className="flex items-center gap-xs">
        <HiSparkles className="text-[var(--interactive-accent-color)]" />
        <h3 className="m-0">KI-Assistent</h3>
      </div>

      <p className={SIDEBAR_SECTION_HINT}>
        Beschreibe, was du verbessern möchtest. Du bekommst Vorschläge, die du einzeln übernehmen
        kannst.
      </p>

      {quickPrompts.length > 0 && (
        <div className="flex flex-wrap gap-xs">
          {quickPrompts.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setPrompt(q)}
              disabled={loading}
              className="rounded-full border border-[var(--border-color)] bg-background-alt px-sm py-[2px] text-[length:var(--font-size-xs)] text-[var(--font-color-secondary)] hover:border-[var(--interactive-accent-color)] hover:text-[var(--interactive-accent-color)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-xs">
        <textarea
          className="w-full min-h-[72px] resize-none rounded-md border border-[var(--border-color)] bg-background p-sm text-[length:var(--font-size-small)] text-foreground placeholder:text-[var(--font-color-secondary)] focus:outline-none focus:border-[var(--interactive-accent-color)]"
          placeholder="z.B. „Mach die Headline schlagkräftiger"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
        />
        <div className="flex items-center gap-xs">
          <button
            type="submit"
            disabled={loading || prompt.trim().length === 0}
            className="flex items-center justify-center gap-xs rounded-md bg-[var(--interactive-accent-color)] px-md py-xs text-[length:var(--font-size-small)] font-medium text-background disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Skeleton className="size-4 rounded-full" /> : <HiSparkles />}
            <span>{loading ? 'Generiere…' : 'Vorschläge erzeugen'}</span>
          </button>
          {(suggestions.length > 0 || error) && (
            <button
              type="button"
              onClick={() => {
                clear();
                setApplyResults({});
              }}
              className="text-[length:var(--font-size-xs)] text-[var(--font-color-secondary)] hover:underline"
            >
              Zurücksetzen
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-sm text-[length:var(--font-size-small)] text-red-700">
          {error}
        </div>
      )}

      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-sm m-0 p-0 list-none">
          {suggestions.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              applyResults={applyResults[s.id]}
              onApply={() => handleApply(s)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export interface SuggestionCardProps {
  suggestion: CanvasAiSuggestion;
  applyResults: ApplyResult[] | undefined;
  onApply: () => void;
}

export function SuggestionCard({ suggestion, applyResults, onApply }: SuggestionCardProps) {
  const applied = !!applyResults;
  const failed = applyResults?.some((r) => !r.ok) ?? false;
  const failedOps = applyResults
    ?.map((r, i) => (r.ok ? null : { op: suggestion.operations[i], reason: r.reason }))
    .filter((x): x is { op: CanvasAiOperation; reason: string } => x !== null);

  return (
    <li className="rounded-md border border-[var(--card-border)] bg-[var(--card-background)] p-sm flex flex-col gap-xs">
      <div className="flex items-start justify-between gap-sm">
        <div className="flex flex-col gap-xs flex-1 min-w-0">
          <div className="text-[length:var(--font-size-small)] font-medium text-foreground">
            {suggestion.title}
          </div>
          {suggestion.description && (
            <div className="text-[length:var(--font-size-xs)] text-[var(--font-color-secondary)]">
              {suggestion.description}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={applied && !failed}
          className="shrink-0 rounded-md border border-[var(--interactive-accent-color)] px-sm py-xs text-[length:var(--font-size-xs)] text-[var(--interactive-accent-color)] hover:bg-[var(--interactive-accent-color)] hover:text-background transition-colors disabled:opacity-60"
        >
          {applied ? (failed ? 'Erneut versuchen' : 'Übernommen') : 'Anwenden'}
        </button>
      </div>

      <ul className="m-0 p-0 list-none flex flex-col gap-xs">
        {suggestion.operations.map((op, idx) => (
          <li
            key={idx}
            className="text-[length:var(--font-size-xs)] text-[var(--font-color-muted)] truncate"
          >
            <OperationPreview op={op} />
          </li>
        ))}
      </ul>

      {failedOps && failedOps.length > 0 && (
        <div className="text-[length:var(--font-size-xs)] text-red-600">
          {failedOps.length} Vorgang konnte nicht angewendet werden:{' '}
          {failedOps.map((f) => f.reason).join(', ')}
        </div>
      )}
    </li>
  );
}

export function OperationPreview({ op }: { op: CanvasAiOperation }) {
  switch (op.kind) {
    case 'set-text':
      return (
        <>
          <span className="font-medium">{op.label}:</span>{' '}
          <span className="italic">„{op.value}"</span>
        </>
      );
    case 'set-color-scheme':
      return (
        <>
          <span className="font-medium">Farbschema:</span> {op.schemeId}
        </>
      );
    case 'set-background-color':
      return (
        <span className="inline-flex items-center gap-xs">
          <span className="font-medium">Hintergrund:</span>
          <span
            className="inline-block w-3 h-3 rounded-sm border border-[var(--border-color)]"
            style={{ backgroundColor: op.color }}
          />
          {op.color}
        </span>
      );
    case 'set-color-mode':
      return (
        <>
          <span className="font-medium">Modus:</span> {op.mode}
        </>
      );
    case 'add-illustration':
      return (
        <>
          <span className="font-medium">Illustration hinzufügen:</span> {op.illustrationId}
        </>
      );
    case 'add-asset':
      return (
        <>
          <span className="font-medium">Element hinzufügen:</span> {op.assetId}
        </>
      );
    case 'remove-element':
      return (
        <>
          <span className="font-medium">Element entfernen:</span> {op.elementId}
        </>
      );
    case 'toggle-sunflower':
      return (
        <>
          <span className="font-medium">Sonnenblume:</span>{' '}
          {op.visible ? 'sichtbar' : 'ausgeblendet'}
        </>
      );
    case 'set-font-size':
      return (
        <>
          <span className="font-medium">Schriftgröße {op.label}:</span> {op.size}px
        </>
      );
    case 'update-element': {
      const parts: string[] = [];
      if (op.patch.color != null) parts.push(`Farbe ${op.patch.color}`);
      if (op.patch.opacity != null) parts.push(`Deckkraft ${Math.round(op.patch.opacity * 100)}%`);
      if (op.patch.scale != null) parts.push(`Skalierung ×${op.patch.scale}`);
      if (op.patch.rotation != null) parts.push(`Rotation ${op.patch.rotation}°`);
      if (op.patch.x != null || op.patch.y != null) parts.push('Position');
      return (
        <>
          <span className="font-medium">Element {op.elementId.slice(0, 12)}…:</span>{' '}
          {parts.join(', ') || '—'}
        </>
      );
    }
    default: {
      const _exhaustive: never = op;
      void _exhaustive;
      return null;
    }
  }
}
