import {
  MARKETPLACE_KINDS,
  type MarketplaceItem,
  type MarketplaceKind,
} from '@gruenerator/contracts';
import {
  DEFAULT_MARKETPLACE_FILTERS,
  type MarketplaceTabSlug,
} from '@gruenerator/shared/marketplace';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { spacing } from '../../theme';
import { BottomSheet } from '../common/BottomSheet';
import { SHEET_HANDOFF_MS } from '../common/CreateMenuSheet';

import { MarketplaceBrowser } from './MarketplaceBrowser';

/**
 * The Marktplatz as a sheet over a page (web: `MarketplaceDialog`), limited to
 * the kinds that page deals in. With `onPick` it is a picker: a tap hands the
 * item back and closes the sheet. Every opening starts fresh, with the search
 * the page hands in.
 */
export function MarketplaceSheet({
  visible,
  onClose,
  kinds = MARKETPLACE_KINDS,
  initialTab = 'alle',
  initialQuery = '',
  onPick,
  title = 'Marktplatz',
  description,
}: {
  visible: boolean;
  onClose: () => void;
  kinds?: readonly MarketplaceKind[];
  initialTab?: MarketplaceTabSlug;
  initialQuery?: string;
  onPick?: (item: MarketplaceItem) => void;
  title?: string;
  description?: string;
}) {
  const { height } = useWindowDimensions();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  // A new key per opening: search, tab and short view start over.
  const [session, setSession] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setSession((s) => s + 1);
  }

  // Detail pages and chats slide in under the sheet once it is gone.
  const leaveFor = (run: () => void) => {
    onClose();
    timer.current = setTimeout(run, SHEET_HANDOFF_MS);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="92%">
      <View style={[styles.body, { height: height * 0.85 }]}>
        <MarketplaceBrowser
          key={session}
          initialFilters={{ ...DEFAULT_MARKETPLACE_FILTERS, tab: initialTab, q: initialQuery }}
          kinds={kinds}
          navigate={leaveFor}
          title={title}
          description={description}
          inSheet
          onPick={
            onPick
              ? (item) => {
                  onClose();
                  onPick(item);
                }
              : undefined
          }
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.medium,
  },
});
