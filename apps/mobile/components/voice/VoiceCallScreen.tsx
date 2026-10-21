import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  type ThreadMessage,
  useAui,
  useAuiState,
  useLocalRuntime,
  useVoiceControls,
  useVoiceState,
} from '@assistant-ui/react-native';
import { TOOL_LABEL, type ToolCall } from '@gruenerator/voice/mistral';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useRouter } from 'expo-router';
import { memo, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '../../hooks/useTheme';
import { createMobileVoiceAdapter } from '../../services/voice/mobileVoice';
import { BODY_FONT, colors, spacing } from '../../theme';
import { GrueneratorLoadingIcon } from '../chat/GrueneratorLoadingIcon';

/** The hosted agent takes audio and `sendText` only; nothing runs a model here. */
const VOICE_ONLY: ChatModelAdapter = {
  run: () => Promise.reject(new Error('Hier wird nur gesprochen.')),
};

const BLOB = 240;
const BLOB_SMALL = 96;
/** Drag distance that moves the view all the way between blob and transcript. */
const SWIPE_RANGE = 280;
const SNAP = { damping: 22, stiffness: 180 };

/** Starts the call when the screen opens and ends it when the screen goes. */
function CallLifecycle() {
  const { connect, disconnect } = useVoiceControls();
  const start = useEffectEvent(() => void connect());
  // Privacy: leaving the screen must not leave the microphone open.
  const stop = useEffectEvent(() => disconnect());
  useEffect(() => {
    start();
    return () => stop();
  }, []);
  return null;
}

function textOf(message: ThreadMessage): string {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

/** Soft green sphere, slowly turning; breathes quicker while the agent speaks. */
function Blob({ tool }: { tool: ToolCall | null }) {
  const voice = useVoiceState();
  const status = voice?.status.type;
  const live = status === 'running' || status === 'starting';
  const speaking = status === 'running' && voice?.mode === 'speaking';
  const turn = useSharedValue(0);
  const breath = useSharedValue(1);

  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1);
    return () => cancelAnimation(turn);
  }, [turn]);

  useEffect(() => {
    cancelAnimation(breath);
    if (!live) {
      breath.value = withTiming(0.94, { duration: 400 });
      return;
    }
    const duration = speaking ? 380 : 1800;
    const peak = speaking ? 1.06 : 1.025;
    breath.value = withRepeat(
      withSequence(
        withTiming(peak, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
  }, [live, speaking, breath]);

  const sphere = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }, { rotate: `${turn.value}deg` }],
  }));

  return (
    <View style={styles.blob}>
      {/* Rasterized once: the GPU turns a texture instead of redrawing the
          gradients every frame. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, sphere]}
        renderToHardwareTextureAndroid
        shouldRasterizeIOS
      >
        <Svg width={BLOB} height={BLOB}>
          <Defs>
            <LinearGradient id="body" x1="0.15" y1="0" x2="0.85" y2="1">
              <Stop offset="0" stopColor={colors.primary[600]} />
              <Stop offset="0.55" stopColor={colors.primary[400]} />
              <Stop offset="1" stopColor={colors.primary[200]} />
            </LinearGradient>
            <RadialGradient id="haze" cx="0.62" cy="0.62" r="0.55">
              <Stop offset="0" stopColor={colors.white} stopOpacity="0.75" />
              <Stop offset="1" stopColor={colors.white} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx={BLOB / 2} cy={BLOB / 2} r={BLOB / 2} fill="url(#body)" />
          <Circle cx={BLOB / 2} cy={BLOB / 2} r={BLOB / 2} fill="url(#haze)" />
        </Svg>
      </Animated.View>
      {tool ? <GrueneratorLoadingIcon size={72} color={colors.white} /> : null}
    </View>
  );
}

/** One line of the transcript; unchanged messages skip rendering while the newest one streams. */
const TranscriptRow = memo(function TranscriptRow({ message }: { message: ThreadMessage }) {
  const theme = useTheme();
  const text = textOf(message);
  if (!text) return null;
  return message.role === 'user' ? (
    <View style={[styles.userBubble, { backgroundColor: colors.primary[50] }]}>
      <Text style={[styles.message, { color: colors.grey[800] }]}>{text}</Text>
    </View>
  ) : (
    <Text style={[styles.message, { color: theme.text }]}>{text}</Text>
  );
});

function Transcript({ visible }: { visible: boolean }) {
  const messages = useAuiState((s) => s.thread.messages);
  const scroll = useRef<ScrollView>(null);

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={styles.transcript}
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
    >
      {messages.map((m) => (
        <TranscriptRow key={m.id} message={m} />
      ))}
    </ScrollView>
  );
}

function CallBar() {
  const theme = useTheme();
  const router = useRouter();
  const aui = useAui();
  const voice = useVoiceState();
  const { disconnect, mute, unmute } = useVoiceControls();
  const [draft, setDraft] = useState('');
  const muted = voice?.isMuted ?? false;
  const canType = voice?.canSendText ?? false;

  const send = () => {
    const text = draft.trim();
    if (!text || !canType) return;
    aui.composer.setText(text);
    aui.composer.send();
    setDraft('');
  };

  return (
    <View style={styles.bar}>
      <View style={[styles.pill, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={send}
          editable={canType}
          placeholder="Nachricht"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="send"
          submitBehavior="submit"
          style={[styles.input, { color: theme.text }]}
          accessibilityLabel="Nachricht an den Grünerator"
        />
      </View>
      <Pressable
        onPress={() => (muted ? unmute() : mute())}
        disabled={voice?.status.type !== 'running'}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Mikrofon an' : 'Mikrofon aus'}
        accessibilityState={{ selected: muted }}
        style={({ pressed }) => [
          styles.round,
          { backgroundColor: theme.buttonBackground },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name={muted ? 'mic-off-outline' : 'mic-outline'} size={24} color={theme.text} />
      </Pressable>
      <Pressable
        onPress={() => {
          disconnect();
          router.back();
        }}
        accessibilityRole="button"
        accessibilityLabel="Gespräch beenden"
        style={({ pressed }) => [
          styles.round,
          { backgroundColor: theme.text },
          pressed && styles.pressed,
        ]}
      >
        <Ionicons name="close" size={26} color={theme.background} />
      </Pressable>
    </View>
  );
}

/**
 * The voice call: a large blob to talk to, and the written transcript one
 * swipe away (up for the transcript, down for the blob again). Speech and
 * typed text go into the same call; the blob carries the loading gear while
 * the agent looks something up.
 */
function VoiceCall({ tool, error }: { tool: ToolCall | null; error: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const voice = useVoiceState();
  const { connect } = useVoiceControls();
  const status = voice?.status.type;
  const live = status === 'running' || status === 'starting';

  const [height, setHeight] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  // 0: the blob fills the screen; 1: the transcript does, the blob waits below it.
  const progress = useSharedValue(0);
  const dragStart = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetY([-20, 20])
    .failOffsetX([-20, 20])
    .onStart(() => {
      dragStart.value = progress.value;
    })
    .onUpdate((e) => {
      progress.value = Math.min(1, Math.max(0, dragStart.value - e.translationY / SWIPE_RANGE));
    })
    .onEnd((e) => {
      const target = e.velocityY < -500 ? 1 : e.velocityY > 500 ? 0 : Math.round(progress.value);
      progress.value = withSpring(target, SNAP);
      runOnJS(setShowTranscript)(target === 1);
    });

  const blobStyle = useAnimatedStyle(() => {
    const big = height * 0.42;
    const small = height - BLOB_SMALL / 2 - spacing.medium;
    return {
      transform: [
        { translateY: interpolate(progress.value, [0, 1], [big, small]) - BLOB / 2 },
        { scale: interpolate(progress.value, [0, 1], [1, BLOB_SMALL / BLOB]) },
      ],
    };
  });
  const transcriptStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: interpolate(progress.value, [0, 1], [24, 0]) }],
  }));
  const captionStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateY: height * 0.42 + BLOB / 2 + spacing.large }],
  }));

  const caption = tool
    ? `${TOOL_LABEL[tool.name] ?? 'Schlage nach'} …`
    : status === 'starting'
      ? 'Verbinde …'
      : !live
        ? 'Tippe auf den Kreis, um neu zu verbinden'
        : null;

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }]}
    >
      <GestureDetector gesture={pan}>
        <View style={styles.stage} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
          <Animated.View
            style={[
              styles.transcriptLayer,
              { bottom: BLOB_SMALL + spacing.large },
              transcriptStyle,
            ]}
          >
            <Transcript visible={showTranscript} />
          </Animated.View>
          {height > 0 ? (
            <>
              <Animated.View style={[styles.blobLayer, blobStyle]}>
                <Pressable
                  onPress={live ? undefined : () => void connect()}
                  disabled={live}
                  accessibilityRole="button"
                  accessibilityLabel={live ? 'Sprachgespräch läuft' : 'Neu verbinden'}
                >
                  <Blob tool={tool} />
                </Pressable>
              </Animated.View>
              <Animated.View style={[styles.captionLayer, captionStyle]} pointerEvents="none">
                <Text
                  style={[styles.caption, { color: theme.textSecondary }]}
                  accessibilityLiveRegion="polite"
                >
                  {caption ?? ' '}
                </Text>
                {error ? (
                  <Text style={styles.error} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}
              </Animated.View>
            </>
          ) : null}
        </View>
      </GestureDetector>
      <View style={{ paddingBottom: insets.bottom + spacing.small }}>
        <CallBar />
        {/* Kennzeichnung als KI-Dialog (Art. 50 Abs. 1 KI-VO). */}
        <Text style={[styles.notice, { color: theme.textSecondary }]}>
          Du sprichst mit einer KI · Audio über Mistrals globalen Endpunkt
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

/** A voice conversation with Mistral's hosted agent, opened from the start page's composer. */
export function VoiceCallScreen() {
  const [tool, setTool] = useState<ToolCall | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice] = useState(() =>
    createMobileVoiceAdapter({ onToolActivity: setTool, onError: setError })
  );
  const runtime = useLocalRuntime(VOICE_ONLY, { adapters: { voice } });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <CallLifecycle />
      <VoiceCall tool={tool} error={error} />
    </AssistantRuntimeProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  stage: {
    flex: 1,
  },
  transcriptLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  transcript: {
    gap: spacing.large,
    paddingHorizontal: spacing.large,
    paddingTop: spacing.large,
    paddingBottom: spacing.medium,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    borderRadius: 24,
    paddingHorizontal: spacing.medium + 2,
    paddingVertical: spacing.small,
  },
  message: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    lineHeight: 25,
  },
  blobLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  blob: {
    width: BLOB,
    height: BLOB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.large,
  },
  caption: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    textAlign: 'center',
  },
  error: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    color: colors.semantic.error,
    textAlign: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
  },
  pill: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: spacing.large,
  },
  input: {
    fontFamily: BODY_FONT,
    fontSize: 17,
    paddingVertical: 0,
  },
  round: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  notice: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.xsmall,
  },
});
