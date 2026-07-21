import {
  MessagePrimitive,
  ThreadPrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  useAuiState,
} from '@assistant-ui/react-native';
import { parseGenericFallback, resolveToolEntry, useFetchFullText } from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';

import { useMessageActions } from '../../hooks/useMessageActions';
import { useNativeTTS } from '../../hooks/useNativeTTS';
import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, borderRadius } from '../../theme';

import { MessageAttachmentUI } from './AttachmentUI';
import { ChatChartCard } from './ChatChartCard';
import { ChatProgressIndicator } from './ChatProgressIndicator';
import { CitationDetailSheet } from './CitationDetailSheet';
import { CitationsFooter } from './CitationsFooter';
import { ComputeCard } from './ComputeCard';
import { ConfirmActionCard } from './ConfirmActionCard';
import { DocumentCreatedCard } from './DocumentCreatedCard';
import { GeneratedImageDisplay } from './GeneratedImageDisplay';
import { getMarkdownStyles } from './markdownStyles';
import { MathText } from './math/MathText';
import { AskHumanCard } from './tool-ui/AskHumanCard';
import { makeCitationMarkdownRules } from './tool-ui/citationMarkdownRules';
import { ExampleResultsCard } from './tool-ui/ExampleResultsCard';
import { ImageResultCard } from './tool-ui/ImageResultCard';
import { KeyValueCard } from './tool-ui/KeyValueCard';
import { PersonResultCard } from './tool-ui/PersonResultCard';
import { PressemitteilungExamplesCard } from './tool-ui/PressemitteilungExamplesCard';
import { ResearchArtifactCard } from './tool-ui/ResearchArtifactCard';
import { RunPythonCard } from './tool-ui/RunPythonCard';
import { ScrapeUrlCard } from './tool-ui/ScrapeUrlCard';
import { ToolResultCard } from './tool-ui/ToolResultCard';
import { ToolCallProgress } from './ToolCallProgress';

import type { Theme } from '../../theme/colors';
import type { ChatMessageMetadata, Citation } from '@gruenerator/chat';

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

// One aligned icon row under each assistant reply. Mirrors web's MessageActions
// set (copy / download / edit-as-document) inline — previously download and
// edit-as-document were hidden behind a long-press sheet — plus mobile's TTS and
// the assistant-ui reload. Every button shares the same 28×28 pill so they line
// up regardless of which are present.
const AssistantActionBar = memo(function AssistantActionBar({
  theme,
  messageText,
  metadata,
}: {
  theme: Theme;
  messageText: string;
  metadata: ChatMessageMetadata;
}) {
  const { state: ttsState, play, stop } = useNativeTTS();
  const target = useMemo(
    () =>
      messageText
        ? { role: 'assistant', text: messageText, metadata: metadata as Record<string, unknown> }
        : null,
    [messageText, metadata]
  );
  const { copied, exporting, copy, exportDocx, openInDocs } = useMessageActions(target);

  const handleTTS = useCallback(() => {
    if (ttsState === 'playing') {
      stop();
    } else if (messageText) {
      void play(messageText);
    }
  }, [ttsState, messageText, play, stop]);

  const pill = [styles.actionButton, { backgroundColor: theme.surface }];

  return (
    <View style={styles.actionBar}>
      {messageText ? (
        <Pressable onPress={() => void copy()} style={pill} accessibilityLabel="Kopieren">
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? colors.primary[500] : theme.textSecondary}
          />
        </Pressable>
      ) : null}
      <Pressable onPress={handleTTS} style={pill} accessibilityLabel="Vorlesen">
        <Ionicons
          name={ttsState === 'playing' ? 'stop' : 'volume-medium-outline'}
          size={14}
          color={ttsState === 'playing' ? colors.primary[500] : theme.textSecondary}
        />
      </Pressable>
      {messageText ? (
        <>
          <Pressable
            onPress={() => void exportDocx()}
            disabled={!!exporting}
            style={pill}
            accessibilityLabel="Als Word herunterladen"
          >
            <Ionicons
              name={exporting === 'docx' ? 'hourglass-outline' : 'download-outline'}
              size={14}
              color={theme.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={() => void openInDocs()}
            disabled={!!exporting}
            style={pill}
            accessibilityLabel="Im Editor öffnen"
          >
            <Ionicons
              name={exporting === 'docs' ? 'hourglass-outline' : 'create-outline'}
              size={14}
              color={theme.textSecondary}
            />
          </Pressable>
        </>
      ) : null}
      <ActionBarPrimitive.Reload style={pill}>
        <Ionicons name="refresh-outline" size={14} color={theme.textSecondary} />
      </ActionBarPrimitive.Reload>
    </View>
  );
});

/**
 * Per-message citation lookup + tap handler, provided by AssistantMessageComponent.
 * Lets the streamed text part turn inline [N] markers into tappable chips that open
 * the citation detail sheet — the native analog of web's CitationProvider → CitationBadge.
 */
const MessageCitationsContext = createContext<{
  citationMap: Map<number, Citation>;
  onCitationPress: (citation: Citation) => void;
} | null>(null);

