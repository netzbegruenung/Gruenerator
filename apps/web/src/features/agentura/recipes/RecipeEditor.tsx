import { useUserLandesverbaende } from '@gruenerator/chat';
import {
  MAX_TEXT_FORM_DESCRIPTION_CHARS,
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
  MAX_TEXT_FORM_TITLE_CHARS,
} from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import { slugifyName } from '@gruenerator/shared/utils';
import { Button, Input, Textarea, useConfirm } from '@gruenerator/ui';
import { useId, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AgentAvatar } from '../../agents/icons/AgentAvatar';
import { IconPicker } from '../../agents/icons/IconPicker';

import { useDeleteRecipe, useOwnRecipes, useSaveRecipe } from './api';
import { ExamplesPanel } from './ExamplesPanel';
import { effectiveMention, recipeFormToPayload, type RecipeFormState } from './recipeFormState';
import { classifyRecipeMention } from './recipeKind';
import { recipeMetaLine } from './recipeMeta';
import { RecipePreview } from './RecipePreview';
import { RecipeSharingPanel } from './RecipeSharingPanel';
import { splitExamples } from './splitExamples';

import PageContainer from '@/components/common/PageContainer';

const labelCls = 'flex flex-col gap-xs text-sm font-medium';

/**
 * `slugifyName` kappt bei 40 Zeichen — das Eingabefeld darf nicht mehr
 * zulassen, sonst tippt jemand ins Leere und der gespeicherte Name weicht
 * stillschweigend vom eingegebenen ab.
 */
const MAX_MENTION_CHARS = 40;

/**
 * Pfadsegmente der Rezept-Routen (`/agentura/rezept/neu`,
 * `…/:mention/bearbeiten`). Als Erwähnung vergeben, wäre die eigene
 * Detailseite des Rezepts nicht mehr erreichbar.
 */
const RESERVED_MENTIONS = ['neu', 'bearbeiten'];

/**
 * Was der Erwähnung im Weg steht, bevor irgendetwas zum Server geht. Der
 * Server lehnt beides ohnehin ab (400 „… ist ein Preset, nicht kind='custom'."
 * bzw. 403 für einen nicht zugeteilten Landesverband) — aber erst nach dem
 * Klick auf Speichern und in seinen Worten. Wer „Presse" als Titel tippt, soll
 * vorher wissen, wohin der eigene Stil stattdessen gehört.
 */
function mentionBlocker(
  mention: string,
  lvIds: readonly string[] | null
): { text: string; href: string | null } | null {
  if (RESERVED_MENTIONS.includes(mention)) {
    return { text: 'Dieser Name ist reserviert.', href: null };
  }
  const classification = classifyRecipeMention(mention, lvIds);
  if (classification.kind === 'custom') return null;
  return {
    text: `@${mention} gehört zu einem mitgelieferten Rezept — dort kannst du deinen eigenen Stil hinterlegen.`,
    href: `/agentura/rezept/${encodeURIComponent(mention)}`,
  };
}

/**
 * Beim Tippen slugifizieren, ohne den gerade getippten Trenner zu schlucken:
 * `slugifyName` schneidet Bindestriche am Ende ab, weshalb „mein-" zu „mein"
 * wurde und „mein-rezept" nie zustande kam. Umlaute gehen weiterhin durch die
 * echte Transliteration (ä→ae), statt hier ein zweites Mal beschrieben zu
 * werden. Beim Verlassen des Feldes räumt {@link normalizeMention} nach.
 */
function typeMention(raw: string): string {
  const slug = slugifyName(raw, '');
  const endsOnSeparator = /[^a-zA-Z0-9]$/.test(raw);
  return endsOnSeparator && slug.length > 0 && slug.length < MAX_MENTION_CHARS ? `${slug}-` : slug;
}

/** Der Endstand des Feldes — ohne den hängenden Bindestrich aus dem Tippen. */
function normalizeMention(value: string): string {
  return slugifyName(value, '');
}

interface RecipeEditorProps {
  mode: 'create' | 'edit';
  /** EMPTY_RECIPE_FORM (or a classification-seeded variant) for create, hydrateRecipeForm(form) for edit. */
  initialState: RecipeFormState;
  onCancel?: () => void;
}

