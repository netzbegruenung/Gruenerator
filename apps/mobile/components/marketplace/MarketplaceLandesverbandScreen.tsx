import { useUserProfileStore } from '@gruenerator/chat/stores';
import { type MarketplaceItem, type MarketplaceKind } from '@gruenerator/contracts';
import { getLandesverbandHubBySlug, type LvHub } from '@gruenerator/shared/agents';
import {
  LANDESVERBAND_COVERS,
  landesverbandBannerPath,
  sortByHubOrder,
  useMarketplaceItem,
  useMarketplaceKind,
  type MarketplaceTarget,
} from '@gruenerator/shared/marketplace';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getLandesverbandPhotoByFile } from '../../config/landesverbandPhotos';
import { MOBILE_SYSTEM_NOTEBOOKS } from '../../config/notebooksConfig';
import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, spacing } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';
import { routeWithParams } from '../../types/routes';
import { Button } from '../common/Button';
import { SkeletonRows } from '../common/Skeleton';
import { useShareToken } from '../studio-assets/useShareToken';

import { MarketplaceItemDetail } from './MarketplaceItemDetail';
import { marketplaceRoute, marketplaceShareUrl } from './marketplaceTarget';
import {
  DISPLAY_FONT,
  ItemShowcaseCard,
  Shelf,
  creditLine,
  showcaseToneAt,
  webImage,
} from './showcase';
import { useMarketplaceActions } from './useMarketplaceActions';

/**
 * `/marktplatz/landesverband/<slug>` (web: `MarketplaceLandesverbandPage`) —
 * a Landesverband's page in the Marktplatz: its Agents, its Rezepte and the
 * way into its Notebook. Resolved through `getLandesverbandHubBySlug`, the
 * same gate as the web; the country applies too, so an Austrian setting sees
 * no German Landesverband and the other way round.
 */
export function MarketplaceLandesverbandScreen({ slug }: { slug: string }) {
  const theme = useTheme();
  const locale = useUserProfileStore((s) => s.locale) === 'de-AT' ? 'de-AT' : 'de-DE';
  const resolved = getLandesverbandHubBySlug(slug);
  const hub = resolved && resolved.audience === locale ? resolved : null;
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.column}>{hub ? <HubView hub={hub} /> : <NotAvailable />}</View>
    </View>
  );
}

function NotAvailable() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <View style={styles.note}>
      <Ionicons name="storefront-outline" size={40} color={theme.textSecondary} />
      <Text style={[styles.noteTitle, { color: theme.text }]}>
        Dieser Landesverband ist nicht verfügbar
      </Text>
      <Text style={[styles.noteText, { color: theme.textSecondary }]}>
        Vielleicht ist der Link veraltet, oder die Seite gibt es hier nicht.
      </Text>
      <Button variant="outline" onPress={() => router.replace(marketplaceRoute())}>
        Zum Marktplatz
      </Button>
    </View>
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
    platform: 'mobile',
  });
}

