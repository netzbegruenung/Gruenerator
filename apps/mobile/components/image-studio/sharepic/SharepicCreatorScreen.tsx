import { type SharepicPhotoAttribution, type SharepicSpec } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSharepicCreator, type CreatorMessage } from '../../../hooks/useSharepicCreator';
import { useTheme } from '../../../hooks/useTheme';
import { composeForMint } from '../../../services/sharepicRender';
import { BODY_FONT, colors, spacing } from '../../../theme';
import { Composer, useComposerEdge } from '../../common/Composer';

import { FinishSheet } from './FinishSheet';
import { SlideCarousel } from './SlideCarousel';

const TITLE_MAX = 60;
const OPEN_FAILED = 'Das Sharepic konnte nicht im Editor geöffnet werden.';

/**
 * Mints the design as a freeform canvas — one page per slide — and returns its
 * id. The app cannot compose editor pages, so the render page does
 * (`composeForMint`); the body mirrors web's `mintCreatorCanvas`.
 */
async function mintCreatorCanvas(
  spec: SharepicSpec,
  attributions: (SharepicPhotoAttribution | null)[],
  title: string
): Promise<string | null> {
  const composed = await composeForMint('freeform', { creatorSpec: spec, attributions });
  if (composed === null) return null;
  const pages = composed.initialProps.pages;
  const response = await getContractsClient().canvas.create({
    body: {
      title,
      template_type: composed.canvasType,
      initial_state: composed.initialProps,
      ...(composed.format !== undefined && { format: composed.format }),
      ...(Array.isArray(pages) && pages.length > 0 && { page_count: pages.length }),
    },
  });
  return response.status === 201 ? response.body.id : null;
}

/** The free-text sharepic creator: describe it, get slides, refine by chatting. */
export function SharepicCreatorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const composerEdge = useComposerEdge();
  const creator = useSharepicCreator();
  const { messages, phase, design, spec, attributions, tweak } = creator;
  const [finishing, setFinishing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [tweaking, setTweaking] = useState(0);
  const list = useRef<FlatList<CreatorMessage>>(null);
  const busy = phase === 'drafting' || phase === 'checking';

  // Every successful turn ends in a plain assistant message, and only those
  // change the design — so the newest one is the message the slides belong to.
  const designMessageId = useMemo(() => {
    if (design === null) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message && message.role === 'assistant' && !message.error) return message.id;
    }
    return null;
  }, [messages, design]);

  const onTweak = useCallback(
    (id: string, value: string) => {
      setTweaking((n) => n + 1);
      void tweak(id, value).finally(() => setTweaking((n) => n - 1));
    },
    [tweak]
  );

  const onReset = useCallback(() => {
    setTweaking((n) => n + 1);
    void creator.reset().finally(() => setTweaking((n) => n - 1));
  }, [creator]);

  const openInEditor = useCallback(async () => {
    if (spec === null || opening) return;
    setOpening(true);
    try {
      const first = messages
        .find((m) => m.role === 'user')
        ?.text.replace(/\s+/g, ' ')
        .trim();
      const title =
        first && first.length > TITLE_MAX
          ? `${first.slice(0, TITLE_MAX - 1)}…`
          : first || 'Sharepic';
      const id = await mintCreatorCanvas(spec, attributions, title);
      if (id === null) {
        Alert.alert('Fehler', OPEN_FAILED);
        return;
      }
      router.push({
        pathname: '/(fullscreen)/web-viewer',
        params: { path: `/studio/canvas/${id}`, title: 'Sharepic' },
      });
    } catch (error: unknown) {
      console.warn('[SharepicCreatorScreen] open in editor failed:', error);
      Alert.alert('Fehler', OPEN_FAILED);
    } finally {
      setOpening(false);
    }
  }, [spec, opening, messages, attributions, router]);

  const headerRight = useCallback(
    () =>
      design === null ? null : (
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setFinishing(true)}
            disabled={busy}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Feinschliff"
            accessibilityState={{ disabled: busy }}
          >
            <Ionicons name="options-outline" size={22} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={() => void openInEditor()}
            disabled={opening || busy}
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="Im Editor öffnen"
            accessibilityState={{ disabled: opening || busy, busy: opening }}
          >
            {opening ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Ionicons name="pencil-outline" size={22} color={theme.text} />
            )}
          </Pressable>
        </View>
      ),
    [design, busy, opening, openInEditor, theme.text]
  );

  const renderMessage = useCallback(
    ({ item }: { item: CreatorMessage }) => {
      if (item.role === 'user') {
        return (
          <View style={[styles.userBubble, { backgroundColor: colors.primary[600] }]}>
            <Text style={styles.userText}>{item.text}</Text>
          </View>
        );
      }
      return (
        <View style={styles.assistant}>
          <Text
            style={[
              styles.assistantText,
              { color: item.error ? colors.semantic.error : theme.text },
            ]}
          >
            {item.text}
          </Text>
          {design !== null && item.id === designMessageId && (
            <SlideCarousel images={design.images} busy={tweaking > 0} />
          )}
        </View>
      );
    },
    [design, designMessageId, tweaking, theme.text]
  );

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen options={{ headerRight }} />
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={headerHeight}
        style={styles.flex}
      >
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderMessage}
          contentContainerStyle={styles.list}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <Text style={[styles.intro, { color: theme.textSecondary }]}>
              Beschreib dein Sharepic – z. B. „Karussell: 3 Gründe für mehr Radwege …“
            </Text>
          }
          ListFooterComponent={
            busy ? (
              <View style={styles.typing} accessibilityLiveRegion="polite">
                <ActivityIndicator color={theme.textSecondary} />
                <Text style={[styles.assistantText, { color: theme.textSecondary }]}>
                  {phase === 'drafting' ? 'Entwirft …' : 'Prüft …'}
                </Text>
              </View>
            ) : null
          }
        />
        <Composer
          variant="bar"
          placeholder="Nachricht"
          showMentions={false}
          theme={theme}
          style={composerEdge}
          onSubmit={(text) => {
            if (busy) return false;
            void creator.send(text);
          }}
        />
      </KeyboardAvoidingView>
      <FinishSheet
        visible={finishing}
        onClose={() => setFinishing(false)}
        tweaks={creator.tweaks}
        tweaked={creator.tweaked}
        onTweak={onTweak}
        onReset={onReset}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.medium, gap: spacing.medium, flexGrow: 1 },
  intro: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, marginTop: spacing.large },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 4,
    borderBottomLeftRadius: 18,
  },
  userText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20, color: colors.white },
  assistant: { gap: spacing.small },
  assistantText: { fontFamily: BODY_FONT, fontSize: 14, lineHeight: 20 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: spacing.small },
  headerActions: { flexDirection: 'row' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
