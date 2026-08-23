import { MessagePrimitive, useAuiState } from '@assistant-ui/react-native';
import {
  agentMentionables,
  getCustomAgentMentionables,
  getDefaultAgent,
  selectReasoningText,
  selectSearchSources,
  selectSearchStatusLabel,
  selectStepAfterText,
  useFetchFullText,
  type ChatMessageMetadata,
  type Citation,
  type StatusPartLike,
} from '@gruenerator/chat';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { ArtifactCard } from '../ArtifactCard';
import { BahnCard } from '../BahnCard';
import { ChatChartCard } from '../ChatChartCard';
import { ChatStatusLine } from '../ChatStatusLine';
import { CitationDetailSheet } from '../CitationDetailSheet';
import { CitationsFooter } from '../CitationsFooter';
import { ComputeCard } from '../ComputeCard';
import { ConfirmActionCard } from '../ConfirmActionCard';
import { DocumentCreatedCard } from '../DocumentCreatedCard';
import { GeneratedImageDisplay } from '../GeneratedImageDisplay';
import { MemoryIndicator } from '../MemoryIndicator';
import { SearchImagesSection } from '../SearchImagesSection';
import { SocialPostCard } from '../SocialPostCard';

import { AgentBadge } from './AgentBadge';
import { AssistantActionBar } from './AssistantActionBar';
import { AssistantTextPart } from './AssistantTextPart';
import { BranchPicker } from './BranchPicker';
import { MessageCitationsContext } from './citationContext';
import { resolveMessageAgent, shouldShowAgentBadge } from './messageAgent';
import { messageLayout } from './messageLayout';
import { HiddenReasoningPart } from './ReasoningBlock';
import { AssistantToolCallPartWithNarration } from './ToolCallPart';
import { ToolGroupScope } from './toolGroupContext';

// Reasoning renders NOTHING in document order: the thinking hangs under the
// status line's chevron (StatusLineDetails), and retires with it.
//
// No `Empty` slot either. The typing dots belong to ChatStatusLine, which is the
// only place that knows whether something better is available. As a part slot
// they were a second, blind decider, happily filling every silence the shimmer's
// own gates produced — which is what a plain question looked like on mobile.
const partsComponents = {
  Text: AssistantTextPart,
  tools: { Fallback: AssistantToolCallPartWithNarration },
  Reasoning: HiddenReasoningPart,
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
  const artifactData = metadata.artifactData;
  const searchImages = metadata.searchImages;

  // Which Grünerator wrote this. `getCustomAgentMentionables()` is a plain read
  // of the module-level catalogue `useMentionablesSync` fills, so it re-resolves
  // with the metadata rather than needing its own subscription.
  const agent = useMemo(
    () => resolveMessageAgent(metadata, agentMentionables, getCustomAgentMentionables()),
    [metadata]
  );

  // While this (last) message is still streaming, surface the cycling stage word
  // + spinning cog the same way web does — the label rides on metadata.progress,
  // written by the shared SSE adapter. Retrieval steps draw no card; they ride
  // this line instead, naming the running search rather than the generic stage
  // word — and, like web, only until the answer text starts.
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const isLast = useAuiState((s) => s.message.isLast);
  const isStreaming = isRunning && isLast;
  const statusParts = message.content as ReadonlyArray<StatusPartLike>;
  const hasOwnDetail =
    message.content.some((p) => p.type === 'tool-call') ||
    message.content.some((p) => p.type === 'reasoning');
  // …except on an agentic turn, which keeps working after its first sentence.
  const stepAfterText = selectStepAfterText(statusParts);
  const toolStatus = selectSearchStatusLabel(statusParts);
  const reasoningText = selectReasoningText(statusParts);
  const statusSources = useMemo(() => selectSearchSources(statusParts), [statusParts]);
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

  return (
    <MessagePrimitive.Root style={[messageLayout.row, messageLayout.assistantRow]}>
      <View style={messageLayout.assistantContent}>
        {shouldShowAgentBadge(agent, getDefaultAgent()) && (
          <AgentBadge agent={agent} theme={theme} />
        )}
        <ChatStatusLine
          isStreaming={isStreaming}
          hasOwnDetail={hasOwnDetail}
          textLength={messageText.length}
          stepAfterText={stepAfterText}
          progress={progress}
          theme={theme}
          toolStatus={toolStatus}
          reasoningText={reasoningText}
          sources={statusSources}
        />
        {/* Above the prose, like web: when a turn produced a post, the post is
            the answer and the surrounding text is commentary on it. */}
        {socialPostData && <SocialPostCard post={socialPostData} theme={theme} />}
        {/* Above the answer, like web: on a turn that found pictures they are the
            first thing the reader looks at, and a gallery that follows a
            thousand words is a gallery nobody scrolls to. Held back while the
            turn streams — the hit list is replaced wholesale by each search, so
            a mid-loop render would shuffle tiles under the reader's thumb. */}
        {!isStreaming && searchImages && searchImages.length > 0 && (
          <SearchImagesSection images={searchImages} theme={theme} />
        )}
        <MessageCitationsContext.Provider value={citationCtx}>
          <ToolGroupScope>
            <MessagePrimitive.Parts components={partsComponents} />
          </ToolGroupScope>
        </MessageCitationsContext.Provider>
        {/* Mirrors web's AssistantMessage: compute/chart cards appear once the
            stream is done — during streaming the progress affordance owns the
            space and the metadata may still be partial. */}
        {!isStreaming && computeData && <ComputeCard data={computeData} theme={theme} />}
        {!isStreaming && chartData && <ChatChartCard data={chartData} theme={theme} />}
        {!isStreaming && artifactData && <ArtifactCard artifact={artifactData} theme={theme} />}
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
