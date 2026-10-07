import { type SharepicPhotoAttribution, type SharepicSpec } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
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
import Animated from 'react-native-reanimated';

import { useContentColumn } from '../../../hooks/useLayout';
import { useSharepicCreator, type CreatorMessage } from '../../../hooks/useSharepicCreator';
import { useTheme } from '../../../hooks/useTheme';
import { composeForMint } from '../../../services/sharepicRender';
import { BODY_FONT, chatType, colors, spacing } from '../../../theme';
import { ThreadWelcomeBlock, useComposerDockPadding } from '../../chat/AssistantThread';
import { ChatBackdrop } from '../../chat/ChatBackdrop';
import { messageLayout } from '../../chat/message/messageLayout';
import { ShimmerStatusLine } from '../../chat/ShimmerStatusLine';
import { Composer, useComposerEdge, type ComposerAccessory } from '../../common/Composer';
import { ScreenScaffold } from '../../navigation/ScreenScaffold';

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

/**
 * The free-text sharepic creator: describe it, get slides, refine by chatting.
 *
 * It keeps its own message state (`useSharepicCreator`), not the assistant-ui
 * runtime, but wears the chat's chrome — scaffold header, vanilla backdrop with
 * the composer glow, the chat's bubbles and its composer dock — so it reads as
 * a conversation like every other one in the app.
 */
export function SharepicCreatorScreen() {
  const theme = useTheme();
  const router = useRouter();
  const composerEdge = useComposerEdge();
  const composerPadding = useComposerDockPadding();
  const column = useContentColumn('reading');
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

  // A design choice still rendering would mint the draft without it.
  const editorBlocked = busy || tweaking > 0;

  const editorButton =
    design === null ? null : (
      <Pressable
        onPress={() => void openInEditor()}
        disabled={opening || editorBlocked}
        style={[styles.headerButton, editorBlocked && !opening && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Im Editor öffnen"
        accessibilityState={{ disabled: opening || editorBlocked, busy: opening }}
      >
        {opening ? (
          <ActivityIndicator color={theme.text} />
        ) : (
          <Ionicons name="pencil-outline" size={22} color={theme.text} />
        )}
      </Pressable>
    );

  // Feinschliff sits in the composer, where the notebook keeps its answer mode:
  // it shapes the next result, like what is typed beside it.
  const finishAccessory = useMemo<ComposerAccessory | undefined>(
    () =>
      design === null
        ? undefined
        : {
            icon: 'options-outline',
            label: 'Feinschliff',
            accessibilityLabel: 'Feinschliff',
            onPress: () => {
              if (!busy) setFinishing(true);
            },
          },
    [design, busy]
  );

  const renderMessage = useCallback(
    ({ item }: { item: CreatorMessage }) => {
      if (item.role === 'user') {
        return (
          <View style={[messageLayout.row, messageLayout.userRow]}>
            <View style={messageLayout.userBubble}>
              <Text style={messageLayout.userBubbleText}>{item.text}</Text>
            </View>
          </View>
        );
      }
      return (
        <View style={[messageLayout.row, messageLayout.assistantRow, styles.assistant]}>
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
    <ScreenScaffold
      title="Sharepic"
      onBack={() => router.back()}
      backdrop={<ChatBackdrop />}
      headerRight={editorButton}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {messages.length === 0 && (
          <ThreadWelcomeBlock
            theme={theme}
            title="Was soll aufs Sharepic?"
            subtitle="Beschreib dein Sharepic – z. B. „Karussell: 3 Gründe für mehr Radwege …“"
          />
        )}
        <FlatList
          ref={list}
          style={styles.flex}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderMessage}
          contentContainerStyle={[column, styles.list]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            busy ? (
              <View
                style={[messageLayout.row, messageLayout.assistantRow]}
                accessibilityLiveRegion="polite"
              >
                <ShimmerStatusLine
                  label={phase === 'drafting' ? 'Entwirft …' : 'Prüft …'}
                  theme={theme}
                />
              </View>
            ) : null
          }
        />
        <Animated.View style={composerPadding}>
          <Composer
            variant="bar"
            placeholder="Beschreib dein Sharepic …"
            showMentions={false}
            theme={theme}
            style={[composerEdge, styles.transparent]}
            busy={busy || tweaking > 0}
            accessory={finishAccessory}
            onSubmit={(text) => {
              void creator.send(text);
            }}
          />
        </Animated.View>
      </KeyboardAvoidingView>
      <FinishSheet
        visible={finishing}
        onClose={() => setFinishing(false)}
        tweaks={creator.tweaks}
        tweaked={creator.tweaked}
        onTweak={onTweak}
        onReset={onReset}
      />
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingTop: spacing.small, flexGrow: 1 },
  transparent: { backgroundColor: 'transparent' },
  assistant: { gap: spacing.small },
  assistantText: { ...chatType.chatBody, fontFamily: BODY_FONT },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.4 },
});
