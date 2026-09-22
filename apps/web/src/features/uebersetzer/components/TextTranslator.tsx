import {
  type TranslateTextResponse,
  type TranslationFormality,
  type TranslationLanguagesResponse,
  TRANSLATION_TEXT_MAX_CHARS,
} from '@gruenerator/contracts';
import { Alert, AlertDescription, Button } from '@gruenerator/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { PiCheck, PiCopy, PiX } from 'react-icons/pi';

import { useTranslateText } from '../hooks/useTranslation';

import { FormalityMenu } from './FormalityMenu';
import { LanguageBar } from './LanguageBar';
import {
  AUTO,
  defaultTarget,
  initialRecent,
  languageName,
  NF,
  pushRecent,
  sourceOptions,
  targetOptions,
} from './languageOptions';

import { TreeBudgetChip } from '@/components/common/TreeBudgetLine';
import { cn } from '@/utils/cn';

interface TextTranslatorProps {
  data: TranslationLanguagesResponse;
}

const AUTO_DEBOUNCE_MS = 800;
/** Above this, translation waits for the button — see the guard rails below. */
export const AUTO_MAX_CHARS = 2000;

/**
 * Two panes, Google-Translate style. Translation runs on its own a moment
 * after typing stops, but only inside guard rails: every run is billed by
 * DeepL and booked against the daily Bäume budget (1 Baum per 20.000
 * characters), so
 *
 *  - a long text is never translated automatically — past `AUTO_MAX_CHARS`
 *    the button comes back, or a 50.000-character paste would cost 2,5 Bäume
 *    per pause in typing,
 *  - the same text, languages and formality are never sent twice,
 *  - an answer whose request has gone stale is dropped rather than shown,
 *  - with an empty budget nothing fires by itself; it would only earn a 429.
 *
 * Cmd/Ctrl+Enter always translates immediately.
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

  const target = targets.find((l) => l.code === targetLang);
  const tooLong = text.length > TRANSLATION_TEXT_MAX_CHARS;
  const outOfBudget = quota.limit !== null && (quota.remaining ?? 0) <= 0;
  const manualOnly = text.length > AUTO_MAX_CHARS;
  const canTranslate = text.trim().length > 0 && !tooLong && !!targetLang;
  const key = `${sourceLang}|${targetLang}|${formality}|${text}`;

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const run = () => {
    if (!canTranslate || translate.isPending) return;
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
        // A slower earlier answer must not overwrite a newer one.
        onSuccess: (answer) => {
          if (pendingKey.current === key) setResult(answer);
        },
      }
    );
  };

  useEffect(() => {
    if (!canTranslate || manualOnly || outOfBudget) return;
    if (sentKey.current === key) return;
    const timer = setTimeout(run, AUTO_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `run` is rebuilt on every render; `key` already carries everything it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, canTranslate, manualOnly, outOfBudget]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      run();
    }
  };

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
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
    } catch {
      // Clipboard blocked (permissions, insecure context) — the text stays selectable.
    }
  };

  const status = translate.isPending
    ? 'Übersetze …'
    : result
      ? [
          sourceLang === AUTO
            ? `Erkannt: ${languageName(languages, result.detectedSourceLang)}`
            : null,
          result.glossaryApplied ? 'Grünen-Glossar angewendet' : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  return (
    <div className="flex flex-col gap-md">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] items-start gap-x-xl gap-y-lg">
        {/* source */}
        <div className="min-w-0">
          <LanguageBar
            label="Von"
            quickLabel="Ausgangssprache"
            value={sourceLang}
            onChange={pickSource}
            options={sources}
            recent={recentSource}
            withAuto
            onSwap={swap}
            swapDisabled={sourceLang === AUTO && !result}
          />
          <div className="relative mt-sm flex flex-col rounded-[14px] border border-grey-200 focus-within:border-primary-500">
            <textarea
              aria-label="Ausgangstext"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Text eingeben oder einfügen …"
              aria-invalid={tooLong || undefined}
              className="min-h-[200px] w-full resize-y rounded-[14px] border-0 bg-transparent py-md pl-md pr-xl text-lg leading-relaxed text-foreground outline-none md:text-[22px]"
            />
            {text ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-xs top-xs rounded-full"
                aria-label="Text löschen"
                onClick={clear}
              >
                <PiX aria-hidden="true" />
              </Button>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-xs px-md pb-sm text-xs text-grey-500">
              <span>
                {sourceLang === AUTO && result
                  ? `Erkannt: ${languageName(languages, result.detectedSourceLang)}`
                  : ''}
              </span>
              <span className={cn(tooLong && 'text-destructive')}>
                {NF.format(text.length)} / {NF.format(TRANSLATION_TEXT_MAX_CHARS)} Zeichen
              </span>
            </div>
          </div>
        </div>

        {/* target */}
        <div className="min-w-0">
          <LanguageBar
            label="Nach"
            quickLabel="Zielsprache"
            value={targetLang}
            onChange={pickTarget}
            options={targets}
            recent={recentTarget}
          >
            {target?.formality ? <FormalityMenu value={formality} onChange={setFormality} /> : null}
          </LanguageBar>
          <div className="mt-sm flex min-h-[262px] flex-col rounded-[14px] bg-primary-50">
            {/* The translation now arrives without anyone pressing anything, so
                it has to announce itself. The status line below therefore stays
                silent — two live regions would double every message. */}
            <div
              role="region"
              aria-label="Übersetzung"
              aria-live="polite"
              className={cn(
                'flex-1 px-md py-md text-lg leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] md:text-[22px]',
                result ? 'text-foreground-heading' : 'text-grey-500'
              )}
            >
              {result?.text ?? 'Übersetzung'}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-xs pb-xs pl-md pr-sm text-xs text-grey-500">
              <span className="inline-flex min-h-9 items-center gap-xs">
                {translate.isPending ? (
                  <span
                    aria-hidden="true"
                    className="inline-block size-3 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
                  />
                ) : null}
                {status}
              </span>
              <span className="ml-auto inline-flex items-center gap-xxs">
                <TreeBudgetChip status={quota} hint="20.000 Zeichen = 1 Baum." />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-primary-600 hover:bg-primary-100"
                  disabled={!result}
                  onClick={() => void copy()}
                >
                  {copied ? <PiCheck aria-hidden="true" /> : <PiCopy aria-hidden="true" />}
                  {copied ? 'Kopiert' : 'Kopieren'}
                </Button>
              </span>
            </div>
          </div>
        </div>
      </div>

      {translate.error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{translate.error.message}</AlertDescription>
        </Alert>
      ) : null}

      {manualOnly || outOfBudget ? (
        <div className="flex flex-wrap items-center justify-end gap-sm">
          <p className="m-0 mr-auto text-xs text-grey-500">
            {outOfBudget
              ? 'Das Tagesbudget ist aufgebraucht.'
              : 'Langer Text — auf Knopfdruck übersetzen.'}
          </p>
          <Button
            type="button"
            variant="brand"
            disabled={!canTranslate || translate.isPending}
            onClick={run}
          >
            {translate.isPending ? 'Übersetze …' : 'Übersetzen'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
