import {
  MAX_TEXT_FORM_EXAMPLES,
  MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS,
  type TextForm,
  type TextFormKind,
  type TextFormType,
} from '@gruenerator/contracts';
import { useUserGroups } from '@gruenerator/shared/groups';
import { slugifyName } from '@gruenerator/shared/utils';
import { Button, toast } from '@gruenerator/ui';
import { useId, useMemo, useRef, useState } from 'react';
import { FiShare2, FiTrash2, FiUpload } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { EXAMPLE_FILE_ACCEPT, extractExampleText } from './extractExampleText';
import {
  EXAMPLE_SEPARATOR,
  joinExamples,
  splitExamples,
  splitStrategyLabel,
} from './splitExamples';
import { type useTextForms } from './useTextForms';

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600';

interface TextFormEditorProps {
  kind: TextFormKind;
  /**
   * Vorgegebene Mention — bei einem Preset ist das der Textyp selbst
   * (`presse`), bei einem Landesverbands-Rezept dessen eigene Mention
   * (`presse-hessen-partei`). Nur `custom` lässt die Person sie selbst wählen.
   */
  fixedMention?: string;
  /** Der Textyp, unter dem die Stilanalyse beschriftet wird ("Pressemitteilungen"). */
  textType?: TextFormType;
  /** Existing saved form, if any. */
  initialForm?: TextForm;
  /** Display title for presets; default for a new custom form. */
  defaultTitle: string;
  /** Placeholder hint describing the text kind (e.g. "Instagram-Posts"). */
  hint: string;
  /** New custom form: let the user name it and pick a mention. */
  editableMeta?: boolean;
  api: ReturnType<typeof useTextForms>;
  /** Called after a successful save — the tab returns to the overview. */
  onCreated?: () => void;
  onDeleted?: () => void;
}

const NUM = (n: number) => n.toLocaleString('de-DE');

