import { DEFAULT_TTS_VOICE_ID, type TtsVoiceId } from '@gruenerator/contracts';
import {
  TTS_VOICES,
  TTS_VOICE_AGE_LABEL,
  ttsVoiceLabel,
  ttsVoiceSampleUrl,
} from '@gruenerator/shared/settings';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gruenerator/ui';
import { Volume2 } from 'lucide-react';
import { useRef } from 'react';

interface VoicePickerProps {
  value: TtsVoiceId;
  onChange: (voiceId: TtsVoiceId) => void;
}

/**
 * The same picker as in the settings, minus the profile write: choosing a
 * voice here is for this recording only.
 */
export default function VoicePicker({ value, onChange }: VoicePickerProps) {
  const sampleRef = useRef<HTMLAudioElement>(null);
  const playSample = () => {
    const audio = sampleRef.current;
    if (!audio) return;
    audio.src = ttsVoiceSampleUrl(value);
    void audio.play().catch(() => undefined);
  };

  return (
    <div className="flex items-center gap-xs">
      <Select value={value} onValueChange={(next) => onChange(next as TtsVoiceId)}>
        <SelectTrigger className="min-w-0 flex-1" aria-label="Stimme">
          <SelectValue>{ttsVoiceLabel(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {TTS_VOICES.map((voice) => (
            <SelectItem key={voice.id} value={voice.id}>
              {ttsVoiceLabel(voice.id)}
              <span className="text-muted-foreground"> · {TTS_VOICE_AGE_LABEL[voice.age]}</span>
              {voice.id === DEFAULT_TTS_VOICE_ID ? (
                <span className="text-muted-foreground"> · Standard</span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        onClick={playSample}
        aria-label="Hörprobe abspielen"
        title="Hörprobe abspielen"
        className="size-10 shrink-0"
      >
        <Volume2 aria-hidden="true" />
      </Button>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- one spoken sentence; its text is fixed and known */}
      <audio ref={sampleRef} preload="none" />
    </div>
  );
}
