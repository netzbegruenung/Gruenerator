import {
  MessagePrimitive,
  ThreadPrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  useAuiState,
} from '@assistant-ui/react-native';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

import { useNativeTTS } from '../../hooks/useNativeTTS';
import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius } from '../../theme';

import { MessageAttachmentUI } from './AttachmentUI';
import { CitationsFooter } from './CitationsFooter';
import { GeneratedImageDisplay } from './GeneratedImageDisplay';
import { getMarkdownStyles } from './markdownStyles';
import { MessageActionsSheet } from './MessageActionsSheet';
import { AskHumanCard } from './tool-ui/AskHumanCard';
import { ExampleResultsCard } from './tool-ui/ExampleResultsCard';
import { PersonResultCard } from './tool-ui/PersonResultCard';
import { PressemitteilungExamplesCard } from './tool-ui/PressemitteilungExamplesCard';
import { ResearchArtifactCard } from './tool-ui/ResearchArtifactCard';
import { ScrapeUrlCard } from './tool-ui/ScrapeUrlCard';
import { ToolResultCard } from './tool-ui/ToolResultCard';
import { ToolCallProgress } from './ToolCallProgress';

import type { Theme } from '../../theme/colors';
import type { ChatMessageMetadata } from '@gruenerator/chat';

export const UserMessageComponent = memo(function UserMessageComponent() {
  return (
    <MessagePrimitive.Root style={[styles.messageRow, styles.userRow]}>
      <View style={[styles.bubble, styles.userBubbleWidth, styles.userBubble]}>
        <MessagePrimitive.Attachments components={{ Attachment: MessageAttachmentUI }} />
        <MessagePrimitive.Content
          renderText={({ part }) => <Text style={styles.userText}>{part.text}</Text>}
        />
      </View>
    </MessagePrimitive.Root>
  );
});

function TypingDot({ delay, color }: { delay: number; color: string }) {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
        -1
      )
    );
  }, [delay, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    backgroundColor: color,
  }));

  return <Animated.View style={[styles.typingDot, animatedStyle]} />;
}

function TypingIndicator() {
  const theme = useTheme();
  return (
    <View style={styles.typingContainer}>
      <TypingDot delay={0} color={theme.textSecondary} />
      <TypingDot delay={150} color={theme.textSecondary} />
      <TypingDot delay={300} color={theme.textSecondary} />
    </View>
  );
}

const ReasoningBlock = memo(function ReasoningBlock({
  part,
  theme,
}: {
  part: { text: string };
  theme: Theme;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!part.text) return null;

  return (
    <View style={[styles.reasoningContainer, { borderColor: theme.border }]}>
      <Pressable style={styles.reasoningTrigger} onPress={() => setExpanded(!expanded)}>
        <Ionicons name="bulb-outline" size={14} color={colors.primary[500]} />
        <Text style={[styles.reasoningLabel, { color: theme.textSecondary }]}>Gedankengang</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={theme.textSecondary}
        />
      </Pressable>
      {expanded && (
        <Text style={[styles.reasoningText, { color: theme.textSecondary }]}>{part.text}</Text>
      )}
    </View>
  );
});

const BranchPicker = memo(function BranchPicker({ theme }: { theme: Theme }) {
  const branchCount = useAuiState((s) => s.message.branchCount);
  if (branchCount <= 1) return null;

  return (
    <View style={[styles.branchPicker, { borderColor: theme.border }]}>
      <BranchPickerPrimitive.Previous style={styles.branchButton}>
        <Ionicons name="chevron-back" size={14} color={theme.textSecondary} />
      </BranchPickerPrimitive.Previous>
      <View style={styles.branchLabel}>
        <BranchPickerPrimitive.Number style={[styles.branchText, { color: theme.textSecondary }]} />
        <Text style={[styles.branchText, { color: theme.textSecondary }]}>/</Text>
        <BranchPickerPrimitive.Count style={[styles.branchText, { color: theme.textSecondary }]} />
      </View>
      <BranchPickerPrimitive.Next style={styles.branchButton}>
        <Ionicons name="chevron-forward" size={14} color={theme.textSecondary} />
      </BranchPickerPrimitive.Next>
    </View>
  );
});

