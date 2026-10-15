import {
  type TranslateTextResponse,
  type TranslationFormality,
  type TranslationLanguagesResponse,
  TRANSLATION_TEXT_MAX_CHARS,
} from '@gruenerator/contracts';
import {
  AUTO,
  defaultTarget,
  initialRecent,
  languageName,
  NF,
  pushRecent,
  sourceOptions,
  targetOptions,
  useTranslateText,
} from '@gruenerator/shared/translation';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { useTheme } from '../../hooks/useTheme';
import { copyToClipboard } from '../../services/share';
import { borderRadius, colors, spacing, typeScale, typography } from '../../theme';
import { Button } from '../common/Button';

import { BudgetNote } from './BudgetNote';
import { FormalityPicker } from './FormalityPicker';
import { LanguageBar } from './LanguageBar';

/** Text recognised by the Bild tab; a new `id` replaces the input even when the text repeats. */
export interface TextSeed {
  text: string;
  id: number;
}

const AUTO_DEBOUNCE_MS = 800;
/** Above this, translation waits for the button — see the guard rails below. */
const AUTO_MAX_CHARS = 2000;

/**
 * Web's text translator, native. Translation runs on its own a moment after
 * typing stops, but only inside guard rails: every run is billed by DeepL and
 * booked against the daily Bäume budget, so
 *
 *  - a long text is never translated automatically — past `AUTO_MAX_CHARS`
 *    the button comes back,
 *  - the same text, languages and formality are never sent twice,
 *  - an answer whose request has gone stale is dropped rather than shown,
 *  - with an empty budget nothing fires by itself; it would only earn a 429.
 */
