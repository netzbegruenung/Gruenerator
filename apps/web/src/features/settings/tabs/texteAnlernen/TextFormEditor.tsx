import { MAX_TEXT_FORM_EXAMPLES, type TextForm, type TextFormType } from '@gruenerator/contracts';
import { slugifyName } from '@gruenerator/shared/utils';
import { Button, toast } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { FiPlus, FiShare2, FiTrash2, FiX } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

import { type useTextForms } from './useTextForms';

const TEXTAREA_CLASS =
  'w-full resize-y rounded-md border border-grey-300 bg-input-bg p-sm text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600';

interface TextFormEditorProps {
  kind: 'preset' | 'custom';
  /** Preset only: fixed text type (also the mention). */
  fixedTextType?: TextFormType;
  /** Existing saved form, if any. */
  initialForm?: TextForm;
  /** Display title for presets; default for a new custom form. */
  defaultTitle: string;
  /** Placeholder hint describing the text kind (e.g. "Instagram-Posts"). */
  hint: string;
  /** New custom form: let the user name it and pick a mention. */
  editableMeta?: boolean;
  api: ReturnType<typeof useTextForms>;
  onCreated?: () => void;
}

function seedExamples(form: TextForm | undefined): string[] {
  const existing = form?.examples.map((e) => e.content) ?? [];
  return existing.length > 0 ? existing : [''];
}

const TextFormEditor = ({
  kind,
  fixedTextType,
  initialForm,
  defaultTitle,
  hint,
  editableMeta = false,
  api,
  onCreated,
}: TextFormEditorProps) => {
  const navigate = useNavigate();
  const [title, setTitle] = useState(initialForm?.title ?? defaultTitle);
  const [mention, setMention] = useState(initialForm?.mention ?? '');
  const [mentionTouched, setMentionTouched] = useState(false);
  const [examples, setExamples] = useState<string[]>(() => seedExamples(initialForm));
  const [styleBlock, setStyleBlock] = useState(initialForm?.styleBlock ?? '');

  const effectiveMention = useMemo(() => {
    if (fixedTextType) return fixedTextType;
    if (initialForm) return initialForm.mention;
    return mentionTouched ? mention : slugifyName(title, 'textform');
  }, [fixedTextType, initialForm, mention, mentionTouched, title]);

  const filledExamples = examples.map((c) => c.trim()).filter((c) => c.length > 0);
  const canAddExample = examples.length < MAX_TEXT_FORM_EXAMPLES;

  const updateExample = (idx: number, value: string) =>
    setExamples((prev) => prev.map((e, i) => (i === idx ? value : e)));
  const addExample = () => canAddExample && setExamples((prev) => [...prev, '']);
  const removeExample = (idx: number) =>
    setExamples((prev) => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== idx)));

  const handleAnalyze = async () => {
    if (filledExamples.length === 0) {
      toast.error('Bitte mindestens ein Beispiel einfügen.');
      return;
    }
    try {
      const block = await api.analyze.mutateAsync({
        ...(fixedTextType ? { textType: fixedTextType } : { title: title.trim() }),
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
      toast.error('Bitte einen Namen für die Textform angeben.');
      return;
    }
    try {
      await api.save.mutateAsync({
        mention: effectiveMention,
        body: {
          kind,
          ...(fixedTextType ? { textType: fixedTextType } : {}),
          title: title.trim() || defaultTitle,
          examples: filledExamples.map((content) => ({ content })),
          styleBlock: styleBlock.trim(),
        },
      });
      toast.success('Textform gespeichert.');
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen.');
    }
  };

  const handleDelete = async () => {
    if (!initialForm) return;
    try {
      await api.remove.mutateAsync(initialForm.mention);
      toast.success('Textform gelöscht.');
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
    <div className="flex flex-col gap-sm rounded-lg border border-grey-200 p-md dark:border-grey-700">
      {editableMeta ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Name, z.B. OMV-Einladungen"
            className="flex-1 rounded-md border border-grey-300 bg-input-bg px-sm py-1.5 text-sm text-foreground placeholder:text-grey-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-grey-600"
          />
          <div className="flex items-center gap-1 rounded-md border border-grey-300 bg-input-bg px-sm py-1.5 text-sm text-grey-500 dark:border-grey-600">
            <span>/</span>
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
                ? `/${effectiveMention}`
                : `Ersetzt den Standard beim /${effectiveMention}-Skill`}
            </p>
          </div>
          {initialForm && (
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="text-grey-400 hover:text-red-500"
              title="Textform löschen"
            >
              <FiTrash2 size={16} />
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs font-medium text-grey-500 dark:text-grey-400">
          Beispiele ({hint}) — bis zu {MAX_TEXT_FORM_EXAMPLES}
        </p>
        {examples.map((value, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <textarea
              value={value}
              onChange={(e) => updateExample(idx, e.target.value)}
              placeholder={`Beispiel ${idx + 1} einfügen…`}
              rows={3}
              className={TEXTAREA_CLASS}
            />
            {examples.length > 1 && (
              <button
                type="button"
                onClick={() => removeExample(idx)}
                className="mt-1 text-grey-400 hover:text-red-500"
                title="Beispiel entfernen"
              >
                <FiX size={16} />
              </button>
            )}
          </div>
        ))}
        {canAddExample && (
          <button
            type="button"
            onClick={addExample}
            className="flex items-center gap-1 self-start text-xs text-primary-600 hover:underline dark:text-primary-400"
          >
            <FiPlus size={14} /> Beispiel hinzufügen
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void handleAnalyze()}
          disabled={api.analyze.isPending}
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
