import { type SpeechPreset, type TtsVoiceId } from '@gruenerator/contracts';
import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';

import { SPEED_OPTIONS, VOICE_PRESETS, VOICE_PRESET_ORDER } from '../presets';

import VoicePicker from './VoicePicker';

import type { ReactNode } from 'react';

export interface VoiceSettingsProps {
  preset: SpeechPreset;
  onPresetChange: (next: SpeechPreset) => void;
  voiceId: TtsVoiceId;
  onVoiceChange: (next: TtsVoiceId) => void;
  speed: number;
  onSpeedChange: (next: number) => void;
  /**
   * `inline` opens inside the editor card on wide screens: presets as one
   * segmented row with the active description below. `sheet` is the phone's
   * bottom sheet: presets as stacked cards with their descriptions, thumb-sized.
   */
  variant: 'inline' | 'sheet';
}

/** Same lead-in for each block, so the settings read as one list of decisions. */
function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-xs">
      <span id={id} className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

const SEGMENTED = 'w-full gap-1 rounded-lg bg-grey-100 p-1 dark:bg-grey-800';
const SEGMENT =
  'h-auto min-h-8 shrink grow basis-0 whitespace-normal rounded-md py-1 hover:bg-transparent hover:text-foreground data-[state=on]:bg-background-pure data-[state=on]:font-medium data-[state=on]:text-foreground data-[state=on]:shadow-sm';
const CARD =
  'h-auto min-h-14 w-full flex-col items-start gap-xxs whitespace-normal rounded-lg border border-grey-200 px-sm py-sm text-left hover:bg-hover-alt hover:text-foreground dark:border-grey-700 data-[state=on]:border-primary-500 data-[state=on]:bg-primary-500/5 data-[state=on]:text-foreground dark:data-[state=on]:border-primary-400 dark:data-[state=on]:bg-primary-400/10';

/** What the recording is for, who reads it and how fast — nothing about the words. */
export default function VoiceSettings({
  preset,
  onPresetChange,
  voiceId,
  onVoiceChange,
  speed,
  onSpeedChange,
  variant,
}: VoiceSettingsProps) {
  const sheet = variant === 'sheet';

  return (
    <div className={sheet ? 'flex flex-col gap-lg' : 'grid gap-md sm:grid-cols-2'}>
      <div className="sm:col-span-full">
        <Group id={`voice-preset-label-${variant}`} label="Art der Aufnahme">
          <ToggleGroup
            type="single"
            value={preset}
            onValueChange={(value) => {
              if (value) onPresetChange(value as SpeechPreset);
            }}
            aria-labelledby={`voice-preset-label-${variant}`}
            spacing={sheet ? 2 : 1}
            className={sheet ? 'w-full flex-col items-stretch gap-xs' : SEGMENTED}
          >
            {VOICE_PRESET_ORDER.map((id) => (
              <ToggleGroupItem key={id} value={id} className={sheet ? CARD : SEGMENT}>
                <span className={sheet ? 'text-base font-medium' : undefined}>
                  {VOICE_PRESETS[id].title}
                </span>
                {sheet ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {VOICE_PRESETS[id].description}
                  </span>
                ) : null}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {sheet ? null : (
            <p className="m-0 text-xs text-muted-foreground">{VOICE_PRESETS[preset].description}</p>
          )}
        </Group>
      </div>

      <Group id={`voice-voice-label-${variant}`} label="Stimme">
        <VoicePicker value={voiceId} onChange={onVoiceChange} />
      </Group>

      <Group id={`voice-speed-label-${variant}`} label="Tempo">
        <ToggleGroup
          type="single"
          value={String(speed)}
          onValueChange={(value) => {
            if (value) onSpeedChange(Number(value));
          }}
          aria-labelledby={`voice-speed-label-${variant}`}
          spacing={1}
          className={SEGMENTED}
        >
          {SPEED_OPTIONS.map((option) => (
            <ToggleGroupItem
              key={option.value}
              value={String(option.value)}
              className={sheet ? `${SEGMENT} min-h-10` : SEGMENT}
            >
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Group>
    </div>
  );
}
