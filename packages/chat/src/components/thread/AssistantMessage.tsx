'use client';

import { memo, useMemo } from 'react';
import { MessagePrimitive, useMessage } from '@assistant-ui/react';
import { useAgentStore } from '../../stores/chatStore';
import { agentsList, getDefaultAgent } from '../../lib/agents';
import { ChatIcon } from '../icons';
import { MarkdownContent } from '../MarkdownContent';
import { ProgressIndicator } from '../message-parts/ProgressIndicator';
import { ProgressTracker } from '../tool-ui/progress-tracker/ProgressTracker';
import { SkillBadge } from '../message-parts/SkillBadge';
import { TypingIndicator } from '../message-parts/TypingIndicator';
import { GeneratedImageDisplay } from '../message-parts/GeneratedImageDisplay';
import { MessageActions } from '../message-parts/MessageActions';
import { SearchResultsSection, type AdditionalSource } from '../message-parts/SearchResultsSection';
import { CitationProvider, useFetchFullText } from '../../context/CitationContext';
import { resolveCitations } from '../../lib/citationUtils';
import type { ChatMessageMetadata } from '../../types/messageMetadata';

function AssistantMessageTextPart({
  text,
}: {
  type: 'text';
  text: string;
  [key: string]: unknown;
}) {
  if (!text) return null;

  return (
    <div className="prose prose-sm max-w-none break-words">
      <MarkdownContent content={text} />
    </div>
  );
}

const partComponents = { Text: AssistantMessageTextPart };

export const AssistantMessage = memo(function AssistantMessage() {
  const message = useMessage();
  const selectedAgentId = useAgentStore((s) => s.selectedAgentId);
  const custom = message.metadata?.custom as ChatMessageMetadata | undefined;

  const messageAgent = useMemo(() => {
    if (custom?.agentMention) return agentsList.find((a) => a.mention === custom.agentMention);
    if (custom?.agentId) return agentsList.find((a) => a.identifier === custom.agentId);
    if (selectedAgentId) return agentsList.find((a) => a.identifier === selectedAgentId);
    return undefined;
  }, [custom?.agentMention, custom?.agentId, selectedAgentId]);

  const isNonDefaultAgent = messageAgent != null && messageAgent.identifier !== getDefaultAgent();
  const fetchFullText = useFetchFullText();

  const textContent = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  const isStreaming = message.status?.type === 'running';
  const hasToolCall = message.content.some((p) => p.type === 'tool-call');

  const citations = useMemo(
    () => resolveCitations(custom as Record<string, unknown> | undefined),
    [custom]
  );
  const additionalSources = custom?.additionalSources as AdditionalSource[] | undefined;

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

  const showSearchResults = !isStreaming && citations.length > 0;

  return (
    <MessagePrimitive.Root className="group mx-auto flex w-full min-w-0 max-w-3xl items-start gap-4">
      {messageAgent ? (
        <div
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm"
          style={{ backgroundColor: messageAgent.backgroundColor }}
        >
          {messageAgent.avatar}
        </div>
      ) : (
        <ChatIcon size={32} className="flex-shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {isNonDefaultAgent && messageAgent && (
          <SkillBadge
            avatar={messageAgent.avatar}
            title={messageAgent.title}
            backgroundColor={messageAgent.backgroundColor}
          />
        )}

        {isStreaming &&
          !hasToolCall &&
          (() => {
            const stage = custom?.progress?.stage;
            const hasConcreteProgress =
              stage === 'searching' || stage === 'generating' || stage === 'generating_image';

            if (hasConcreteProgress) {
              const agentColor = messageAgent?.backgroundColor || '#316049';
              if (custom!.progress!.steps) {
                return (
                  <ProgressTracker
                    steps={custom!.progress!.steps}
                    agentColor={agentColor}
                    totalTimeMs={custom?.streamMetadata?.totalTimeMs}
                  />
                );
              }
              return <ProgressIndicator progress={custom!.progress!} agentColor={agentColor} />;
            }

            if (!textContent) {
              return <TypingIndicator />;
            }

            return null;
          })()}

        {isStreaming &&
          hasToolCall &&
          !textContent &&
          custom?.progress?.stage === 'generating' &&
          (custom?.progress?.steps ? (
            <ProgressTracker
              steps={custom.progress.steps}
              agentColor={messageAgent?.backgroundColor || '#316049'}
              totalTimeMs={custom?.streamMetadata?.totalTimeMs}
            />
          ) : (
            <ProgressIndicator
              progress={custom.progress}
              agentColor={messageAgent?.backgroundColor || '#316049'}
            />
          ))}

        {custom?.generatedImage && <GeneratedImageDisplay image={custom.generatedImage} />}

        <CitationProvider citations={citations} fetchFullText={fetchFullText}>
          <MessagePrimitive.Parts components={partComponents} />
        </CitationProvider>

        {showSearchResults && (
          <SearchResultsSection citations={citations} additionalSources={additionalSources} />
        )}

        {!isStreaming && textContent && (
          <MessageActions content={textContent} metadata={actionsMetadata} />
        )}
      </div>
    </MessagePrimitive.Root>
  );
});
