import { MessagePrimitive, useAuiState } from '@assistant-ui/react-native';
import { useFetchFullText, type ChatMessageMetadata, type Citation } from '@gruenerator/chat';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { ChatChartCard } from '../ChatChartCard';
import { ChatProgressIndicator } from '../ChatProgressIndicator';
import { CitationDetailSheet } from '../CitationDetailSheet';
import { CitationsFooter } from '../CitationsFooter';
import { ComputeCard } from '../ComputeCard';
import { ConfirmActionCard } from '../ConfirmActionCard';
import { DocumentCreatedCard } from '../DocumentCreatedCard';
import { GeneratedImageDisplay } from '../GeneratedImageDisplay';

import { AssistantActionBar } from './AssistantActionBar';
import { AssistantTextPart } from './AssistantTextPart';
import { BranchPicker } from './BranchPicker';
import { MessageCitationsContext } from './citationContext';
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

  return (
    <MessagePrimitive.Root style={[messageLayout.row, messageLayout.assistantRow]}>
      <View style={messageLayout.assistantContent}>
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
