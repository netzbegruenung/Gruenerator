import {
  fetchResearchDocument,
  researchDocumentQueryKey,
  type ResearchDocumentParams,
} from '@gruenerator/shared/api';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useQuery } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceTransparency } from '../../hooks/useAccessibilityPreferences';
import { DEV_AUTH_BYPASS } from '../../services/devAuth';
import { DEV_FIXTURE_COLLECTION, devResearchDocument } from '../../services/devResearchFixture';
import { BODY_FONT, borderRadius, darkTheme, lightTheme, spacing, typography } from '../../theme';
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
                // 30dp drawn, 44dp to tap.
                hitSlop={{ top: 7, bottom: 7 }}
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

type Props = ResearchDocumentParams & {
  title: string;
  theme: Theme;
  onClose: () => void;
};

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
    // The placeholder hits of the emulator's dev login open a placeholder
    // document; the API has neither.
    queryFn: () =>
      DEV_AUTH_BYPASS && 'collectionId' in params && params.collectionId === DEV_FIXTURE_COLLECTION
        ? Promise.resolve(devResearchDocument(params.sourceUrl, params.query))
        : fetchResearchDocument(params),
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

  // An uploaded file has no original on the web.
  const webUrl = data ? data.sourceUrl : 'sourceUrl' in params ? params.sourceUrl : null;
  const webButton = webUrl && (
    <Pressable
      onPress={() => openInBrowser(webUrl)}
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
        </Pressable>
        {/* The title lives up here, beside the arrow, so the text starts
            right under the bar. */}
        <Text
          style={[styles.title, { color: theme.text }]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {data?.title ?? title}
        </Text>
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
        // A small floating pill, bottom right within thumb reach: Liquid Glass
        // where iOS has it, a blur everywhere else.
        <StepperSurface dark={dark} bottom={insets.bottom + spacing.medium}>
          <Text
            style={[styles.stepLabel, { color: theme.text }]}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Stelle ${active + 1} von ${count}`}
          >
            {active + 1}/{count}
          </Text>
          <Pressable
            onPress={() => step(-1)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Vorherige Stelle"
            style={styles.stepButton}
          >
            <Ionicons name="chevron-up" size={20} color={theme.text} />
          </Pressable>
          <Pressable
            onPress={() => step(1)}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Nächste Stelle"
            style={styles.stepButton}
          >
            <Ionicons name="chevron-down" size={20} color={theme.text} />
          </Pressable>
        </StepperSurface>
      )}
    </View>
  );
}

function StepperSurface({
  dark,
  bottom,
  children,
}: {
  dark: boolean;
  bottom: number;
  children: ReactNode;
}) {
  const reduceTransparency = useReduceTransparency();
  if (reduceTransparency) {
    const backgroundColor = (dark ? darkTheme : lightTheme).card;
    return (
      <View style={[styles.stepper, styles.stepperBlur, { bottom, backgroundColor }]}>
        {children}
      </View>
    );
  }
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return <GlassView style={[styles.stepper, { bottom }]}>{children}</GlassView>;
  }
  return (
    <BlurView
      intensity={60}
      tint={dark ? 'dark' : 'light'}
      style={[
        styles.stepper,
        styles.stepperBlur,
        {
          bottom,
          backgroundColor: dark ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.72)',
        },
      ]}
    >
      {children}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
    paddingRight: spacing.medium,
    paddingBottom: spacing.xxsmall,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
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
  title: { ...typography.bodyBold, fontSize: 16, flex: 1 },
  chips: { gap: 6, paddingVertical: spacing.xsmall },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 30,
    maxWidth: 200,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: borderRadius.full,
  },
  chipNo: { fontFamily: BODY_FONT, fontSize: 12, fontWeight: '700' },
  chipText: { fontFamily: BODY_FONT, fontSize: 12, flexShrink: 1 },
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
  stepper: {
    position: 'absolute',
    right: spacing.medium,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.small,
    paddingRight: 2,
    height: 44,
    borderRadius: 22,
  },
  stepperBlur: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    elevation: 4,
  },
  stepLabel: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '600',
    marginRight: 2,
    fontVariant: ['tabular-nums'],
  },
  stepButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
});
