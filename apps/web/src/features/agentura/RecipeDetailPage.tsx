/**
 * One detail page for every kind of recipe ("Rezept") behind
 * `/agentura/rezept/:mention` — the shipped catalogue ones AND the ones people
 * write themselves, share into a Projekt or publish. Which of the four it is
 * comes from {@link useRecipeByMention}; this file only picks the view.
 *
 * The system view is the page that was here before, plus one action: a preset
 * or an entitled Landesverbands-Rezept can be adapted with one's own examples,
 * and once that override exists the page says so and links to it. Everything
 * else about it — Anleitung, Vorlage, Verwandte, Favorit, Link kopieren — is
 * unchanged, including for everyone who may not override anything.
 */
import {
  agentsList,
  useHiddenSkillMentions,
  useSkillFavoritesStore,
  useUserLandesverbaende,
  type AgentListItem,
} from '@gruenerator/chat';
import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';
import { SKILL_CATEGORY_LABELS, isAdminVisibleSkill } from '@gruenerator/shared/agents';
import {
  Badge,
  Button,
  CardGrid,
  ConfirmDialogProvider,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useConfirm,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import {
  PiArrowLeft,
  PiPaperPlaneTilt,
  PiPencilSimple,
  PiShareNetwork,
  PiSparkle,
  PiStar,
  PiStarFill,
  PiTrash,
} from 'react-icons/pi';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AgentAvatar } from '../agents/icons/AgentAvatar';

import { SkillCard, TypeBadge } from './components/cards';
import { ShareRecipeModal } from './components/ShareRecipeModal';
import { useSkillPrompt } from './hooks/useSkillPrompt';
import { relatedSkills } from './lib/lookups';
import { useDeleteRecipe } from './recipes/api';
import { classifyRecipeMention } from './recipes/recipeKind';
import { recipeOriginLine } from './recipes/recipeMeta';
import { useRecipeByMention, type RecipeSource } from './recipes/useRecipeByMention';

import { Markdown } from '@/components/common/Markdown';
import PageContainer from '@/components/common/PageContainer';
import { UnderlineTabs } from '@/components/common/UnderlineTabs';
import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useAuthStore } from '@/stores/authStore';

const ICON_BTN =
  'flex h-10 w-10 items-center justify-center rounded-xl text-foreground-muted transition-colors hover:bg-hover-alt hover:text-primary-700 dark:hover:text-primary-300';

function BackLink() {
  return (
    <Link
      to="/agentura"
      className="mb-md inline-flex items-center gap-xs text-sm text-foreground-muted transition-colors hover:text-foreground"
    >
      <PiArrowLeft className="h-4 w-4" />
      Agentura
    </Link>
  );
}

function copyPageLink() {
  void navigator.clipboard?.writeText(window.location.href);
}

// ── The shipped catalogue ────────────────────────────────────────────────────

