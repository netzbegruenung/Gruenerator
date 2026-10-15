import {
  type TranslationFormality,
  type TranslationLanguagesResponse,
  TRANSLATION_DOCUMENT_EXTENSIONS,
  TRANSLATION_DOCUMENT_MAX_BYTES,
} from '@gruenerator/contracts';
import {
  AUTO,
  defaultTarget,
  glossaryTargets,
  initialRecent,
  NF,
  pushRecent,
  sourceOptions,
  targetOptions,
  useDocumentStatus,
} from '@gruenerator/shared/translation';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import {
  type PickedFile,
  shareTranslatedDocument,
  useUploadDocument,
} from '../../hooks/translation/useDocumentTranslation';
import { useTheme } from '../../hooks/useTheme';
import { pickDocument } from '../../services/documentPicker';
import { borderRadius, colors, spacing, typography } from '../../theme';
import { Button } from '../common/Button';

import { BudgetNote } from './BudgetNote';
import { FormalityPicker } from './FormalityPicker';
import { LanguageBar } from './LanguageBar';

const ACCEPT_LIST = TRANSLATION_DOCUMENT_EXTENSIONS.map((e) => `.${e}`).join(', ');
const MAX_MB = Math.round(TRANSLATION_DOCUMENT_MAX_BYTES / (1024 * 1024));

