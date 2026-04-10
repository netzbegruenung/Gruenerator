import { useCallback, useState } from 'react';

import type { SubtitleStyle } from './SubtitleSettings';

import { cn } from '@/utils/cn';

interface StylePreset {
  id: string;
  name: string;
  previewStyle: React.CSSProperties;
  overrides: Partial<SubtitleStyle>;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'shadow',
    name: 'Schatten',
    previewStyle: {
      color: '#fff',
      textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6)',
    },
    overrides: {
      backgroundOpacity: 0,
      borderWidth: 0,
      shadowBlur: 3,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
      shadowColor: '#000000',
      fontWeight: 'bold',
      fontStyle: 'normal',
      letterSpacing: 0,
    },
  },
  {
    id: 'classic',
    name: 'Klassisch',
    previewStyle: {
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: '2px 6px',
      borderRadius: '3px',
    },
    overrides: {
      backgroundColor: '#000000',
      backgroundOpacity: 0.7,
      backgroundRadius: 4,
      backgroundPadding: 8,
      borderWidth: 0,
      shadowBlur: 0,
      fontWeight: 'bold',
      fontStyle: 'normal',
      letterSpacing: 0,
    },
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    previewStyle: {
      color: '#fff',
      fontWeight: 900,
      textTransform: 'uppercase' as const,
      textShadow: '0 2px 4px rgba(0,0,0,0.5)',
      letterSpacing: '0.02em',
    },
    overrides: {
      backgroundOpacity: 0,
      borderWidth: 2,
      borderColor: '#000000',
      shadowBlur: 4,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      shadowColor: '#000000',
      fontWeight: 'bold',
      fontStyle: 'normal',
      letterSpacing: 0,
      fontSize: 28,
    },
  },
  {
    id: 'cinematic',
    name: 'Kino',
    previewStyle: {
      color: '#e8e8e8',
      fontStyle: 'italic',
      letterSpacing: '0.1em',
      textShadow: '0 2px 12px rgba(0,0,0,0.8), 0 0 30px rgba(0,0,0,0.5)',
    },
    overrides: {
      backgroundOpacity: 0,
      borderWidth: 0,
      shadowBlur: 12,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
      shadowColor: '#000000',
      fontWeight: 'normal',
      fontStyle: 'italic',
      letterSpacing: 2,
      color: '#E8E8E8',
    },
  },
  {
    id: 'outline',
    name: 'Kontur',
    previewStyle: {
      color: '#fff',
      WebkitTextStroke: '1px black',
      paintOrder: 'stroke fill',
      textShadow: '0 1px 3px rgba(0,0,0,0.3)',
    },
    overrides: {
      backgroundOpacity: 0,
      borderWidth: 3,
      borderColor: '#000000',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fontWeight: 'bold',
      fontStyle: 'normal',
      letterSpacing: 0,
      color: '#FFFFFF',
    },
  },
  {
    id: 'tanne',
    name: 'Grün',
    previewStyle: {
      color: '#fff',
      backgroundColor: '#005538',
      padding: '2px 6px',
      borderRadius: '3px',
    },
    overrides: {
      backgroundColor: '#005538',
      backgroundOpacity: 1,
      backgroundRadius: 4,
      backgroundPadding: 8,
      borderWidth: 0,
      shadowBlur: 0,
      fontWeight: 'bold',
      fontStyle: 'normal',
      letterSpacing: 0,
      color: '#FFFFFF',
    },
  },
];

interface StylePresetPickerProps {
  currentStyle: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
}

export function StylePresetPicker({ currentStyle, onStyleChange }: StylePresetPickerProps) {
  const [activePresetId, setActivePresetId] = useState<string>('shadow');

  const handleSelectPreset = useCallback(
    (preset: StylePreset) => {
      setActivePresetId(preset.id);
      onStyleChange({ ...currentStyle, ...preset.overrides });
    },
    [currentStyle, onStyleChange]
  );

  return (
    <div className="flex items-center gap-xs overflow-x-auto py-xs">
      {STYLE_PRESETS.map((preset) => {
        const isActive = activePresetId === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => handleSelectPreset(preset)}
            className={cn(
              'group flex flex-shrink-0 flex-col items-center gap-xs rounded-lg px-sm py-xs transition-all',
              isActive
                ? 'bg-primary-50 ring-2 ring-primary-500 dark:bg-primary-900/20'
                : 'hover:bg-grey-100 dark:hover:bg-grey-800'
            )}
          >
            {/* Mini preview */}
            <div className="flex h-8 w-16 items-center justify-center overflow-hidden rounded bg-grey-900">
              <span className="text-[10px] font-bold leading-none" style={preset.previewStyle}>
                Text
              </span>
            </div>
            {/* Label */}
            <span
              className={cn(
                'text-[10px] leading-none',
                isActive ? 'font-medium text-primary-600 dark:text-primary-400' : 'text-grey-500'
              )}
            >
              {preset.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
