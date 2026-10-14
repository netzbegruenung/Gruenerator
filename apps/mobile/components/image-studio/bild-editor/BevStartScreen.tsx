import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';

import { type BildEditorMobile } from '../../../hooks/image-studio/useBildEditorMobile';
import { useTheme } from '../../../hooks/useTheme';
import { BODY_FONT, colors, spacing } from '../../../theme';
import { getSurfaceFab, getToolTheme } from '../../../theme/toolTheme';
import { ThreadWelcomeBlock, useComposerDockPadding } from '../../chat/AssistantThread';
import { ShimmerStatusLine } from '../../chat/ShimmerStatusLine';
import { BottomSheet } from '../../common';
import { Composer, useComposerEdge } from '../../common/Composer';
import { SurfaceGradientBackground } from '../../common/NotebookGradientBackground';
import { ScreenScaffold } from '../../navigation/ScreenScaffold';

import { BevSettingsSections, MODE_META } from './BevComposer';
import { getStudioPalette } from './palette';

/**
 * The Bild-Editor before there is a picture, in the chat's grammar, painted in
 * the Studio violet as the notebooks wear their magenta: calm page, greeting, and one docked composer — the large card the notebooks use — that
 * carries everything else: the mode chip („KI-Bild" / „Sharepic") opens the
 * modes and, below them, how the picture is made; the „+" adds what the picture
 * starts from. Suggestions sit just above the composer and send on tap.
 */
export function BevStartScreen({
  bev,
  onSharepic,
}: {
  bev: BildEditorMobile;
  onSharepic: (prompt: string) => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  // Page, composer and sheets in one hue.
  const palette = getStudioPalette(isDark);
  const tone = getSurfaceFab('studio', isDark);
  const toneText = getToolTheme('ki-bildgenerierung', isDark).title;
  const composerEdge = useComposerEdge();
  const dockPadding = useComposerDockPadding();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const {
    mode,
    setMode,
    generating,
    statusText,
    error,
    submit,
    uploadFromGallery,
    uploadFromCamera,
  } = bev;
  const meta = MODE_META[mode];
  const isSharepic = mode === 'sharepic';

  const send = (text: string) => {
    if (isSharepic) onSharepic(text);
    else void submit(text);
  };

  const ownImage = (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: palette.muted }]}>Eigenes Bild bearbeiten</Text>
      <View style={styles.ownImageRow}>
        {(
          [
            { label: 'Galerie', icon: 'image-outline', pick: uploadFromGallery },
            { label: 'Kamera', icon: 'camera-outline', pick: uploadFromCamera },
          ] as const
        ).map((source) => (
          <Pressable
            key={source.label}
            onPress={() => {
              setAddOpen(false);
              void source.pick();
            }}
            accessibilityRole="button"
            style={[styles.ownImageButton, { borderColor: palette.accentBorder }]}
          >
            <Ionicons name={source.icon} size={18} color={palette.chipInk} />
            <Text style={[styles.ownImageText, { color: palette.chipInk }]}>{source.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <ScreenScaffold
      title="Bild erstellen"
      onBack={() => router.back()}
      backdrop={<SurfaceGradientBackground surface="studio" />}
      headerRight={null}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <View style={styles.flex}>
          {generating ? (
            <View style={styles.center} accessibilityLiveRegion="polite">
              <ShimmerStatusLine label={statusText} theme={theme} />
            </View>
          ) : (
            <ThreadWelcomeBlock
              theme={theme}
              title="Was möchtest du erschaffen?"
              // One line for both modes: switching must not move the page.
              subtitle="Ein KI-Bild oder ein Sharepic – unten rechts wählst du, was entsteht."
            />
          )}
        </View>
        <Animated.View style={dockPadding}>
          {error && <Text style={styles.error}>{error}</Text>}
          <Composer
            variant="card"
            toolbarTone={{ background: tone.background, foreground: tone.icon, text: toneText }}
            accentColor={getSurfaceFab('studio', false).icon}
            // The same field across both modes, so a typed draft survives the
            // switch — the chip says which one sending goes to.
            placeholder="Beschreib, was entstehen soll …"
            showMentions={false}
            theme={theme}
            style={[composerEdge, styles.transparent]}
            busy={generating}
            accessoryBesideAction
            accessory={{
              icon: meta.icon,
              label: meta.label,
              // Two ways to start, so the chip simply flips between them.
              accessibilityLabel: `Modus ${meta.label}, wechseln zu ${isSharepic ? 'KI-Bild' : 'Sharepic'}`,
              onPress: () => setMode(isSharepic ? 'erstellen' : 'sharepic'),
            }}
            onAdd={() => setAddOpen(true)}
            // A sharepic is styled in its chat's Feinschliff; nothing to set here.
            {...(!isSharepic && { onSettings: () => setSettingsOpen(true) })}
            onSubmit={send}
          />
        </Animated.View>
      </KeyboardAvoidingView>
      <BottomSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        padded
        backgroundColor={palette.sheet}
      >
        {ownImage}
      </BottomSheet>
      <BottomSheet
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        padded
        maxHeight="70%"
        backgroundColor={palette.sheet}
      >
        <ScrollView>
          <BevSettingsSections bev={bev} palette={palette} />
        </ScrollView>
      </BottomSheet>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  transparent: { backgroundColor: 'transparent' },
  error: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    color: colors.semantic.error,
    textAlign: 'center',
    paddingBottom: spacing.small,
  },
  section: { gap: 10, marginBottom: 20 },
  sectionLabel: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ownImageRow: { flexDirection: 'row', gap: spacing.small },
  ownImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    minHeight: 44,
  },
  ownImageText: { fontFamily: BODY_FONT, fontSize: 14 },
});