function extensionOf(file: PickedFile): string {
  return file.name.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Upload → poll → share. The server buffers DeepL's one-shot result, so the
 * share button can be pressed again if the first download fails.
 */
export function DocumentTranslator({
  data,
  loading,
}: {
  /** `null` until the language list arrives; starting waits for it. */
  data: TranslationLanguagesResponse | null;
  loading: boolean;
}) {
  const theme = useTheme();
  const languages = data?.languages ?? [];
  const glossaryPairs = data?.glossaryPairs ?? [];
  const quota = data?.quota ?? null;
  const sources = sourceOptions(languages);
  const targets = targetOptions(languages);
  const fallbackTarget = defaultTarget(languages);

  const [file, setFile] = useState<PickedFile | null>(null);
  const [sourceLang, setSourceLang] = useState<string>(AUTO);
  // As in the text tab: defaults follow the list, which may still be loading;
  // with the target '' the start button stays off until it lands.
  const [pickedTarget, setPickedTarget] = useState<string | null>(null);
  const [pickedRecentSource, setPickedRecentSource] = useState<string[] | null>(null);
  const [pickedRecentTarget, setPickedRecentTarget] = useState<string[] | null>(null);
  const [formality, setFormality] = useState<TranslationFormality>('default');
  const [asDocx, setAsDocx] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const targetLang = pickedTarget ?? fallbackTarget;
  const recentSource = pickedRecentSource ?? initialRecent(sources, [AUTO, 'de', fallbackTarget]);
  const recentTarget = pickedRecentTarget ?? initialRecent(targets, [fallbackTarget, 'de'], 3);

  const upload = useUploadDocument();
  const status = useDocumentStatus(jobId);

  const target = targets.find((l) => l.code === targetLang);
  // A glossary needs an explicit source: whenever a dictionary translates INTO
  // the chosen target, "auto" would silently drop it.
  const sourceRequired = glossaryTargets(glossaryPairs, targetLang);
  const isPdf = file ? extensionOf(file) === 'pdf' : false;
  const fileError = file
    ? !(TRANSLATION_DOCUMENT_EXTENSIONS as readonly string[]).includes(extensionOf(file))
      ? `„${file.name}" wird nicht unterstützt. Möglich sind: ${ACCEPT_LIST}.`
      : file.size > TRANSLATION_DOCUMENT_MAX_BYTES
        ? `„${file.name}" ist größer als ${MAX_MB} MB.`
        : null
    : null;
  const busy =
    upload.isPending || status.data?.status === 'queued' || status.data?.status === 'translating';
  const canStart =
    !!file && !fileError && !busy && !!targetLang && !(sourceRequired && sourceLang === AUTO);

  const pick = async () => {
    if (busy) return;
    // Any type: several accepted formats (.xlf, .srt …) have no reliable MIME
    // type on either platform, so the extension check below decides.
    const next = await pickDocument(['*/*']);
    if (!next) return;
    setFile(next);
    setJobId(null);
    setDownloadError(null);
    upload.reset();
  };

  const start = () => {
    if (!file || !canStart) return;
    setDownloadError(null);
    upload.mutate(
      {
        file,
        targetLang,
        sourceLang: sourceLang === AUTO ? null : sourceLang,
        formality: formality === 'default' ? null : formality,
        outputFormat: isPdf && asDocx ? 'docx' : null,
      },
      { onSuccess: (job) => setJobId(job.jobId) }
    );
  };

  const share = async () => {
    if (!jobId || !status.data || sharing) return;
    setDownloadError(null);
    setSharing(true);
    // Promise chain, not try/finally: the React Compiler cannot lower a finalizer.
    await shareTranslatedDocument(jobId, status.data.filename)
      .catch(() =>
        setDownloadError('Der Download ist fehlgeschlagen. Bitte noch einmal versuchen.')
      )
      .finally(() => setSharing(false));
  };

  const error =
    fileError ?? upload.error?.message ?? status.error?.message ?? downloadError ?? null;
  const jobState = status.data;

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => void pick()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={
          file ? `Datei: ${file.name}. Andere Datei auswählen` : 'Datei auswählen'
        }
        accessibilityHint={`${ACCEPT_LIST} — bis ${MAX_MB} MB`}
        accessibilityState={{ disabled: busy }}
        style={({ pressed }) => [
          styles.zone,
          {
            borderColor: pressed ? colors.primary[500] : theme.cardBorder,
            backgroundColor: pressed ? theme.backgroundAlt : 'transparent',
          },
        ]}
      >
        <Ionicons name="cloud-upload-outline" size={28} color={theme.textSecondary} />
        {file ? (
          <View style={styles.fileRow}>
            <Ionicons name="document-text-outline" size={16} color={theme.text} />
            <Text style={[styles.zoneTitle, styles.fileName, { color: theme.text }]}>
              {file.name}{' '}
              <Text style={{ color: theme.textSecondary }}>
                ({NF.format(Math.ceil(file.size / 1024))} KB)
              </Text>
            </Text>
          </View>
        ) : (
          <Text style={[styles.zoneTitle, { color: theme.text }]}>Datei auswählen</Text>
        )}
        <Text style={[styles.caption, styles.center, { color: theme.textSecondary }]}>
          {ACCEPT_LIST} — bis {MAX_MB} MB
        </Text>
      </Pressable>

      <View>
        <LanguageBar
          label="Von"
          value={sourceLang}
          onChange={(code) => {
            setSourceLang(code);
            setPickedRecentSource(pushRecent(recentSource, code));
          }}
          options={sources}
          recent={recentSource}
          loading={loading}
          withAuto
          autoDisabled={sourceRequired}
        />
        {sourceRequired ? (
          <Text style={[styles.caption, styles.hint, { color: theme.textSecondary }]}>
            Für diese Zielsprache gibt es ein Glossar — dafür braucht DeepL die Ausgangssprache.
          </Text>
        ) : null}
      </View>
      <LanguageBar
        label="Nach"
        value={targetLang}
        onChange={(code) => {
          setPickedTarget(code);
          setPickedRecentTarget(pushRecent(recentTarget, code, 3));
        }}
        options={targets}
        recent={recentTarget}
        loading={loading}
      >
        {target?.formality ? <FormalityPicker value={formality} onChange={setFormality} /> : null}
      </LanguageBar>

      {isPdf ? (
        <View style={styles.switchRow}>
          <Text style={[styles.body, styles.switchLabel, { color: theme.text }]}>
            Als bearbeitbare Word-Datei (.docx) ausgeben
          </Text>
          <Switch
            value={asDocx}
            onValueChange={setAsDocx}
            accessibilityLabel="Als bearbeitbare Word-Datei (.docx) ausgeben"
            trackColor={{ true: colors.primary[500] }}
          />
        </View>
      ) : null}

      {error ? (
        <View
          style={[styles.alert, { borderColor: colors.error[500], backgroundColor: theme.surface }]}
        >
          <Text accessibilityRole="alert" style={[styles.body, { color: colors.error[600] }]}>
            {error}
          </Text>
        </View>
      ) : null}

      {jobState ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.job, { backgroundColor: theme.backgroundAlt }]}
        >
          {jobState.status === 'done' ? (
            <>
              <Text style={[styles.body, { color: theme.text }]}>
                Fertig: <Text style={styles.bold}>{jobState.filename}</Text>
                {jobState.billedCharacters
                  ? ` — ${NF.format(jobState.billedCharacters)} Zeichen abgerechnet`
                  : ''}
              </Text>
              <Button onPress={() => void share()} loading={sharing}>
                Teilen / Speichern
              </Button>
            </>
          ) : jobState.status === 'error' ? (
            <Text style={[styles.body, { color: colors.error[600] }]}>{jobState.message}</Text>
          ) : (
            <Text style={[styles.body, { color: theme.text }]}>
              DeepL übersetzt „{jobState.filename}“ …
              {jobState.secondsRemaining ? ` (noch etwa ${jobState.secondsRemaining} s)` : ''}
            </Text>
          )}
        </View>
      ) : null}

      <View style={styles.footer}>
        <BudgetNote quota={quota} hint="20.000 Zeichen = 1 Baum." />
        <Text style={[styles.caption, { color: theme.textSecondary }]}>
          DeepL rechnet jedes Dokument mit mindestens 50.000 Zeichen ab.
        </Text>
        <Button onPress={start} disabled={!canStart}>
          {busy ? 'Übersetze …' : 'Dokument übersetzen'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.medium },
  zone: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xsmall,
    minHeight: 44,
    paddingHorizontal: spacing.medium,
    paddingVertical: spacing.large,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: borderRadius.large,
  },
  zoneTitle: { ...typography.bodyBold, textAlign: 'center' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxsmall, maxWidth: '100%' },
  fileName: { flexShrink: 1 },
  caption: { ...typography.caption },
  center: { textAlign: 'center' },
  hint: { marginTop: spacing.xxsmall },
  body: { ...typography.body },
  bold: { ...typography.bodyBold },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.small,
    minHeight: 44,
  },
  switchLabel: { flex: 1 },
  alert: {
    borderWidth: 1,
    borderRadius: borderRadius.medium,
    padding: spacing.small,
  },
  job: { gap: spacing.small, padding: spacing.medium, borderRadius: borderRadius.large },
  footer: { gap: spacing.small },
});
