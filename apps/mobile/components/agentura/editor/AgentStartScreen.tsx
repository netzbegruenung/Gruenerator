import { MAX_DRAFT_BRIEF_CHARS } from '@gruenerator/contracts';
import { EMPTY_FORM, specToFormState, useDraftAgent } from '@gruenerator/shared/grueneratoren';
import { useAuth } from '@gruenerator/shared/hooks';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appendTranscript, useSpeechToText } from '../../../hooks/useSpeechToText';
import { useTheme } from '../../../hooks/useTheme';
import {
  isResumableCreateDraft,
  useAgentEditorStore,
  type EditorVariant,
} from '../../../stores/agentEditorStore';
import { BODY_FONT, colors, spacing, typography } from '../../../theme';
import { Button, ListRow } from '../../common';
import { AgentGlyph } from '../AgentGlyph';
import { CharCount, ErrorText, FieldInput, FormSection } from '../recipe-editor/FormParts';

import { defaultScheduleFor } from './agentEditorLogic';

/** Dieselben Beispiele wie auf der Web-Startseite. */
const EXAMPLE_PROMPTS = [
  {
    label: 'Pressestelle',
    text: 'Ein Agent für Pressemitteilungen meines Kreisverbands. Freundlicher, professioneller Ton, soll auch im Web recherchieren können.',
  },
  {
    label: 'Recherche-Bot',
    text: 'Ein Recherche-Bot für Verkehrs- und Mobilitätsthemen, der Quellen aus dem Web zusammenfasst und einordnet.',
  },
  {
    label: 'Social Media',
    text: 'Ein Agent für kurze Social-Media-Posts zu Klimaschutz im Alltag, der nach der Zielgruppe fragt.',
  },
] as const;

/** Der Zähler erscheint erst kurz vor der Grenze. */
const COUNTER_FROM = MAX_DRAFT_BRIEF_CHARS - 500;

const NUM = (n: number) => n.toLocaleString('de-DE');

/**
 * Einstieg „Neuer Agent" bzw. „Neue wiederkehrende Aufgabe": eine kurze
 * Beschreibung, daraus ein KI-Entwurf, der im Editor landet und erst dort
 * gespeichert wird.
 */