const AssistantActionBar = memo(function AssistantActionBar({
  theme,
  messageText,
  onLongPress,
}: {
  theme: Theme;
  messageText: string;
  onLongPress: () => void;
}) {
  const { state: ttsState, play, stop } = useNativeTTS();

  const handleTTS = useCallback(() => {
    if (ttsState === 'playing') {
      stop();
    } else if (messageText) {
      void play(messageText);
    }
  }, [ttsState, messageText, play, stop]);

  return (
    <View style={styles.actionBar}>
      <ActionBarPrimitive.Copy copiedDuration={2000}>
        {({ isCopied }) => (
          <View style={[styles.actionButton, { backgroundColor: theme.surface }]}>
            <Ionicons
              name={isCopied ? 'checkmark' : 'copy-outline'}
              size={14}
              color={isCopied ? colors.primary[500] : theme.textSecondary}
            />
          </View>
        )}
      </ActionBarPrimitive.Copy>
      <Pressable
        onPress={handleTTS}
        style={[styles.actionButton, { backgroundColor: theme.surface }]}
      >
        <Ionicons
          name={ttsState === 'playing' ? 'stop' : 'volume-medium-outline'}
          size={14}
          color={ttsState === 'playing' ? colors.primary[500] : theme.textSecondary}
        />
      </Pressable>
      <ActionBarPrimitive.Reload style={[styles.actionButton, { backgroundColor: theme.surface }]}>
        <Ionicons name="refresh-outline" size={14} color={theme.textSecondary} />
      </ActionBarPrimitive.Reload>
      <Pressable
        onPress={onLongPress}
        style={[styles.actionButton, { backgroundColor: theme.surface }]}
      >
        <Ionicons name="ellipsis-horizontal" size={14} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
});

function AssistantTextPart(props: { text: string }) {
  const theme = useTheme();
  const markdownStyles = useMemo(() => getMarkdownStyles(theme), [theme]);
  return <Markdown style={markdownStyles}>{props.text}</Markdown>;
}

function AssistantToolCallPart(props: {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  addResult: (result: string) => void;
}) {
  const theme = useTheme();
  const { toolName, args, result, addResult } = props;

  // Interactive: asks a clarifying question and submits the answer back into the
  // run (handles both the awaiting-input and the answered states itself).
  if (toolName === 'ask_human') {
    return <AskHumanCard args={args} result={result} addResult={addResult} theme={theme} />;
  }
  // Research has its own rich card that handles both loading and result states.
  if (toolName === 'research') {
    return <ResearchArtifactCard part={props} theme={theme} />;
  }
  // Still running: a compact progress pill.
  if (result === undefined) {
    return <ToolCallProgress part={props} theme={theme} />;
  }
  // Completed — pick the renderer matching the tool's result shape.
  switch (toolName) {
    case 'gruenerator_person_search':
      return <PersonResultCard result={result} theme={theme} />;
    case 'gruenerator_examples_search':
      return <ExampleResultsCard part={props} theme={theme} />;
    case 'scrape_url':
      return <ScrapeUrlCard part={props} theme={theme} />;
    case 'gruenerator_pressemitteilung_examples':
      return <PressemitteilungExamplesCard part={props} theme={theme} />;
    default:
      // search / web / sources / user-content → compact citation pill.
      return <ToolResultCard part={props} theme={theme} />;
  }
}

function AssistantReasoningPart(props: { text: string }) {
  const theme = useTheme();
  return <ReasoningBlock part={props} theme={theme} />;
}

export const AssistantMessageComponent = memo(function AssistantMessageComponent() {
  const theme = useTheme();
  const message = useAuiState((s) => s.message);
  const metadata = ((message.metadata as Record<string, unknown>)?.custom ??
    {}) as ChatMessageMetadata;
  const citations = metadata.citations;
  const generatedImage = metadata.generatedImage;
  const [actionsVisible, setActionsVisible] = useState(false);

  const messageText = useMemo(() => {
    return message.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
  }, [message.content]);

  const handleOpenActions = useCallback(() => {
    if (messageText) setActionsVisible(true);
  }, [messageText]);

  const partsComponents = useMemo(
    () => ({
      Text: AssistantTextPart,
      tools: { Fallback: AssistantToolCallPart },
      Reasoning: AssistantReasoningPart,
      Empty: TypingIndicator,
    }),
    []
  );

  return (
    <>
      <MessagePrimitive.Root style={[styles.messageRow, styles.assistantRow]}>
        <Pressable onLongPress={handleOpenActions} style={styles.assistantContent}>
          <View style={styles.assistantContent}>
            <MessagePrimitive.Parts components={partsComponents} />
            {generatedImage && <GeneratedImageDisplay image={generatedImage} theme={theme} />}
            {citations && citations.length > 0 && (
              <CitationsFooter citations={citations} theme={theme} />
            )}
          </View>
        </Pressable>
        <BranchPicker theme={theme} />
        <AssistantActionBar
          theme={theme}
          messageText={messageText}
          onLongPress={handleOpenActions}
        />
      </MessagePrimitive.Root>
      <MessageActionsSheet
        visible={actionsVisible}
        onClose={() => setActionsVisible(false)}
        message={
          messageText
            ? {
                role: 'assistant',
                text: messageText,
                metadata: metadata as Record<string, unknown>,
              }
            : null
        }
      />
    </>
  );
});

const FollowUpSuggestions = memo(function FollowUpSuggestions() {
  const theme = useTheme();
  const message = useAuiState((s) => s.message);
  const isLast = useAuiState((s) => s.message.isLast);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  if (!isLast || isRunning) return null;

  const metadata = ((message.metadata as Record<string, unknown>)?.custom ??
    {}) as ChatMessageMetadata;
  const suggestions = metadata.followUpSuggestions;
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <View style={styles.followUpContainer}>
      {suggestions.map((prompt, i) => (
        <ThreadPrimitive.Suggestion
          key={i}
          prompt={prompt}
          send
          style={[
            styles.followUpChip,
            { borderColor: theme.border, backgroundColor: theme.surface },
          ]}
        >
          <Text style={[styles.followUpText, { color: theme.text }]} numberOfLines={2}>
            {prompt}
          </Text>
        </ThreadPrimitive.Suggestion>
      ))}
    </View>
  );
});

