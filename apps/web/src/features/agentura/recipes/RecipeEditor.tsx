import {
  MAX_TEXT_FORM_DESCRIPTION_CHARS,
  MAX_TEXT_FORM_STYLE_CHARS,
  type PublicOwnership,
  type TextFormShareMode,
} from '@gruenerator/contracts';
import { isApiErrorWithStatus } from '@gruenerator/shared/api';
import { slugifyName } from '@gruenerator/shared/utils';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  Textarea,
  useConfirm,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { HiTrash } from 'react-icons/hi';
import { useNavigate } from 'react-router-dom';

import { AgentAvatar } from '../../agents/icons/AgentAvatar';
import { IconPicker } from '../../agents/icons/IconPicker';
import { useMyGroupsForSharing } from '../hooks/useMyGroupsForSharing';

import {
  useDeleteRecipe,
  useOwnRecipes,
  useSaveRecipe,
  useShareRecipeWithGroup,
  useUnshareRecipeFromGroup,
} from './api';
import { ExamplesPanel } from './ExamplesPanel';
import { effectiveMention, recipeFormToPayload, type RecipeFormState } from './recipeFormState';
import { recipeMetaLine } from './recipeMeta';
import { RecipePreview } from './RecipePreview';
import { splitExamples } from './splitExamples';
import {
  useRecipeGroupShares,
  useRecipeShareSettings,
  useSetRecipeIsPublic,
  useSetRecipeShareMode,
} from './useRecipeSharing';

import PageContainer from '@/components/common/PageContainer';
import { UnderlineTabs } from '@/components/common/UnderlineTabs';
import { cn } from '@/utils/cn';

const labelCls = 'flex flex-col gap-xs text-sm font-medium';

const SHARE_MODE_LABELS: Record<TextFormShareMode, string> = {
  private: 'Privat — nur ich',
  groups: 'Mit Projekten geteilt',
  authenticated: 'Mit Anmeldung — alle eingeloggten Nutzer*innen',
};

type Section = 'grund' | 'anleitung' | 'beispiele' | 'teilen';

interface RecipeEditorProps {
  mode: 'create' | 'edit';
  /** EMPTY_RECIPE_FORM (or a classification-seeded variant) for create, hydrateRecipeForm(form) for edit. */
  initialState: RecipeFormState;
  initialSection?: Section;
  onCancel?: () => void;
}

/**
 * Single-page recipe editor: a sticky action header, the form split into
 * Grundlagen / Anleitung / Beispiele / Teilen tabs, and a live preview pane
 * alongside. Shared by the create and edit routes, so create and edit behave
 * identically. Mirrors `agents/AgentEditor.tsx`.
 */
