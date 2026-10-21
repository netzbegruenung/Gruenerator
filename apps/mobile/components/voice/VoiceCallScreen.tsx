import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  useLocalRuntime,
  useVoiceControls,
  useVoiceState,
} from '@assistant-ui/react-native';
import { TOOL_LABEL, type ToolCall } from '@gruenerator/voice/mistral';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useEffectEvent, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../../hooks/useTheme';
import { createMobileVoiceAdapter } from '../../services/voice/mobileVoice';
import { BODY_FONT, colors, spacing } from '../../theme';
import { AssistantThread } from '../chat/AssistantThread';
import { GrueneratorLoadingIcon } from '../chat/GrueneratorLoadingIcon';

/** The hosted agent takes audio and `sendText` only; nothing runs a model here. */
const VOICE_ONLY: ChatModelAdapter = {
  run: () => Promise.reject(new Error('Hier wird nur gesprochen.')),
};

const ORB_SIZE = 132;

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

/** A breathing disc: slow while listening, quicker while the agent speaks. */
function Orb({ tool }: { tool: ToolCall | null }) {
  const voice = useVoiceState();
  const status = voice?.status.type;
  const speaking = status === 'running' && voice?.mode === 'speaking';
  const live = status === 'running' || status === 'starting';
  const scale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(scale);
    if (!live) {
      scale.value = withTiming(0.92, { duration: 300 });
      return;
    }
    const duration = speaking ? 420 : 1600;
    const peak = speaking ? 1.08 : 1.04;
    scale.value = withRepeat(
      withSequence(
        withTiming(peak, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
  }, [live, speaking, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[styles.orb, style]}>
      {tool ? <GrueneratorLoadingIcon size={56} color={colors.white} /> : null}
    </Animated.View>
  );
}

function CallControls({ tool, error }: { tool: ToolCall | null; error: string | null }) {
  const theme = useTheme();
  const voice = useVoiceState();
  const { connect, disconnect, mute, unmute } = useVoiceControls();
  const status = voice?.status.type;
  const live = status === 'running' || status === 'starting';
  const muted = voice?.isMuted ?? false;

  const caption = tool
    ? `${TOOL_LABEL[tool.name] ?? 'Schlage nach'} …`
    : status === 'starting'
      ? 'Verbinde …'
      : status === 'running'
        ? muted
          ? 'Stumm – du kannst tippen'
          : 'Ich höre zu'
        : 'Gespräch beendet';

  return (
    <View style={styles.controls}>
      <Orb tool={tool} />
      <Text
        style={[styles.caption, { color: theme.textSecondary }]}
        accessibilityLiveRegion="polite"
      >
        {caption}
      </Text>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {live ? (
          <>
            <Pressable
              onPress={() => (muted ? unmute() : mute())}
              disabled={status !== 'running'}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Mikrofon an' : 'Mikrofon aus'}
              accessibilityState={{ selected: muted, disabled: status !== 'running' }}
              style={({ pressed }) => [
                styles.round,
                { backgroundColor: muted ? theme.text : theme.buttonBackground },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={muted ? 'mic-off' : 'mic'}
                size={22}
                color={muted ? theme.background : theme.text}
              />
            </Pressable>
            <Pressable
              onPress={() => disconnect()}
              accessibilityRole="button"
              accessibilityLabel="Gespräch beenden"
              style={({ pressed }) => [styles.round, styles.hangUp, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={24} color={colors.white} />
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => void connect()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.restart, pressed && styles.pressed]}
          >
            <Ionicons name="call" size={18} color={colors.white} />
            <Text style={styles.restartText}>Neu verbinden</Text>
          </Pressable>
        )}
      </View>
      {/* Kennzeichnung als KI-Dialog (Art. 50 Abs. 1 KI-VO). */}
      <Text style={[styles.notice, { color: theme.textSecondary }]}>
        Du sprichst mit einer KI. Audio läuft über Mistrals globalen Endpunkt.
      </Text>
    </View>
  );
}

/**
 * A voice conversation with Mistral's hosted agent, opened from the start
 * page's composer. Speech and typed text land in one thread; the orb carries
 * the loading gear while the agent looks something up.
 */
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
      <AssistantThread
        bareComposer
        welcome={{ title: 'Sprachgespräch', subtitle: 'Sprich einfach los.', suggestions: [] }}
        composerHeader={<CallControls tool={tool} error={error} />}
      />
    </AssistantRuntimeProvider>
  );
}

const styles = StyleSheet.create({
  controls: {
    alignItems: 'center',
    gap: spacing.small,
    paddingBottom: spacing.small,
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: colors.primary[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontFamily: BODY_FONT,
    fontSize: 15,
    minHeight: 20,
  },
  error: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    color: colors.semantic.error,
    textAlign: 'center',
    paddingHorizontal: spacing.medium,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.medium,
  },
  round: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangUp: {
    backgroundColor: colors.primary[600],
  },
  restart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    minHeight: 48,
    paddingHorizontal: spacing.large,
    borderRadius: 24,
    backgroundColor: colors.primary[600],
  },
  restartText: {
    fontFamily: BODY_FONT,
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
  notice: {
    fontFamily: BODY_FONT,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: spacing.medium,
  },
});
