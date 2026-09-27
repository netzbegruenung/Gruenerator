import {
  fetchResearchDocument,
  researchDocumentQueryKey,
  type ResearchDocumentParams,
} from '@gruenerator/shared/api';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BODY_FONT, borderRadius, spacing, typography } from '../../theme';
import { getSurfaceFab } from '../../theme/toolTheme';

import type { Theme } from '../../theme/colors';
import type {
  ResearchDocumentBlock,
  ResearchDocumentPart,
  ResearchDocumentResponse,
} from '@gruenerator/contracts';

/** Passage tints — the web reader's notebook magenta (notebookTheme.ts). */
const PASSAGE = { light: '#FCEAF3', dark: '#3A1828' };
const PASSAGE_ACTIVE = { light: '#F5CFE2', dark: '#5A2740' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function Parts({ parts }: { parts: ResearchDocumentPart[] }) {
  return parts.map((p, i) =>
    p.term ? (
      <Text key={i} style={styles.term}>
        {p.text}
      </Text>
    ) : (
      p.text
    )
  );
}

function openInBrowser(url: string) {
  void WebBrowser.openBrowserAsync(url).catch((err: unknown) =>
    console.warn('[ResearchDocumentReader] Browser konnte nicht öffnen:', err)
  );
}

function ReaderHeader({
  doc,
  active,
  theme,
  accent,
  chipBg,
  onJump,
}: {
  doc: ResearchDocumentResponse;
  active: number;
  theme: Theme;
  accent: string;
  chipBg: string;
  onJump: (index: number) => void;
}) {
  const count = doc.passages.length;
  return (
    <View style={styles.header}>
      <View style={styles.metaRow}>
        {doc.contentTypeLabel && (
          <View style={[styles.badge, { borderColor: theme.cardBorder }]}>
            <Text style={[styles.badgeText, { color: theme.text }]}>{doc.contentTypeLabel}</Text>
          </View>
        )}
        <Text style={[styles.meta, { color: theme.textSecondary }]}>
          {[doc.sourceName, doc.publishedAt ? formatDate(doc.publishedAt) : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
        {doc.title}
      </Text>
      {count > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {doc.passages.map((p) => {
            const on = p.index === active;
            return (
              <Pressable
                key={p.index}
                onPress={() => onJump(p.index)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Stelle ${p.index + 1}${p.heading ? `: ${p.heading}` : ''}`}
                style={[
                  styles.chip,
                  { borderColor: on ? accent : theme.cardBorder },
                  on && { backgroundColor: chipBg },
                ]}
              >
                <Text style={[styles.chipNo, { color: accent }]}>{p.index + 1}</Text>
                <Text style={[styles.chipText, { color: theme.text }]} numberOfLines={1}>
                  {p.heading ?? p.text}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Keine einzelnen Textstellen markiert – das Dokument passt insgesamt zur Suche.
        </Text>
      )}
    </View>
  );
}

interface Props extends ResearchDocumentParams {
  title: string;
  theme: Theme;
  onClose: () => void;
}

/**
 * A search hit read inside the notebook: the full text with the passages that
 * match the search marked and numbered. The passage strip sits under the title,
 * stepping lives in a bar at the bottom within thumb reach — the web reader's
 * phone layout.
 */
export function ResearchDocumentReader({ title, theme, onClose, ...params }: Props) {
  const dark = useColorScheme() === 'dark';
  const accent = getSurfaceFab('wissen', dark).icon;
  const insets = useSafeAreaInsets();

  const { data, isPending, isError } = useQuery({
    queryKey: researchDocumentQueryKey(params),
    queryFn: () => fetchResearchDocument(params),
    staleTime: 5 * 60 * 1000,
  });

  const [active, setActive] = useState(0);
  const list = useRef<FlatList<ResearchDocumentBlock>>(null);

  // The block holding each passage — the list scrolls by block.
  const passageBlock = new Map<number, number>();
  data?.blocks.forEach((b, bi) =>
    b.segments.forEach((s) => {
      if (s.passage !== null) passageBlock.set(s.passage, bi);
    })
  );
  const count = data?.passages.length ?? 0;

  const jump = (index: number) => {
    setActive(index);
    const blockIndex = passageBlock.get(index);
    if (blockIndex !== undefined) {
      list.current?.scrollToIndex({ index: blockIndex, viewPosition: 0.3, animated: true });
    }
  };
  const step = (delta: number) => jump((active + delta + count) % count);

  // Opens on the first passage, where the reason for the hit is.
  useEffect(() => {
    const first = data?.blocks.findIndex((b) => b.segments.some((s) => s.passage === 0)) ?? -1;
    if (first < 0) return;
    const timer = setTimeout(
      () => list.current?.scrollToIndex({ index: first, viewPosition: 0.3, animated: true }),
      150
    );
    return () => clearTimeout(timer);
  }, [data]);

  const passageBg = dark ? PASSAGE.dark : PASSAGE.light;
  const activeBg = dark ? PASSAGE_ACTIVE.dark : PASSAGE_ACTIVE.light;

  const renderBlock = ({ item }: { item: ResearchDocumentBlock }) =>
    item.kind === 'heading' ? (
      <Text style={[styles.h2, { color: theme.text }]} accessibilityRole="header">
        {item.segments.map((s, si) => (
          <Parts key={si} parts={s.parts} />
        ))}
      </Text>
    ) : (
      <Text style={[styles.paragraph, { color: theme.text }]}>
        {item.segments.map((s, si) =>
          s.passage === null ? (
            <Parts key={si} parts={s.parts} />
          ) : (
            <Text key={si} style={{ backgroundColor: s.passage === active ? activeBg : passageBg }}>
              <Parts parts={s.parts} />
            </Text>
          )
        )}
      </Text>
    );

  const webButton = (
    <Pressable
      onPress={() => openInBrowser(data?.sourceUrl ?? params.sourceUrl)}
      accessibilityRole="link"
      style={[styles.webButton, { borderColor: accent }]}
    >
      <Ionicons name="open-outline" size={18} color={accent} />
      <Text style={[styles.webButtonText, { color: accent }]}>Im Web öffnen</Text>
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + spacing.xxsmall, borderColor: theme.cardBorder },
        ]}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Zurück zu den Ergebnissen"
          style={styles.back}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={theme.text} />
          <Text style={[styles.backText, { color: theme.text }]}>Ergebnisse</Text>
        </Pressable>
      </View>

      {data ? (
        <FlatList
          ref={list}
          data={data.blocks}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderBlock}
          extraData={active}
          ListHeaderComponent={
            <ReaderHeader
              doc={data}
              active={active}
              theme={theme}
              accent={accent}
              chipBg={passageBg}
              onJump={jump}
            />
          }
          ListFooterComponent={<View style={styles.footer}>{webButton}</View>}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          // Blocks vary in height, so a far jump may land before it is laid out:
          // scroll roughly there, then retry once it has rendered.
          onScrollToIndexFailed={(info) => {
            list.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false,
            });
            setTimeout(
              () =>
                list.current?.scrollToIndex({
                  index: info.index,
                  viewPosition: 0.3,
                  animated: true,
                }),
              100
            );
          }}
        />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
            {title}
          </Text>
          {isPending && <ActivityIndicator color={accent} style={styles.loading} />}
          {isError && (
            <View style={styles.errorBox}>
              <Text style={[styles.paragraph, { color: theme.text }]}>
                Das Dokument konnte nicht geladen werden.
              </Text>
              {webButton}
            </View>
          )}
        </View>
      )}

      {count > 0 && (
        <View
          style={[
            styles.bottomBar,
            {
              paddingBottom: insets.bottom + spacing.xxsmall,
              borderColor: theme.cardBorder,
              backgroundColor: theme.background,
            },
          ]}
        >
          <Text
            style={[styles.stepLabel, { color: theme.textSecondary }]}
            accessibilityLiveRegion="polite"
          >
            Stelle {active + 1} von {count}
          </Text>
          <Pressable
            onPress={() => step(-1)}
            accessibilityRole="button"
            accessibilityLabel="Vorherige Stelle"
            style={styles.stepButton}
          >
            <Ionicons name="chevron-up" size={22} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={() => step(1)}
            accessibilityRole="button"
            accessibilityLabel="Nächste Stelle"
            style={styles.stepButton}
          >
            <Ionicons name="chevron-down" size={22} color={theme.text} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    paddingHorizontal: spacing.xsmall,
    paddingBottom: spacing.xxsmall,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  backText: { fontFamily: BODY_FONT, fontSize: 16, marginLeft: 2 },
  content: { paddingHorizontal: spacing.medium, paddingTop: spacing.large, paddingBottom: 96 },
  header: { gap: spacing.small, marginBottom: spacing.medium },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xsmall },
  badge: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: BODY_FONT, fontSize: 12, fontWeight: '600' },
  meta: { fontFamily: BODY_FONT, fontSize: 14 },
  title: { ...typography.h2 },
  chips: { gap: spacing.xsmall, paddingVertical: spacing.xxsmall },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    minHeight: 44,
    maxWidth: 224,
    paddingHorizontal: spacing.small,
    borderWidth: 1,
    borderRadius: borderRadius.full,
  },
  chipNo: { fontFamily: BODY_FONT, fontSize: 14, fontWeight: '700' },
  chipText: { fontFamily: BODY_FONT, fontSize: 14, flexShrink: 1 },
  hint: { fontFamily: BODY_FONT, fontSize: 14 },
  h2: { ...typography.h3, marginTop: spacing.small },
  paragraph: { fontFamily: BODY_FONT, fontSize: 17, lineHeight: 28 },
  term: { fontWeight: '700' },
  gap: { height: spacing.medium },
  footer: { marginTop: spacing.xlarge, alignItems: 'flex-start' },
  webButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    minHeight: 44,
    paddingHorizontal: spacing.medium,
    borderWidth: 1.5,
    borderRadius: borderRadius.full,
  },
  webButtonText: { fontFamily: BODY_FONT, fontSize: 15, fontWeight: '600' },
  loading: { marginTop: spacing.large },
  errorBox: { marginTop: spacing.large, gap: spacing.medium, alignItems: 'flex-start' },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xsmall,
    paddingTop: spacing.xxsmall,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stepLabel: { fontFamily: BODY_FONT, fontSize: 14, marginRight: spacing.xsmall },
  stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
