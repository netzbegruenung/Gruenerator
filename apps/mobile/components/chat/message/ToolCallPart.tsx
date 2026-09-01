import { useAuiState } from '@assistant-ui/react-native';
import {
  getToolMeta,
  isSearchProgressTool,
  parseGenericFallback,
  resolveToolEntry,
  selectApprovalLabels,
  selectNarration,
  selectToolRun,
  toolErrorMessage,
  toolOutcome,
  type PartLike,
  type ToolApprovalState,
} from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Pressable, Text, StyleSheet, View } from 'react-native';
import { useShallow } from 'zustand/shallow';

import { useTheme } from '../../../hooks/useTheme';
import { spacing, BODY_FONT, chatType } from '../../../theme';
import { ShimmerStatusLine } from '../ShimmerStatusLine';
import { ShimmerText } from '../ShimmerText';
import { AskHumanCard } from '../tool-ui/AskHumanCard';
import { ExampleResultsCard } from '../tool-ui/ExampleResultsCard';
import { ImageResultCard } from '../tool-ui/ImageResultCard';
import { KeyValueCard } from '../tool-ui/KeyValueCard';
import { PersonResultCard } from '../tool-ui/PersonResultCard';
import { PressemitteilungExamplesCard } from '../tool-ui/PressemitteilungExamplesCard';
import { ResearchArtifactCard } from '../tool-ui/ResearchArtifactCard';
import { RunPythonCard } from '../tool-ui/RunPythonCard';
import { ScrapeUrlCard } from '../tool-ui/ScrapeUrlCard';
import { ToolApprovalCard } from '../tool-ui/ToolApprovalCard';
import { ToolErrorCard } from '../tool-ui/ToolErrorCard';
import { ToolResultCard } from '../tool-ui/ToolResultCard';

import { useToolGroupExpanded } from './toolGroupContext';

import type { Theme } from '../../../theme/colors';

interface ToolCallProps {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  addResult: (result: string) => void;
  approval?: ToolApprovalState;
  respondToApproval?: (response: { approved: boolean; optionId?: string; reason?: string }) => void;
}

// Persistent planner narration above the tool row (split-gather mode). Reads
// the raw part via useAuiState — assistant-ui's typed tool props don't carry the
// custom `narration` field, but it survives on message.parts. Mirrors web's
// ToolNarration; the selection rule is unit-tested in narrationView.vitest.ts.
function ToolNarration({ toolCallId }: { toolCallId: string }) {
  const theme = useTheme();
  const narration = useAuiState((s) =>
    selectNarration((s.message?.parts ?? []) as ReadonlyArray<PartLike>, toolCallId)
  );
  if (!narration) return null;
  return (
    <Text numberOfLines={2} style={[styles.narration, { color: theme.textSecondary }]}>
      {narration}
    </Text>
  );
}

/**
 * Every tool card, with its narration line above it and whatever chrome the run
 * it belongs to calls for — native stand-in for web's `ToolCallGroup`, which
 * gets the run handed to it by an assistant-ui slot that react-native has no
 * equivalent of. The decision itself is the shared `selectToolRun` /
 * `computeToolGroupView`, so the two platforms group alike:
 *   - streaming run of ≥2 cards → a shimmer collector header above the cards
 *     (the cards stay visible);
 *   - finished run of ≥4 → a collapsed summary row, expandable to the full
 *     transcript (nothing is discarded).
 * Single cards and short finished runs get no chrome at all.
 */
export function AssistantToolCallPartWithNarration(props: ToolCallProps) {
  const theme = useTheme();
  const { toolCallId } = props;

  // The selector must return only primitives: `useShallow` compares one level
  // with Object.is, so a freshly built object graph per call would make every
  // getSnapshot "new" and loop useSyncExternalStore into React #185 as soon as a
  // message with tool cards renders. Same constraint web's ToolCallGroup notes.
  const { mode, headerLabel, summary, isRunStart, runKey } = useAuiState(
    useShallow((s) => {
      const run = selectToolRun(
        (s.message?.parts ?? []) as ReadonlyArray<PartLike>,
        toolCallId,
        s.message?.status?.type === 'running'
      );
      return {
        mode: run?.view.mode ?? 'passthrough',
        headerLabel: run?.view.headerLabel ?? '',
        summary: run?.view.summary ?? '',
        isRunStart: run?.isRunStart ?? true,
        runKey: run?.runKey ?? toolCallId,
      };
    })
  );

  const { isExpanded, toggle } = useToolGroupExpanded(runKey);

  const card = (
    <>
      <ToolNarration toolCallId={toolCallId} />
      <ApprovalOrPart {...props} />
    </>
  );

  if (mode === 'live-header') {
    return (
      <>
        {isRunStart && (
          <View style={styles.groupHeader}>
            <ShimmerText
              mutedColor={theme.textSecondary}
              brightColor={theme.text}
              fontSize={chatType.chatBody.fontSize}
              style={styles.groupHeaderText}
            >
              {headerLabel}
            </ShimmerText>
          </View>
        )}
        {card}
      </>
    );
  }

  if (mode === 'collapsed') {
    return (
      <>
        {isRunStart && (
          <CollapsedRunRow
            summary={summary}
            isExpanded={isExpanded}
            onToggle={toggle}
            theme={theme}
          />
        )}
        {isExpanded && (
          <View style={[styles.collapsedBody, { borderLeftColor: theme.border }]}>{card}</View>
        )}
      </>
    );
  }

  return card;
}

