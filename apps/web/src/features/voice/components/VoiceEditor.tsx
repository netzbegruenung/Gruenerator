import { SPEECH_MAX_CHUNK_CHARS } from '@gruenerator/contracts';
import { Button, Label, Textarea } from '@gruenerator/ui';
import { Pause } from 'lucide-react';

import { formatCount } from '../../../utils/usageFormat';

import type { VoicePresetDef } from '../presets';
import type { ReactNode, RefObject } from 'react';

export interface VoiceEditorProps {
  text: string;
  onChange: (next: string) => void;
  def: VoicePresetDef;
  onInsertPause: () => void;
  /** False when a pause tag would no longer fit — a cut-off tag gets read aloud. */
  pauseFits: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** The "Text mit KI entwerfen" trigger, so the editor owns no drafting state. */
  assistant: ReactNode;
}

/**
 * The page's centre of gravity: one card that is the text and its immediate
 * tools, with everything about the *recording* moved out to the settings rail.
 *
 * The focus ring sits on the card rather than the textarea, because the two are
 * one control visually — a ring around the inner field would draw a box inside
 * a box.
 */
export default function VoiceEditor({
  text,
  onChange,
  def,
  onInsertPause,
  pauseFits,
  textareaRef,
  assistant,
}: VoiceEditorProps) {
  const chunkCount = Math.max(1, Math.ceil(text.length / SPEECH_MAX_CHUNK_CHARS));

  return (
    <div className="flex min-h-[20rem] flex-col overflow-hidden rounded-xl border border-grey-200 bg-background-pure shadow-sm focus-within:ring-[3px] focus-within:ring-ring/50 dark:border-grey-700 lg:min-h-[32rem]">
      <div className="flex flex-wrap items-center gap-xs border-b border-grey-200 px-sm py-xs dark:border-grey-700">
        {assistant}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onInsertPause}
          disabled={!pauseFits}
        >
          <Pause aria-hidden="true" />
          Pause einfügen
        </Button>
        <p
          id="voice-text-count"
          aria-live="polite"
          className="m-0 ml-auto text-xs tabular-nums text-muted-foreground"
        >
          {formatCount(text.length)} / {formatCount(def.maxChars)} Zeichen
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-xs p-md">
        <Label htmlFor="voice-text" className="sr-only">
          Text
        </Label>
        <p id="voice-text-hint" className="m-0 text-sm text-muted-foreground">
          {def.hint}
        </p>
        <Textarea
          id="voice-text"
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value.slice(0, def.maxChars))}
          placeholder={def.placeholder}
          maxLength={def.maxChars}
          aria-describedby="voice-text-hint voice-text-count"
          className="min-h-0 flex-1 field-sizing-fixed bg-transparent px-0 text-base leading-relaxed focus-visible:ring-0"
        />
        {chunkCount > 1 ? (
          <p className="m-0 text-xs text-muted-foreground">
            Wird in {chunkCount} Abschnitten erzeugt (je höchstens{' '}
            {formatCount(SPEECH_MAX_CHUNK_CHARS)} Zeichen).
          </p>
        ) : null}
      </div>
    </div>
  );
}
