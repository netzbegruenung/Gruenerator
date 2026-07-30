import { MessagePrimitive, useAuiState } from '@assistant-ui/react-native';
import {
  agentMentionables,
  getCustomAgentMentionables,
  getDefaultAgent,
  selectHasVisibleToolCard,
  selectSearchStatusLabel,
  useFetchFullText,
  type ChatMessageMetadata,
  type Citation,
  type StatusPartLike,
} from '@gruenerator/chat';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { BahnCard } from '../BahnCard';
import { ChatChartCard } from '../ChatChartCard';
import { ChatProgressIndicator } from '../ChatProgressIndicator';
import { CitationDetailSheet } from '../CitationDetailSheet';
import { CitationsFooter } from '../CitationsFooter';
import { ComputeCard } from '../ComputeCard';
import { ConfirmActionCard } from '../ConfirmActionCard';
import { DocumentCreatedCard } from '../DocumentCreatedCard';
import { GeneratedImageDisplay } from '../GeneratedImageDisplay';
import { MemoryIndicator } from '../MemoryIndicator';
import { SocialPostCard } from '../SocialPostCard';

import { AgentBadge } from './AgentBadge';
import { AssistantActionBar } from './AssistantActionBar';
import { AssistantTextPart } from './AssistantTextPart';
import { BranchPicker } from './BranchPicker';
import { MessageCitationsContext } from './citationContext';
import { resolveMessageAgent, shouldShowAgentBadge } from './messageAgent';
import { messageLayout } from './messageLayout';
import { AssistantReasoningPart } from './ReasoningBlock';
import { AssistantToolCallPartWithNarration } from './ToolCallPart';
import { TypingIndicator } from './TypingIndicator';

const partsComponents = {
  Text: AssistantTextPart,
  tools: { Fallback: AssistantToolCallPartWithNarration },
  Reasoning: AssistantReasoningPart,
  Empty: TypingIndicator,
};

export const AssistantMessage = memo(function AssistantMessage() {
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
  const socialPostData = metadata.socialPostData;
  const bahnData = metadata.bahnData;

  // Which Grünerator wrote this. `getCustomAgentMentionables()` is a plain read
  // of the module-level catalogue `useMentionablesSync` fills, so it re-resolves
  // with the metadata rather than needing its own subscription.
  const agent = useMemo(
    () => resolveMessageAgent(metadata, agentMentionables, getCustomAgentMentionables()),
    [metadata]
  );

  // While this (last) message is still streaming, surface the cycling stage word
  // + spinning cog the same way web does — the label rides on metadata.progress,
  // written by the shared SSE adapter. Once a tool CARD exists, the tool UI owns
  // the progress affordance, so we step aside. Retrieval steps draw no card;
  // they ride this line instead, naming the running search rather than the
  // generic stage word — and, like web, only until the answer text starts.
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isLast = useAuiState((s) => s.message.isLast);
  const isStreaming = isRunning && isLast;
  const statusParts = message.content as ReadonlyArray<StatusPartLike>;
  const hasToolCall = message.content.some((p) => p.type === 'tool-call');
  const hasToolCard = selectHasVisibleToolCard(statusParts);
  const toolStatus = selectSearchStatusLabel(statusParts);
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

  // A tool CARD owns the affordance outright; a cardless retrieval turn keeps
  // the line, but only until the answer text starts (web's !textContent gate).
  const showsProgress =
    isStreaming && !!progress && !hasToolCard && (!hasToolCall || messageText.length === 0);

  return (
    <MessagePrimitive.Root style={[messageLayout.row, messageLayout.assistantRow]}>
      <View style={messageLayout.assistantContent}>
        {shouldShowAgentBadge(agent, getDefaultAgent()) && (
          <AgentBadge agent={agent} theme={theme} />
        )}
        {showsProgress && progress && (
          <ChatProgressIndicator progress={progress} theme={theme} toolStatus={toolStatus} />
        )}
        {/* Above the prose, like web: when a turn produced a post, the post is
            the answer and the surrounding text is commentary on it. */}
        {socialPostData && <SocialPostCard post={socialPostData} theme={theme} />}
        <MessageCitationsContext.Provider value={citationCtx}>
          <MessagePrimitive.Parts components={partsComponents} />
        </MessageCitationsContext.Provider>
        {/* Mirrors web's AssistantMessage: compute/chart cards appear once the
            stream is done — during streaming the progress affordance owns the
            space and the metadata may still be partial. */}
        {!isStreaming && computeData && <ComputeCard data={computeData} theme={theme} />}
        {!isStreaming && chartData && <ChatChartCard data={chartData} theme={theme} />}
        {!isStreaming && bahnData && <BahnCard data={bahnData} theme={theme} />}
        {generatedImage && <GeneratedImageDisplay image={generatedImage} theme={theme} />}
        {confirmAction && <ConfirmActionCard action={confirmAction} theme={theme} />}
        {createdDocument && <DocumentCreatedCard document={createdDocument} theme={theme} />}
        {citations && citations.length > 0 && (
          <CitationsFooter citations={citations} theme={theme} onSelect={setSelectedCitation} />
        )}
        {!isStreaming && progress?.memoryContext && (
          <MemoryIndicator memoryContext={progress.memoryContext} theme={theme} />
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