function CollapsedRunRow({
  summary,
  isExpanded,
  onToggle,
  theme,
}: {
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
  theme: Theme;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      hitSlop={8}
      style={[styles.collapsedRow, { backgroundColor: theme.surface }]}
    >
      <Text style={[styles.collapsedSummary, { color: theme.text }]}>{summary}</Text>
      <Ionicons
        name={isExpanded ? 'chevron-up' : 'chevron-down'}
        size={14}
        color={theme.textSecondary}
      />
    </Pressable>
  );
}

/**
 * Trägt der Part ein Freigabe-Gate, ersetzt die Karte den normalen Render —
 * dieselbe Regel wie webs `renderApproval`: solange nichts entschieden ist,
 * gibt es kein Ergebnis zu zeigen. Ohne das blieb auf Mobile ein Shimmer
 * stehen, der nie auflöste.
 */
function ApprovalOrPart(props: ToolCallProps) {
  const theme = useTheme();
  const { approval, respondToApproval, toolName, toolCallId } = props;
  const labels = useAuiState(
    useShallow((s) =>
      selectApprovalLabels((s.message?.parts ?? []) as ReadonlyArray<PartLike>, toolCallId)
    )
  );
  if (!approval || !respondToApproval) return <AssistantToolCallPart {...props} />;
  return (
    <ToolApprovalCard
      toolName={toolName}
      approval={approval}
      respondToApproval={respondToApproval}
      theme={theme}
      {...(labels.title != null && { title: labels.title })}
      {...(labels.serverName != null && { serverName: labels.serverName })}
    />
  );
}

function AssistantToolCallPart(props: ToolCallProps) {
  const theme = useTheme();
  const { toolName, args, result, addResult } = props;

  // Retrieval steps report through the one status line above the message
  // (ChatProgressIndicator, fed by selectSearchStatusLabel) — no card, running
  // or finished, so nothing is left standing once the answer text arrives.
  if (isSearchProgressTool(toolName)) return null;
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
  // Still running: the same shimmering line the streaming stage uses. It was a
  // bordered card with a spinner, a sparkle and its own label table whose
  // fallback was the RAW tool name — which is how an internal stage id ended up
  // on screen as "generating". `getToolMeta` is the shared source web reads and
  // never yields an internal name.
  if (result === undefined) {
    // Verb pair: the present-tense label while it runs ("Lade Schreibvorgaben"),
    // falling back to the resting label for tools that declare no activeLabel.
    // Same shared metadata web reads — the two platforms say the same words.
    const meta = getToolMeta(toolName);
    return <ShimmerStatusLine label={meta.activeLabel ?? meta.label} theme={theme} />;
  }
  // Fehlgeschlagen: eigene Karte statt der Erfolgs-Karte mit grauer Notiz.
  // `toolOutcome` prüft beide Kanäle (`ok:false` live, `error` nach Reload),
  // damit Livestream und neu geladener Thread dasselbe sagen.
  if (toolOutcome(result, 'result') === 'error') {
    return (
      <ToolErrorCard
        toolName={toolName}
        args={args}
        message={toolErrorMessage(result) ?? 'Das Werkzeug ist fehlgeschlagen.'}
        theme={theme}
      />
    );
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

const styles = StyleSheet.create({
  narration: {
    ...chatType.chatSecondary,
    paddingHorizontal: spacing.small,
    marginTop: spacing.xxsmall,
  },
  groupHeader: {
    paddingHorizontal: spacing.xxsmall,
    paddingVertical: spacing.xxsmall,
  },
  groupHeaderText: {
    ...chatType.chatBody,
    fontWeight: '600',
  },
  collapsedRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    marginVertical: spacing.xxsmall,
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: 999,
  },
  collapsedSummary: {
    ...chatType.chatSecondary,
    fontFamily: BODY_FONT,
    fontWeight: '600',
  },
  // The rail web draws with border-l-2 on the expanded transcript. Each card
  // carries its own segment, because on native no single component owns them.
  collapsedBody: {
    marginLeft: spacing.xsmall,
    paddingLeft: spacing.small,
    borderLeftWidth: 2,
  },
});
