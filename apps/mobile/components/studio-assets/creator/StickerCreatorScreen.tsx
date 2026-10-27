import { type StudioAssetItem, type StudioAssetSource } from '@gruenerator/contracts';
import {
  profilbildAssetParams,
  STICKER_CREATOR_MODES,
  STICKER_CREATOR_STEPS,
  stickerCreatorModeTitle,
  type StickerLocale,
} from '@gruenerator/shared/stickers';
import {
  assetFormBody,
  emptyAssetForm,
  isAssetFormComplete,
  TITLE_MAX,
  useStudioAssetMutations,
} from '@gruenerator/shared/studio-assets';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useStepBack } from '../../../hooks/useStepBack';
import { useTheme } from '../../../hooks/useTheme';
import { borderRadius, colors, spacing, typography } from '../../../theme';
import { Button } from '../../common/Button';

import { BadgeDesigner } from './BadgeDesigner';
import { CREATOR_MODE_ICONS, stickerFilename, type CreatorStep } from './creatorModel';
import { StickerPreview, usePreviewSize, type StickerDraft } from './creatorParts';
import { ImageStickerDesigner } from './ImageStickerDesigner';
import { writeStickerPng } from './stickerRender';
import { StudioAssetForm } from './StudioAssetForm';
import { uploadStickerPng } from './uploadSticker';

const UPLOAD_ERROR = 'Das Hochladen hat nicht geklappt. Bitte versuche es erneut.';
const CREATE_ERROR = 'Sticker konnte nicht gespeichert werden.';

const HEADINGS: Record<Exclude<CreatorStep, 'design'>, string> = {
  mode: 'Wie soll dein Sticker entstehen?',
  save: 'Speichern',
  done: 'Fertig!',
};

/** The draft as a temporary PNG file, uploaded to the media store; returns the share token. */
async function uploadDraft(image: StickerDraft['image'], filename: string): Promise<string> {
  const uri = await writeStickerPng(image, filename);
  try {
    return await uploadStickerPng(uri, filename);
  } finally {
    try {
      new File(uri).delete();
    } catch {
      // A leftover cache file is harmless; the OS clears the cache.
    }
  }
}

