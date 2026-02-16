'use client';

import { memo, useMemo } from 'react';
import { MessagePrimitive, useMessage } from '@assistant-ui/react';
import { useAgentStore } from '../../stores/chatStore';
import { agentsList } from '../../lib/agents';
import { ChatIcon } from '../icons';
import { MarkdownContent } from '../MarkdownContent';
import { ProgressIndicator } from '../message-parts/ProgressIndicator';
import { TypingIndicator } from '../message-parts/TypingIndicator';
import { GeneratedImageDisplay } from '../message-parts/GeneratedImageDisplay';
import { MessageActions } from '../message-parts/MessageActions';
import { SearchResultsSection } from '../message-parts/SearchResultsSection';
import { CitationProvider } from '../../context/CitationContext';
import type { GrueneratorMessageMetadata } from '../../runtime/GrueneratorModelAdapter';

function AssistantMessageTextPart({
  text,
}: {
  type: 'text';
  text: string;
  [key: string]: unknown;
}) {
  if (!text) return null;

  return (
    <div className="prose prose-sm max-w-none">
      <MarkdownContent content={text} />
    </div>
  );
}

const partComponents = { Text: AssistantMessageTextPart };

export function AssistantMessage() {
  const message = useMessage();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const selectedAgent = useMemo(
    () => agentsList.find((a) => a.identifier === selectedAgentId),
    [selectedAgentId]
  );
  const custom = message.metadata?.custom as GrueneratorMessageMetadata | undefined;

  const textContent = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  const isStreaming = message.status?.type === 'running';
  const hasToolCall = message.content.some((p) => p.type === 'tool-call');

  const citations = custom?.citations || [];

  const actionsMetadata = useMemo(() => {
    if (!custom) return undefined;
    return {
      citations: custom.citations,
      searchResults: custom.searchResults,
      intent: custom.streamMetadata?.intent,
      searchCount: custom.streamMetadata?.searchCount,
      generatedImage: custom.generatedImage,
    };
  }, [custom]);

  return (
    <MessagePrimitive.Root className="group mx-auto flex w-full max-w-3xl items-start gap-4">
      {selectedAgent ? (
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
          style={{ backgroundColor: selectedAgent.backgroundColor }}
        >
          {selectedAgent.avatar}
        </div>
      ) : (
        <ChatIcon size={32} className="flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {isStreaming &&
          !hasToolCall &&
          (() => {
            const stage = custom?.progress?.stage;
            const hasConcreteProgress =
              stage === 'searching' || stage === 'generating' || stage === 'generating_image';

            if (hasConcreteProgress) {
              return (
                <ProgressIndicator
                  progress={custom!.progress!}
                  agentColor={selectedAgent?.backgroundColor || '#316049'}
                />
              );
            }

            if (!textContent) {
              return <TypingIndicator />;
            }

            return null;
          })()}

        {custom?.generatedImage && <GeneratedImageDisplay image={custom.generatedImage} />}

        <CitationProvider citations={citations}>
          <MessagePrimitive.Parts components={partComponents} />
          {!isStreaming && citations.length > 0 && <SearchResultsSection citations={citations} />}
        </CitationProvider>

        {!isStreaming && textContent && (
          <MessageActions content={textContent} metadata={actionsMetadata} />
        )}
      </div>
    </MessagePrimitive.Root>
  );
}
