import { type SharepicVorlage } from '@gruenerator/contracts';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSharepicVorlagen } from '../../hooks/useSharepicVorlagen';
import { useTheme } from '../../hooks/useTheme';
import { secureStorage } from '../../services/storage';
import { borderRadius, colors, spacing, typography } from '../../theme';

import { SharepicVorlageSheet } from './SharepicVorlageSheet';
import { vorlageAspectRatio, vorlageThumbSource } from './vorlageThumb';

const CARD_WIDTH = 140;

/**
 * The Grünerator's own sharepic Vorlagen above the community gallery, as on
 * web. The server picks the country; renders nothing while there are none
 * (e.g. the private catalogue is not rolled out).
 */
export function SharepicVorlagenSection() {
  const theme = useTheme();
  const { data } = useSharepicVorlagen();
  const [token, setToken] = useState<string | null>(null);
  const [open, setOpen] = useState<SharepicVorlage | null>(null);

  useEffect(() => {
    void secureStorage.getToken().then(setToken);
  }, []);

  if (!data || data.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        Grünerator-Vorlagen
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Sharepics zum Kopieren und Bearbeiten — oder als Anregung für deinen Wunsch an den Chat.
      </Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={(v) => v.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        renderItem={({ item }) => {
          const slides = item.spec.slides.length;
          return (
            <Pressable
              onPress={() => setOpen(item)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={slides > 1 ? `${item.titel}, ${slides} Seiten` : item.titel}
              accessibilityHint="Zeigt die Vorlage mit allen Seiten"
            >
              <View
                style={[
                  styles.thumb,
                  {
                    height: CARD_WIDTH / vorlageAspectRatio(item),
                    backgroundColor: theme.surface,
                  },
                ]}
              >
                {token ? (
                  <Image
                    source={vorlageThumbSource(item.id, 1, token)}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                  />
                ) : null}
                {slides > 1 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{slides} Seiten</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={2}>
                {item.titel}
              </Text>
            </Pressable>
          );
        }}
      />
      <SharepicVorlageSheet vorlage={open} token={token} onClose={() => setOpen(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.large,
  },
  title: {
    ...typography.h4,
  },
  subtitle: {
    ...typography.caption,
    marginTop: spacing.xxsmall,
    marginBottom: spacing.small,
  },
  row: {
    gap: spacing.small,
  },
  card: {
    width: CARD_WIDTH,
  },
  pressed: {
    opacity: 0.8,
  },
  thumb: {
    width: CARD_WIDTH,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: spacing.xxsmall,
    right: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(15, 18, 16, 0.6)',
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    color: colors.white,
    fontWeight: '600',
  },
  cardTitle: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: spacing.xxsmall,
  },
});
