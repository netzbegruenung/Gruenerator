import { useAuiState } from '@assistant-ui/react-native';
import {
  parseGenericFallback,
  resolveToolEntry,
  selectNarration,
  type PartLike,
} from '@gruenerator/chat';
import { Text, StyleSheet } from 'react-native';

import { useTheme } from '../../../hooks/useTheme';
import { spacing, BODY_FONT } from '../../../theme';
import { AskHumanCard } from '../tool-ui/AskHumanCard';
import { ExampleResultsCard } from '../tool-ui/ExampleResultsCard';
import { ImageResultCard } from '../tool-ui/ImageResultCard';
import { KeyValueCard } from '../tool-ui/KeyValueCard';
import { PersonResultCard } from '../tool-ui/PersonResultCard';
import { PressemitteilungExamplesCard } from '../tool-ui/PressemitteilungExamplesCard';
import { ResearchArtifactCard } from '../tool-ui/ResearchArtifactCard';
import { RunPythonCard } from '../tool-ui/RunPythonCard';
import { ScrapeUrlCard } from '../tool-ui/ScrapeUrlCard';
import { ToolResultCard } from '../tool-ui/ToolResultCard';
import { ToolCallProgress } from '../ToolCallProgress';

interface ToolCallProps {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  addResult: (result: string) => void;
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

/** Every tool card, with its narration line above it. */
export function AssistantToolCallPartWithNarration(props: ToolCallProps) {
  return (
    <>
      <ToolNarration toolCallId={props.toolCallId} />
      <AssistantToolCallPart {...props} />
    </>
  );
}

function AssistantToolCallPart(props: ToolCallProps) {
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

const styles = StyleSheet.create({
  narration: {
    fontFamily: BODY_FONT,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: spacing.small,
    marginTop: spacing.xxsmall,
  },
});
