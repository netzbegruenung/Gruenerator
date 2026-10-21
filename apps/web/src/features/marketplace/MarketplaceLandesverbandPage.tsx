import { type MarketplaceItem, type MarketplaceKind } from '@gruenerator/contracts';
import { getLandesverbandHubBySlug, type LvHub } from '@gruenerator/shared/agents';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  LANDESVERBAND_COVERS,
  MARKETPLACE_PATH,
  marketplaceHref,
  parseMarketplaceParams,
  serializeMarketplaceParams,
  useMarketplaceItem,
  useMarketplaceKind,
} from '@gruenerator/shared/marketplace';
import { Button, SectionHeader, ShowcaseCardImage, ShowcaseMedia } from '@gruenerator/ui';
import { type JSX, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { GalleryEmptyState, GallerySkeleton } from '../../components/common/Gallery/parts';
import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import { PageHero, PageShell } from '../../components/common/PageHero';
import { getNotebookById } from '../notebook/config/notebooksConfig';

import { lvBannerImage } from './landesverbandCovers';
import { MarketplaceItemDetail } from './MarketplaceItemDetail';
import {
  DISPLAY_FONT,
  MarketplaceShowcaseCard,
  SHOWCASE_GRID,
  showcaseToneAt,
} from './MarketplaceShowcaseCard';
import { useMarketplaceActions, type MarketplaceActions } from './useMarketplaceActions';

import { CURRENT_INSTANCE } from '@/config/instance';
import { useAuthStore } from '@/stores/authStore';

type Locale = 'de-DE' | 'de-AT';

/**
 * `/marktplatz/landesverband/<slug>` — die Seite eines Landesverbands im
 * Marktplatz: Agents, Rezepte und der Weg ins Notebook.
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

  return <PageShell wide>{hub ? <HubView hub={hub} /> : <NotAvailable />}</PageShell>;
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

function HubView({ hub }: { hub: LvHub }): JSX.Element {
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
            backLabel={hub.name}
            shareHref={marketplaceHref({ item: opened })}
            headingLevel={2}
            onSelect={select}
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

  return (
    <div className="flex flex-col gap-2xl">
      <HubHeader hub={hub} notebookPath={notebook?.path ?? null} />

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

      {dialogs}
    </div>
  );
}

const hubRank = (hub: LvHub, ref: string): number => {
  const index = (hub.agentIds as readonly string[]).indexOf(ref);
  return index === -1 ? hub.agentIds.length : index;
};

function HubHeader({
  hub,
  notebookPath,
}: {
  hub: LvHub;
  notebookPath: string | null;
}): JSX.Element {
  const cover = LANDESVERBAND_COVERS[hub.lvId];
  return (
    <div className="flex flex-col gap-xl">
      {/* Without a breadcrumb the photo opens the page: its top edge sits as far
          from the top as the page edge from the side. */}
      <ShowcaseMedia
        tone="tanne"
        className="aspect-[2/1] sm:aspect-[3/1] w-full rounded-2xl md:-mt-4"
      >
        <ShowcaseCardImage
          {...lvBannerImage(cover)}
          alt={cover.alt}
          credit={cover.credit && { ...cover.credit, source: 'Unsplash' }}
          loading="eager"
          fetchPriority="high"
        />
      </ShowcaseMedia>
      <header className="flex max-w-[42rem] flex-col gap-xs">
        <span className="text-sm font-semibold tracking-[0.06em] text-primary-700 uppercase dark:text-primary-300">
          Landesverband
        </span>
        <h1
          className="m-0 text-[clamp(2rem,4.5vw,3rem)] leading-[1.05] font-bold tracking-[-0.02em] text-balance text-foreground-heading"
          style={{ fontFamily: DISPLAY_FONT }}
        >
          {hub.name}
        </h1>
        <p className="m-0 text-base leading-relaxed text-foreground-muted sm:text-lg">
          {`Agents und Rezepte von ${hub.name} an einem Ort.`}
          {notebookPath && (
            <>
              {' '}
              <Link
                to={notebookPath}
                className="font-semibold whitespace-nowrap text-primary-700 underline-offset-4 hover:underline dark:text-primary-300"
              >
                Zum Notebook
              </Link>
            </>
          )}
        </p>
      </header>
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
      <div className={SHOWCASE_GRID}>
        {items.map((item, index) => (
          <MarketplaceShowcaseCard
            key={item.key}
            item={item}
            tone={showcaseToneAt(index)}
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
      <div className={SHOWCASE_GRID}>
        <GallerySkeleton count={4} className="h-[190px]" />
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

export default withAuthRequired(MarketplaceLandesverbandPage, { title: 'Marktplatz' });
