import { type SharepicVorlagenSuggestions } from '@gruenerator/contracts';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { memo, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { resolveChatUrl } from '../../../services/chatApiUrl';
import { secureStorage } from '../../../services/storage';
import { borderRadius, chatType, spacing } from '../../../theme';

import type { Theme } from '../../../theme/colors';

const TILE_WIDTH = 140;

/**
 * The gallery `vorlagen_vorschlagen` sends — web's `VorlagenSuggestionsSection`.
 * A tap opens the copy in the web viewer, like `SharepicVorlageSheet`; the post
 * itself stays behind, because the viewer does not share the chat's session
 * storage the web handoff rides on.
 */
export const VorlagenSuggestionsSection = memo(function VorlagenSuggestionsSection({
  data,
  theme,
}: {
  data: SharepicVorlagenSuggestions;
  theme: Theme;
}) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    void secureStorage.getToken().then(setToken);
  }, []);

  return (
    <View style={styles.container}>
      <Text style={[styles.heading, { color: theme.text }]}>
        Diese Design-Optionen passen zu deinem Beitrag
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {data.vorlagen.map((v) => (
          <Pressable
            key={v.id}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel={`${v.titel}: Kopie bearbeiten`}
            onPress={() =>
              router.push({
                pathname: '/(fullscreen)/web-viewer',
                params: { path: `/studio/vorlage/${v.id}`, title: v.titel },
              })
            }
          >
            <View
              style={[
                styles.thumb,
                {
                  aspectRatio: v.format === 'post-portrait-tall' ? 3 / 4 : 4 / 5,
                  backgroundColor: theme.surface,
                },
              ]}
            >
              {token && (
                <Image
                  source={{
                    uri: resolveChatUrl(v.thumbUrl),
                    headers: { Authorization: `Bearer ${token}` },
                  }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              )}
            </View>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
              {v.titel}
            </Text>
            <Text style={[styles.grund, { color: theme.textSecondary }]} numberOfLines={3}>
              {v.grund}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginVertical: spacing.small, gap: spacing.xsmall },
  heading: { ...chatType.chatSecondary, fontWeight: '600' },
  row: { gap: spacing.small },
  tile: { width: TILE_WIDTH, gap: 4 },
  thumb: { width: '100%', borderRadius: borderRadius.medium, overflow: 'hidden' },
  title: { ...chatType.chatSecondary, fontWeight: '600' },
  grund: { ...chatType.chatSecondary },
});
