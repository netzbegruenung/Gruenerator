import {
  MAX_TEXT_FORM_DESCRIPTION_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
  MAX_TEXT_FORM_TITLE_CHARS,
  USER_RECIPE_DESCRIPTION_MIN,
} from '@gruenerator/contracts';
import { useDescribeRecipe } from '@gruenerator/shared/grueneratoren';
import { Textarea, useConfirm } from '@gruenerator/ui';
import { useState } from 'react';
import { PiSparkleFill } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { IconPicker } from '../../agents/icons/IconPicker';

import { ExamplesPanel } from './ExamplesPanel';
import { recipeMetaLine } from './recipeMeta';
import { MAX_MENTION_CHARS, type RecipeEditorState } from './useRecipeEditor';

import { cn } from '@/utils/cn';

const labelCls = 'text-sm text-foreground-muted';
const errorCls = 'm-0 text-sm text-destructive';

interface RecipeFormProps {
  editor: RecipeEditorState;
}

/**
 * Die Felder eines Rezepts, ohne Rahmen drumherum: Name mit Symbol, darunter
 * der Name im Chat, dann Anleitung und Beschreibung. Seite und Projekt-Dialog
 * setzen sie nur unterschiedlich ein.
 *
 * Die Anleitung steht vor der Beschreibung, weil „Mit KI erstellen" die
 * Beschreibung aus Name und Anleitung schreibt.
 */
