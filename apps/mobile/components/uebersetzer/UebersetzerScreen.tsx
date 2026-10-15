import {
  TranslationNotConfiguredError,
  useTranslationLanguages,
} from '@gruenerator/shared/translation';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';
import { colors, spacing, typography } from '../../theme';
import { CONTENT_MAX_WIDTH } from '../../theme/layout';
import { Button } from '../common/Button';
import { SegmentedControl, type SegmentedOption } from '../common/SegmentedControl';
import { SkeletonBar, SkeletonGroup } from '../common/Skeleton';

import { DocumentTranslator } from './DocumentTranslator';
import { ImageTranslator } from './ImageTranslator';
import { TextTranslator, type TextSeed } from './TextTranslator';

type Tab = 'text' | 'dokument' | 'bild';

const TABS: SegmentedOption[] = [
  { value: 'text', label: 'Text', short: 'Text', disabled: false, icon: 'text-outline' },
  {
    value: 'dokument',
    label: 'Dokument',
    short: 'Dokument',
    disabled: false,
    icon: 'document-text-outline',
  },
  { value: 'bild', label: 'Bild', short: 'Bild', disabled: false, icon: 'image-outline' },
];

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
        <SegmentedControl
          accessibilityLabel="Art der Übersetzung"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          options={TABS}
        />
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
  skeleton: { gap: spacing.medium },
  notice: { gap: spacing.medium, paddingVertical: spacing.large },
  noticeText: { ...typography.body },
  hidden: { display: 'none' },
});
