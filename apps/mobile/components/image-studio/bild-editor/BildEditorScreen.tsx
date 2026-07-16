import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBildEditorMobile } from '../../../hooks/image-studio/useBildEditorMobile';

import { BevComposer } from './BevComposer';
import { BevGradientBackdrop, BevLoadingCard } from './BevGradientBackdrop';
import { getBevPalette } from './palette';

type Bev = ReturnType<typeof useBildEditorMobile>;

function captionFor(bev: Bev): string {
  const a = bev.active;
  if (!a) return '';
  if (a.kind === 'upload') return `V${a.num} · Hochgeladen`;
  if (a.kind === 'create') return `V${a.num} · KI-erstellt`;
  const parent = bev.versions.find((p) => p.id === a.parentId);
  const parentLabel = `V${parent?.num ?? '?'}`;
  if (a.kind === 'green') return `V${a.num} · Grün verwandelt aus ${parentLabel}`;
  if (a.kind === 'outpaint') return `V${a.num} · Vergrößert aus ${parentLabel}`;
  if (a.kind === 'nobg') return `V${a.num} · Freigestellt aus ${parentLabel}`;
  return `V${a.num} · Bearbeitung von ${parentLabel}`;
}

export function BildEditorScreen() {
  const bev = useBildEditorMobile();
  const isDark = useColorScheme() === 'dark';
  const palette = getBevPalette(isDark);

  const {
    screen,
    generating,
    statusText,
    active,
    versions,
    activeHasChildren,
    uploadFromGallery,
    uploadFromCamera,
    selectVersion,
    download,
    share,
    resetAll,
  } = bev;

  const editLoading = generating && screen === 'result';

  return (
    <View style={[styles.root, { backgroundColor: palette.base }]}>
      <BevGradientBackdrop palette={palette} generating={generating} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          {screen === 'start' ? (
            generating ? (
              <View style={styles.centerFill}>
                <Text style={[styles.loadingHeadline, { color: palette.ink }]}>{statusText}</Text>
                <Text style={[styles.loadingSub, { color: palette.muted }]}>
                  Dein Bild entsteht – einen Moment …
                </Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.startContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={[styles.headline, { color: palette.ink }]}>
                  Was möchtest du erschaffen?
                </Text>
                <BevComposer bev={bev} palette={palette} />
                <View style={styles.uploadBlock}>
                  <Text style={[styles.uploadHint, { color: palette.muted }]}>
                    Oder bearbeite ein eigenes Bild
                  </Text>
                  <View style={styles.uploadRow}>
                    <Pressable
                      onPress={() => void uploadFromGallery()}
                      style={[styles.uploadBtn, { borderColor: palette.accentBorder }]}
                    >
                      <Ionicons name="image" size={18} color={palette.chipInk} />
                      <Text style={[styles.uploadBtnText, { color: palette.chipInk }]}>
                        Galerie
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void uploadFromCamera()}
                      style={[styles.uploadBtn, { borderColor: palette.accentBorder }]}
                    >
                      <Ionicons name="camera" size={18} color={palette.chipInk} />
                      <Text style={[styles.uploadBtnText, { color: palette.chipInk }]}>Kamera</Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            )
          ) : (
            <View style={styles.flex}>
              {/* Top bar */}
              <View style={styles.topBar}>
                <Pressable onPress={resetAll} hitSlop={6}>
                  <Text style={[styles.restart, { color: palette.accent }]}>Neu starten</Text>
                </Pressable>
                <View style={styles.captionWrap}>
                  {active && (
                    <Text
                      style={[
                        styles.caption,
                        {
                          color: palette.ink,
                          backgroundColor: palette.overlayPill,
                          borderColor: palette.overlayPillBorder,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {captionFor(bev)}
                    </Text>
                  )}
                </View>
                <View style={styles.topActions}>
                  <Pressable onPress={() => void share()} disabled={!active} hitSlop={6}>
                    <Ionicons name="share-outline" size={20} color={palette.accent} />
                  </Pressable>
                  <Pressable
                    onPress={() => void download()}
                    disabled={!active}
                    style={[styles.downloadBtn, { backgroundColor: palette.primary }]}
                  >
                    <Text style={styles.downloadText}>Speichern</Text>
                  </Pressable>
                </View>
              </View>

              {/* Image / edit-loading card */}
              <View style={styles.imageArea}>
                {editLoading ? (
                  <BevLoadingCard palette={palette} statusText={statusText} />
                ) : (
                  active && (
                    <Animated.View
                      key={active.id}
                      entering={FadeIn.duration(600)}
                      style={[styles.imageCard, { backgroundColor: palette.cardBg }]}
                    >
                      <Image
                        source={{ uri: active.image }}
                        style={[styles.image, { aspectRatio: active.width / active.height || 1 }]}
                        contentFit="contain"
                      />
                    </Animated.View>
                  )
                )}
              </View>

              {/* Version strip + branch hint + composer */}
              <View style={styles.bottom}>
                {versions.length > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.strip}
                  >
                    {versions.map((v) => {
                      const selected = active?.id === v.id;
                      return (
                        <Pressable
                          key={v.id}
                          onPress={() => selectVersion(v.id)}
                          style={[
                            styles.thumb,
                            {
                              borderColor: selected ? palette.primary : palette.overlayPillBorder,
                              backgroundColor: palette.cardBg,
                            },
                          ]}
                        >
                          <Image
                            source={{ uri: v.image }}
                            style={styles.thumbImg}
                            contentFit="cover"
                          />
                          <Text style={styles.thumbNum}>V{v.num}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}

                {activeHasChildren && !generating && active && (
                  <Text
                    style={[
                      styles.branchHint,
                      {
                        color: palette.accent,
                        backgroundColor: palette.overlayPill,
                        borderColor: palette.accentBorder,
                      },
                    ]}
                  >
                    Änderungen an V{active.num} erstellen einen neuen Zweig
                  </Text>
                )}

                <BevComposer bev={bev} palette={palette} />
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
  },
  loadingHeadline: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 34,
  },
  loadingSub: { fontSize: 14 },
  startContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 22,
    padding: 24,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 36,
  },
  uploadBlock: {
    width: '100%',
    alignItems: 'center',
    gap: 12,
  },
  uploadHint: { fontSize: 13 },
  uploadRow: { flexDirection: 'row', gap: 12 },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  uploadBtnText: { fontSize: 14, fontWeight: '600' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  restart: { fontSize: 13, fontWeight: '600' },
  captionWrap: { flex: 1, alignItems: 'center' },
  caption: {
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    maxWidth: '100%',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  downloadBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  downloadText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  imageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  imageCard: {
    borderRadius: 20,
    padding: 6,
    width: '88%',
    maxWidth: 520,
    shadowColor: '#23372e',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 8,
  },
  image: {
    width: '100%',
    maxHeight: 420,
    borderRadius: 15,
  },
  bottom: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    alignItems: 'center',
  },
  strip: { gap: 10, paddingVertical: 2 },
  thumb: {
    padding: 3,
    borderRadius: 12,
    borderWidth: 2,
  },
  thumbImg: { width: 64, height: 44, borderRadius: 8 },
  thumbNum: {
    position: 'absolute',
    left: 7,
    bottom: 6,
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: 'rgba(35,55,46,0.6)',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  branchHint: {
    fontSize: 12,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
});
