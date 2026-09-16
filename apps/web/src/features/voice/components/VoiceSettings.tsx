import {
  type SpeechOutputFormat,
  type SpeechPreset,
  type TtsVoiceId,
} from '@gruenerator/contracts';
import { Checkbox, Label, ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';


import { FORMAT_LABELS, SPEED_OPTIONS, VOICE_PRESETS, VOICE_PRESET_ORDER } from '../presets';

import VoicePicker from './VoicePicker';

import type { ReactNode } from 'react';

const FORMAT_ORDER: readonly SpeechOutputFormat[] = ['mp3', 'wav_phone'];

export interface VoiceSettingsProps {
  preset: SpeechPreset;
  onPresetChange: (next: SpeechPreset) => void;
  voiceId: TtsVoiceId;
  onVoiceChange: (next: TtsVoiceId) => void;
  speed: number;
  onSpeedChange: (next: number) => void;
  formats: readonly SpeechOutputFormat[];
  onFormatsChange: (next: readonly SpeechOutputFormat[]) => void;
  /** The submit button and its duration estimate — the rail's last block. */
  footer: ReactNode;
}

/** Same lead-in for each block, so the rail reads as one list of decisions. */
function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-sm">
      <span
        id={id}
        className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </span>
      {children}
    </div>
  );
}

/**
 * Everything about the recording rather than the words: what it is for, who
 * reads it, how fast, and what comes out.
 *
 * A rail beside the editor on wide screens, a stack below it on narrow ones —
 * which also puts the submit button last in the reading order on a phone.
 */
export default function VoiceSettings({
  preset,
  onPresetChange,
  voiceId,
  onVoiceChange,
  speed,
  onSpeedChange,
  formats,
  onFormatsChange,
  footer,
}: VoiceSettingsProps) {
  const toggleFormat = (format: SpeechOutputFormat, checked: boolean) => {
    onFormatsChange(FORMAT_ORDER.filter((f) => (f === format ? checked : formats.includes(f))));
  };

  return (
    <div className="flex flex-col gap-lg">
      <Group id="voice-preset-label" label="Art der Aufnahme">
        <ToggleGroup
          type="single"
          value={preset}
          onValueChange={(value) => {
            if (value) onPresetChange(value as SpeechPreset);
          }}
          aria-labelledby="voice-preset-label"
          spacing={2}
          className="w-full flex-col items-stretch gap-xs"
        >
          {VOICE_PRESET_ORDER.map((id) => (
            <ToggleGroupItem
              key={id}
              value={id}
              className="h-auto w-full flex-col items-start gap-xxs whitespace-normal rounded-lg border border-grey-200 px-sm py-sm text-left hover:bg-hover-alt hover:text-foreground dark:border-grey-700 data-[state=on]:border-primary-500 data-[state=on]:bg-primary-500/5 data-[state=on]:text-foreground dark:data-[state=on]:border-primary-400 dark:data-[state=on]:bg-primary-400/10"
            >
              <span className="text-sm font-medium">{VOICE_PRESETS[id].title}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {VOICE_PRESETS[id].description}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>

      <Group id="voice-voice-label" label="Stimme">
        <VoicePicker value={voiceId} onChange={onVoiceChange} />
      </Group>

      <Group id="voice-speed-label" label="Tempo">
        <ToggleGroup
          type="single"
          value={String(speed)}
          onValueChange={(value) => {
            if (value) onSpeedChange(Number(value));
          }}
          aria-labelledby="voice-speed-label"
          spacing={1}
          className="w-full gap-1 rounded-lg bg-grey-100 p-1 dark:bg-grey-800"
        >
          {SPEED_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={String(option.value)}
              className="shrink grow basis-0 rounded-md hover:bg-transparent hover:text-foreground data-[state=on]:bg-background-pure data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>

      <fieldset className="m-0 flex flex-col gap-sm border-0 p-0">
        <legend className="mb-sm text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ausgabeformat
        </legend>
        {FORMAT_ORDER.map((format) => {
          const id = `voice-format-${format}`;
          return (
            <div
              key={format}
              className="flex items-start gap-sm rounded-lg border border-grey-200 px-sm py-sm dark:border-grey-700"
            >
              <Checkbox
                id={id}
                checked={formats.includes(format)}
                onCheckedChange={(checked) => toggleFormat(format, checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor={id} className="flex flex-col gap-xxs font-normal">
                <span className="text-sm font-medium">{FORMAT_LABELS[format].label}</span>
                <span className="text-xs text-muted-foreground">{FORMAT_LABELS[format].hint}</span>
              </Label>
            </div>
          );
        })}
        {formats.length === 0 ? (
          <p className="m-0 text-sm text-destructive" role="alert">
            Mindestens ein Format auswählen.
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-sm border-t border-grey-200 pt-md dark:border-grey-700">
        {footer}
      </div>
    </div>
  );
}