function HubView({ hub }: { hub: LvHub }) {
  const theme = useTheme();
  const router = useRouter();
  const token = useShareToken();
  const actions = useMarketplaceActions();
  const agents = useHubKind('agent', hub);
  const recipes = useHubKind('recipe', hub);
  const agentItems = sortByHubOrder(hub, agents.items);
  const recipeItems = recipes.items;
  const [opened, setOpened] = useState<MarketplaceTarget | null>(null);

  const listed = opened
    ? ([...agentItems, ...recipeItems].find(
        (i) => i.kind === opened.kind && i.ref === opened.ref
      ) ?? null)
    : null;
  const single = useMarketplaceItem(opened, { platform: 'mobile', enabled: listed === null });
  const current = listed ?? single.data ?? null;
  const select = (item: MarketplaceItem) => setOpened({ kind: item.kind, ref: item.ref });

  if (opened) {
    return current ? (
      <MarketplaceItemDetail
        item={current}
        token={token}
        actions={actions}
        onBack={() => setOpened(null)}
        backLabel={hub.name}
        shareUrl={marketplaceShareUrl({ item: opened })}
        allowReport
        onSelect={select}
      />
    ) : (
      <SkeletonRows count={3} leading={40} on="card" style={styles.loading} />
    );
  }

  const cover = LANDESVERBAND_COVERS[hub.lvId];
  const notebook = MOBILE_SYSTEM_NOTEBOOKS.find((nb) => nb.id === hub.notebookId) ?? null;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.banner}>
        <Image
          source={webImage(landesverbandBannerPath(cover, 1200))}
          // The bundled photo stands in until the banner cut has loaded.
          placeholder={getLandesverbandPhotoByFile(cover.file)}
          placeholderContentFit="cover"
          contentFit="cover"
          style={StyleSheet.absoluteFill}
          accessibilityLabel={cover.alt}
          priority="high"
        />
        {cover.credit ? (
          <Text style={styles.credit} numberOfLines={1}>
            {creditLine(cover.credit)}
          </Text>
        ) : null}
      </View>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: theme.textGreen }]}>LANDESVERBAND</Text>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {hub.name}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {`Agents und Rezepte von ${hub.name} an einem Ort.`}
        </Text>
        {notebook ? (
          <Pressable
            onPress={() =>
              router.push(
                routeWithParams('/notebook/[id]', { id: notebook.id, title: notebook.title })
              )
            }
            accessibilityRole="link"
            hitSlop={8}
            style={styles.notebookLink}
          >
            <Text style={[styles.notebookText, { color: theme.textGreen }]}>Zum Notebook</Text>
            <Ionicons name="chevron-forward" size={14} color={theme.textGreen} />
          </Pressable>
        ) : null}
      </View>
      <ItemSection
        title="Agents"
        query={agents}
        items={agentItems}
        token={token}
        onSelect={select}
      />
      <ItemSection
        title="Rezepte"
        query={recipes}
        items={recipeItems}
        token={token}
        onSelect={select}
      />
    </ScrollView>
  );
}

/** One aisle of the hub; hidden once loaded and empty. */
function ItemSection({
  title,
  query,
  items,
  token,
  onSelect,
}: {
  title: string;
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  items: MarketplaceItem[];
  token: string | null;
  onSelect: (item: MarketplaceItem) => void;
}) {
  const theme = useTheme();
  let body;
  if (items.length > 0) {
    body = (
      <View style={styles.stack}>
        {items.map((item, index) => (
          <ItemShowcaseCard
            key={item.key}
            item={item}
            tone={showcaseToneAt(index)}
            token={token}
            onPress={() => onSelect(item)}
          />
        ))}
      </View>
    );
  } else if (query.isError) {
    body = (
      <View style={styles.note}>
        <Text style={[styles.noteText, { color: theme.textSecondary }]}>
          {`${title} konnten nicht geladen werden.`}
        </Text>
        <Button variant="outline" onPress={() => void query.refetch()}>
          Erneut versuchen
        </Button>
      </View>
    );
  } else if (query.isPending) {
    body = <SkeletonRows count={3} leading={40} on="card" />;
  } else {
    return null;
  }
  return (
    <Shelf title={title} large>
      {body}
    </Shelf>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.xsmall,
  },
  content: { gap: spacing.xlarge, paddingTop: spacing.small, paddingBottom: spacing.xxlarge },
  stack: { gap: spacing.small },
  loading: { paddingTop: spacing.medium },
  banner: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  credit: {
    position: 'absolute',
    right: spacing.xsmall,
    bottom: spacing.xsmall,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontFamily: BODY_FONT,
    fontSize: 10.5,
    color: '#FFFFFF',
  },
  header: { gap: spacing.xsmall },
  kicker: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700', letterSpacing: 0.8 },
  title: { fontFamily: DISPLAY_FONT, fontSize: 32, lineHeight: 34, letterSpacing: -0.6 },
  description: { fontFamily: BODY_FONT, fontSize: 16, lineHeight: 24 },
  notebookLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  notebookText: { fontFamily: BODY_FONT, fontSize: 16, fontWeight: '700' },
  note: {
    alignItems: 'center',
    gap: spacing.medium,
    paddingVertical: spacing.xxlarge,
    paddingHorizontal: spacing.large,
  },
  noteTitle: { fontFamily: BODY_FONT, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  noteText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