function AssistantTextPart(props: { text: string }) {
  const theme = useTheme();
  const markdownStyles = useMemo(() => getMarkdownStyles(theme), [theme]);
  const citationCtx = useContext(MessageCitationsContext);
  const rules = useMemo(
    () =>
      citationCtx
        ? makeCitationMarkdownRules(citationCtx.citationMap, citationCtx.onCitationPress)
        : undefined,
    [citationCtx]
  );
  return (
    <MathText
      text={props.text}
      markdownStyles={markdownStyles}
      rules={rules ?? null}
      theme={theme}
    />
  );
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
  // run_python owns running/failed/done itself (registry maps it to the
  // 'interactive' kind, which would wrongly render AskHumanCard here).
  if (toolName === 'run_python') {
    return <RunPythonCard args={args} result={result} theme={theme} />;
  }
  // Still running: a compact progress pill.
  if (result === undefined) {
    return <ToolCallProgress part={props} theme={theme} />;
  }
  // Completed — the shared registry parses the result to a platform-neutral
  // view-model; this switch only maps its kind to the native component.
  const vm = resolveToolEntry(toolName).parse(args, result);
  switch (vm.kind) {
    case 'person':
      return <PersonResultCard result={result} theme={theme} />;
    case 'snippets':
      return <ExampleResultsCard part={props} theme={theme} />;
    case 'link-preview':
      return <ScrapeUrlCard part={props} theme={theme} />;
    case 'press-examples':
      return <PressemitteilungExamplesCard part={props} theme={theme} />;
    case 'image':
      return <ImageResultCard vm={vm} theme={theme} />;
    case 'text-note':
      return <ToolResultCard part={props} citations={[]} note={vm.text} theme={theme} />;
    case 'citations':
      return <ToolResultCard part={props} citations={vm.citations} theme={theme} />;
    case 'key-value':
      return <KeyValueCard part={props} vm={vm} theme={theme} />;
    case 'markdown-report':
      // research is handled above; defensive for a future markdown-report tool.
      return <ResearchArtifactCard part={props} theme={theme} />;
    case 'interactive':
      return <AskHumanCard args={args} result={result} addResult={addResult} theme={theme} />;
    default: {
      // Future view kinds must never vanish silently — degrade to the generic
      // fallback parse the registry uses for unknown tools.
      const fallback = parseGenericFallback(args, result);
      if (fallback.kind === 'key-value') {
        return <KeyValueCard part={props} vm={fallback} theme={theme} />;
      }
      return (
        <ToolResultCard
          part={props}
          citations={[]}
          note={fallback.kind === 'text-note' ? fallback.text : null}
          theme={theme}
        />
      );
    }
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
  const confirmAction = metadata.confirmAction;
  const createdDocument = metadata.createdDocument;
  const computeData = metadata.computeData;
  const chartData = metadata.chartData;

  // While this (last) message is still streaming, surface the cycling stage word
  // + spinning cog the same way web does — the label rides on metadata.progress,
  // written by the shared SSE adapter. Once a tool-call part exists, the tool UI
  // owns the progress affordance, so we step aside (mirrors web's !hasToolCall).
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isLast = useAuiState((s) => s.message.isLast);
  const isStreaming = isRunning && isLast;
  const hasToolCall = message.content.some((p) => p.type === 'tool-call');
  const progress = metadata.progress;

  const fetchFullText = useFetchFullText();
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);

  // One lookup the streamed text part reads to turn inline [N] markers into chips
  // that open the same detail sheet the "Quellen" footer uses.
  const citationCtx = useMemo(() => {
    if (!citations || citations.length === 0) return null;
    return {
      citationMap: new Map<number, Citation>(citations.map((c) => [c.id, c])),
      onCitationPress: setSelectedCitation,
    };
  }, [citations]);

  const messageText = useMemo(() => {
    return message.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
  }, [message.content]);

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
    <MessagePrimitive.Root style={[styles.messageRow, styles.assistantRow]}>
      <View style={styles.assistantContent}>
        {isStreaming && !hasToolCall && progress && (
          <ChatProgressIndicator progress={progress} theme={theme} />
        )}
        <MessageCitationsContext.Provider value={citationCtx}>
          <MessagePrimitive.Parts components={partsComponents} />
        </MessageCitationsContext.Provider>
        {/* Mirrors web's AssistantMessage: compute/chart cards appear once the
            stream is done — during streaming the progress affordance owns the
            space and the metadata may still be partial. */}
        {!isStreaming && computeData && <ComputeCard data={computeData} theme={theme} />}
        {!isStreaming && chartData && <ChatChartCard data={chartData} theme={theme} />}
        {generatedImage && <GeneratedImageDisplay image={generatedImage} theme={theme} />}
        {confirmAction && <ConfirmActionCard action={confirmAction} theme={theme} />}
        {createdDocument && <DocumentCreatedCard document={createdDocument} theme={theme} />}
        {citations && citations.length > 0 && (
          <CitationsFooter citations={citations} theme={theme} onSelect={setSelectedCitation} />
        )}
      </View>
      <BranchPicker theme={theme} />
      <AssistantActionBar theme={theme} messageText={messageText} metadata={metadata} />
      <CitationDetailSheet
        citation={selectedCitation}
        theme={theme}
        onClose={() => setSelectedCitation(null)}
        fetchFullText={fetchFullText}
      />
    </MessagePrimitive.Root>
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
