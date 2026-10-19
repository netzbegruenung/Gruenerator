import { type MarketplaceItem, type MarketplaceKind } from '@gruenerator/contracts';
import { getLandesverbandHubBySlug, type LvHub } from '@gruenerator/shared/agents';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  MARKETPLACE_PATH,
  marketplaceHref,
  parseMarketplaceParams,
  serializeMarketplaceParams,
  useMarketplaceItem,
  useMarketplaceKind,
} from '@gruenerator/shared/marketplace';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import { getNotebookDefinition } from '@gruenerator/shared/notebooks';
import { Button, SectionHeader } from '@gruenerator/ui';
import { type JSX, type ReactNode } from 'react';
import { PiCaretRight } from 'react-icons/pi';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { GalleryEmptyState, GallerySkeleton } from '../../components/common/Gallery/parts';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import { PageHero, PageShell } from '../../components/common/PageHero';
import NotebookGalleryCard from '../notebook/components/NotebookGalleryCard';
import { getNotebookById } from '../notebook/config/notebooksConfig';

import { MarketplaceCard } from './MarketplaceCard';
import { MarketplaceItemDetail } from './MarketplaceItemDetail';
import { useMarketplaceActions, type MarketplaceActions } from './useMarketplaceActions';

import { CURRENT_INSTANCE } from '@/config/instance';
import { useAuthStore } from '@/stores/authStore';

type Locale = 'de-DE' | 'de-AT';

const GRID = 'grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3';

/**
 * `/marktplatz/landesverband/<slug>` — die Seite eines Landesverbands im
 * Marktplatz: Notebook, Agents, Rezepte und eine kurze Anleitung.
 *
 * Aufgelöst wird über `getLandesverbandHubBySlug`, dasselbe Gate wie
 * `/agents/<slug>`: ein abgeschalteter Landesverband (`enabled: false`) ist
 * hier genauso „nicht verfügbar" wie dort. Zusätzlich gilt das Land — eine
 * Person mit österreichischer Einstellung sieht keinen deutschen Landesverband
 * und umgekehrt, weil seine Agents und Rezepte für sie ohnehin nicht im
 * Marktplatz stehen.
 */
function MarketplaceLandesverbandPage(): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();
  const locale: Locale = useAuthStore((s) => s.locale) === 'de-AT' ? 'de-AT' : 'de-DE';
  const resolved = getLandesverbandHubBySlug(slug, CURRENT_INSTANCE);
  const hub = resolved && resolved.audience === locale ? resolved : null;

  return (
    <PageShell wide>{hub ? <HubView hub={hub} locale={locale} /> : <NotAvailable />}</PageShell>
  );
}

function NotAvailable(): JSX.Element {
  return (
    <>
      <PageHero title="Marktplatz" />
      <GalleryEmptyState
        title="Dieser Landesverband ist nicht verfügbar"
        hint="Vielleicht ist der Link veraltet, oder die Seite gibt es hier nicht."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={MARKETPLACE_PATH}>Zum Marktplatz</Link>
          </Button>
        }
      />
    </>
  );
}

function useHubKind(kind: MarketplaceKind, hub: LvHub) {
  return useMarketplaceKind({
    kind,
    origin: 'landesverband',
    lv: hub.lvId,
    q: '',
    sort: 'empfohlen',
    scope: 'shop',
    platform: 'web',
  });
}

