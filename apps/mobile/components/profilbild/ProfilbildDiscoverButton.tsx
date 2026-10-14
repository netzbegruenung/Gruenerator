import { type StudioAssetItem, type StudioAssetKind } from '@gruenerator/contracts';
import { STUDIO_ASSET_PLURAL, useDebouncedSearch } from '@gruenerator/shared/studio-assets';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { HEADING_FONT_BOLD, spacing, typography } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { StudioAssetSearchField } from '../studio-assets/StudioAssetParts';

import { ActionTile, GalleryTiles } from './GalleryTiles';

/**
 * Tile „Entdecken“ at the end of a picker row: opens what others share as a
 * sheet. A choice closes it.
 */
export function ProfilbildDiscoverButton({
  kind,
  size,
  onPick,
}: {
  kind: StudioAssetKind;
  size?: number;
  onPick(item: StudioAssetItem): void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const plural = STUDIO_ASSET_PLURAL[kind];
  return (
    <>
      <ActionTile label={`${plural} entdecken`} size={size} onPress={() => setOpen(true)}>
        <Ionicons name="storefront-outline" size={22} color={theme.textSecondary} />
      </ActionTile>
      <BottomSheet visible={open} onClose={() => setOpen(false)} padded keyboardAvoiding>
        {open ? (
          <Discover
            kind={kind}
            onPick={(item) => {
              setOpen(false);
              onPick(item);
            }}
          />
        ) : null}
      </BottomSheet>
    </>
  );
}

/** Mounted only while the sheet is open, so every visit starts without a search. */
function Discover({
  kind,
  onPick,
}: {
  kind: StudioAssetKind;
  onPick(item: StudioAssetItem): void;
}) {
  const theme = useTheme();
  const [searchInput, setSearchInput] = useState('');
  const q = useDebouncedSearch(searchInput);
  const plural = STUDIO_ASSET_PLURAL[kind];
  return (
    <View style={styles.root}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
        {`${plural} entdecken`}
      </Text>
      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Was andere öffentlich teilen. Tippe ein Bild an, um es zu verwenden.
      </Text>
      <View style={styles.searchRow}>
        <StudioAssetSearchField
          value={searchInput}
          onChange={setSearchInput}
          placeholder={`${plural} durchsuchen…`}
        />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
        <GalleryTiles
          kind={kind}
          source="shop"
          q={q}
          onPick={onPick}
          emptyHint={q ? 'Nichts gefunden.' : `Noch keine ${plural} zum Entdecken.`}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.small, flexShrink: 1 },
  title: { fontFamily: HEADING_FONT_BOLD, fontSize: 20 },
  description: { ...typography.caption },
  searchRow: { flexDirection: 'row' },
  list: { paddingBottom: spacing.medium },
});
