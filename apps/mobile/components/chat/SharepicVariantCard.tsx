import {
  useAgentStore,
  useSharepicLiveStore,
  type SharepicData,
  type SharepicVariant,
} from '@gruenerator/chat';
import { getContractsClient } from '@gruenerator/shared/api';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSharepicPreview } from '../../hooks/useSharepicPreview';
import { saveImageToGallery } from '../../services/imageStudio';
import { shareBase64Image } from '../../services/share';
import { BODY_FONT, borderRadius, chatType, colors, spacing } from '../../theme';

import type { Theme } from '../../theme/colors';

/**
 * A sharepic in the chat.
 *
 * The picture is not in the stream: the app renders it through the hidden
 * WebView (`useSharepicPreview`). That takes seconds on a cold start and can
 * fail, so the card has three states and says which one it is in — a silent
 * empty frame was the failure mode this whole path exists to avoid.
 *
 * Deck variants (`pages`) are shown as a single first-slide preview for now;
 * the carousel is web-only until the renderer handles multi-page.
 */
export function SharepicVariantCard({ data, theme }: { data: SharepicData; theme: Theme }) {
  const [selected, setSelected] = useState(0);
  const variants = data.variants;
  const variant = variants[selected];

  if (variant === undefined) return null;

  return (
    <View style={styles.wrap}>
      <SharepicHero variant={variant} theme={theme} />
      {variants.length > 1 && (
        <View style={styles.chips}>
          {variants.map((entry, index) => (
            <Pressable
              key={entry.id}
              onPress={() => setSelected(index)}
              style={[
                styles.chip,
                {
                  backgroundColor: index === selected ? colors.primary[600] : theme.surface,
                  borderColor: index === selected ? colors.primary[600] : theme.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: index === selected }}
              accessibilityLabel={entry.label ?? `Variante ${index + 1}`}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: index === selected ? colors.white : theme.textSecondary },
                ]}
              >
                {entry.label ?? `Variante ${index + 1}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function SharepicHero({ variant, theme }: { variant: SharepicVariant; theme: Theme }) {
  const router = useRouter();
  const { image, status } = useSharepicPreview(variant);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const liveCanvasId = useSharepicLiveStore((state) => state.entries[variant.id]?.canvasId);
  const canvasId = liveCanvasId ?? variant.canvasId ?? null;

  const handleSave = useCallback(async () => {
    if (image === null || saving) return;
    setSaving(true);
    try {
      // Handles permissions, the file write, the gallery save and its own
      // alerts — including the way back into the gallery.
      await saveImageToGallery(image);
    } finally {
      setSaving(false);
    }
  }, [image, saving]);

  const handleOpenStudio = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    try {
      let id = canvasId;
      if (id === null) {
        // A chat sharepic has no canvas until someone wants to edit it. The
        // endpoint is idempotent per (thread, variant), so a second tap
        // returns the same document rather than a duplicate.
        // Read at tap time, not at render: the first turn of a new chat
        // creates the thread after this card has already mounted.
        const threadId = useAgentStore.getState().currentThreadId;
        if (threadId === null || threadId === undefined || threadId.length === 0) {
          Alert.alert('Nicht möglich', 'Dieses Sharepic gehört zu keinem gespeicherten Chat.');
          return;
        }
        const result = await getContractsClient().canvas.fromVariant({
          body: {
            canvasType: variant.canvasType,
            initialProps: variant.initialProps,
            threadId,
            variantId: variant.id,
          },
        });
        if (result.status !== 201) {
          Alert.alert('Fehler', 'Das Sharepic konnte nicht im Studio geöffnet werden.');
          return;
        }
        id = result.body.canvasId;
        useSharepicLiveStore
          .getState()
          .upsertEntry(variant.id, { canvasId: id, canvasType: variant.canvasType });
      }
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/studio/canvas/${id}`, title: 'Sharepic' },
      });
    } catch (error: unknown) {
      console.warn('[SharepicVariantCard] open in studio failed:', error);
      Alert.alert('Fehler', 'Das Sharepic konnte nicht im Studio geöffnet werden.');
    } finally {
      setOpening(false);
    }
  }, [canvasId, opening, router, variant]);

  return (
    <View style={styles.hero}>
      <View
        style={[styles.frame, { backgroundColor: theme.surface, borderColor: theme.border }]}
        accessible
        accessibilityLabel={variant.altText ?? 'Sharepic'}
      >
        {status === 'ready' && image !== null ? (
          <Image source={{ uri: image }} style={styles.image} contentFit="contain" />
        ) : status === 'rendering' ? (
          <View style={styles.placeholder}>
            <ActivityIndicator color={colors.primary[600]} />
            <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
              Sharepic wird gezeichnet …
            </Text>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={28} color={theme.textSecondary} />
            <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
              Keine Vorschau verfügbar
            </Text>
            <Text style={[styles.placeholderHint, { color: theme.textSecondary }]}>
              Im Studio öffnen, um es zu sehen und zu bearbeiten.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => void handleOpenStudio()}
          disabled={opening}
          style={styles.action}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ disabled: opening }}
        >
          <Ionicons
            name={opening ? 'hourglass-outline' : 'create-outline'}
            size={14}
            color={theme.textSecondary}
          />
          <Text style={[styles.actionText, { color: theme.textSecondary }]}>
            {opening ? 'Öffnen…' : 'Im Studio öffnen'}
          </Text>
        </Pressable>

        {image !== null && (
          <>
            <Pressable
              onPress={() => void shareBase64Image(image, 'Sharepic teilen')}
              style={styles.action}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Ionicons name="share-outline" size={14} color={theme.textSecondary} />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>Teilen</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSave()}
              disabled={saving}
              style={styles.action}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving }}
            >
              <Ionicons
                name={saving ? 'hourglass-outline' : 'download-outline'}
                size={14}
                color={theme.textSecondary}
              />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                {saving ? 'Speichern…' : 'Speichern'}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xsmall, gap: spacing.xsmall },
  hero: { gap: spacing.xxsmall },
  frame: {
    width: '100%',
    aspectRatio: 4 / 5,
    maxHeight: 380,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    padding: spacing.medium,
  },
  placeholderText: { ...chatType.chatMicro, fontWeight: '600', textAlign: 'center' },
  placeholderHint: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    flexWrap: 'wrap',
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: 2,
  },
  actionText: { ...chatType.chatMicro, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxsmall },
  chip: {
    paddingHorizontal: spacing.small,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: { ...chatType.chatMicro, fontWeight: '600' },
});