function SystemRecipeView({
  skill,
  ownOverride,
}: {
  skill: AgentListItem;
  ownOverride: TextForm | null;
}) {
  const navigate = useNavigate();
  const userLocale = useAuthStore((s) => s.locale) ?? 'de-DE';
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);
  // The recipe text is not in the bundle — it is party-internal and comes from
  // the API, for signed-in users only. See hooks/useSkillPrompt.ts.
  const { data: skillPrompt } = useSkillPrompt(skill.mention);
  const hiddenSkillMentions = useHiddenSkillMentions();
  const { lvIds } = useUserLandesverbaende();

  const related = useMemo(() => {
    const pool = agentsList.filter(
      (s) =>
        (s.audience === undefined || s.audience === 'all' || s.audience === userLocale) &&
        isAdminVisibleSkill(s.mention, hiddenSkillMentions)
    );
    return relatedSkills(skill, pool);
  }, [skill, userLocale, hiddenSkillMentions]);

  // Only a preset or a Landesverbands-Rezept this user is actually assigned to
  // can be overridden — every other catalogue entry has no per-user body, so
  // offering the button would lead to a save the backend rejects.
  const classification = classifyRecipeMention(skill.mention, lvIds);
  const canOverride =
    classification.kind === 'preset' ||
    (classification.kind === 'recipe' && classification.entitled);

  const Icon = skill.icon ?? PiSparkle;
  const isFavorite = favorites.includes(skill.mention.toLowerCase());
  const editHref = `/agentura/rezept/${encodeURIComponent(skill.mention)}/bearbeiten`;
  // Mit einem eigenen Override ist „Im Chat verwenden" nicht mehr dasselbe:
  // `?skill=` aktiviert nur den Agenten, der Rumpf bliebe der mitgelieferte.
  // `?rezept=` samt Zeilen-ID nimmt den angepassten Stil mit — genau den, den
  // die Seite eine Zeile darüber ankündigt.
  const chatHref = ownOverride
    ? `/chat?rezept=${encodeURIComponent(skill.mention)}&rezeptId=${encodeURIComponent(ownOverride.id)}`
    : `/chat?skill=${encodeURIComponent(skill.mention)}`;

  return (
    <PageContainer maxWidth="lg">
      <BackLink />

      <header className="mb-lg flex flex-col gap-md sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-md">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-hover-alt text-3xl text-secondary-600 dark:bg-grey-800">
            <Icon className="text-3xl" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-sm">
              <h1 className="m-0 text-2xl font-semibold text-foreground-heading">{skill.title}</h1>
              <Badge variant="outline">Rezept</Badge>
            </div>
            <div className="mt-sm flex flex-wrap gap-xs">
              {skill.skillCategory && (
                <Badge variant="secondary">{SKILL_CATEGORY_LABELS[skill.skillCategory]}</Badge>
              )}
              {ownOverride && <Badge variant="secondary">Du hast diesen Stil angepasst</Badge>}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-xs">
          <Button variant="brand" onClick={() => navigate(chatHref)}>
            <PiPaperPlaneTilt />
            Im Chat verwenden
          </Button>
          {canOverride && (
            <Button variant="outline" onClick={() => navigate(editHref)}>
              <PiPencilSimple />
              {ownOverride ? 'Angepassten Stil bearbeiten' : 'Mit eigenen Beispielen anpassen'}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            onClick={() => toggleFavorite(skill.mention)}
          >
            {isFavorite ? <PiStarFill /> : <PiStar />}
          </Button>
          <Button variant="outline" size="icon" aria-label="Link kopieren" onClick={copyPageLink}>
            <PiShareNetwork />
          </Button>
        </div>
      </header>

      <p className="mb-lg text-foreground">{skill.description}</p>

      <Tabs defaultValue="skill">
        <TabsList className="mb-lg">
          <TabsTrigger value="skill">Anleitung</TabsTrigger>
          {related.length > 0 && <TabsTrigger value="related">Verwandte Rezepte</TabsTrigger>}
        </TabsList>

        <TabsContent value="skill">
          <div className="flex flex-col gap-lg">
            {skill.promptTemplate && (
              <div className="rounded-lg border border-grey-200 bg-hover-alt p-md dark:border-grey-700 dark:bg-grey-800/40">
                <h2 className="m-0 mb-xs text-sm font-semibold uppercase tracking-wide text-foreground-muted">
                  Vorlage
                </h2>
                <p className="m-0 text-sm text-foreground">{skill.promptTemplate}</p>
              </div>
            )}
            <Markdown fallback={<p>{skill.description}</p>}>
              {skillPrompt ?? skill.description}
            </Markdown>
          </div>
        </TabsContent>

        {related.length > 0 && (
          <TabsContent value="related">
            <CardGrid columns="auto" gap="md">
              {related.map((other: AgentListItem) => (
                <SkillCard
                  key={other.mention}
                  skill={other}
                  isFavorite={favorites.includes(other.mention.toLowerCase())}
                  onToggleFavorite={toggleFavorite}
                  onSelect={(s) => navigate(`/agentura/rezept/${encodeURIComponent(s.mention)}`)}
                />
              ))}
            </CardGrid>
          </TabsContent>
        )}
      </Tabs>
    </PageContainer>
  );
}

// ── Own, shared and public rows ──────────────────────────────────────────────

/** Own/shared rows carry the examples themselves, public ones only the count. */
function exampleCountOf(form: TextForm | PublicTextForm): number {
  return 'examples' in form ? form.examples.length : form.exampleCount;
}

function UserRecipeView({
  form,
  source,
}: {
  form: TextForm | PublicTextForm;
  source: RecipeSource;
}) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const favorites = useSkillFavoritesStore((s) => s.favorites);
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);
  const deleteRecipe = useDeleteRecipe();
  const [shareOpen, setShareOpen] = useState(false);
  const [tab, setTab] = useState<'anleitung' | 'beispiele'>('anleitung');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isOwn = source === 'own';
  const isFavorite = favorites.includes(form.mention.toLowerCase());
  const origin = recipeOriginLine(form, source);
  const exampleCount = exampleCountOf(form);

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Rezept löschen?',
      description: `„${form.title}“ wird dauerhaft entfernt — samt Beispielen und Anleitung.`,
    });
    if (!confirmed) return;
    try {
      await deleteRecipe.mutateAsync(form.mention);
      void navigate('/agentura?cat=meine');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <PageContainer maxWidth="lg">
      <BackLink />

      <header className="mb-md flex items-center gap-md">
        <AgentAvatar iconKey={form.iconKey ?? 'PiSparkle'} size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-sm">
            <h1 className="m-0 text-2xl font-semibold leading-tight text-foreground-heading">
              {form.title}
            </h1>
            <TypeBadge kind="skill" />
          </div>
          <p className="m-0 mt-1 text-sm text-foreground-muted">
            @{form.mention}
            {origin ? ` · ${origin}` : ''}
          </p>
        </div>
      </header>

      {form.description && <p className="mb-lg text-foreground">{form.description}</p>}

      <div className="mb-lg flex flex-wrap items-center gap-xs">
        <Button
          variant="brand"
          onClick={() =>
            navigate(
              `/chat?rezept=${encodeURIComponent(form.mention)}&rezeptId=${encodeURIComponent(form.id)}`
            )
          }
        >
          <PiPaperPlaneTilt />
          Im Chat verwenden
        </Button>
        <div className="mx-1 h-6 w-px bg-grey-200 dark:bg-grey-700" />
        {isOwn && (
          <button
            type="button"
            className={ICON_BTN}
            aria-label="Bearbeiten"
            onClick={() =>
              navigate(`/agentura/rezept/${encodeURIComponent(form.mention)}/bearbeiten`)
            }
          >
            <PiPencilSimple className="h-[18px] w-[18px]" />
          </button>
        )}
        <button
          type="button"
          className={ICON_BTN}
          aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
          onClick={() => toggleFavorite(form.mention)}
        >
          {isFavorite ? (
            <PiStarFill className="h-[18px] w-[18px] text-secondary-600" />
          ) : (
            <PiStar className="h-[18px] w-[18px]" />
          )}
        </button>
        <button
          type="button"
          className={ICON_BTN}
          aria-label={isOwn ? 'Teilen' : 'Link kopieren'}
          onClick={() => (isOwn ? setShareOpen(true) : copyPageLink())}
        >
          <PiShareNetwork className="h-[18px] w-[18px]" />
        </button>
        {isOwn && (
          <button
            type="button"
            className={ICON_BTN}
            aria-label="Löschen"
            onClick={() => void handleDelete()}
            disabled={deleteRecipe.isPending}
          >
            <PiTrash className="h-[18px] w-[18px]" />
          </button>
        )}
      </div>

      {deleteError && (
        <p role="alert" className="mb-md text-sm text-destructive">
          {deleteError}
        </p>
      )}

      {isOwn && (
        <ShareRecipeModal mention={form.mention} open={shareOpen} onOpenChange={setShareOpen} />
      )}

      <UnderlineTabs
        tabs={[
          { key: 'anleitung' as const, label: 'Anleitung' },
          { key: 'beispiele' as const, label: 'Beispiele' },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-lg"
      />

      {tab === 'anleitung' && (
        <div className="max-w-[640px] text-base leading-relaxed text-foreground">
          {form.styleBlock ? (
            <Markdown fallback={<p>{form.styleBlock}</p>}>{form.styleBlock}</Markdown>
          ) : (
            <p className="m-0 text-foreground-muted">
              Für dieses Rezept ist noch keine Anleitung hinterlegt.
            </p>
          )}
        </div>
      )}

      {tab === 'beispiele' && (
        // The example texts themselves stay off the page — they are the
        // author's own writing; what a recipe publishes is the instruction.
        <p className="m-0 text-foreground-muted">
          {exampleCount === 1 ? '1 Beispiel hinterlegt' : `${exampleCount} Beispiele hinterlegt`}
        </p>
      )}
    </PageContainer>
  );
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

function RecipeDetailPage() {
  const { mention: rawMention } = useParams<{ mention: string }>();
  const mention = decodeURIComponent(rawMention ?? '');
  const lookup = useRecipeByMention(mention);

  useDocumentTitle(lookup.skill?.title ?? lookup.form?.title ?? null);

  if (lookup.status === 'loading') {
    return (
      <PageContainer maxWidth="lg">
        <BackLink />
        <p className="text-foreground-muted">Lädt…</p>
      </PageContainer>
    );
  }

  if (lookup.source === 'system' && lookup.skill) {
    return <SystemRecipeView skill={lookup.skill} ownOverride={lookup.ownOverride} />;
  }

  if (lookup.form && lookup.source) {
    // The delete confirmation needs a provider; none is mounted above this
    // route, and without one `useConfirm` degrades to `window.confirm`.
    return (
      <ConfirmDialogProvider>
        <UserRecipeView form={lookup.form} source={lookup.source} />
      </ConfirmDialogProvider>
    );
  }

  // A failed list is not a missing recipe — "nicht gefunden" here would send
  // someone looking for a deletion that never happened.
  if (lookup.isError) {
    return (
      <PageContainer maxWidth="lg" title="Rezept konnte nicht geladen werden">
        <p className="mb-md text-foreground">
          Die Rezepte konnten gerade nicht abgerufen werden. Bitte lade die Seite neu.
        </p>
        <Button asChild variant="outline">
          <Link to="/agentura">Zurück zur Agentura</Link>
        </Button>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="lg" title="Rezept nicht gefunden">
      <div className="text-center">
        <Button asChild variant="brand">
          <Link to="/agentura">Zurück zur Agentura</Link>
        </Button>
      </div>
    </PageContainer>
  );
}

export default RecipeDetailPage;
