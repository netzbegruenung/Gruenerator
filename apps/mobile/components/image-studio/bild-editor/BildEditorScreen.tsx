import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useBildEditorMobile } from '../../../hooks/image-studio/useBildEditorMobile';
import { BODY_FONT } from '../../../theme';
import { CONTENT_MAX_WIDTH } from '../../../theme/layout';
import { routeWithParams } from '../../../types/routes';

import { BevComposer } from './BevComposer';
import { BevGradientBackdrop, BevLoadingCard } from './BevGradientBackdrop';
import { BevStartScreen } from './BevStartScreen';
import { getBevPalette } from './palette';
import { type BevMode } from './types';

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

/**
 * One place to make a picture, as on web: „KI-Bild" generates and edits here,
 * „Sharepic" hands the prompt to the sharepic chat. Both start from the same
 * composer; the mode chip switches between them.
 */
export function BildEditorScreen({ initialMode }: { initialMode: BevMode }) {
  const bev = useBildEditorMobile(initialMode);
  const router = useRouter();
  const openSharepic = (prompt: string) =>
    router.push(routeWithParams('/(focused)/sharepic', { initialMessage: prompt }));
  const isDark = useColorScheme() === 'dark';
  const palette = getBevPalette(isDark);

  const {
    screen,
    generating,
    statusText,
    active,
    versions,
    activeHasChildren,
    selectVersion,
    download,
    share,
    resetAll,
  } = bev;

  const editLoading = generating && screen === 'result';

  if (screen === 'start') return <BevStartScreen bev={bev} onSharepic={openSharepic} />;

  return (
    <View style={[styles.root, { backgroundColor: palette.base }]}>
      <BevGradientBackdrop palette={palette} generating={generating} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior="padding" style={styles.flex}>
          <View style={styles.flex}>
            {/* Top bar */}
            <View style={styles.topBar}>
              <Pressable onPress={resetAll} accessibilityRole="button" hitSlop={6}>
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
                <Pressable
                  onPress={() => void share()}
                  disabled={!active}
                  accessibilityRole="button"
                  accessibilityLabel="Bild teilen"
                  accessibilityState={{ disabled: !active }}
                  hitSlop={6}
                >
                  <Ionicons name="share-outline" size={20} color={palette.accent} />
                </Pressable>
                <Pressable
                  onPress={() => void download()}
                  disabled={!active}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !active }}
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
                        accessibilityRole="button"
                        accessibilityLabel={`Version ${v.num} anzeigen`}
                        accessibilityState={{ selected }}
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

              <BevComposer bev={bev} palette={palette} onSharepic={openSharepic} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  flex: { flex: 1 },
  // Both composer blocks keep the chat composer's measure on a tablet.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  restart: { fontFamily: BODY_FONT, fontSize: 13, fontWeight: '600' },
  captionWrap: { flex: 1, alignItems: 'center' },
  caption: {
    fontFamily: BODY_FONT,
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
  downloadText: { color: '#fff', fontFamily: BODY_FONT, fontSize: 13, fontWeight: '700' },
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
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
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
    fontFamily: BODY_FONT,
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
    fontFamily: BODY_FONT,
    fontSize: 12,
    fontWeight: '600',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
});