export function AgentStartScreen({ variant }: { variant: EditorVariant }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale } = useAuth();
  const draftMut = useDraftAgent();
  const start = useAgentEditorStore((s) => s.start);
  const openDraft = useAgentEditorStore((s) => (isResumableCreateDraft(s) ? s.form : null));
  const speech = useSpeechToText();
  const [brief, setBrief] = useState('');
  const [error, setError] = useState<string | null>(null);

  const trimmed = brief.trim();
  const editorHref = {
    pathname: '/(focused)/grueneratoren/agent-editor',
    params: variant === 'recurring' ? { mode: 'recurring' } : {},
  } as const;

  const handleGenerate = async () => {
    if (trimmed.length === 0 || draftMut.isPending) return;
    if (trimmed.length > MAX_DRAFT_BRIEF_CHARS) {
      setError(
        `Die Beschreibung ist zu lang (${NUM(trimmed.length)} von max. ${NUM(MAX_DRAFT_BRIEF_CHARS)} Zeichen).`
      );
      return;
    }
    setError(null);
    try {
      const spec = await draftMut.mutateAsync({ description: trimmed });
      start({
        identifier: null,
        variant,
        taskId: null,
        // Wie im Web: ein AT-Profil macht den Agent österreichisch, egal was das Modell vorschlägt.
        form: {
          ...EMPTY_FORM,
          locale,
          ...specToFormState(spec),
          ...(locale === 'de-AT' && { locale }),
        },
        schedule: defaultScheduleFor(locale),
        dirty: true,
      });
      router.replace(editorHref);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Entwurf fehlgeschlagen.');
    }
  };

  const handleManual = () => {
    start({
      identifier: null,
      variant,
      taskId: null,
      form: { ...EMPTY_FORM, locale },
      schedule: defaultScheduleFor(locale),
      dirty: false,
    });
    router.replace(editorHref);
  };

  const subject = variant === 'recurring' ? 'deine Aufgabe' : 'dein Agent';

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <Stack.Screen
        options={{ title: variant === 'recurring' ? 'Neue wiederkehrende Aufgabe' : 'Neuer Agent' }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xlarge }]}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.intro, { color: theme.textSecondary }]}>
          {variant === 'recurring'
            ? 'Eine wiederkehrende Aufgabe ist ein Agent, der nach Zeitplan von selbst arbeitet. Beschreibe, was regelmäßig passieren soll — daraus entsteht ein Entwurf, den du vor dem Anlegen noch anpassen kannst.'
            : 'Beschreibe Zweck, Ton und Fähigkeiten — daraus entsteht ein Entwurf, den du vor dem Anlegen noch anpassen kannst.'}
        </Text>

        {openDraft ? (
          <FormSection title="Offener Entwurf">
            <ListRow
              leading={<Glyph iconKey={openDraft.iconKey} />}
              title={openDraft.title.trim() || 'Agent ohne Namen'}
              value="Weiter bearbeiten"
              onPress={() => router.replace('/(focused)/grueneratoren/agent-editor')}
              last
            />
          </FormSection>
        ) : null}

        <FormSection
          title={`Was soll ${subject} können?`}
          error={error ? <ErrorText>{error}</ErrorText> : null}
        >
          <FieldInput
            value={brief}
            onChangeText={(text) => {
              setBrief(text);
              if (error) setError(null);
            }}
            placeholder="Beschreibe deinen neuen Agent …"
            multiline
            maxLength={MAX_DRAFT_BRIEF_CHARS}
            editable={!draftMut.isPending}
            accessibilityLabel={`Was soll ${subject} können?`}
            style={styles.briefInput}
          />
          <View style={styles.inputFooter}>
            <Pressable
              onPress={() =>
                void speech.toggle((t) => setBrief((prev) => appendTranscript(prev, t)))
              }
              disabled={draftMut.isPending}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={speech.isListening ? 'Diktat beenden' : 'Diktieren'}
              accessibilityState={{ busy: speech.isListening }}
              style={({ pressed }) => [
                styles.mic,
                {
                  backgroundColor: speech.isListening ? colors.secondary[600] : theme.backgroundAlt,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Ionicons
                name={speech.isListening ? 'stop' : 'mic-outline'}
                size={18}
                color={speech.isListening ? colors.white : theme.text}
              />
            </Pressable>
            {brief.length >= COUNTER_FROM ? (
              <CharCount value={brief} max={MAX_DRAFT_BRIEF_CHARS} />
            ) : null}
          </View>
        </FormSection>

        <View style={styles.chips} accessibilityLabel="Beispiele">
          {EXAMPLE_PROMPTS.map((example) => (
            <Pressable
              key={example.label}
              onPress={() => {
                setBrief(example.text);
                setError(null);
              }}
              disabled={draftMut.isPending}
              accessibilityRole="button"
              accessibilityLabel={`Beispiel: ${example.label}`}
              style={({ pressed }) => [
                styles.chip,
                { borderColor: theme.border, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>{example.label}</Text>
            </Pressable>
          ))}
        </View>

        <Button
          onPress={() => void handleGenerate()}
          disabled={trimmed.length === 0}
          loading={draftMut.isPending}
        >
          Entwurf erstellen
        </Button>
        {draftMut.isPending ? (
          <Text
            style={[styles.pendingLine, { color: theme.textSecondary }]}
            accessibilityLiveRegion="polite"
          >
            Der Entwurf wird geschrieben …
          </Text>
        ) : null}
        <Button variant="ghost" onPress={handleManual} disabled={draftMut.isPending}>
          Lieber manuell anlegen
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Glyph({ iconKey }: { iconKey: string }) {
  return (
    <View style={styles.glyph}>
      <AgentGlyph iconKey={iconKey} size={22} color={colors.white} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: spacing.medium,
    gap: spacing.medium,
  },
  intro: {
    ...typography.bodySmall,
    paddingHorizontal: spacing.xsmall,
  },
  briefInput: { minHeight: 140 },
  inputFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.small,
    paddingBottom: spacing.xsmall,
  },
  mic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xsmall,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: BODY_FONT,
    fontSize: 13,
    fontWeight: '500',
  },
  pendingLine: {
    ...typography.caption,
    textAlign: 'center',
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary[600],
  },
});
