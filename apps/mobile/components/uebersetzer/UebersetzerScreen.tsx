import {
  TranslationNotConfiguredError,
  useTranslationLanguages,
} from '@gruenerator/shared/translation';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { borderRadius, colors, spacing, typography, HEADING_FONT_SEMIBOLD } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';
import { Button } from '../common/Button';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

import { DocumentTranslator } from './DocumentTranslator';
import { ImageTranslator } from './ImageTranslator';
import { TextTranslator, type TextSeed } from './TextTranslator';

type Tab = 'text' | 'dokument' | 'bild';

const TABS: {
  value: Tab;
  label: string;
  icon: 'text-outline' | 'document-text-outline' | 'image-outline';
}[] = [
  { value: 'text', label: 'Text', icon: 'text-outline' },
  { value: 'dokument', label: 'Dokument', icon: 'document-text-outline' },
  { value: 'bild', label: 'Bild', icon: 'image-outline' },
];

/** Web's pill pair: outlined pills, the active one filled Eucalyptus. */
function TabPills({ value, onChange }: { value: Tab; onChange: (tab: Tab) => void }) {
  const theme = useTheme();
  const isDark = useColorScheme() === 'dark';
  return (
    <View style={styles.pills} accessibilityRole="tablist" accessibilityLabel="Art der Übersetzung">
      {TABS.map((t) => {
        const active = t.value === value;
        const color = active ? colors.white : theme.text;
        return (
          <Pressable
            key={t.value}
            onPress={() => {
              if (!active) void Haptics.selectionAsync();
              onChange(t.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.pill,
              active
                ? { backgroundColor: colors.secondary[600], borderColor: colors.secondary[600] }
                : { borderColor: isDark ? colors.grey[700] : colors.grey[200] },
              pressed && !active && { backgroundColor: theme.surface },
            ]}
          >
            <Ionicons name={t.icon} size={16} color={color} />
            <Text style={[styles.pillText, { color }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The translator, ported from web's `/uebersetzer`: Text, Dokument and Bild as
 * tabs. Text and Dokument stay mounted so a result survives a tab switch; the
 * Bild tab reads the text off a photo and hands it to the Text tab.
 */
export function UebersetzerScreen() {
  const theme = useTheme();
  const languages = useTranslationLanguages();
  const [tab, setTab] = useState<Tab>('text');
  const [seed, setSeed] = useState<TextSeed | null>(null);

  const body = () => {
    if (languages.isPending) {
      return (
        <View accessible accessibilityLabel="Lade Sprachen">
          <SkeletonGroup style={styles.skeleton}>
            <SkeletonBar height={44} radius={12} />
            <SkeletonBar height={200} radius={16} />
            <SkeletonBar height={200} radius={16} />
          </SkeletonGroup>
        </View>
      );
    }
    if (languages.error) {
      const notConfigured = languages.error instanceof TranslationNotConfiguredError;
      return (
        <View style={styles.notice}>
          <Text
            accessibilityRole="alert"
            style={[styles.noticeText, { color: notConfigured ? theme.text : colors.error[600] }]}
          >
            {languages.error.message}
          </Text>
          {notConfigured ? null : (
            <Button variant="outline" onPress={() => void languages.refetch()}>
              Erneut versuchen
            </Button>
          )}
        </View>
      );
    }
    const data = languages.data;
    return (
      <>
        <TabPills value={tab} onChange={setTab} />
        <View style={tab === 'text' ? null : styles.hidden}>
          <TextTranslator data={data} seed={seed} />
        </View>
        <View style={tab === 'dokument' ? null : styles.hidden}>
          <DocumentTranslator data={data} />
        </View>
        {tab === 'bild' ? (
          <ImageTranslator
            onText={(text) => {
              setSeed((s) => ({ text, id: (s?.id ?? 0) + 1 }));
              setTab('text');
            }}
          />
        ) : null}
      </>
    );
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          Texte und Dokumente mit DeepL übersetzen — das Grünen-Glossar wird automatisch angewendet.
        </Text>
        {body()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    paddingBottom: spacing.xxlarge,
  },
  intro: { ...typography.bodySmall },
  pills: { flexDirection: 'row', gap: spacing.xsmall },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    height: 40,
    paddingHorizontal: spacing.medium,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  pillText: { fontFamily: HEADING_FONT_SEMIBOLD, fontSize: 14 },
  skeleton: { gap: spacing.medium },
  notice: { gap: spacing.medium, paddingVertical: spacing.large },
  noticeText: { ...typography.body },
  hidden: { display: 'none' },
});
