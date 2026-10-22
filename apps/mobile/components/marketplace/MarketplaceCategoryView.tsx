import { type MarketplaceItem, type MarketplaceKind } from '@gruenerator/contracts';
import {
  DEFAULT_MARKETPLACE_SORT,
  categoryById,
  getMarketplaceTab,
  tabForKind,
  useMarketplaceKind,
  type MarketplaceCategoryId,
} from '@gruenerator/shared/marketplace';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { BODY_FONT, spacing } from '../../theme';
import { Button } from '../common/Button';
import { SkeletonRows } from '../common/Skeleton';

import { marketplaceCardProps } from './kindViews';
import { MarketCard } from './MarketCard';
import { DISPLAY_FONT, ItemShowcaseCard, Shelf, showcaseToneAt } from './showcase';
import { type MarketplaceActions } from './useMarketplaceActions';

const isVisual = (kind: MarketplaceKind) =>
  kind === 'template' || kind === 'sticker' || kind === 'background';

/**
 * One category opened (`?kategorie=<id>`, web: `MarketplaceCategoryView`):
 * the title, then every kind of the category as its own aisle of cards. The
 * photo belongs to the tile on the front page.
 */
export function MarketplaceCategoryView({
  id,
  token,
  actions,
  onSelect,
}: {
  id: MarketplaceCategoryId;
  token: string | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}) {
  const theme = useTheme();
  const category = categoryById(id);
  if (!category) return null;
  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: theme.textGreen }]}>
          {category.kicker.toUpperCase()}
        </Text>
        <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
          {category.title}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {category.description}
        </Text>
      </View>
      {category.kinds.map((kind) => (
        <KindAisle
          key={kind}
          kind={kind}
          // One kind needs no heading of its own: the page title already says it.
          titled={category.kinds.length > 1}
          token={token}
          actions={actions}
          onSelect={onSelect}
        />
      ))}
    </ScrollView>
  );
}

function KindAisle({
  kind,
  titled,
  token,
  actions,
  onSelect,
}: {
  kind: MarketplaceKind;
  titled: boolean;
  token: string | null;
  actions: MarketplaceActions;
  onSelect: (item: MarketplaceItem) => void;
}) {
  const theme = useTheme();
  const tab = tabForKind(kind);
  const query = useMarketplaceKind({
    kind,
    origin: null,
    q: '',
    sort: DEFAULT_MARKETPLACE_SORT,
    scope: 'shop',
    platform: 'mobile',
  });

  let body;
  if (query.items.length > 0) {
    body = (
      <View style={styles.stack}>
        {query.items.map((item, index) =>
          item.kind === 'agent' || item.kind === 'recipe' || isVisual(item.kind) ? (
            <ItemShowcaseCard
              key={item.key}
              item={item}
              tone={showcaseToneAt(index)}
              token={token}
              visual={isVisual(item.kind)}
              onPress={() => onSelect(item)}
            />
          ) : (
            <MarketCard
              key={item.key}
              {...marketplaceCardProps(item, token)}
              onPress={() => onSelect(item)}
              onToggleAdded={() => actions.toggleSave(item)}
            />
          )
        )}
        {query.hasNextPage ? (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onPress={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Lädt …' : 'Mehr anzeigen'}
          </Button>
        ) : null}
      </View>
    );
  } else if (query.isError) {
    body = (
      <View style={styles.note}>
        <Text style={[styles.noteText, { color: theme.textSecondary }]}>
          {`${tab.label} konnten nicht geladen werden.`}
        </Text>
        <Button variant="outline" onPress={() => void query.refetch()}>
          Erneut versuchen
        </Button>
      </View>
    );
  } else if (query.isPending) {
    body = <SkeletonRows count={3} leading={40} on="card" />;
  } else {
    body = (
      <Text style={[styles.noteText, { color: theme.textSecondary }]}>
        {getMarketplaceTab(tab.slug).emptyText}
      </Text>
    );
  }

  return titled ? (
    <Shelf title={tab.label} large>
      {body}
    </Shelf>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xlarge, paddingTop: spacing.medium, paddingBottom: spacing.xxlarge },
  stack: { gap: spacing.small },
  header: { gap: spacing.xsmall },
  kicker: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700', letterSpacing: 0.8 },
  title: { fontFamily: DISPLAY_FONT, fontSize: 32, lineHeight: 34, letterSpacing: -0.6 },
  description: { fontFamily: BODY_FONT, fontSize: 16, lineHeight: 24 },
  note: { alignItems: 'center', gap: spacing.medium, paddingVertical: spacing.large },
  noteText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