function RecipeEditor({
  mode,
  initialState,
  initialSection = 'grund',
  onCancel,
}: RecipeEditorProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const saveMut = useSaveRecipe();
  const deleteMut = useDeleteRecipe();

  const [form, setForm] = useState<RecipeFormState>(initialState);
  const [error, setError] = useState<string | null>(null);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [section, setSection] = useState<Section>(initialSection);

  const set = <K extends keyof RecipeFormState>(k: K, v: RecipeFormState[K]) => {
    setJustSaved(false);
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  // The mention field is read-only in edit mode (only a custom recipe's mention
  // is editable, and only while creating it) — so the save/link target must NOT
  // recompute from a live-changing title the way `effectiveMention` does for
  // create mode. It stays pinned to the mention the row was hydrated with,
  // mirroring `TextFormEditor`'s `initialForm`-present branch (which
  // `RecipeFormState` has no equivalent field for).
  const canEditMention = form.kind === 'custom' && mode === 'create';
  const mention =
    mode === 'edit' ? (initialState.fixedMention ?? initialState.mention) : effectiveMention(form);

  const exampleCount = useMemo(
    () => splitExamples(form.rawExamples).examples.length,
    [form.rawExamples]
  );

  // The chat deep-link wants the row id too (`?rezept=<mention>&rezeptId=<id>`,
  // Task 4). Not part of `RecipeFormState` — read off the own list already
  // cached by `RecipeEditorPage`'s own-vs-create lookup.
  const ownRecipesQuery = useOwnRecipes(mode === 'edit');
  const recipeId =
    mode === 'edit' ? (ownRecipesQuery.data?.find((r) => r.mention === mention)?.id ?? null) : null;

  const titleValid = form.title.trim().length > 0;
  const styleValid = form.styleBlock.trim().length > 0;
  const mentionValid = canEditMention ? mention.length >= 2 : true;
  const canSave = titleValid && styleValid && mentionValid && !saveMut.isPending;

  const handleSave = async () => {
    setError(null);
    setMentionError(null);
    try {
      const payload = recipeFormToPayload(form);
      const saved = await saveMut.mutateAsync({ mention, body: payload });
      if (mode === 'create') {
        void navigate(`/agentura/rezept/${encodeURIComponent(saved.mention)}`);
      } else {
        setJustSaved(true);
      }
    } catch (err) {
      if (isApiErrorWithStatus(err, 409)) {
        setMentionError(err instanceof Error ? err.message : 'Diese Mention ist bereits vergeben.');
        setSection('grund');
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
      void navigate('/agentura');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  // ── Teilen tab — only for a custom recipe the user already owns. ───────────
  const showTeilen = mode === 'edit' && form.kind === 'custom';
  const shareSettingsQuery = useRecipeShareSettings(showTeilen ? mention : null);
  const groupShares = useRecipeGroupShares(showTeilen ? mention : null);
  const myGroupsQuery = useMyGroupsForSharing(showTeilen);
  const setShareMode = useSetRecipeShareMode(mention);
  const setIsPublic = useSetRecipeIsPublic(mention);
  const shareGroupMut = useShareRecipeWithGroup();
  const unshareGroupMut = useUnshareRecipeFromGroup();
  const [shareError, setShareError] = useState<string | null>(null);

  const shareMode = shareSettingsQuery.data?.share_mode ?? 'private';
  const isPublic = shareSettingsQuery.data?.is_public ?? false;
  const publicOwnership = shareSettingsQuery.data?.public_ownership ?? null;

  const sharedGroupIds = useMemo(() => new Set(groupShares.map((g) => g.groupId)), [groupShares]);
  const availableGroups = useMemo(
    () => (myGroupsQuery.data ?? []).filter((g) => !sharedGroupIds.has(g.id)),
    [myGroupsQuery.data, sharedGroupIds]
  );

  const onShareError = (err: unknown) => {
    setShareError(err instanceof Error ? err.message : 'Teilen fehlgeschlagen.');
  };

  const sectionTabs = [
    { key: 'grund' as const, label: 'Grundlagen' },
    { key: 'anleitung' as const, label: 'Anleitung' },
    { key: 'beispiele' as const, label: `Beispiele${exampleCount ? ` · ${exampleCount}` : ''}` },
    ...(showTeilen ? [{ key: 'teilen' as const, label: 'Teilen' }] : []),
  ];

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
          {justSaved && <span className="text-sm text-foreground-muted">Gespeichert ✓</span>}
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
          >
            Speichern
          </Button>
        </div>
      </header>

      {error && <p className="mb-md text-sm text-destructive">{error}</p>}

      <div className="grid grid-cols-1 gap-lg lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] lg:gap-2xl">
        {/* ── Form column ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          <UnderlineTabs
            tabs={sectionTabs}
            value={section}
            onChange={setSection}
            className="mb-lg"
          />

          {section === 'grund' && (
            <div className="flex flex-col gap-lg">
              <div className="flex items-end gap-sm">
                <label className={`${labelCls} flex-1`}>
                  Name
                  <Input
                    value={form.title}
                    onChange={(e) => set('title', e.target.value)}
                    maxLength={100}
                    placeholder="Gib deinem Rezept einen Namen"
                  />
                </label>
                <IconPicker compact value={form.iconKey} onChange={(v) => set('iconKey', v)} />
              </div>

              {canEditMention ? (
                <label className={labelCls}>
                  @mention
                  <Input
                    value={form.mention}
                    onChange={(e) => {
                      setJustSaved(false);
                      setForm((prev) => ({
                        ...prev,
                        mentionTouched: true,
                        mention: slugifyName(e.target.value, 'textform'),
                      }));
                    }}
                    maxLength={48}
                    placeholder="mein-rezept"
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
              {mentionError && <p className="text-sm text-destructive">{mentionError}</p>}

              <label className={labelCls}>
                Beschreibung
                <Input
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  maxLength={MAX_TEXT_FORM_DESCRIPTION_CHARS}
                  placeholder="Beschreibe dein Rezept und wie es funktioniert"
                />
              </label>
            </div>
          )}

          {section === 'anleitung' && (
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
            </div>
          )}

          {section === 'beispiele' && (
            <ExamplesPanel
              rawExamples={form.rawExamples}
              onChange={(v) => set('rawExamples', v)}
              textType={form.textType}
              title={form.title}
              onAnalyzed={(styleBlock) => set('styleBlock', styleBlock)}
            />
          )}

          {section === 'teilen' && (
            <div className="flex flex-col gap-md">
              {shareError && <p className="text-sm text-destructive">{shareError}</p>}

              <div>
                <p className="mb-xs text-sm font-semibold">Sichtbarkeit</p>
                <Select
                  value={shareMode}
                  onValueChange={(v) => {
                    setShareError(null);
                    setShareMode.mutate(v as TextFormShareMode, { onError: onShareError });
                  }}
                  disabled={setShareMode.isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SHARE_MODE_LABELS) as TextFormShareMode[]).map((m) => (
                      <SelectItem key={m} value={m}>
                        {SHARE_MODE_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {shareMode === 'groups' ? (
                <div>
                  <p className="mb-xs text-sm font-semibold">Projekte</p>
                  {groupShares.length > 0 ? (
                    <ul className="mb-xs flex flex-col gap-xs">
                      {groupShares.map((share) => (
                        <li
                          key={share.groupId}
                          className="flex items-center justify-between rounded-md border border-grey-200 bg-background p-xs dark:border-grey-700"
                        >
                          <span className="truncate text-sm">{share.groupName}</span>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setShareError(null);
                              unshareGroupMut.mutate(
                                { mention, groupId: share.groupId },
                                { onError: onShareError }
                              );
                            }}
                            disabled={unshareGroupMut.isPending}
                            aria-label={`${share.groupName} entfernen`}
                          >
                            <HiTrash size={14} />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-xs text-xs text-foreground-muted">
                      Noch keine Projekte hinzugefügt.
                    </p>
                  )}
                  {availableGroups.length > 0 ? (
                    <Select
                      value=""
                      onValueChange={(v) => {
                        if (!v) return;
                        setShareError(null);
                        shareGroupMut.mutate({ mention, groupId: v }, { onError: onShareError });
                      }}
                      disabled={shareGroupMut.isPending}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Projekt hinzufügen…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : myGroupsQuery.data && myGroupsQuery.data.length === 0 ? (
                    <p className="text-xs text-foreground-muted">
                      Du bist noch in keinem Projekt. Tritt einem Projekt bei, um Rezepte zu teilen.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {shareMode === 'authenticated' ? (
                <p className="text-xs text-foreground-muted">
                  Sichtbar nur für eingeloggte Nutzer*innen aus deinem Land.
                </p>
              ) : null}

              {/* "Von der Basis" public listing — shown in every visibility mode so
                  it's discoverable; enabling it from a lower mode first promotes
                  Sichtbarkeit to 'authenticated' (the backend invariant for an
                  Agentura listing). Mirrors `ShareAgentModal`. */}
              <div className="flex items-start justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
                <div className="space-y-xs">
                  <Label htmlFor="recipe-agentura-toggle" className="text-sm">
                    Auf „Von der Basis“ listen
                  </Label>
                  <p className="text-xs text-foreground-muted">
                    Dein Rezept erscheint dann in der Agentura unter „Von der Basis“ zum Entdecken.
                  </p>
                  {!isPublic && shareMode !== 'authenticated' ? (
                    <p className="text-xs text-foreground-muted">
                      Beim Aktivieren wird die Sichtbarkeit auf „Mit Anmeldung — alle eingeloggten
                      Nutzer*innen“ gesetzt.
                    </p>
                  ) : null}
                </div>
                <Switch
                  id="recipe-agentura-toggle"
                  checked={isPublic}
                  onCheckedChange={(checked) => {
                    setShareError(null);
                    if (!checked) {
                      setIsPublic.mutate(
                        { is_public: false, public_ownership: null },
                        { onError: onShareError }
                      );
                      return;
                    }
                    const list = () =>
                      setIsPublic.mutate(
                        { is_public: true, public_ownership: publicOwnership ?? 'owner' },
                        { onError: onShareError }
                      );
                    if (shareMode !== 'authenticated') {
                      void setShareMode.mutateAsync('authenticated').then(list).catch(onShareError);
                    } else {
                      list();
                    }
                  }}
                  disabled={setIsPublic.isPending || setShareMode.isPending}
                />
              </div>

              {isPublic ? (
                <div className="space-y-sm">
                  <p className="text-sm text-foreground-heading">Bitte bestätige:</p>
                  <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
                    {(['owner', 'public_data'] as const).map((choice: PublicOwnership) => (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => {
                          setShareError(null);
                          setIsPublic.mutate(
                            { is_public: true, public_ownership: choice },
                            { onError: onShareError }
                          );
                        }}
                        disabled={setIsPublic.isPending}
                        className={cn(
                          'flex flex-col gap-xs rounded-lg border p-md text-left transition-colors',
                          publicOwnership === choice
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                            : 'border-grey-200 hover:border-primary-300 dark:border-grey-700 dark:hover:border-primary-600'
                        )}
                      >
                        <span className="text-sm font-medium text-foreground">
                          {choice === 'owner'
                            ? 'Ich besitze die Inhalte'
                            : 'Inhalte sind öffentlich verfügbar'}
                        </span>
                        <span className="text-xs text-foreground-muted">
                          {choice === 'owner'
                            ? '… oder habe die Rechte zur Veröffentlichung'
                            : 'z.B. offizielle Inhalte, Pressematerial'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <Separator />
            </div>
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
