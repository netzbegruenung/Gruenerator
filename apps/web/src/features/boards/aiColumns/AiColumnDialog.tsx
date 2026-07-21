/**
 * Lightweight 3-stage config for a Grünerator-Spalte: Quelle → KI-Schritt → Ergebnis.
 * No node editor — radios + a few checkboxes. Used both to create a new AI column
 * and to edit an existing one (pre-filled via `initial`).
 *
 * The form state is initialised from `initial` via lazy useState initialisers in a
 * child that only mounts while the dialog is open (Radix unmounts DialogContent on
 * close), so there's no prefill effect.
 */
import {
  type BoardAiPreset,
  type BoardAiTask,
  type BoardFlowOutput,
  type BoardFlowSource,
  type BoardFlowSourcePlatform,
  type BoardFlowSourceType,
  type BoardFlowTask,
} from '@gruenerator/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@gruenerator/ui';
import { type ReactNode, useState } from 'react';

import { OUTPUT_UI, PRESET_UI, SOURCE_UI } from './catalog';

import type { Field } from '../types';

const SOURCE_TYPES: BoardFlowSourceType[] = ['card', 'scrape_url', 'apify_social'];

interface AiColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = create a new AI column; otherwise pre-fill for editing. */
  initial: BoardAiTask | null;
  fields: Field[];
  onConfirm: (aiTask: BoardAiTask) => void;
}

function OptionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm cursor-pointer transition-colors ${
        active
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 text-foreground'
          : 'border-grey-200 dark:border-grey-700 bg-transparent text-grey-500 dark:text-grey-300 hover:border-primary-300'
      }`}
    >
      {children}
    </button>
  );
}

export function AiColumnDialog({
  open,
  onOpenChange,
  initial,
  fields,
  onConfirm,
}: AiColumnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <AiColumnForm
            initial={initial}
            fields={fields}
            onConfirm={(aiTask) => {
              onConfirm(aiTask);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AiColumnForm({
  initial,
  fields,
  onConfirm,
  onCancel,
}: {
  initial: BoardAiTask | null;
  fields: Field[];
  onConfirm: (aiTask: BoardAiTask) => void;
  onCancel: () => void;
}) {
  const initialSource = initial?.source;
  const initialTask = initial?.task;

  const [sourceType, setSourceType] = useState<BoardFlowSourceType>(initialSource?.type ?? 'card');
  const [platform, setPlatform] = useState<BoardFlowSourcePlatform>(
    initialSource?.type === 'apify_social' ? initialSource.platform : 'instagram'
  );
  const [handleField, setHandleField] = useState(
    initialSource?.type === 'apify_social' ? (initialSource.handleField ?? '') : ''
  );
  const [taskType, setTaskType] = useState<'preset' | 'custom'>(initialTask?.type ?? 'preset');
  const [preset, setPreset] = useState<BoardAiPreset>(
    initialTask?.type === 'preset' ? initialTask.preset : 'web_research'
  );
  const [customPrompt, setCustomPrompt] = useState(
    initialTask?.type === 'custom' ? initialTask.prompt : ''
  );
  const [wantDoc, setWantDoc] = useState(
    initial?.outputs.some((o) => o.type === 'document') ?? false
  );
  const [wantSheet, setWantSheet] = useState(
    initial?.outputs.some((o) => o.type === 'sheet') ?? false
  );
  const [wantPresentation, setWantPresentation] = useState(
    initial?.outputs.some((o) => o.type === 'presentation') ?? false
  );
  const [wantEmail, setWantEmail] = useState(
    initial?.outputs.some((o) => o.type === 'email') ?? false
  );

  const handleFieldOptions = fields.filter((f) => f.type === 'text' || f.type === 'url');
  const canConfirm = taskType === 'preset' || customPrompt.trim().length > 0;

  const handleConfirm = () => {
    const source: BoardFlowSource =
      sourceType === 'apify_social'
        ? { type: 'apify_social', platform, ...(handleField && { handleField }) }
        : { type: sourceType };
    const task: BoardFlowTask =
      taskType === 'custom'
        ? { type: 'custom', prompt: customPrompt.trim() }
        : { type: 'preset', preset };
    const outputs: BoardFlowOutput[] = [
      { type: 'comment' },
      ...(wantDoc ? [{ type: 'document' as const }] : []),
      ...(wantSheet ? [{ type: 'sheet' as const }] : []),
      ...(wantPresentation ? [{ type: 'presentation' as const }] : []),
      ...(wantEmail ? [{ type: 'email' as const }] : []),
    ];
    onConfirm({ source, task, outputs });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {initial ? 'Grünerator-Aufgabe bearbeiten' : 'Neue Grünerator-Spalte'}
        </DialogTitle>
        <DialogDescription>
          Karten in dieser Spalte bekommen einen Button zum Starten des Grünerator-Agenten.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-2">
        {/* Stage 1 — source */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-grey-400 mb-1.5">
            1 · Quelle
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SOURCE_TYPES.map((t) => {
              const Icon = SOURCE_UI[t].icon;
              return (
                <OptionButton key={t} active={sourceType === t} onClick={() => setSourceType(t)}>
                  <Icon size={13} />
                  {SOURCE_UI[t].label}
                </OptionButton>
              );
            })}
          </div>
          <p className="text-xs text-grey-400 mt-1">{SOURCE_UI[sourceType].help}</p>
          {sourceType === 'apify_social' && (
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex gap-1.5">
                <OptionButton
                  active={platform === 'instagram'}
                  onClick={() => setPlatform('instagram')}
                >
                  Instagram
                </OptionButton>
                <OptionButton
                  active={platform === 'facebook'}
                  onClick={() => setPlatform('facebook')}
                >
                  Facebook
                </OptionButton>
              </div>
              <label className="text-xs text-grey-500 dark:text-grey-300">
                Account-Handle aus Feld
                <select
                  value={handleField}
                  onChange={(e) => setHandleField(e.target.value)}
                  className="mt-1 w-full rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary-500"
                >
                  <option value="">Kartentitel</option>
                  {handleFieldOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </section>

        {/* Stage 2 — AI step */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-grey-400 mb-1.5">
            2 · KI-Schritt
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_UI.map((p) => {
              const Icon = p.icon;
              return (
                <OptionButton
                  key={p.type}
                  active={taskType === 'preset' && preset === p.type}
                  onClick={() => {
                    setTaskType('preset');
                    setPreset(p.type);
                  }}
                >
                  <Icon size={13} />
                  {p.label}
                </OptionButton>
              );
            })}
            <OptionButton active={taskType === 'custom'} onClick={() => setTaskType('custom')}>
              Eigene Anweisung
            </OptionButton>
          </div>
          {taskType === 'custom' ? (
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="z. B. Fasse die letzten Posts als 5 Bulletpoints zusammen und bewerte die Stimmung."
              rows={3}
              className="mt-2 w-full rounded-md border border-grey-200 dark:border-grey-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-primary-500 resize-none"
            />
          ) : (
            <p className="text-xs text-grey-400 mt-1">
              {PRESET_UI.find((p) => p.type === preset)?.description}
            </p>
          )}
        </section>

        {/* Stage 3 — outputs */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-grey-400 mb-1.5">
            3 · Ergebnis
          </p>
          <div className="flex flex-col gap-1.5 text-sm">
            <label className="flex items-center gap-2 text-grey-500 dark:text-grey-300">
              <input type="checkbox" checked disabled />
              {OUTPUT_UI.comment.label} <span className="text-xs text-grey-400">(immer)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wantDoc}
                onChange={(e) => setWantDoc(e.target.checked)}
              />
              {OUTPUT_UI.document.label}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wantSheet}
                onChange={(e) => setWantSheet(e.target.checked)}
              />
              {OUTPUT_UI.sheet.label}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wantPresentation}
                onChange={(e) => setWantPresentation(e.target.checked)}
              />
              {OUTPUT_UI.presentation.label}
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={wantEmail}
                onChange={(e) => setWantEmail(e.target.checked)}
              />
              {OUTPUT_UI.email.label}
            </label>
          </div>
        </section>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button type="button" disabled={!canConfirm} onClick={handleConfirm}>
          {initial ? 'Speichern' : 'Grünerator-Spalte erstellen'}
        </Button>
      </DialogFooter>
    </>
  );
}
