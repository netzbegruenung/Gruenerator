import {
  parseResearchResult,
  getToolQuery,
  researchCitationToSerializable,
  buildExportMarkdown,
  extractHeadings,
  extractFirstParagraph,
  CONFIDENCE_LABELS,
  useChatConfigStore,
} from '@gruenerator/chat';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { colors, spacing, borderRadius } from '../../../theme';
import { GrueneratorLoadingIcon } from '../GrueneratorLoadingIcon';
import { getMarkdownStyles } from '../markdownStyles';

import { makeCitationMarkdownRules } from './citationMarkdownRules';
import { ToolCitationList } from './ToolCitationList';

import type { Theme } from '../../../theme/colors';

interface ToolCallPart {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: colors.primary[600],
  medium: colors.eucalyptus,
  low: colors.error[500],
};

// Native counterpart of web's ResearchArtifactCard. Shares all parsing/markdown
// logic with web via @gruenerator/chat; only the presentation is native.
export function ResearchArtifactCard({ part, theme }: { part: ToolCallPart; theme: Theme }) {
  const [expanded, setExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const query = getToolQuery(part.args) ?? '';
  const markdownStyles = useMemo(() => getMarkdownStyles(theme), [theme]);

  const onEditInDocs = useChatConfigStore((s) => s.onEditInDocs);

  const parsed = useMemo(
    () => (part.result != null ? parseResearchResult(part.result) : null),
    [part.result]
  );

  // Inline [N] markers in the report become tappable source chips.
  const markdownRules = useMemo(
    () => makeCitationMarkdownRules(new Map((parsed?.citations ?? []).map((c) => [c.id, c]))),
    [parsed?.citations]
  );

  const handleExport = useCallback(() => {
    if (!parsed?.answer || !onEditInDocs) return;
    const content = buildExportMarkdown(query, parsed.answer, parsed.citations);
    const title = query ? `Recherche: ${query.slice(0, 80)}` : 'Recherche';
    void onEditInDocs(content, title);
  }, [parsed, query, onEditInDocs]);

  // Loading state — the orchestrator is still planning/searching.
  if (!parsed) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.headerRow}>
          <GrueneratorLoadingIcon size={18} color={colors.primary[600]} />
          <Text style={[styles.title, { color: theme.text }]}>Deep Research</Text>
        </View>
        {query ? (
          <Text style={[styles.query, { color: theme.textSecondary }]} numberOfLines={1}>
            „{query}"
          </Text>
        ) : null}
        <Text style={[styles.loadingHint, { color: theme.textSecondary }]}>
          Plant Sub-Fragen, sucht parallel in Web & Dokumenten, vertieft bei Lücken und
          synthetisiert einen Bericht. Dauert ca. 15–30s.
        </Text>
      </View>
    );
  }

  const { answer, citations, confidence } = parsed;
  const headings = answer ? extractHeadings(answer) : [];
  const preview = answer ? extractFirstParagraph(answer) : '';
  const confidenceLabel = confidence ? CONFIDENCE_LABELS[confidence] : null;

  if (!answer && citations.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.headerRow}>
          <Ionicons name="book-outline" size={16} color={colors.eucalyptus} />
          <Text style={[styles.title, { color: theme.text }]}>Deep Research</Text>
        </View>
        <Text style={[styles.loadingHint, { color: theme.textSecondary }]}>
          Keine Recherche-Ergebnisse
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <Ionicons name="book-outline" size={16} color={colors.eucalyptus} />
        <Text style={[styles.title, { color: theme.text }]}>Deep Research</Text>
        {confidenceLabel && (
          <View style={styles.confidence}>
            <View
              style={[
                styles.dot,
                { backgroundColor: CONFIDENCE_COLOR[confidence ?? ''] ?? theme.textSecondary },
              ]}
            />
            <Text style={[styles.confidenceText, { color: theme.textSecondary }]}>
              {confidenceLabel}
            </Text>
          </View>
        )}
      </View>
      {query ? (
        <Text style={[styles.query, { color: theme.textSecondary }]} numberOfLines={1}>
          „{query}"
        </Text>
      ) : null}

      {/* Collapsed: TOC + first paragraph. Expanded: full report. */}
      {!expanded && headings.length > 0 && (
        <Text style={[styles.toc, { color: theme.textSecondary }]} numberOfLines={2}>
          {headings.map((h) => `## ${h}`).join('   ·   ')}
        </Text>
      )}
      {answer && (
        <Markdown style={markdownStyles} rules={markdownRules}>
          {expanded ? answer : preview}
        </Markdown>
      )}

      <View style={styles.actions}>
        {answer && (
          <Pressable
            onPress={() => setExpanded((x) => !x)}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={colors.primary[600]}
            />
            <Text style={[styles.actionText, { color: colors.primary[600] }]}>
              {expanded ? 'Einklappen' : 'Vollständig anzeigen'}
            </Text>
          </Pressable>
        )}
        {answer && onEditInDocs && (
          <Pressable
            onPress={handleExport}
            style={({ pressed }) => [styles.actionButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Ionicons name="document-text-outline" size={14} color={colors.primary[600]} />
            <Text style={[styles.actionText, { color: colors.primary[600] }]}>
              Als Dokument speichern
            </Text>
          </Pressable>
        )}
      </View>

      {citations.length > 0 && (
        <View style={[styles.sources, { borderTopColor: theme.border }]}>
          <Pressable
            onPress={() => setShowSources((s) => !s)}
            style={styles.sourcesTrigger}
            hitSlop={8}
          >
            <Ionicons
              name={showSources ? 'chevron-down' : 'chevron-forward'}
              size={13}
              color={theme.textSecondary}
            />
            <Text style={[styles.sourcesLabel, { color: theme.textSecondary }]}>
              {citations.length} Quelle{citations.length === 1 ? '' : 'n'}
            </Text>
          </Pressable>
          {showSources && (
            <ToolCitationList
              citations={citations.map(researchCitationToSerializable)}
              theme={theme}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.xsmall,
    padding: spacing.small,
    borderRadius: borderRadius.medium,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  confidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '500',
  },
  query: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  loadingHint: {
    fontSize: 12,
    marginTop: spacing.xsmall,
    lineHeight: 17,
  },
  toc: {
    fontSize: 12,
    marginTop: spacing.xsmall,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.medium,
    marginTop: spacing.xsmall,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sources: {
    marginTop: spacing.small,
    paddingTop: spacing.xsmall,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sourcesTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xxsmall,
  },
  sourcesLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
