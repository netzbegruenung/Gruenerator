import { type ChatMessageMetadata } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, useColorScheme } from 'react-native';

import { saveImageToGallery } from '../../services/imageStudio';
import { colors, spacing, borderRadius } from '../../theme';

import type { Theme } from '../../theme/colors';

// Native counterpart of web's GeneratedImageDisplay. generate_image is delivered
// via message metadata (metadata.generatedImage), not as a tool call, so this
// renders from AssistantMessageComponent rather than the tool dispatcher.
type GeneratedImage = NonNullable<ChatMessageMetadata['generatedImage']>;

const STYLE_LABELS: Record<GeneratedImage['style'], string> = {
  illustration: 'Illustration',
  realistic: 'Realistisch',
  pixel: 'Pixel Art',
  'green-edit': 'Stadt begrünen',
  sharepic: 'Sharepic',
};

export function GeneratedImageDisplay({ image, theme }: { image: GeneratedImage; theme: Theme }) {
  const [zoomed, setZoomed] = useState(false);
  const [saving, setSaving] = useState(false);
  const isDark = useColorScheme() === 'dark';
  const src = image.base64 || image.url;

  if (!src) return null;

  // saveImageToGallery handles permissions, the base64→file write, the
  // MediaLibrary save and its own success/error alerts. base64 is the
  // self-contained source (url is a relative API path).
  const handleSave = async () => {
    if (!image.base64 || saving) return;
    setSaving(true);
    try {
      await saveImageToGallery(image.base64);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => setZoomed(true)}>
        <Image
          source={{ uri: src }}
          style={[styles.image, { backgroundColor: theme.surface, borderColor: theme.border }]}
          contentFit="cover"
          accessibilityLabel="Generiertes Bild"
        />
      </Pressable>

      <View style={styles.meta}>
        <View style={styles.metaLeft}>
          <View
            style={[
              styles.badge,
              { backgroundColor: isDark ? colors.primary[950] : colors.primary[100] },
            ]}
          >
            <Ionicons
              name="image-outline"
              size={11}
              color={isDark ? theme.textGreen : colors.primary[700]}
            />
            <Text
              style={[styles.badgeText, { color: isDark ? theme.textGreen : colors.primary[700] }]}
            >
              {STYLE_LABELS[image.style] ?? image.style}
            </Text>
          </View>
          {typeof image.generationTimeMs === 'number' && image.generationTimeMs > 0 && (
            <Text style={[styles.time, { color: theme.textSecondary }]}>
              {(image.generationTimeMs / 1000).toFixed(1)}s
            </Text>
          )}
        </View>

        {image.base64 && (
          <Pressable onPress={handleSave} disabled={saving} style={styles.save} hitSlop={8}>
            <Ionicons
              name={saving ? 'hourglass-outline' : 'download-outline'}
              size={14}
              color={theme.textSecondary}
            />
            <Text style={[styles.saveText, { color: theme.textSecondary }]}>
              {saving ? 'Speichern…' : 'Speichern'}
            </Text>
          </Pressable>
        )}
      </View>

      <Modal
        visible={zoomed}
        transparent
        animationType="fade"
        onRequestClose={() => setZoomed(false)}
      >
        <Pressable style={styles.lightbox} onPress={() => setZoomed(false)}>
          <Image source={{ uri: src }} style={styles.lightboxImage} contentFit="contain" />
          <View
            style={styles.closeButton}
            accessibilityLabel="Schließen"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={24} color={colors.white} />
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xsmall,
    gap: spacing.xxsmall,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    maxHeight: 320,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingVertical: 2,
  },
  saveText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  time: {
    fontSize: 11,
  },
  lightbox: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.medium,
  },
  lightboxImage: {
    width: '100%',
    height: '90%',
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    right: spacing.medium,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
