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
 *
 * Nothing here waits for the language list: the tabs and the input render at
 * once, and the pickers fill in when the list lands. An error never takes the
 * translator away either — someone may have typed already — except "not
 * configured", where there is nothing to translate with.
 */
export function UebersetzerScreen() {
  const theme = useTheme();
  const languages = useTranslationLanguages();
  const [tab, setTab] = useState<Tab>('text');
  const [seed, setSeed] = useState<TextSeed | null>(null);

  // A failed refresh keeps the list it already has; only a list that never
  // arrived is worth a notice.
  const error = languages.data ? null : languages.error;
  const notConfigured = error instanceof TranslationNotConfiguredError;
  const data = languages.data ?? null;

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
        {error ? (
          <View style={styles.notice}>
            <Text
              accessibilityRole="alert"
              style={[styles.noticeText, { color: notConfigured ? theme.text : colors.error[600] }]}
            >
              {error.message}
            </Text>
            {notConfigured ? null : (
              <Button variant="outline" onPress={() => void languages.refetch()}>
                Erneut versuchen
              </Button>
            )}
          </View>
        ) : null}
        {notConfigured ? null : (
          <>
            <SegmentedControl
              accessibilityLabel="Art der Übersetzung"
              value={tab}
              onChange={(v) => setTab(v as Tab)}
              options={TABS}
            />
            <View style={tab === 'text' ? null : styles.hidden}>
              <TextTranslator data={data} loading={languages.isPending} seed={seed} />
            </View>
            <View style={tab === 'dokument' ? null : styles.hidden}>
              <DocumentTranslator data={data} loading={languages.isPending} />
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
        )}
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
  notice: { gap: spacing.medium, paddingVertical: spacing.large },
  noticeText: { ...typography.body },
  hidden: { display: 'none' },
});
