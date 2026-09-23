import { SPEECH_MAX_CHUNK_CHARS } from '@gruenerator/contracts';
import { Button, Label, Textarea } from '@gruenerator/ui';
import { Pause } from 'lucide-react';

import { formatCount } from '../../../utils/usageFormat';
import { clampToWire, countPauses, wireLength } from '../presets';

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
  /** The settings toggle in the toolbar — absent on phones, where it is a row below. */
  settingsToggle?: ReactNode;
  /** The opened settings, folded out under the toolbar inside the same card. */
  settingsPanel?: ReactNode;
}

/**
 * The page's centre of gravity: the text first, its tools underneath, and the
 * recording settings folded into the same card rather than beside it.
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
  settingsToggle,
  settingsPanel,
}: VoiceEditorProps) {
  // Every count here is the wire length: that is what the server measures and
  // what the person is actually spending.
  const sentLength = wireLength(text);
  const pauses = countPauses(text);
  const chunkCount = Math.max(1, Math.ceil(sentLength / SPEECH_MAX_CHUNK_CHARS));

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-grey-200 bg-background-pure shadow-sm focus-within:ring-[3px] focus-within:ring-ring/50 dark:border-grey-700">
      <div className="flex flex-col gap-xs p-md">
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
          onChange={(e) => onChange(clampToWire(e.target.value, def.maxChars))}
          placeholder={def.placeholder}
          aria-describedby="voice-text-hint voice-text-count voice-text-chunks"
          className="min-h-[clamp(12rem,40vh,18rem)] resize-y field-sizing-fixed bg-transparent px-0! text-base placeholder:text-muted-foreground leading-relaxed focus-visible:ring-0"
        />
        {/* Always mounted: a live region inserted at the same moment as its text
            is not reliably announced. Empty until the text actually splits. */}
        <p
          id="voice-text-chunks"
          aria-live="polite"
          className="m-0 text-xs text-muted-foreground empty:hidden"
        >
          {chunkCount > 1
            ? `Wird in ${chunkCount} Abschnitten erzeugt (je höchstens ${formatCount(SPEECH_MAX_CHUNK_CHARS)} Zeichen).`
            : ''}
        </p>
      </div>

      <div className="flex items-center gap-xs border-t border-grey-200 px-sm py-xs dark:border-grey-700">
        {assistant}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onInsertPause}
          disabled={!pauseFits}
        >
          <Pause aria-hidden="true" />
          <span className="max-sm:sr-only">Pause einfügen</span>
        </Button>
        {settingsToggle ? (
          <>
            <span aria-hidden="true" className="mx-xxs h-5 w-px bg-grey-200 dark:bg-grey-700" />
            {settingsToggle}
          </>
        ) : null}
        <p
          id="voice-text-count"
          aria-live="polite"
          className="m-0 ml-auto shrink-0 whitespace-nowrap pr-xs text-xs tabular-nums text-muted-foreground"
        >
          {formatCount(sentLength)} / {formatCount(def.maxChars)}
          <span className="max-sm:sr-only"> Zeichen</span>
          {pauses > 0 ? ` · ${pauses} ${pauses === 1 ? 'Pause' : 'Pausen'}` : ''}
        </p>
      </div>

      {settingsPanel ? (
        <div className="border-t border-grey-200 bg-background-alt p-md dark:border-grey-700">
          {settingsPanel}
        </div>
      ) : null}
    </div>
  );
}