export function TextTranslator({
  data,
  seed,
}: {
  data: TranslationLanguagesResponse;
  seed: TextSeed | null;
}) {
  const theme = useTheme();
  const dark = useColorScheme() === 'dark';
  const { languages, quota } = data;
  const sources = sourceOptions(languages);
  const targets = targetOptions(languages);

  const [text, setText] = useState('');
  const [sourceLang, setSourceLang] = useState<string>(AUTO);
  const [targetLang, setTargetLang] = useState<string>(() => defaultTarget(languages));
  const [formality, setFormality] = useState<TranslationFormality>('default');
  const [result, setResult] = useState<TranslateTextResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [recentSource, setRecentSource] = useState(() =>
    initialRecent(sources, [AUTO, 'de', defaultTarget(languages)])
  );
  const [recentTarget, setRecentTarget] = useState(() =>
    initialRecent(targets, [defaultTarget(languages), 'de'], 3)
  );

  const translate = useTranslateText();
  /** The request whose answer is still wanted; anything older is discarded. */
  const pendingKey = useRef<string | null>(null);
  /** What has already been asked, so an unchanged text never asks twice. */
  const sentKey = useRef<string | null>(null);
  /** The automatic run still on the clock, so a manual one can call it off. */
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = targets.find((l) => l.code === targetLang);
  const tooLong = text.length > TRANSLATION_TEXT_MAX_CHARS;
  const outOfBudget = quota.limit !== null && (quota.remaining ?? 0) <= 0;
  const manualOnly = text.length > AUTO_MAX_CHARS;
  const canTranslate = text.trim().length > 0 && !tooLong && !!targetLang;
  const key = `${sourceLang}|${targetLang}|${formality}|${text}`;

  // Only a new seed replaces the input; re-renders with the same one must not.
  const [seenSeed, setSeenSeed] = useState<number | null>(null);
  if (seed && seed.id !== seenSeed) {
    setSeenSeed(seed.id);
    setText(seed.text);
  }

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = () => {
    if (!canTranslate || translate.isPending) return;
    // A manual run calls off the automatic one waiting for the same text, or
    // its timer would fire into a stale closure and bill the text twice.
    if (autoTimer.current !== null) {
      clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
    sentKey.current = key;
    pendingKey.current = key;
    translate.mutate(
      {
        text,
        targetLang,
        sourceLang: sourceLang === AUTO ? null : sourceLang,
        formality: formality === 'default' ? null : formality,
      },
      {
        onSuccess: (answer) => {
          if (pendingKey.current === key) setResult(answer);
        },
      }
    );
  };

  // `translate.isPending` re-arms the timer once a run settles: text typed
  // during a run schedules a timer that sees the run still going and gives up,
  // and with `key` unchanged nothing else would ever ask again.
  // The timer fires with the latest `run`, not the one from when it was set.
  const runFromTimer = useEffectEvent(() => run());
  useEffect(() => {
    if (!canTranslate || manualOnly || outOfBudget) return;
    if (sentKey.current === key) return;
    const timer = setTimeout(() => {
      autoTimer.current = null;
      runFromTimer();
    }, AUTO_DEBOUNCE_MS);
    autoTimer.current = timer;
    return () => {
      autoTimer.current = null;
      clearTimeout(timer);
    };
  }, [key, canTranslate, manualOnly, outOfBudget, translate.isPending]);

  const pickSource = (code: string) => {
    setSourceLang(code);
    setRecentSource((r) => pushRecent(r, code));
  };

  const pickTarget = (code: string) => {
    setTargetLang(code);
    setRecentTarget((r) => pushRecent(r, code, 3));
  };

  const clear = () => {
    sentKey.current = null;
    pendingKey.current = null;
    setText('');
    setResult(null);
  };

  /** Only meaningful with an explicit source; with "auto" there is nothing to swap into. */
  const swap = () => {
    const from = sourceLang === AUTO ? result?.detectedSourceLang : sourceLang;
    if (!from) return;
    const newSource = targetLang;
    const newTarget =
      targets.find((l) => l.code.toLowerCase() === from.toLowerCase())?.code ??
      targets.find((l) => l.code.toLowerCase().startsWith(from.toLowerCase()))?.code;
    if (!newTarget) return;
    pickSource(sources.find((l) => l.code === newSource)?.code ?? newSource.split('-')[0]!);
    pickTarget(newTarget);
    if (result) {
      setText(result.text);
      setResult(null);
    }
  };

  const copy = async () => {
    if (!result) return;
    if (await copyToClipboard(result.text)) setCopied(true);
  };

  const share = async () => {
    if (!result) return;
    try {
      await Share.share({ message: result.text });
    } catch {
      // Share sheet unavailable — Kopieren still works.
    }
  };

  const detected =
    sourceLang === AUTO && result
      ? `Erkannt: ${languageName(languages, result.detectedSourceLang)}`
      : '';

  const status = translate.isPending
    ? 'Übersetze …'
    : result
      ? [detected || null, result.glossaryApplied ? 'Grünen-Glossar angewendet' : null]
          .filter(Boolean)
          .join(' · ')
      : '';

  const card = { backgroundColor: theme.card, borderColor: theme.cardBorder };
  const accent = dark ? colors.primary[300] : colors.primary[600];

  return (
    <View style={styles.root}>
      <View style={[styles.card, card]}>
        <LanguageBar
          label="Von"
          value={sourceLang}
          onChange={pickSource}
          options={sources}
          recent={recentSource}
          withAuto
          onSwap={swap}
          swapDisabled={sourceLang === AUTO && !result}
        />
        <View>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder="Text eingeben oder einfügen …"
            placeholderTextColor={theme.textSecondary}
            accessibilityLabel="Ausgangstext"
            style={[styles.input, { color: theme.text }]}
          />
          {text ? (
            <Pressable
              onPress={clear}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Text löschen"
              style={({ pressed }) => [styles.clear, pressed && { backgroundColor: theme.surface }]}
            >
              <Ionicons name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.footer}>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{detected}</Text>
          <Text style={[styles.meta, { color: tooLong ? colors.error[600] : theme.textSecondary }]}>
            {NF.format(text.length)} / {NF.format(TRANSLATION_TEXT_MAX_CHARS)} Zeichen
          </Text>
        </View>
      </View>

      <View style={[styles.card, card]}>
        <LanguageBar
          label="Nach"
          value={targetLang}
          onChange={pickTarget}
          options={targets}
          recent={recentTarget}
        >
          {target?.formality ? <FormalityPicker value={formality} onChange={setFormality} /> : null}
        </LanguageBar>
        <View style={{ backgroundColor: dark ? colors.primary[950] : colors.primary[50] }}>
          {/* The translation arrives without anyone pressing anything, so it
              announces itself; the status line stays silent to avoid doubling. */}
          <Text
            selectable
            accessibilityLiveRegion="polite"
            style={[styles.output, { color: result ? theme.text : theme.textSecondary }]}
          >
            {result?.text ?? 'Übersetzung'}
          </Text>
          <View style={styles.statusRow}>
            {translate.isPending ? <ActivityIndicator size="small" color={accent} /> : null}
            <Text style={[styles.meta, styles.status, { color: theme.textSecondary }]}>
              {status}
            </Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void copy()}
              disabled={!result}
              accessibilityRole="button"
              accessibilityState={{ disabled: !result }}
              style={({ pressed }) => [
                styles.action,
                !result && styles.off,
                pressed && { backgroundColor: dark ? colors.primary[900] : colors.primary[100] },
              ]}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color={accent} />
              <Text style={[styles.actionText, { color: accent }]}>
                {copied ? 'Kopiert' : 'Kopieren'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void share()}
              disabled={!result}
              accessibilityRole="button"
              accessibilityState={{ disabled: !result }}
              style={({ pressed }) => [
                styles.action,
                !result && styles.off,
                pressed && { backgroundColor: dark ? colors.primary[900] : colors.primary[100] },
              ]}
            >
              <Ionicons name="share-outline" size={18} color={accent} />
              <Text style={[styles.actionText, { color: accent }]}>Teilen</Text>
            </Pressable>
          </View>
          <View style={styles.budget}>
            <BudgetNote quota={quota} hint="20.000 Zeichen = 1 Baum." />
          </View>
        </View>
      </View>

      {translate.error ? (
        <View
          accessibilityRole="alert"
          style={[
            styles.alert,
            {
              backgroundColor: dark ? colors.error[950] : colors.error[50],
              borderColor: dark ? colors.error[800] : colors.error[200],
            },
          ]}
        >
          <Text style={[styles.alertText, { color: dark ? colors.error[200] : colors.error[700] }]}>
            {translate.error.message || 'Die Übersetzung ist fehlgeschlagen.'}
          </Text>
        </View>
      ) : null}

      {manualOnly || outOfBudget ? (
        <View style={styles.manual}>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>
            {outOfBudget
              ? 'Das Tagesbudget ist aufgebraucht.'
              : 'Langer Text — auf Knopfdruck übersetzen.'}
          </Text>
          <Button onPress={run} disabled={!canTranslate || translate.isPending}>
            {translate.isPending ? 'Übersetze …' : 'Übersetzen'}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.medium },
  card: {
    borderWidth: 1,
    borderRadius: borderRadius.xlarge,
    overflow: 'hidden',
  },
  input: {
    ...typography.body,
    fontSize: typeScale(17),
    lineHeight: typeScale(26),
    minHeight: 200,
    paddingTop: spacing.medium,
    paddingBottom: spacing.small,
    paddingLeft: spacing.medium,
    paddingRight: spacing.xxlarge,
  },
  clear: {
    position: 'absolute',
    top: spacing.xxsmall,
    right: spacing.xxsmall,
    width: 44,
    height: 44,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xsmall,
    paddingHorizontal: spacing.medium,
    paddingBottom: spacing.small,
  },
  meta: { ...typography.caption },
  output: {
    ...typography.body,
    fontSize: typeScale(17),
    lineHeight: typeScale(26),
    minHeight: 200,
    padding: spacing.medium,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xsmall,
    minHeight: 24,
    paddingHorizontal: spacing.medium,
  },
  status: { flexShrink: 1 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xxsmall,
    paddingHorizontal: spacing.xsmall,
    paddingVertical: spacing.xxsmall,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxsmall,
    minHeight: 44,
    paddingHorizontal: spacing.small,
    borderRadius: borderRadius.full,
  },
  actionText: { ...typography.bodySmall, fontWeight: '600' },
  off: { opacity: 0.4 },
  budget: { paddingHorizontal: spacing.medium, paddingBottom: spacing.small },
  alert: {
    borderWidth: 1,
    borderRadius: borderRadius.large,
    padding: spacing.small,
  },
  alertText: { ...typography.bodySmall },
  manual: { gap: spacing.small },
});
