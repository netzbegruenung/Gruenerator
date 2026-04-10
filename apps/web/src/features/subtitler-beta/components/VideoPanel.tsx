import { BetaVideoPlayer } from './BetaVideoPlayer';
import { StylePresetPicker } from './StylePresetPicker';

import type { BetaVideoPlayerRef } from './BetaVideoPlayer';
import type { SubtitleStyle } from './SubtitleSettings';
import type { RefObject } from 'react';

interface VideoPanelProps {
  videoUrl: string | null;
  videoPlayerRef: RefObject<BetaVideoPlayerRef | null>;
  subtitleStyle: SubtitleStyle;
  onSubtitleStyleChange: (style: SubtitleStyle) => void;
  onTimeUpdate: (time: number) => void;
  onExport: () => void;
  isExporting: boolean;
}

export function VideoPanel({
  videoUrl,
  videoPlayerRef,
  subtitleStyle,
  onSubtitleStyleChange,
  onTimeUpdate,
  onExport,
  isExporting,
}: VideoPanelProps) {
  return (
    <div className="flex min-h-0 flex-[3] flex-col overflow-hidden">
      {/* Video Player */}
      <div className="min-h-0 flex-1 bg-grey-950">
        {videoUrl && (
          <BetaVideoPlayer
            ref={videoPlayerRef}
            videoUrl={videoUrl}
            className="h-full w-full"
            onTimeUpdate={onTimeUpdate}
            subtitleStyle={subtitleStyle}
            onSubtitleStyleChange={onSubtitleStyleChange}
            onExport={onExport}
            isExporting={isExporting}
          />
        )}
      </div>

      {/* Style Presets — below the video */}
      <div className="border-t border-grey-200 bg-background px-md py-sm dark:border-grey-700">
        <StylePresetPicker currentStyle={subtitleStyle} onStyleChange={onSubtitleStyleChange} />
      </div>
    </div>
  );
}
