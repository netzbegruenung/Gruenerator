'use client';

import { memo, useMemo } from 'react';
import { MessagePrimitive, useMessage } from '@assistant-ui/react';
import { agentsList, getDefaultAgent } from '../../lib/agents';
import { GrueneratorHomeIconLoading } from '../icons';
import { CitationMarkdownText } from '../message-parts/CitationMarkdownText';
import { Reasoning, ReasoningGroup } from '../assistant-ui/reasoning';
import { ProgressIndicator } from '../message-parts/ProgressIndicator';
import { ProgressTracker } from '../tool-ui/progress-tracker/ProgressTracker';
import { SkillBadge } from '../message-parts/SkillBadge';
import { TypingIndicator } from '../message-parts/TypingIndicator';
import { GeneratedImageDisplay } from '../message-parts/GeneratedImageDisplay';
import { SharepicVariantStack } from '../message-parts/SharepicVariantStack';
import { MemoryIndicator } from '../message-parts/MemoryIndicator';
import { MessageActions } from '../message-parts/MessageActions';
import { SearchResultsSection, type AdditionalSource } from '../message-parts/SearchResultsSection';
import { CitationProvider, useFetchFullText } from '../../context/CitationContext';
import { resolveCitations } from '../../lib/citationUtils';
import { ConfirmActionCard } from '../tool-ui/ConfirmActionCard';
import { DocumentCreatedCard } from '../tool-ui/DocumentCreatedCard';
import { useChatDensity } from './chatDensityContext';
import type { ChatMessageMetadata } from '../../types/messageMetadata';

function AssistantMessageTextPart() {
  const isCompact = useChatDensity() === 'compact';
  return (
    <div
      className={
        isCompact
          ? 'prose prose-sm max-w-none min-w-0 break-words text-[13px] [&_h1]:text-base [&_h1]:mt-3 [&_h1]:mb-2 [&_h2]:text-[15px] [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5'
          : 'prose prose-sm max-w-none min-w-0 break-words'
      }
    >
      <CitationMarkdownText />
    </div>
  );
}

const partComponents = { Text: AssistantMessageTextPart, Reasoning, ReasoningGroup };

export const AssistantMessage = memo(function AssistantMessage() {
  const message = useMessage();
  const density = useChatDensity();
  const isCompact = density === 'compact';
  const custom = message.metadata?.custom as ChatMessageMetadata | undefined;

  // Resolve the agent that PRODUCED this message from its own metadata only.
  // The chat adapter sets `custom.agentId`/`agentMention` on every frame when an
  // agent is active, so this covers normal agent chats. Surfaces with no agent
  // (notebook QA, eigener chat) leave it unset → no agent avatar/badge. We do
  // NOT fall back to the currently-selected agent: selection is ambient UI state,
  // not message provenance, and leaks the wrong agent into notebook answers.
  const messageAgent = useMemo(() => {
    if (custom?.agentMention) return agentsList.find((a) => a.mention === custom.agentMention);
    if (custom?.agentId) return agentsList.find((a) => a.identifier === custom.agentId);
    return undefined;
  }, [custom?.agentMention, custom?.agentId]);

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
    <MessagePrimitive.Root
      className={
        isCompact
          ? 'group mx-auto flex w-full min-w-0 items-start gap-2'
          : 'group mx-auto flex w-full min-w-0 max-w-3xl items-start gap-4'
      }
    >
      {messageAgent ? (
        <div
          className={
            isCompact
              ? 'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white'
              : 'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white'
          }
          style={{ backgroundColor: messageAgent.backgroundColor }}
        >
          <messageAgent.icon className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden />
        </div>
      ) : (
        <GrueneratorHomeIconLoading
          loading={isStreaming}
          width={isCompact ? 24 : 32}
          height={isCompact ? 24 : 32}
          className="flex-shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        {isNonDefaultAgent && messageAgent && (
          <SkillBadge
            avatar={messageAgent.avatar}
            icon={messageAgent.icon}
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
          (custom?.progress?.stage === 'generating' || custom?.progress?.stage === 'searching') &&
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

        {custom?.sharepicData && !custom?.generatedImage && (
          <SharepicVariantStack data={custom.sharepicData} />
        )}
        {custom?.generatedImage && <GeneratedImageDisplay image={custom.generatedImage} />}

        <CitationProvider citations={citations} fetchFullText={fetchFullText}>
          <MessagePrimitive.Parts components={partComponents} />
        </CitationProvider>

        {!isStreaming && custom?.confirmAction && (
          <ConfirmActionCard action={custom.confirmAction} />
        )}

        {!isStreaming && custom?.createdDocument && (
          <DocumentCreatedCard document={custom.createdDocument} />
        )}

        {showSearchResults && (
          <SearchResultsSection citations={citations} additionalSources={additionalSources} />
        )}

        {!isStreaming && textContent && (
          <MessageActions content={textContent} metadata={actionsMetadata} />
        )}

        {!isStreaming && custom?.progress?.memoryContext && (
          <MemoryIndicator memoryContext={custom.progress.memoryContext} />
        )}
      </div>
    </MessagePrimitive.Root>
  );
});