function Stepper({ step }: { step: CreatorStep }) {
  const theme = useTheme();
  const active =
    step === 'done'
      ? STICKER_CREATOR_STEPS.length
      : STICKER_CREATOR_STEPS.findIndex((s) => s.key === step);
  return (
    <View style={styles.stepper} accessibilityLabel="Fortschritt">
      {STICKER_CREATOR_STEPS.map((s, i) => {
        const current = i === active;
        const done = i < active;
        return (
          <View
            key={s.key}
            accessible
            accessibilityLabel={`Schritt ${i + 1}: ${s.label}${done ? ' (erledigt)' : ''}`}
            accessibilityState={{ selected: current }}
            style={[
              styles.step,
              current
                ? { backgroundColor: colors.secondary[600], borderColor: colors.secondary[600] }
                : { borderColor: theme.border },
            ]}
          >
            <Text
              style={[
                styles.stepText,
                { color: current ? colors.white : done ? theme.text : theme.textSecondary },
              ]}
              numberOfLines={1}
            >
              {done ? '✓' : i + 1} {s.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function ModeCards({ onPick }: { onPick: (mode: StudioAssetSource) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.modes}>
      {STICKER_CREATOR_MODES.map((m) => (
        <Pressable
          key={m.id}
          accessibilityRole="button"
          accessibilityLabel={m.title}
          accessibilityHint={m.text}
          onPress={() => onPick(m.id)}
          style={({ pressed }) => [
            styles.mode,
            {
              backgroundColor: pressed ? theme.buttonBackground : theme.card,
              borderColor: theme.cardBorder,
            },
          ]}
        >
          <View style={[styles.modeIcon, { backgroundColor: theme.surface }]}>
            <Ionicons name={CREATOR_MODE_ICONS[m.id]} size={26} color={colors.primary[600]} />
          </View>
          <View style={styles.modeText}>
            <Text style={[styles.modeTitle, { color: theme.text }]}>{m.title}</Text>
            <Text style={[styles.modeBody, { color: theme.textSecondary }]}>{m.text}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </Pressable>
      ))}
    </View>
  );
}

/** Web's /studio/sticker/neu on the phone: Art wählen → Gestalten → Speichern. */
export function StickerCreatorScreen({
  locale,
  returnTo,
}: {
  locale: StickerLocale;
  /** `profilbild`: hand the new sticker straight back to the open Profilbild. */
  returnTo: 'profilbild' | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const previewSize = usePreviewSize();
  const { create } = useStudioAssetMutations();

  const [step, setStep] = useState<CreatorStep>('mode');
  const [mode, setMode] = useState<StudioAssetSource | null>(null);
  const [draft, setDraft] = useState<StickerDraft | null>(null);
  const [created, setCreated] = useState<StudioAssetItem | null>(null);
  const [form, setForm] = useState(() => emptyAssetForm(locale));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A retry after a failed create reuses the upload instead of orphaning another file.
  const uploaded = useRef<{ draft: StickerDraft; token: string } | null>(null);

  const pickMode = (next: StudioAssetSource) => {
    setMode(next);
    setDraft(null);
    setStep('design');
  };

  const toSave = () => {
    if (!draft) return;
    if (!form.title.trim())
      setForm((f) => ({ ...f, title: draft.suggestedTitle.slice(0, TITLE_MAX) }));
    setError(null);
    setStep('save');
  };

  const startOver = () => {
    setMode(null);
    setDraft(null);
    setCreated(null);
    setForm(emptyAssetForm(locale));
    setError(null);
    setStep('mode');
  };

  // The way back steps back like „Zurück", so the design is not thrown away.
  useStepBack(step === 'design' || step === 'save', () => {
    if (busy) return;
    if (step === 'design') startOver();
    else setStep('design');
  });

  const canSave = !!draft && !!mode && isAssetFormComplete(form) && !busy;

  const save = async () => {
    if (!draft || !mode || !canSave) return;
    setBusy(true);
    setError(null);
    const shareToken =
      uploaded.current?.draft === draft
        ? uploaded.current.token
        : await uploadDraft(draft.image, stickerFilename(form.title)).catch(() => null);
    if (!shareToken) {
      setError(UPLOAD_ERROR);
      setBusy(false);
      return;
    }
    uploaded.current = { draft, token: shareToken };
    const item = await create
      .mutateAsync({ shareToken, kind: 'sticker', source: mode, ...assetFormBody(form) })
      .catch((err: unknown) => {
        setError(err instanceof Error && err.message ? err.message : CREATE_ERROR);
        return null;
      });
    setBusy(false);
    if (!item) return;
    if (returnTo === 'profilbild') {
      router.dismissTo({ pathname: '/(focused)/profilbild', params: profilbildAssetParams(item) });
      return;
    }
    setCreated(item);
    setStep('done');
  };

  const heading = step === 'design' ? (mode ? stickerCreatorModeTitle(mode) : '') : HEADINGS[step];

  return (
    <SafeAreaView edges={['bottom']} style={[styles.root, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.root} behavior="padding">
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Stepper step={step} />
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.text }]}>
            {heading}
          </Text>

          {step === 'mode' ? <ModeCards onPick={pickMode} /> : null}

          {/* Stays mounted on Speichern, so „Zurück" keeps the work. */}
          {mode ? (
            <View style={step === 'design' ? styles.section : styles.hidden}>
              {mode === 'badge' ? (
                <BadgeDesigner locale={locale} onDraft={setDraft} />
              ) : (
                <ImageStickerDesigner key={mode} mode={mode} locale={locale} onDraft={setDraft} />
              )}
            </View>
          ) : null}

          {step === 'save' && draft ? (
            <View style={styles.section}>
              <StickerPreview
                image={draft.image}
                size={Math.min(previewSize, 240)}
                label="Vorschau deines Stickers"
              />
              <StudioAssetForm values={form} onChange={setForm} locale={locale} disabled={busy} />
              {error ? (
                <Text
                  accessibilityRole="alert"
                  style={[styles.error, { color: colors.error[500] }]}
                >
                  {error}
                </Text>
              ) : null}
            </View>
          ) : null}

          {step === 'done' && created ? (
            <View style={[styles.section, styles.done]}>
              <Ionicons name="checkmark-circle" size={56} color={colors.primary[600]} />
              {draft ? (
                <StickerPreview image={draft.image} size={160} label={created.title} />
              ) : null}
              <Text style={[styles.doneText, { color: theme.text }]}>
                „{created.title}“ ist gespeichert und liegt in der Galerie unter „Meine“.
              </Text>
              <View style={styles.doneButtons}>
                <Button
                  onPress={() =>
                    router.push({
                      pathname: '/(focused)/profilbild',
                      params: profilbildAssetParams(created),
                    })
                  }
                >
                  Im Profilbild verwenden
                </Button>
                <Button variant="outline" onPress={() => router.dismissTo('/(focused)/sticker')}>
                  Zur Galerie
                </Button>
                <Button variant="ghost" onPress={startOver}>
                  Noch einen Sticker
                </Button>
              </View>
            </View>
          ) : null}
        </ScrollView>

        {step === 'design' || step === 'save' ? (
          <View style={[styles.actions, { borderTopColor: theme.border }]}>
            <Button
              variant="outline"
              style={styles.action}
              disabled={busy}
              onPress={step === 'design' ? startOver : () => setStep('design')}
            >
              Zurück
            </Button>
            {step === 'design' ? (
              <Button style={styles.action} disabled={!draft} onPress={toSave}>
                Weiter
              </Button>
            ) : (
              <Button
                style={styles.action}
                disabled={!canSave}
                loading={busy}
                onPress={() => void save()}
              >
                Sticker speichern
              </Button>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    gap: spacing.medium,
    padding: spacing.medium,
    paddingBottom: spacing.xlarge,
  },
  stepper: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxsmall },
  step: {
    paddingHorizontal: spacing.small,
    paddingVertical: spacing.xxsmall,
    borderRadius: borderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepText: { ...typography.caption, fontWeight: '600' },
  heading: { ...typography.h3 },
  modes: { gap: spacing.small },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    padding: spacing.medium,
    borderRadius: borderRadius.xlarge,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modeIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeText: { flex: 1, gap: spacing.xxsmall },
  modeTitle: { ...typography.bodyBold },
  modeBody: { ...typography.bodySmall },
  section: { gap: spacing.medium },
  hidden: { display: 'none' },
  error: { ...typography.body, textAlign: 'center' },
  done: { alignItems: 'center' },
  doneText: { ...typography.body, textAlign: 'center' },
  doneButtons: { width: '100%', maxWidth: 360, gap: spacing.small },
  actions: {
    flexDirection: 'row',
    gap: spacing.small,
    paddingHorizontal: spacing.medium,
    paddingTop: spacing.small,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: { flex: 1 },
});
