import {
  type TranslateTextResponse,
  type TranslationFormality,
  type TranslationLanguagesResponse,
  TRANSLATION_TEXT_MAX_CHARS,
} from '@gruenerator/contracts';
import { Alert, AlertDescription, Button, Label, Textarea } from '@gruenerator/ui';
import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { PiArrowsLeftRight, PiCheck, PiCopy } from 'react-icons/pi';

import { useTranslateText } from '../hooks/useTranslation';

import { FormalityToggle } from './FormalityToggle';
import {
  AUTO,
  defaultTarget,
  languageName,
  NF,
  selectCls,
  sourceOptions,
  targetOptions,
} from './languageOptions';

import { TreeBudgetLine } from '@/components/common/TreeBudgetLine';
import { cn } from '@/utils/cn';

interface TextTranslatorProps {
  data: TranslationLanguagesResponse;
}

/**
 * Two panes, Google-Translate style. Translation is explicit (button or
 * Cmd/Ctrl+Enter), never on keystroke: every request is billed by DeepL and
 * counts against the person's daily budget.
 */
export function TextTranslator({ data }: TextTranslatorProps) {
  const { languages, quota } = data;
  const sources = sourceOptions(languages);
  const targets = targetOptions(languages);

  const [sourceLang, setSourceLang] = useState<string>(AUTO);
  const [targetLang, setTargetLang] = useState<string>(() => defaultTarget(languages));
  const [formality, setFormality] = useState<TranslationFormality>('default');
  const [text, setText] = useState('');
  const [result, setResult] = useState<TranslateTextResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const translate = useTranslateText();
  const sourceId = useId();
  const targetId = useId();
  const inputId = useId();
  const outputId = useId();

  const target = targets.find((l) => l.code === targetLang);
  const tooLong = text.length > TRANSLATION_TEXT_MAX_CHARS;
  const canTranslate = text.trim().length > 0 && !tooLong && !translate.isPending && !!targetLang;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = () => {
    if (!canTranslate) return;
    translate.mutate(
      {
        text,
        targetLang,
        sourceLang: sourceLang === AUTO ? null : sourceLang,
        formality: formality === 'default' ? null : formality,
      },
      { onSuccess: setResult }
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      run();
    }
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
    setSourceLang(sources.find((l) => l.code === newSource)?.code ?? newSource.split('-')[0]!);
    setTargetLang(newTarget);
    if (result) {
      setText(result.text);
      setResult(null);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions, insecure context) — the text stays selectable.
    }
  };

  return (
    <div className="flex flex-col gap-md">
      <div className="grid gap-sm md:grid-cols-[1fr_auto_1fr] md:items-end">
        <div className="flex flex-col gap-xs">
          <Label htmlFor={sourceId}>Von</Label>
          <select
            id={sourceId}
            className={selectCls}
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
          >
            <option value={AUTO}>Automatisch erkennen</option>
            {sources.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="justify-self-center"
          aria-label="Sprachen tauschen"
          disabled={sourceLang === AUTO && !result}
          onClick={swap}
        >
          <PiArrowsLeftRight aria-hidden="true" />
        </Button>
        <div className="flex flex-col gap-xs">
          <Label htmlFor={targetId}>Nach</Label>
          <select
            id={targetId}
            className={selectCls}
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {targets.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {target?.formality ? <FormalityToggle value={formality} onChange={setFormality} /> : null}

      <div className="grid gap-md md:grid-cols-2">
        <div className="flex flex-col gap-xs">
          <Label htmlFor={inputId}>Ausgangstext</Label>
          <Textarea
            id={inputId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Text eingeben oder einfügen …"
            className="min-h-[16rem] resize-y text-base leading-relaxed"
            aria-invalid={tooLong || undefined}
            aria-describedby={`${inputId}-count`}
          />
          <p
            id={`${inputId}-count`}
            className={cn('m-0 text-xs', tooLong ? 'text-destructive' : 'text-grey-500')}
          >
            {NF.format(text.length)} / {NF.format(TRANSLATION_TEXT_MAX_CHARS)} Zeichen
          </p>
        </div>
        <div className="flex flex-col gap-xs">
          <div className="flex items-center justify-between gap-sm">
            <Label htmlFor={outputId}>Übersetzung</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!result}
              onClick={() => void copy()}
            >
              {copied ? <PiCheck aria-hidden="true" /> : <PiCopy aria-hidden="true" />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </Button>
          </div>
          <Textarea
            id={outputId}
            value={result?.text ?? ''}
            readOnly
            placeholder="Die Übersetzung erscheint hier."
            className="min-h-[16rem] resize-y text-base leading-relaxed"
          />
          <p className="m-0 text-xs text-grey-500" aria-live="polite">
            {result
              ? [
                  sourceLang === AUTO
                    ? `Erkannt: ${languageName(languages, result.detectedSourceLang)}`
                    : null,
                  result.glossaryApplied ? 'Grünen-Glossar angewendet' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : ' '}
          </p>
        </div>
      </div>

      {translate.error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{translate.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-sm">
        <TreeBudgetLine status={quota} />
        <Button type="button" variant="brand" disabled={!canTranslate} onClick={run}>
          {translate.isPending ? 'Übersetze …' : 'Übersetzen'}
        </Button>
      </div>
    </div>
  );
}
