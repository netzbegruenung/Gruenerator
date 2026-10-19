import { type MarketplaceItem } from '@gruenerator/contracts';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import {
  BODY_FONT,
  HEADING_FONT_BOLD,
  HEADING_FONT_SEMIBOLD,
  borderRadius,
  spacing,
} from '../../theme';
import { AgentGlyph } from '../agentura/AgentGlyph';
import { Button } from '../common/Button';

import { kindView, marketplaceCardProps } from './kindViews';
import { MarketplaceDiscussion } from './MarketplaceDiscussion';
import { type MarketplaceActions } from './useMarketplaceActions';

/**
 * One Marktplatz item up close, in place of the list (the Agentura's short
 * view, for every kind): what it is, the ways on — keep it, try it, open it —
 * and the interaction block every kind shares (like, share, report,
 * reactions, comments).
 */
export function MarketplaceItemDetail({
  item,
  token,
  actions,
  onBack,
  shareUrl,
  allowReport,
}: {
  item: MarketplaceItem;
  token: string | null;
  actions: MarketplaceActions;
  onBack: () => void;
  /** Where „Teilen" points: the web Marktplatz with this item open. */
  shareUrl: string;
  /** Off inside a sheet: the report form would be a modal over the modal. */
  allowReport: boolean;
}) {
  const theme = useTheme();
  const card = marketplaceCardProps(item, token);
  const view = kindView(item.kind);
  const library = view.toggle === 'library';
  const { DetailExtras } = view;
  const large = item.kind === 'template' || item.kind === 'background' || item.kind === 'sticker';

  return (
    <ScrollView
      contentContainerStyle={styles.detail}
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={styles.back}>
        <Ionicons name="arrow-back" size={16} color={theme.textSecondary} />
        <Text style={[styles.backText, { color: theme.textSecondary }]}>Zurück zum Marktplatz</Text>
      </Pressable>

      {DetailExtras ? (
        <DetailExtras item={item} />
      ) : large && card.image ? (
        <View style={[styles.preview, { backgroundColor: theme.backgroundAlt }]}>
          <Image
            source={card.image}
            contentFit={card.imageFit === 'contain' ? 'contain' : 'cover'}
            style={card.imageFit === 'contain' ? styles.previewContain : StyleSheet.absoluteFill}
            accessibilityIgnoresInvertColors
          />
        </View>
      ) : null}

      <View style={styles.header}>
        {large ? null : (
          <View style={[styles.icon, { backgroundColor: theme.backgroundAlt }]}>
            <AgentGlyph iconKey={card.iconKey} size={28} color={theme.text} />
          </View>
        )}
        <View style={styles.titles}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {card.title}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{card.meta}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {card.added !== null ? (
          <Button
            variant={card.added ? 'outline' : 'primary'}
            onPress={() => actions.toggleSave(item)}
          >
            {library
              ? card.added
                ? 'In meinen Grüneratoren'
                : 'Zu meinen Grüneratoren'
              : card.added
                ? 'Gemerkt'
                : 'Merken'}
          </Button>
        ) : null}
        {item.kind === 'agent' || item.kind === 'recipe' ? (
          <>
            <Button variant="ghost" onPress={() => actions.startChat(item)}>
              Im Chat ausprobieren
            </Button>
            <Button variant="ghost" onPress={() => actions.open(item)}>
              Alle Details
            </Button>
          </>
        ) : item.kind === 'template' ? (
          <Button variant="ghost" onPress={() => actions.open(item)}>
            Vorlage öffnen
          </Button>
        ) : item.kind === 'notebook' ? (
          <Button variant="ghost" onPress={() => actions.open(item)}>
            Notebook öffnen
          </Button>
        ) : (
          <Button variant="ghost" onPress={() => actions.toProfilbild(item)}>
            Im Profilbild verwenden
          </Button>
        )}
      </View>

      {card.description ? (
        <Text style={[styles.body, { color: theme.text }]}>{card.description}</Text>
      ) : null}

      <MarketplaceDiscussion
        target={{ kind: item.kind, ref: item.ref }}
        item={item}
        canModerate={item.isOwn}
        shareUrl={shareUrl}
        allowReport={allowReport}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  detail: {
    gap: spacing.large,
    paddingTop: spacing.small,
    paddingBottom: spacing.xlarge,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: HEADING_FONT_SEMIBOLD,
    fontSize: 14,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.large,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContain: { width: '80%', height: '80%' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.medium,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titles: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: HEADING_FONT_BOLD,
    fontSize: 22,
    lineHeight: 27,
  },
  meta: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    gap: spacing.small,
  },
  body: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    lineHeight: 24,
  },
});