const TextFormEditor = ({
  kind,
  fixedMention,
  textType,
  initialForm,
  defaultTitle,
  hint,
  editableMeta = false,
  api,
  onCreated,
  onDeleted,
}: TextFormEditorProps) => {
  const navigate = useNavigate();
  const examplesFieldId = useId();
  const examplesStatusId = useId();
  const { data: groupsData } = useUserGroups();
  const groups = groupsData ?? [];
  const sharedGroupIds = useMemo(
    () => new Set((initialForm?.sharedWithGroups ?? []).map((g) => g.groupId)),
    [initialForm]
  );
  const [title, setTitle] = useState(initialForm?.title ?? defaultTitle);
  const [mention, setMention] = useState(initialForm?.mention ?? '');
  const [mentionTouched, setMentionTouched] = useState(false);
  const [rawExamples, setRawExamples] = useState(() => joinExamples(initialForm?.examples ?? []));
  const [styleBlock, setStyleBlock] = useState(initialForm?.styleBlock ?? '');
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveMention = useMemo(() => {
    if (fixedMention) return fixedMention;
    if (initialForm) return initialForm.mention;
    return mentionTouched ? mention : slugifyName(title, 'textform');
  }, [fixedMention, initialForm, mention, mentionTouched, title]);

  const split = useMemo(() => splitExamples(rawExamples), [rawExamples]);
  const filledExamples = split.examples;
  const usedChars = rawExamples.trim().length;
  const tooManyExamples = filledExamples.length > MAX_TEXT_FORM_EXAMPLES;
  const tooManyChars = usedChars > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;

  /**
   * Uploaded files are appended to the one field, separated by the same rule the
   * splitter recognises: whatever the OCR read stays visible and editable, so a
   * botched extraction is obvious before it is analysed.
   */
  const handleFiles = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setIsReadingFiles(true);
    try {
      const results = await Promise.allSettled(files.map((file) => extractExampleText(file)));
      const blocks: string[] = [];

      results.forEach((result, i) => {
        const name = files[i]?.name ?? 'Datei';
        if (result.status === 'rejected') {
          const err = result.reason as unknown;
          toast.error(
            err instanceof Error ? err.message : `„${name}" konnte nicht gelesen werden.`
          );
          return;
        }
        const text = result.value.trim();
        if (text.length === 0) {
          toast.error(`Aus „${name}" ließ sich kein Text lesen.`);
          return;
        }
        blocks.push(text);
      });

      if (blocks.length === 0) return;

      const merged = [rawExamples.trim(), ...blocks]
        .filter((b) => b.length > 0)
        .join(EXAMPLE_SEPARATOR);
      const truncated = merged.length > MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS;
      setRawExamples(truncated ? merged.slice(0, MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS) : merged);

      toast.success(
        blocks.length === 1
          ? 'Beispiel aus Datei übernommen.'
          : `${blocks.length} Dateien übernommen.`
      );
      if (truncated) {
        toast.info(`Auf ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen gekürzt.`);
      }
    } finally {
      setIsReadingFiles(false);
    }
  };

  const handleAnalyze = async () => {
    if (filledExamples.length === 0) {
      toast.error('Bitte mindestens ein Beispiel einfügen.');
      return;
    }
    if (tooManyExamples) {
      toast.error(
        `${filledExamples.length} Beispiele erkannt — höchstens ${MAX_TEXT_FORM_EXAMPLES} sind möglich.`
      );
      return;
    }
    if (tooManyChars) {
      toast.error(
        `Zu viel Text: ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen.`
      );
      return;
    }
    try {
      const block = await api.analyze.mutateAsync({
        ...(textType ? { textType } : { title: title.trim() }),
        examples: filledExamples.map((content) => ({ content })),
      });
      setStyleBlock(block);
      toast.success('Stil erkannt — du kannst ihn jetzt anpassen.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analyse fehlgeschlagen.');
    }
  };

  const handleSave = async () => {
    if (styleBlock.trim().length === 0) {
      toast.error('Bitte zuerst analysieren oder einen Stil eingeben.');
      return;
    }
    if (kind === 'custom' && effectiveMention.length < 2) {
      toast.error('Bitte einen Namen für das Rezept angeben.');
      return;
    }
    if (tooManyExamples || tooManyChars) {
      toast.error('Bitte zuerst die Beispiele auf das erlaubte Maß kürzen.');
      return;
    }
    try {
      await api.save.mutateAsync({
        mention: effectiveMention,
        body: {
          kind,
          ...(textType ? { textType } : {}),
          title: title.trim() || defaultTitle,
          examples: filledExamples.map((content) => ({ content })),
          styleBlock: styleBlock.trim(),
        },
      });
      toast.success('Rezept gespeichert.');
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const handleDelete = async () => {
    if (!initialForm) return;
    try {
      await api.remove.mutateAsync(initialForm.mention);
      toast.success('Rezept gelöscht.');
      onDeleted?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  };

  const handleConvertToAgent = () => {
    if (styleBlock.trim().length === 0) {
      toast.error('Bitte zuerst einen Stil speichern.');
      return;
    }
    const systemRole = `Du schreibst Texte im angelernten Stil "${title.trim() || defaultTitle}".\n\n${styleBlock.trim()}`;
    void navigate('/agents/new', {
      state: { prefillTextForm: { title: title.trim() || defaultTitle, systemRole } },
    });
  };

  return (
    <div className="flex flex-col gap-sm">
      {editableMeta ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name, z.B. OMV-Einladungen"
            className="flex-1 rounded-md border border-grey-300 bg-input-bg px-sm py-1.5 text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
          />
          <div className="flex items-center gap-1 rounded-md border border-grey-300 bg-input-bg px-sm py-1.5 text-sm text-grey-500 dark:border-grey-600">
            <span>@</span>
            <input
              value={effectiveMention}
              onChange={(e) => {
                setMentionTouched(true);
                setMention(slugifyName(e.target.value, 'textform'));
              }}
              placeholder="omv-einladungen"
              className="w-36 bg-transparent text-foreground focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="m-0 text-sm font-semibold text-foreground">{title}</p>
            <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
              {kind === 'custom'
                ? `@${effectiveMention}`
                : `Ersetzt das mitgelieferte Rezept @${effectiveMention}`}
            </p>
          </div>
          {initialForm && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="text-grey-400 hover:text-red-500"
              title="Rezept löschen"
            >
              <FiTrash2 size={16} />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label
          htmlFor={examplesFieldId}
          className="m-0 text-xs font-medium text-grey-500 dark:text-grey-400"
        >
          Beispiele ({hint}) — alle in dieses Feld, bis zu {MAX_TEXT_FORM_EXAMPLES} Stück
        </label>
        <p className="m-0 text-xs text-grey-500 dark:text-grey-400">
          Einfach alles hintereinander einfügen. Wir trennen die Beispiele automatisch — an einer
          Zeile aus <code>---</code>, an Überschriften wie „Beispiel 2&ldquo;, an einer Nummerierung
          oder an doppelten Leerzeilen.
        </p>
        <textarea
          id={examplesFieldId}
          value={rawExamples}
          onChange={(e) => setRawExamples(e.target.value)}
          maxLength={MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS}
          placeholder={`Beispiel 1…\n\n---\n\nBeispiel 2…`}
          rows={14}
          aria-describedby={examplesStatusId}
          className={TEXTAREA_CLASS}
        />
        <p
          id={examplesStatusId}
          aria-live="polite"
          className={
            tooManyExamples || tooManyChars
              ? 'm-0 text-xs text-red-600 dark:text-red-400'
              : 'm-0 text-xs text-grey-500 dark:text-grey-400'
          }
        >
          {filledExamples.length === 0
            ? `0 Beispiele — noch nichts eingefügt (${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen Platz)`
            : `${filledExamples.length} ${filledExamples.length === 1 ? 'Beispiel' : 'Beispiele'} erkannt (${splitStrategyLabel(split.strategy)}) · ${NUM(usedChars)} von ${NUM(MAX_TEXT_FORM_EXAMPLES_TOTAL_CHARS)} Zeichen`}
          {tooManyExamples && ` — höchstens ${MAX_TEXT_FORM_EXAMPLES} Beispiele.`}
        </p>
        <div className="flex flex-wrap items-center gap-md">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isReadingFiles}
            className="flex items-center gap-1 text-xs text-primary-600 hover:underline disabled:opacity-60 dark:text-primary-400"
          >
            <FiUpload size={14} /> {isReadingFiles ? 'Lese Dateien…' : 'Dateien hochladen'}
          </button>
          <span className="text-xs text-grey-500 dark:text-grey-400">
            PDF, Word, PowerPoint, Bilder oder Textdateien
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={EXAMPLE_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleAnalyze()}
          disabled={api.analyze.isPending || filledExamples.length === 0 || tooManyExamples}
        >
          {api.analyze.isPending ? 'Analysiere…' : 'Gemeinsamkeiten erkennen'}
        </Button>
      </div>

      {(styleBlock.length > 0 || initialForm) && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-medium text-grey-500 dark:text-grey-400">
            Erkannter Stil (anpassbar) — wird künftig statt des Standards verwendet
          </p>
          <textarea
            value={styleBlock}
            onChange={(e) => setStyleBlock(e.target.value)}
            rows={8}
            className={TEXTAREA_CLASS}
          />
          {initialForm && groups.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-grey-200 p-sm dark:border-grey-700">
              <p className="m-0 text-xs font-medium text-grey-500 dark:text-grey-400">
                Mit Gruppen teilen — Mitglieder können das Rezept dann im Chat nutzen
              </p>
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => {
                  const isShared = sharedGroupIds.has(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      disabled={api.share.isPending || api.unshare.isPending}
                      onClick={() => {
                        const mutation = isShared ? api.unshare : api.share;
                        mutation.mutate(
                          { mention: effectiveMention, groupId: group.id },
                          {
                            onSuccess: () =>
                              toast.success(
                                isShared
                                  ? `Nicht mehr mit ${group.name} geteilt.`
                                  : `Mit ${group.name} geteilt.`
                              ),
                            onError: (e) =>
                              toast.error(
                                e instanceof Error ? e.message : 'Teilen fehlgeschlagen.'
                              ),
                          }
                        );
                      }}
                      className={
                        isShared
                          ? 'rounded-full border border-primary-500 bg-primary-50 px-sm py-[0.2rem] text-xs text-primary-800 dark:bg-primary-950/40 dark:text-primary-200'
                          : 'rounded-full border border-grey-200 px-sm py-[0.2rem] text-xs text-grey-600 hover:bg-background-alt dark:border-grey-700 dark:text-grey-400'
                      }
                    >
                      {group.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleConvertToAgent}
              title="Aus diesem Stil einen teilbaren Grünerator erstellen"
            >
              <FiShare2 size={14} /> Als Grünerator anlegen
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={api.save.isPending}
            >
              {api.save.isPending ? 'Speichere…' : 'Speichern'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextFormEditor;