/**
 * Single-page recipe editor: a sticky action header, one continuous form —
 * name, mention, description, Anleitung, the examples disclosure that fills
 * it, and (for a saved own recipe) sharing — and a live preview pane
 * alongside. Shared by the create and edit routes, so create and edit behave
 * identically.
 *
 * The form used to be split across Grundlagen / Anleitung / Teilen tabs. Six
 * fields do not need three tabs, and the split had a cost: the name sat on a
 * tab the examples disclosure could not see, so that disclosure grew a second
 * name field of its own. One form, one name field.
 */
function RecipeEditor({ mode, initialState, onCancel }: RecipeEditorProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const saveMut = useSaveRecipe();
  const deleteMut = useDeleteRecipe();
  const mentionErrorId = useId();
  const mentionHintId = useId();
  const { lvIds } = useUserLandesverbaende();

  const [form, setForm] = useState<RecipeFormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [mentionError, setMentionError] = useState<{ text: string; href: string | null } | null>(
    null
  );
  const [justSaved, setJustSaved] = useState(false);
  // Open the disclosure where it is the point: a recipe that already carries
  // examples. Otherwise it stays folded — raw material, not a required step.
  const [examplesOpen, setExamplesOpen] = useState(initialState.rawExamples.trim().length > 0);

  const set = <K extends keyof RecipeFormState>(k: K, v: RecipeFormState[K]) => {
    setJustSaved(false);
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  // The mention field is read-only in edit mode (only a custom recipe's
  // mention is editable, and only while creating it). `effectiveMention`
  // already keeps a hydrated row's `originalMention` stable there — it does
  // not recompute from a live-changing title once a row has one.
  const canEditMention = form.kind === 'custom' && mode === 'create';
  const mention = effectiveMention(form);
  // Was im Feld steht, solange niemand getippt hat: derselbe aus dem Titel
  // abgeleitete Entwurf, aber ohne `effectiveMention`s Notfallnamen — der stand
  // sonst als „textform" im noch leeren Feld und jedes getippte Zeichen hängte
  // sich daran. Gespeichert wird weiterhin `mention`, und dort ist der Titel zu
  // dem Zeitpunkt ohnehin gefüllt (`canSave`).
  const mentionFieldValue =
    canEditMention && !form.mentionTouched ? slugifyName(form.title, '') : mention;

  const split = useMemo(() => splitExamples(form.rawExamples), [form.rawExamples]);
  const exampleCount = split.examples.length;
  const tooManyExamples = exampleCount > MAX_TEXT_FORM_EXAMPLES;
  const tooManyChars = form.rawExamples.trim().length > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;
  const examplesBlockReason = tooManyExamples
    ? `Höchstens ${MAX_TEXT_FORM_EXAMPLES} Beispiele erlaubt — bitte unter „Aus Beispielen lernen“ kürzen.`
    : tooManyChars
      ? 'Zu viele Zeichen in den Beispielen — bitte unter „Aus Beispielen lernen“ kürzen.'
      : null;

  // The chat deep-link wants the row id too (`?rezept=<mention>&rezeptId=<id>`,
  // Task 4). Not part of `RecipeFormState` — read off the own list already
  // cached by `RecipeEditorPage`'s own-vs-create lookup.
  const ownRecipesQuery = useOwnRecipes(mode === 'edit');
  // Erwähnungen werden gespeichert wie getippt, ein Link kann jede Schreibung
  // tragen — verglichen wird deshalb ohne Groß-/Kleinschreibung, wie in
  // `useRecipeByMention`.
  const recipeId =
    mode === 'edit'
      ? (ownRecipesQuery.data?.find((r) => r.mention.toLowerCase() === mention.toLowerCase())?.id ??
        null)
      : null;

  const titleValid = form.title.trim().length > 0;
  // Doppelte Rolle: Speicherbedingung und — im Beispiel-Panel — die Frage, ob
  // eine Analyse etwas überschreiben würde.
  const styleValid = form.styleBlock.trim().length > 0;
  // Geprüft wird, was IM FELD steht, nicht `effectiveMention`: slugt der Titel
  // auf nichts (etwa „!!!"), zeigt das Feld leer und `effectiveMention` fiele
  // auf „textform" zurück — gespeichert würde dann ein Name, den niemand
  // gesehen hat.
  const mentionValid = canEditMention ? mentionFieldValue.length >= 2 : true;
  const mentionHint =
    canEditMention && mentionFieldValue.length === 0
      ? 'Bitte einen Namen für die Mention angeben.'
      : null;
  const canSave =
    titleValid &&
    styleValid &&
    mentionValid &&
    !tooManyExamples &&
    !tooManyChars &&
    !saveMut.isPending;

  const handleSave = async () => {
    setError(null);
    setMentionError(null);
    // Nur eine frei getippte Erwähnung kann kollidieren: eine Preset-/LV-
    // Anpassung trägt ihre feste Erwähnung absichtlich und soll genau dorthin
    // speichern.
    if (canEditMention) {
      const blocker = mentionBlocker(mention, lvIds);
      if (blocker) {
        setMentionError(blocker);
        return;
      }
    }
    try {
      const payload = recipeFormToPayload(form);
      const saved = await saveMut.mutateAsync({ mention, body: payload });
      if (mode === 'create') {
        void navigate(`/agentura/rezept/${encodeURIComponent(saved.mention)}`);
      } else {
        setJustSaved(true);
      }
    } catch (err) {
      // 400/403/409 sind hier allesamt Auskünfte über die Erwähnung: sie ist
      // vergeben, sie gehört einem Preset, oder der Landesverband ist nicht
      // zugeteilt. Als Banner ganz oben stünde die Erklärung weit weg von dem
      // Feld, das sie meint.
      const aboutMention =
        isApiErrorWithStatus(err, 409) ||
        isApiErrorWithStatus(err, 400) ||
        isApiErrorWithStatus(err, 403);
      if (aboutMention) {
        setMentionError({
          text: err instanceof Error ? err.message : 'Diese Mention ist bereits vergeben.',
          href: null,
        });
        return;
      }
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `„${form.title || mention}“ löschen?`,
      description: 'Das Rezept wird endgültig gelöscht.',
      confirmLabel: 'Löschen',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(mention);
      void navigate('/agentura?cat=meine');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  // ── Teilen — only for a custom recipe the user already owns. ──────────────
  const showTeilen = mode === 'edit' && form.kind === 'custom';

  return (
    <PageContainer maxWidth="lg" noPadTop>
      {/* Sticky action bar — bleeds to the container padding edges. */}
      <header className="sticky top-0 z-20 -mx-lg mb-lg flex flex-wrap items-center gap-md border-b border-grey-200 bg-background/90 px-lg py-md backdrop-blur-sm dark:border-grey-700 max-md:-mx-md max-md:px-md">
        <div className="flex min-w-0 flex-1 items-center gap-md">
          <AgentAvatar iconKey={form.iconKey} size="md" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-foreground-heading">
              {mode === 'create' ? 'Neues Rezept' : form.title || 'Rezept bearbeiten'}
            </h1>
            <p className="truncate text-xs text-foreground-muted">@{mention}</p>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          {justSaved && (
            <span role="status" className="text-sm text-foreground-muted">
              Gespeichert ✓
            </span>
          )}
          {mode === 'edit' && (
            <Button
              variant="brand-outline"
              size="sm"
              onClick={() =>
                navigate(
                  `/chat?rezept=${encodeURIComponent(mention)}${recipeId ? `&rezeptId=${encodeURIComponent(recipeId)}` : ''}`
                )
              }
            >
              Im Chat verwenden
            </Button>
          )}
          {mode === 'edit' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleDelete()}
              disabled={deleteMut.isPending}
            >
              Löschen
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (onCancel ? onCancel() : navigate('/agentura'))}
            disabled={saveMut.isPending}
          >
            Abbrechen
          </Button>
          <Button
            variant="brand"
            size="brand-sm"
            onClick={() => void handleSave()}
            disabled={!canSave}
            title={examplesBlockReason ?? undefined}
          >
            Speichern
          </Button>
        </div>
      </header>

      {error && (
        <p role="alert" className="mb-md text-sm text-destructive">
          {error}
        </p>
      )}
      {examplesBlockReason && (
        <p className="mb-md text-sm text-destructive">{examplesBlockReason}</p>
      )}

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-2xl">
        {/* ── Form column ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-lg">
          <div className="flex items-end gap-sm">
            <label className={`${labelCls} flex-1`}>
              Name
              <Input
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={MAX_TEXT_FORM_TITLE_CHARS}
                placeholder="Gib deinem Rezept einen Namen"
              />
            </label>
            <IconPicker compact value={form.iconKey} onChange={(v) => set('iconKey', v)} />
          </div>

          {canEditMention ? (
            <label className={labelCls}>
              @mention
              <Input
                value={mentionFieldValue}
                onChange={(e) => {
                  setJustSaved(false);
                  setForm((prev) => ({
                    ...prev,
                    mentionTouched: true,
                    mention: typeMention(e.target.value),
                  }));
                }}
                onBlur={() =>
                  setForm((prev) =>
                    prev.mentionTouched
                      ? { ...prev, mention: normalizeMention(prev.mention) }
                      : prev
                  )
                }
                maxLength={MAX_MENTION_CHARS}
                placeholder="mein-rezept"
                aria-invalid={mentionError ? true : undefined}
                aria-describedby={
                  mentionError ? mentionErrorId : mentionHint ? mentionHintId : undefined
                }
              />
            </label>
          ) : (
            <div>
              <span className="inline-flex items-center rounded-full border border-grey-200 px-sm py-0.5 text-xs text-foreground-muted dark:border-grey-700">
                @{mention}
              </span>
              <p className="mt-xs text-xs text-foreground-muted">{recipeMetaLine(mention)}</p>
            </div>
          )}
          {mentionHint && !mentionError && (
            <p id={mentionHintId} className="text-sm text-foreground-muted">
              {mentionHint}
            </p>
          )}
          {mentionError && (
            <p id={mentionErrorId} role="alert" className="text-sm text-destructive">
              {mentionError.text}
              {mentionError.href && (
                <>
                  {' '}
                  <Link to={mentionError.href} className="underline">
                    Zum Rezept
                  </Link>
                </>
              )}
            </p>
          )}

          <label className={labelCls}>
            Beschreibung
            <Input
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              maxLength={MAX_TEXT_FORM_DESCRIPTION_CHARS}
              placeholder="Beschreibe dein Rezept und wie es funktioniert"
            />
          </label>

          <div className="flex flex-col gap-sm">
            <label className={labelCls}>
              Anleitung
              <Textarea
                className="min-h-[320px] font-mono"
                value={form.styleBlock}
                onChange={(e) => set('styleBlock', e.target.value)}
                maxLength={MAX_TEXT_FORM_STYLE_CHARS}
                rows={16}
                placeholder="Schreibe im Stil von…"
              />
            </label>
            <p className="text-xs text-foreground-muted">
              wird dem Modell als Schreibvorgabe gegeben
            </p>

            {/* Examples are raw material for the Anleitung above, not a
                  subject of their own — they sit right under the field they
                  fill, folded away until someone wants them. */}
            <details
              open={examplesOpen}
              onToggle={(e) => setExamplesOpen(e.currentTarget.open)}
              className="mt-md border-t border-grey-200 pt-md dark:border-grey-700"
            >
              <summary className="cursor-pointer text-sm font-medium">
                Aus Beispielen lernen{exampleCount ? ` · ${exampleCount}` : ''}
              </summary>
              <p className="mb-md mt-xs text-xs text-foreground-muted">
                Füge Beispieltexte ein — daraus wird eine Anleitung erkannt, die du oben weiter
                anpassen kannst.
              </p>
              <ExamplesPanel
                rawExamples={form.rawExamples}
                onChange={(v) => set('rawExamples', v)}
                textType={form.textType}
                title={form.title}
                hasStyleBlock={styleValid}
                onAnalyzed={(styleBlock) => set('styleBlock', styleBlock)}
              />
            </details>
          </div>

          {showTeilen && (
            <section className="flex flex-col gap-md border-t border-grey-200 pt-lg dark:border-grey-700">
              <h2 className="m-0 text-sm font-medium">Teilen</h2>
              <RecipeSharingPanel mention={mention} enabled />
            </section>
          )}
        </div>

        {/* ── Preview pane ────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-[88px] lg:h-fit">
          <RecipePreview
            iconKey={form.iconKey}
            title={form.title}
            description={form.description}
            styleBlock={form.styleBlock}
          />
        </div>
      </div>
    </PageContainer>
  );
}

export default RecipeEditor;
