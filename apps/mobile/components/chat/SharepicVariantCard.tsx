import { type MenuAction } from '@expo/ui/community/menu';
import {
  useAgentStore,
  useSharepicLiveStore,
  type SharepicData,
  type SharepicVariant,
} from '@gruenerator/chat';
import { type CanvasTemplateType, type SharepicFormat } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSharepicPreview } from '../../hooks/useSharepicPreview';
import { saveImageToGallery } from '../../services/imageStudio';
import { shareBase64Image } from '../../services/share';
import { composeForMint } from '../../services/sharepicRender';
import { BODY_FONT, borderRadius, chatType, colors, spacing } from '../../theme';

import { ImageGenerationDots } from './ImageGenerationFrame';
import { asSharepicMenuId, buildSharepicMenuActions, type SharepicMenuId } from './menuActions';
import { MenuActionSheet } from './MenuActionSheet';
import { ShimmerText } from './ShimmerText';

import type { Theme } from '../../theme/colors';

/**
 * A sharepic in the chat.
 *
 * The picture is not in the stream: the app renders it through the hidden
 * WebView (`useSharepicPreview`). That takes seconds on a cold start and can
 * fail, so the card has three states and says which one it is in — a silent
 * empty frame was the failure mode this whole path exists to avoid.
 *
 * No buttons under the picture: tap opens it full screen, holding it opens the
 * actions (share, save, studio) as a sheet.
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

async function openInStudio(
  canvasId: string | null,
  variant: SharepicVariant,
  router: ReturnType<typeof useRouter>
): Promise<void> {
  let id = canvasId;
  const minted = id === null;
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
    const body = await composeForMint(variant.canvasType, variant.initialProps);
    if (body === null) {
      Alert.alert('Fehler', 'Das Sharepic konnte nicht im Studio geöffnet werden.');
      return;
    }
    const result = await getContractsClient().canvas.fromVariant({
      body: {
        // The page composed it; the server validates template id and format.
        canvasType: body.canvasType as CanvasTemplateType,
        initialProps: body.initialProps,
        ...(body.format !== undefined && { format: body.format as SharepicFormat }),
        ...(body.title !== undefined && { title: body.title }),
        threadId,
        variantId: variant.id,
      },
    });
    if (result.status !== 201) {
      Alert.alert('Fehler', 'Das Sharepic konnte nicht im Studio geöffnet werden.');
      return;
    }
    id = result.body.canvasId;
    useSharepicLiveStore.getState().upsertEntry(variant.id, {
      canvasId: id,
      canvasType: body.canvasType as CanvasTemplateType,
    });
  }
  router.push({
    pathname: '/(fullscreen)/web-viewer',
    // `fresh`: the editor may show the minted pages before its sync lands.
    params: { path: `/studio/canvas/${id}${minted ? '?fresh=1' : ''}`, title: 'Sharepic' },
  });
}

function SharepicHero({ variant, theme }: { variant: SharepicVariant; theme: Theme }) {
  const router = useRouter();
  const { image, status } = useSharepicPreview(variant);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const liveCanvasId = useSharepicLiveStore((state) => state.entries[variant.id]?.canvasId);
  const canvasId = liveCanvasId ?? variant.canvasId ?? null;
  const ready = status === 'ready' && image !== null;

  const handleSave = useCallback(async () => {
    if (image === null || saving) return;
    setSaving(true);
    // Handles permissions, the file write, the gallery save and its own
    // alerts — including the way back into the gallery.
    await saveImageToGallery(image).finally(() => setSaving(false));
  }, [image, saving]);

  const handleOpenStudio = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    await openInStudio(canvasId, variant, router)
      .catch((error: unknown) => {
        console.warn('[SharepicVariantCard] open in studio failed:', error);
        Alert.alert('Fehler', 'Das Sharepic konnte nicht im Studio geöffnet werden.');
      })
      .finally(() => setOpening(false));
  }, [canvasId, opening, router, variant]);

  // While a new sharepic is first drawn there is nothing to act on — the frame
  // says what is happening. A sharepic that already has a canvas (redrawn after
  // a chat edit) can be opened meanwhile; once drawing failed, the studio is
  // the way to it. Share and save wait for the picture either way.
  const menuActions = buildSharepicMenuActions({
    hasImage: image !== null,
    canOpenStudio: status !== 'rendering' || canvasId !== null,
    saving,
    opening,
  });

  const runAction = useCallback(
    (id: string) => {
      switch (asSharepicMenuId(id)) {
        case 'share':
          if (image !== null) void shareBase64Image(image, 'Sharepic teilen');
          return;
        case 'save':
          void handleSave();
          return;
        case 'open-studio':
          setZoomed(false);
          void handleOpenStudio();
          return;
        case null:
          return;
      }
    },
    [handleOpenStudio, handleSave, image]
  );

  // Tap looks, hold acts — the gesture photos have in every messenger. A
  // picture opens full screen (with the same actions in its toolbar, so they
  // are never only behind a hidden gesture); without one, the tap goes where
  // the placeholder points: the studio.
  const handlePress = useCallback(() => {
    if (ready) setZoomed(true);
    else if (status !== 'rendering') void handleOpenStudio();
  }, [handleOpenStudio, ready, status]);

  const handleLongPress = useCallback(() => {
    if (menuActions.length === 0) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuOpen(true);
  }, [menuActions.length]);

  // A long press is not reachable from VoiceOver or TalkBack in practice; the
  // same entries are offered as the element's own actions.
  const enabledActions = menuActions.filter((action) => action.attributes?.disabled !== true);
  const hint = ready
    ? 'Öffnet das Sharepic im Vollbild. Lang drücken für Teilen, Speichern und Studio.'
    : status !== 'rendering'
      ? 'Öffnet das Sharepic im Studio.'
      : null;

  return (
    <View style={styles.hero}>
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.frame,
          { backgroundColor: theme.surface, borderColor: theme.border },
          pressed && styles.framePressed,
        ]}
        testID="chat-sharepic"
        accessibilityRole={ready || status !== 'rendering' ? 'button' : 'image'}
        accessibilityLabel={variant.altText ?? 'Sharepic'}
        {...(hint !== null && { accessibilityHint: hint })}
        accessibilityActions={enabledActions.map((action) => ({
          name: action.id ?? action.title,
          label: action.title,
        }))}
        onAccessibilityAction={(event) => runAction(event.nativeEvent.actionName)}
      >
        {ready ? (
          <Image source={{ uri: image }} style={styles.image} contentFit="contain" />
        ) : status === 'rendering' ? (
          <View style={styles.generating}>
            <ImageGenerationDots color={theme.textSecondary} />
            <View style={styles.generatingLabel}>
              <ShimmerText mutedColor={theme.textSecondary} brightColor={theme.text} fontSize={12}>
                Sharepic wird gezeichnet …
              </ShimmerText>
            </View>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={28} color={theme.textSecondary} />
            <Text style={[styles.placeholderText, { color: theme.textSecondary }]}>
              Keine Vorschau verfügbar
            </Text>
            <Text style={[styles.placeholderHint, { color: theme.textSecondary }]}>
              {opening ? 'Wird geöffnet …' : 'Tippen, um es im Studio zu sehen und zu bearbeiten.'}
            </Text>
          </View>
        )}
      </Pressable>

      <MenuActionSheet
        visible={menuOpen}
        theme={theme}
        heading={variant.label ?? 'Sharepic'}
        actions={menuActions}
        onSelect={runAction}
        onClose={() => setMenuOpen(false)}
      />

      {image !== null && (
        <SharepicLightbox
          visible={zoomed}
          image={image}
          altText={variant.altText ?? 'Sharepic'}
          actions={menuActions}
          onSelect={runAction}
          onClose={() => setZoomed(false)}
        />
      )}
    </View>
  );
}

const LIGHTBOX_ICONS: Record<
  SharepicMenuId,
  'share-outline' | 'download-outline' | 'create-outline'
> = {
  share: 'share-outline',
  save: 'download-outline',
  'open-studio': 'create-outline',
};

function SharepicLightbox({
  visible,
  image,
  altText,
  actions,
  onSelect,
  onClose,
}: {
  visible: boolean;
  image: string;
  altText: string;
  actions: MenuAction[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.lightbox, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable
          style={styles.lightboxImageWrap}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Vollbildansicht schließen"
        >
          <Image
            source={{ uri: image }}
            style={styles.lightboxImage}
            contentFit="contain"
            accessibilityLabel={altText}
          />
        </Pressable>
        <Pressable
          onPress={onClose}
          style={[styles.closeButton, { top: insets.top + spacing.small }]}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Schließen"
        >
          <Ionicons name="close" size={24} color={colors.white} />
        </Pressable>
        <View style={styles.lightboxBar}>
          {actions.map((action) => {
            const id = asSharepicMenuId(action.id ?? '');
            if (id === null) return null;
            const disabled = action.attributes?.disabled === true;
            return (
              <Pressable
                key={id}
                onPress={() => onSelect(id)}
                disabled={disabled}
                style={({ pressed }) => [
                  styles.lightboxAction,
                  (pressed || disabled) && styles.lightboxActionDimmed,
                ]}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
              >
                <Ionicons name={LIGHTBOX_ICONS[id]} size={22} color={colors.white} />
                <Text style={styles.lightboxActionText}>{action.title}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
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
  framePressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  image: { width: '100%', height: '100%' },
  generating: { flex: 1 },
  generatingLabel: { alignItems: 'center', paddingBottom: spacing.medium },
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
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  lightboxImageWrap: { flex: 1, padding: spacing.medium, justifyContent: 'center' },
  lightboxImage: { width: '100%', height: '100%' },
  closeButton: {
    position: 'absolute',
    right: spacing.medium,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  lightboxAction: { alignItems: 'center', gap: spacing.xxsmall, minWidth: 72, padding: 4 },
  lightboxActionDimmed: { opacity: 0.5 },
  lightboxActionText: { ...chatType.chatMicro, fontWeight: '600', color: colors.white },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxsmall },
  chip: {
    paddingHorizontal: spacing.small,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  chipText: { ...chatType.chatMicro, fontWeight: '600' },
});