export function RecipeForm({ editor }: RecipeFormProps) {
  const { form, set, fieldIds, fieldErrors } = editor;
  const [examplesOpen, setExamplesOpen] = useState(false);
  const confirm = useConfirm();
  const describeMut = useDescribeRecipe();
  const [describeError, setDescribeError] = useState<string | null>(null);

  const ids = {
    titleError: `${fieldIds.title}-error`,
    mentionError: `${fieldIds.mention}-error`,
    styleError: `${fieldIds.styleBlock}-error`,
    descriptionHint: `${fieldIds.description}-hint`,
  };

  const showHandle = !editor.canEditMention || form.title.trim().length > 0 || form.mentionTouched;
  const mentionMessage =
    editor.mentionProblem ??
    (fieldErrors.mention ? { text: fieldErrors.mention, href: null } : null);

  const descriptionLength = form.description.trim().length;
  const canDescribe =
    form.title.trim().length > 0 && form.styleBlock.trim().length > 0 && !describeMut.isPending;

  const handleDescribe = async () => {
    setDescribeError(null);
    if (form.description.trim().length > 0) {
      const ok = await confirm({
        title: 'Beschreibung ersetzen?',
        description: 'Die KI schreibt eine neue Beschreibung und ersetzt, was jetzt im Feld steht.',
        confirmLabel: 'Ersetzen',
      });
      if (!ok) return;
    }
    try {
      const description = await describeMut.mutateAsync({
        title: form.title.trim(),
        styleBlock: form.styleBlock.trim(),
      });
      set('description', description);
    } catch (err) {
      setDescribeError(
        err instanceof Error ? err.message : 'Beschreibung konnte nicht erstellt werden.'
      );
    }
  };

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-xs">
        <div className="flex items-center gap-sm">
          <IconPicker compact value={form.iconKey} onChange={(v) => set('iconKey', v)} />
          <input
            id={fieldIds.title}
            aria-label="Name"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            maxLength={MAX_TEXT_FORM_TITLE_CHARS}
            placeholder="Name des Rezepts"
            autoComplete="off"
            aria-invalid={fieldErrors.title ? true : undefined}
            aria-describedby={fieldErrors.title ? ids.titleError : undefined}
            className="min-w-0 flex-1 border-0 bg-transparent py-xxs text-xl font-bold text-foreground outline-none placeholder:text-foreground-muted/70"
          />
        </div>
        {fieldErrors.title && (
          <p id={ids.titleError} className={errorCls}>
            {fieldErrors.title}
          </p>
        )}

        {showHandle && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-sm pl-[3.25rem] text-sm text-foreground-muted">
            {editor.canEditMention ? (
              <span className="inline-flex items-center">
                <span aria-hidden>@</span>
                <input
                  id={fieldIds.mention}
                  aria-label="Im Chat aufrufen mit"
                  value={editor.mentionFieldValue}
                  onChange={(e) => editor.setMentionInput(e.target.value)}
                  onBlur={editor.normalizeMentionInput}
                  maxLength={MAX_MENTION_CHARS}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={mentionMessage ? true : undefined}
                  aria-describedby={mentionMessage ? ids.mentionError : undefined}
                  className="field-sizing-content min-w-[4ch] rounded-xs border-0 bg-transparent px-xxs py-[2px] text-foreground-muted outline-none hover:bg-input-bg focus:bg-input-bg focus:text-foreground"
                />
              </span>
            ) : (
              <span>@{editor.mention}</span>
            )}
            {form.kind !== 'custom' && <span>· {recipeMetaLine(editor.mention)}</span>}
          </div>
        )}
        {mentionMessage && (
          <p id={ids.mentionError} role="alert" className={cn(errorCls, 'pl-[3.25rem]')}>
            {mentionMessage.text}
            {mentionMessage.href && (
              <>
                {' '}
                <Link to={mentionMessage.href} className="underline">
                  Zum Rezept
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-xs">
        <div className="flex items-baseline justify-between gap-sm">
          {examplesOpen ? (
            <span className={labelCls}>Aus Beispielen lernen</span>
          ) : (
            <label htmlFor={fieldIds.styleBlock} className={labelCls}>
              Anleitung
            </label>
          )}
          <button
            type="button"
            onClick={() => setExamplesOpen((v) => !v)}
            className="text-sm text-foreground-muted underline decoration-grey-300 underline-offset-4 hover:text-foreground dark:decoration-grey-600"
          >
            {examplesOpen
              ? 'Zur Anleitung'
              : `Aus Beispielen lernen${editor.exampleCount ? ` · ${editor.exampleCount}` : ''}`}
          </button>
        </div>
        {examplesOpen ? (
          <ExamplesPanel
            rawExamples={form.rawExamples}
            onChange={(v) => set('rawExamples', v)}
            textType={form.textType}
            title={form.title}
            hasStyleBlock={form.styleBlock.trim().length > 0}
            onAnalyzed={(styleBlock) => {
              set('styleBlock', styleBlock);
              setExamplesOpen(false);
            }}
          />
        ) : (
          <Textarea
            id={fieldIds.styleBlock}
            rows={3}
            value={form.styleBlock}
            onChange={(e) => set('styleBlock', e.target.value)}
            maxLength={MAX_TEXT_FORM_STYLE_CHARS}
            placeholder="Schreibe im Stil von …"
            aria-invalid={fieldErrors.styleBlock ? true : undefined}
            aria-describedby={fieldErrors.styleBlock ? ids.styleError : undefined}
            className="max-h-[75vh] min-h-[calc(3lh+1rem)] font-mono text-sm leading-relaxed"
          />
        )}
        {fieldErrors.styleBlock && !examplesOpen && (
          <p id={ids.styleError} className={errorCls}>
            {fieldErrors.styleBlock}
          </p>
        )}
        {editor.examplesProblem && <p className={errorCls}>{editor.examplesProblem}</p>}
      </div>

      <div className="flex flex-col gap-xs">
        <label htmlFor={fieldIds.description} className={labelCls}>
          Wann soll der Grünerator es nutzen?
        </label>
        <Textarea
          id={fieldIds.description}
          rows={1}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          maxLength={MAX_TEXT_FORM_DESCRIPTION_CHARS}
          placeholder="z. B. für Einladungen zur Mitgliederversammlung"
          aria-invalid={fieldErrors.description ? true : undefined}
          aria-describedby={ids.descriptionHint}
          className="max-h-[30vh] min-h-0"
        />
        <div className="flex min-h-6 items-center justify-between gap-sm">
          <button
            type="button"
            onClick={() => void handleDescribe()}
            disabled={!canDescribe}
            title={
              form.title.trim() && form.styleBlock.trim()
                ? undefined
                : 'Erst Name und Anleitung ausfüllen'
            }
            className="inline-flex items-center gap-xxs text-sm text-primary-600 hover:underline hover:underline-offset-4 disabled:cursor-default disabled:text-foreground-muted disabled:opacity-60 disabled:hover:no-underline dark:text-primary-400"
          >
            <PiSparkleFill aria-hidden className="size-3.5" />
            {describeMut.isPending
              ? 'Wird erstellt …'
              : form.description.trim()
                ? 'Mit KI neu erstellen'
                : 'Mit KI erstellen'}
          </button>
          {!editor.descriptionValid && (
            <span
              id={ids.descriptionHint}
              aria-live="polite"
              className={cn(
                'text-xs tabular-nums',
                fieldErrors.description ? 'text-destructive' : 'text-foreground-muted'
              )}
            >
              {descriptionLength}/{USER_RECIPE_DESCRIPTION_MIN}
            </span>
          )}
        </div>
        {fieldErrors.description && <p className={errorCls}>{fieldErrors.description}</p>}
        {describeError && (
          <p role="alert" className={errorCls}>
            {describeError}
          </p>
        )}
      </div>
    </div>
  );
}