function HubView({ hub, locale }: { hub: LvHub; locale: Locale }): JSX.Element {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { actions, dialogs } = useMarketplaceActions();
  const agents = useHubKind('agent', hub);
  const recipes = useHubKind('recipe', hub);

  // Agents in hub order (Öffentlichkeitsarbeit, Bürger*innen, Wahlprüfsteine, …).
  const agentItems = [...agents.items].sort((a, b) => hubRank(hub, a.ref) - hubRank(hub, b.ref));
  const recipeItems = recipes.items;

  const opened = parseMarketplaceParams(params).item;
  const listed = opened
    ? ([...agentItems, ...recipeItems].find(
        (i) => i.kind === opened.kind && i.ref === opened.ref
      ) ?? null)
    : null;
  const single = useMarketplaceItem(opened, { enabled: listed === null });
  const openedItem = listed ?? single.data ?? null;

  const select = (item: MarketplaceItem) =>
    setParams(
      serializeMarketplaceParams({
        ...DEFAULT_MARKETPLACE_FILTERS,
        item: { kind: item.kind, ref: item.ref },
      })
    );
  const back = () => setParams(new URLSearchParams(), { replace: true });

  if (opened) {
    return (
      <>
        {openedItem ? (
          <MarketplaceItemDetail
            item={openedItem}
            actions={actions}
            onBack={back}
            backLabel={`Zurück zu ${hub.name}`}
            shareHref={marketplaceHref({ item: opened })}
            headingLevel={2}
          />
        ) : (
          <div className="flex flex-col gap-md">
            <Button variant="ghost" size="sm" className="self-start" onClick={back}>
              {`Zurück zu ${hub.name}`}
            </Button>
            {single.isError ? (
              <GalleryEmptyState
                title="Dieser Eintrag ist nicht verfügbar"
                hint="Vielleicht wurde er gelöscht oder ist nicht mehr öffentlich."
              />
            ) : (
              <p className="m-0 text-sm text-foreground-muted">Lädt …</p>
            )}
          </div>
        )}
        {dialogs}
      </>
    );
  }

  const notebook = getNotebookById(hub.notebookId) ?? null;
  const notebookAlias = getNotebookDefinition(hub.notebookId)?.mention.alias ?? null;
  const firstRecipeMention =
    recipeItems[0]?.kind === 'recipe' ? recipeItems[0].recipe.mention : null;

  return (
    <div className="flex flex-col gap-2xl">
      <HubHeader hub={hub} coverImage={notebook?.coverImage ?? null} />

      {notebook && (
        <section aria-label="Notebook">
          <SectionHeader title="Notebook" />
          <div className="w-full max-w-56">
            <NotebookGalleryCard
              title={notebook.title}
              meta={notebook.meta}
              icon={notebook.icon}
              {...(notebook.coverImage ? { coverImage: notebook.coverImage } : {})}
              onActivate={() => navigate(notebook.path)}
            />
          </div>
        </section>
      )}

      <ItemSection
        title="Agents"
        query={agents}
        items={agentItems}
        actions={actions}
        onSelect={select}
      />
      <ItemSection
        title="Rezepte"
        query={recipes}
        items={recipeItems}
        actions={actions}
        onSelect={select}
      />

      <HowTo
        hub={hub}
        locale={locale}
        notebookAlias={notebook ? notebookAlias : null}
        hasNotebook={notebook !== null}
        hasAgents={agentItems.length > 0}
        recipeMention={firstRecipeMention}
      />
      {dialogs}
    </div>
  );
}

const hubRank = (hub: LvHub, ref: string): number => {
  const index = (hub.agentIds as readonly string[]).indexOf(ref);
  return index === -1 ? hub.agentIds.length : index;
};

