'use client';

import { MessagePrimitive, useAuiState } from '@assistant-ui/react';
import { type SkillIcon } from '@gruenerator/shared/agents';
import { memo, useCallback, useMemo, useState } from 'react';

import { CitationProvider, useFetchFullText } from '../../context/CitationContext';
import { agentsList, getDefaultAgent } from '../../lib/agents';
import { resolveCitations } from '../../lib/citationUtils';
import { phosphorAgentIcon } from '../../lib/phosphorAgentIcon';
import {
  selectReasoningText,
  selectSearchSources,
  selectSearchStatusLabel,
  type StatusPartLike,
} from '../../lib/toolStatusLine';
import { useUserAgentsRegistry } from '../../stores/userAgentsRegistry';
import { HiddenReasoning, HiddenReasoningGroup } from '../assistant-ui/reasoning';
import { GrueneratorHomeIconLoading } from '../icons';
import { ArtifactCard } from '../message-parts/ArtifactCard';
import { BahnCard } from '../message-parts/BahnCard';
import { ChatChart } from '../message-parts/ChatChart';
import { CitationMarkdownText } from '../message-parts/CitationMarkdownText';
import { ComputeCard } from '../message-parts/ComputeCard';
import { GeneratedImageDisplay } from '../message-parts/GeneratedImageDisplay';
import { MemoryIndicator } from '../message-parts/MemoryIndicator';
import { MessageActions } from '../message-parts/MessageActions';
import { MessageErrorBanner } from '../message-parts/MessageErrorBanner';
import { MessageStreamingProvider } from '../message-parts/messageStreamingContext';
import { ProgressIndicator } from '../message-parts/ProgressIndicator';
import { SearchImagesSection } from '../message-parts/SearchImagesSection';
import { SearchResultsSection, type AdditionalSource } from '../message-parts/SearchResultsSection';
import { SharepicVariantStack } from '../message-parts/SharepicVariantStack';
import { SkillBadge } from '../message-parts/SkillBadge';
import { SocialPostCard } from '../message-parts/SocialPostCard';
import { StreamingStatusLine } from '../message-parts/StreamingStatusLine';
import { ToolCallGroup } from '../message-parts/ToolCallGroup';
import { TypingIndicator } from '../message-parts/TypingIndicator';
import { ConfirmActionCard } from '../tool-ui/ConfirmActionCard';
import { DocumentCreatedCard } from '../tool-ui/DocumentCreatedCard';
import { ProgressTracker } from '../tool-ui/progress-tracker/ProgressTracker';
import { ReelPickerCard } from '../tool-ui/ReelPickerCard';
import { ReelProcessingCard } from '../tool-ui/ReelProcessingCard';

import { useChatDensity } from './chatDensityContext';

import type { ChatMessageMetadata } from '../../types/messageMetadata';

function AssistantMessageTextPart() {
  const isCompact = useChatDensity() === 'compact';
  // Expose streaming state to descendants (ChatCodeBlock auto-runs a spreadsheet
  // block only once the message has finished streaming).
  const isStreaming = useAuiState((s) => s.message.status?.type === 'running');
  return (
    <div
      className={
        isCompact
          ? 'prose prose-sm max-w-none min-w-0 break-words text-[13px] [&_h1]:text-base [&_h1]:mt-3 [&_h1]:mb-2 [&_h2]:text-[15px] [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5'
          : 'prose prose-sm max-w-none min-w-0 break-words'
      }
    >
      <MessageStreamingProvider value={isStreaming}>
        <CitationMarkdownText />
      </MessageStreamingProvider>
    </div>
  );
}

// Reasoning renders NOTHING in document order: the thinking hangs under the
// status line's chevron instead (StatusLineDetails), and retires with it.
const partComponents = {
  Text: AssistantMessageTextPart,
  Reasoning: HiddenReasoning,
  ReasoningGroup: HiddenReasoningGroup,
  ToolGroup: ToolCallGroup,
};