export const MessageBubble = memo(function MessageBubble() {
  return (
    <>
      <MessagePrimitive.If user>
        <UserMessageComponent />
      </MessagePrimitive.If>
      <MessagePrimitive.If assistant>
        <AssistantMessageComponent />
        <FollowUpSuggestions />
      </MessagePrimitive.If>
    </>
  );
});

const styles = StyleSheet.create({
  messageRow: {
    paddingHorizontal: spacing.medium,
    marginVertical: spacing.xsmall,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
    marginTop: spacing.xxsmall,
  },
  bubble: {
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.small,
    borderRadius: borderRadius.large,
  },
  userBubbleWidth: {
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: colors.eucalyptus,
    borderBottomRightRadius: borderRadius.small,
  },
  assistantContent: {
    width: '100%',
  },
  userText: {
    color: colors.white,
    fontSize: 16,
    lineHeight: 24,
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.xxsmall,
    marginTop: spacing.xxsmall,
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  branchPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xxsmall,
  },
  branchButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  branchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  branchText: {
    fontSize: 11,
    fontWeight: '500',
  },
  reasoningContainer: {
    marginBottom: spacing.xsmall,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.medium,
    overflow: 'hidden',
  },
  reasoningTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  reasoningLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  reasoningText: {
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.small,
  },
  followUpContainer: {
    paddingHorizontal: spacing.medium,
    marginTop: spacing.xsmall,
    marginBottom: spacing.small,
    gap: spacing.xxsmall,
  },
  followUpChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: borderRadius.large,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xsmall,
  },
  followUpText: {
    fontSize: 13,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xsmall,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