function HubHeader({ hub, coverImage }: { hub: LvHub; coverImage: string | null }): JSX.Element {
  const Icon = NOTEBOOK_ICONS[hub.notebookId];
  return (
    <div className="flex flex-col gap-md">
      <nav aria-label="Brotkrümelnavigation">
        <ol className="m-0 flex list-none flex-wrap items-center gap-xs p-0 text-sm text-foreground-muted">
          <li>
            <Link
              to={MARKETPLACE_PATH}
              className="font-semibold text-foreground-muted no-underline hover:text-primary-700 hover:underline dark:hover:text-primary-300"
            >
              Marktplatz
            </Link>
          </li>
          <li aria-hidden className="flex items-center">
            <PiCaretRight className="size-3.5" />
          </li>
          <li aria-current="page" className="text-foreground">
            {hub.name}
          </li>
        </ol>
      </nav>
      <div className="flex items-center gap-md">
        {coverImage ? (
          <img
            src={coverImage}
            alt=""
            decoding="async"
            className="size-20 shrink-0 rounded-xl border border-grey-200 object-cover sm:size-24 dark:border-grey-700"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-20 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-4xl text-primary-600 sm:size-24 dark:text-primary-300"
          >
            <Icon />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <PageHero
            title={hub.name}
            description={
              <p className="m-0 text-sm leading-relaxed text-pretty text-foreground-muted">
                {`Notebook, Agents und Rezepte von ${hub.name} an einem Ort.`}
              </p>
            }
          />
        </div>
      </div>
    </div>
  );
}

interface KindQuery {
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
}

/** One aisle of the hub; hidden once loaded and empty. */
function ItemSection({
  title,
  query,
  items,
  actions,
  onSelect,
}: {
  title: string;
  query: KindQuery;
  items: MarketplaceItem[];
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}): JSX.Element | null {
  let body: ReactNode;
  if (items.length > 0) {
    body = (
      <div className={GRID}>
        {items.map((item) => (
          <MarketplaceCard
            key={item.key}
            item={item}
            actions={actions}
            onSelect={() => onSelect(item)}
          />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = (
      <GalleryEmptyState
        title={`${title} konnten nicht geladen werden`}
        action={
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Erneut versuchen
          </Button>
        }
      />
    );
  } else if (query.isPending) {
    body = (
      <div className={GRID}>
        <GallerySkeleton count={3} className="h-[190px]" />
      </div>
    );
  } else {
    return null;
  }
  return (
    <section aria-label={title}>
      <SectionHeader title={title} />
      {body}
    </section>
  );
}

/**
 * Die Anleitung folgt der Doku (`documentation/docs/features/landesverbaende.md`)
 * und nennt nur, was die Seite wirklich zeigt: das Notebook mit seiner
 * `@`-Erwähnung aus der Registry, die Agents, ein Rezept aus der Liste.
 * Keine Zahlen, nichts über einen einzelnen Landesverband, was nicht in den
 * Daten steht.
 */
function HowTo({
  hub,
  locale,
  notebookAlias,
  hasNotebook,
  hasAgents,
  recipeMention,
}: {
  hub: LvHub;
  locale: Locale;
  notebookAlias: string | null;
  hasNotebook: boolean;
  hasAgents: boolean;
  recipeMention: string | null;
}): JSX.Element | null {
  const steps: { title: string; text: string }[] = [];
  if (hasNotebook) {
    steps.push({
      title: 'Notebook befragen',
      text: notebookAlias
        ? `Das Notebook durchsucht die offiziellen Inhalte von ${hub.name}. Öffne es oder binde es im Chat mit @${notebookAlias} als Quelle ein.`
        : `Das Notebook durchsucht die offiziellen Inhalte von ${hub.name}. Öffne es und stell deine Frage.`,
    });
  }
  if (hasAgents) {
    steps.push({
      title: 'Agent wählen',
      text: `Jeder Agent hat eine eigene Aufgabe und recherchiert automatisch im Notebook von ${hub.name}.`,
    });
  }
  if (recipeMention) {
    steps.push({
      title: 'Rezept nutzen',
      text: `Tippe im Chat eine Rezept-Abkürzung wie @${recipeMention} und direkt dahinter dein Anliegen. Das Rezept gibt dem passenden Agent gleich die richtige Aufgabe mit.`,
    });
  }
  if (steps.length === 0) return null;

  const heading =
    locale === 'de-AT'
      ? 'So nutzt du diese Inhalte'
      : 'So nutzt du die Inhalte deines Landesverbands';
  return (
    <section
      aria-labelledby="landesverband-anleitung"
      className="rounded-xl bg-background-sand px-lg py-lg dark:bg-grey-800"
    >
      <h2
        id="landesverband-anleitung"
        className="m-0 mb-md text-lg font-semibold text-foreground-heading"
      >
        {heading}
      </h2>
      <ol className="m-0 grid list-none grid-cols-1 gap-md p-0 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-sm">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white dark:bg-primary-300 dark:text-grey-900"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="m-0 text-base font-semibold text-foreground-heading">{step.title}</h3>
              <p className="m-0 text-sm leading-relaxed text-foreground-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default withAuthRequired(MarketplaceLandesverbandPage, { title: 'Marktplatz' });