export const AssistantMessage = memo(function AssistantMessage() {
  const message = useAuiState((s) => s.message);
  const density = useChatDensity();
  const isCompact = density === 'compact';
  const custom = message.metadata?.custom as ChatMessageMetadata | undefined;
  const userAgents = useUserAgentsRegistry((s) => s.userAgents);

  // Resolve the agent that PRODUCED this message from its own metadata only.
  // The chat adapter sets `custom.agentId`/`agentMention` on every frame when an
  // agent is active, so this covers normal agent chats. Surfaces with no agent
  // (notebook QA, eigener chat) leave it unset → no agent avatar/badge. We do
  // NOT fall back to the currently-selected agent: selection is ambient UI state,
  // not message provenance, and leaks the wrong agent into notebook answers.
  const messageAgent = useMemo<
    | {
        identifier: string;
        icon: SkillIcon;
        backgroundColor: string;
        avatar: string;
        title: string;
      }
    | undefined
  >(() => {
    const skill = custom?.agentMention
      ? agentsList.find((a) => a.mention === custom.agentMention)
      : custom?.agentId
        ? agentsList.find((a) => a.identifier === custom.agentId)
        : undefined;
    if (skill) {
      return {
        identifier: skill.identifier,
        icon: skill.icon,
        backgroundColor: skill.backgroundColor,
        avatar: skill.avatar,
        title: skill.title,
      };
    }
    // User agents aren't in the skills catalog — resolve from the registry and
    // map their Phosphor `iconKey` through the dynamic resolver.
    if (custom?.agentId) {
      const ua = userAgents.find((a) => a.identifier === custom.agentId);
      if (ua) {
        return {
          identifier: ua.identifier,
          icon: phosphorAgentIcon(ua.iconKey ?? 'PiSparkle'),
          backgroundColor: ua.backgroundColor,
          avatar: ua.avatar,
          title: ua.title,
        };
      }
    }
    return undefined;
  }, [custom?.agentMention, custom?.agentId, userAgents]);

  const isNonDefaultAgent = messageAgent != null && messageAgent.identifier !== getDefaultAgent();
  const fetchFullText = useFetchFullText();

  const textContent = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  const isStreaming = message.status?.type === 'running';

  // Everything the status line needs, read off the same parts it lives on.
  // Retrieval steps and reasoning draw no block of their own: the running search
  // IS the label, the thinking and the hits hang under its chevron, and
  // `hasOwnDetail` retires the lot the moment the answer text starts.
  const statusParts = message.content as ReadonlyArray<StatusPartLike>;
  const hasOwnDetail =
    message.content.some((p) => p.type === 'tool-call') ||
    message.content.some((p) => p.type === 'reasoning');
  const toolStatus = selectSearchStatusLabel(statusParts);
  const reasoningText = selectReasoningText(statusParts);
  const statusSources = useMemo(() => selectSearchSources(statusParts), [statusParts]);

  const citations = useMemo(
    () => resolveCitations(custom as Record<string, unknown> | undefined),
    [custom]
  );
  const additionalSources = custom?.additionalSources as AdditionalSource[] | undefined;
  const searchImages = custom?.searchImages;

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

  /**
   * Images render on their own, NOT inside the sources disclosure.
   *
   * They used to live in there, and that made them unreachable in the very case
   * they exist for: an image search registers no text sources, so `citations` is
   * empty — and with empty citations the action row's "Quellen" trigger renders
   * nothing at all, while the section itself was in controlled mode and had no
   * trigger of its own. The images were in the DOM and behind no button.
   *
   * Putting them under the answer is also the honest place for them: a source
   * backs a claim and belongs behind a disclosure, but these ARE the answer —
   * they only ever arrive when the user asked to see pictures.
   */
  const showSearchImages = !isStreaming && (searchImages?.length ?? 0) > 0;

  // Owned here, not in SearchResultsSection: the trigger sits in the action row
  // and the list below it, so neither of the two can hold the state alone.
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const toggleSources = useCallback(() => setSourcesOpen((v) => !v), []);

  // A text-less turn (image only) renders no action row, so the trigger has
  // nowhere to live — the list falls back to carrying its own.
  const showActions = !isStreaming && textContent.length > 0;

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
      ) : isStreaming ? (
        <GrueneratorHomeIconLoading
          loading
          width={isCompact ? 24 : 32}
          height={isCompact ? 24 : 32}
          className="flex-shrink-0"
        />
      ) : (
        // Reserves the icon's footprint so the message text doesn't jump left
        // the moment streaming finishes and the spinner disappears.
        <div
          className={isCompact ? 'h-6 w-6 flex-shrink-0' : 'h-8 w-8 flex-shrink-0'}
          aria-hidden
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

        <StreamingStatusLine
          isStreaming={isStreaming}
          hasOwnDetail={hasOwnDetail}
          textContent={textContent}
          custom={custom}
          toolStatus={toolStatus}
          reasoningText={reasoningText}
          sources={statusSources}
        />

        {custom?.socialPostData && (
          <SocialPostCard
            post={custom.socialPostData}
            {...(custom.sharepicData ? { sharepicData: custom.sharepicData } : {})}
          />
        )}
        {custom?.sharepicData && !custom?.generatedImage && !custom?.socialPostData && (
          <SharepicVariantStack data={custom.sharepicData} />
        )}
        {custom?.generatedImage && <GeneratedImageDisplay image={custom.generatedImage} />}

        {/* Above the answer, not under it: on a turn that found pictures they are
            the first thing the reader looks at, and a gallery that follows a
            1000-word text is a gallery nobody scrolls to. */}
        {showSearchImages && searchImages && <SearchImagesSection images={searchImages} />}

        <CitationProvider citations={citations} fetchFullText={fetchFullText}>
          <MessagePrimitive.Parts components={partComponents} />
        </CitationProvider>

        <MessageErrorBanner />

        {custom?.interrupted && (
          <p className="text-xs text-foreground-muted italic">Antwort wurde unterbrochen</p>
        )}

        {!isStreaming && custom?.chartData && <ChatChart data={custom.chartData} />}

        {!isStreaming && custom?.artifactData && <ArtifactCard artifact={custom.artifactData} />}
        {!isStreaming && custom?.computeData && <ComputeCard data={custom.computeData} />}
        {!isStreaming && custom?.bahnData && <BahnCard data={custom.bahnData} />}

        {!isStreaming && custom?.confirmAction && (
          <ConfirmActionCard action={custom.confirmAction} />
        )}

        {!isStreaming && custom?.createdDocument && (
          <DocumentCreatedCard document={custom.createdDocument} />
        )}

        {!isStreaming && custom?.reelProcessing && (
          <ReelProcessingCard data={custom.reelProcessing} />
        )}

        {!isStreaming && custom?.reelPicker && <ReelPickerCard data={custom.reelPicker} />}

        {showActions && (
          <MessageActions
            content={textContent}
            metadata={actionsMetadata}
            showFeedback={custom?.streamMetadata?.traceId != null}
            {...(showSearchResults
              ? { sources: citations, sourcesOpen, onToggleSources: toggleSources }
              : {})}
          />
        )}

        {showSearchResults && (
          <SearchResultsSection
            citations={citations}
            additionalSources={additionalSources}
            {...(showActions ? { open: sourcesOpen, onOpenChange: setSourcesOpen } : {})}
          />
        )}

        {!isStreaming && custom?.progress?.memoryContext && (
          <MemoryIndicator memoryContext={custom.progress.memoryContext} />
        )}
      </div>
    </MessagePrimitive.Root>
  );
});
