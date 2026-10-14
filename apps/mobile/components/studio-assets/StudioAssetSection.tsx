import { type StudioAssetItem } from '@gruenerator/contracts';
import { type StudioAssetSectionData } from '@gruenerator/shared/studio-assets';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { spacing, typography } from '../../theme';
import { Button } from '../common/Button';

import { StudioAssetTile, type StudioAssetAction } from './StudioAssetTile';

export const TILE_GAP = spacing.small;

/** One section „Sticker“ or „Hintergründe“ — the same heading as on web. */
export function StudioAssetSection({
  title,
  data,
  tileSize,
  token,
  onAction,
}: {
  title: string;
  data: StudioAssetSectionData;
  tileSize: number;
  token: string | null;
  onAction: (action: StudioAssetAction, item: StudioAssetItem) => void;
}) {
  const theme = useTheme();
  return (
    <View accessibilityLabel={title} style={styles.section}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {title}
      </Text>
      {data.isLoading ? (
        <ActivityIndicator color={theme.textGreen} style={styles.loading} />
      ) : (
        <View style={styles.grid}>
          {data.items.map((item) => (
            <StudioAssetTile
              key={item.id}
              item={item}
              size={tileSize}
              token={token}
              onAction={onAction}
            />
          ))}
        </View>
      )}
      {data.error && data.items.length > 0 ? (
        <View accessibilityRole="alert" style={styles.message}>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>{data.error.message}</Text>
          <Button variant="outline" onPress={data.retry} disabled={data.isFetchingNextPage}>
            Erneut versuchen
          </Button>
        </View>
      ) : data.hasNextPage ? (
        <Button
          variant="outline"
          onPress={data.fetchNextPage}
          loading={data.isFetchingNextPage}
          disabled={data.isFetchingNextPage}
        >
          Mehr laden
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.small },
  title: { ...typography.h4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  loading: { alignSelf: 'flex-start', paddingVertical: spacing.medium },
  message: { gap: spacing.small, alignItems: 'center' },
  hint: { ...typography.body, textAlign: 'center' },
});
