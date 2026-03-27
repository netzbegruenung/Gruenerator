import { Button, Label, Slider } from '@gruenerator/ui';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useCallback } from 'react';

import { cn } from '@/utils/cn';

export interface SubtitleStyle {
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';

  color: string;
  backgroundColor: string;
  borderColor: string;
  shadowColor: string;

  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;

  borderWidth: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;

  backgroundOpacity: number;
  backgroundRadius: number;
  backgroundPadding: number;

  bottomOffset: number;

  visible: boolean;
}

export const defaultSubtitleStyle: SubtitleStyle = {
  fontSize: 24,
  fontFamily: "'GrueneType', Arial, sans-serif",
  fontWeight: 'bold',
  fontStyle: 'normal',

  color: '#FFFFFF',
  backgroundColor: '#000000',
  borderColor: '#000000',
  shadowColor: '#000000',

  textAlign: 'center',
  lineHeight: 1.2,
  letterSpacing: 0,

  borderWidth: 1,
  shadowOffsetX: 1,
  shadowOffsetY: 1,
  shadowBlur: 2,

  backgroundOpacity: 0.8,
  backgroundRadius: 4,
  backgroundPadding: 8,

  bottomOffset: 60,

  visible: true,
};

interface StylePreset {
  id: string;
  name: string;
  isRecommended?: boolean;
  preview: React.CSSProperties;
  overrides: Partial<SubtitleStyle>;
}

const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'shadow',
    name: 'Schatten',
    isRecommended: true,
    preview: {
      backgroundColor: 'transparent',
      color: '#fff',
      textShadow: '0 2px 8px rgba(0,0,0,0.8), 0 0 4px rgba(0,0,0,0.6)',
    },
    overrides: {
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
      borderWidth: 0,
      shadowBlur: 3,
      shadowOffsetX: 1,
      shadowOffsetY: 2,
    },
  },
  {
    id: 'standard',
    name: 'Klassisch',
    preview: {
      backgroundColor: 'rgba(0,0,0,0.8)',
      color: '#fff',
      textShadow: 'none',
      padding: '0.2em 0.4em',
      borderRadius: '0.15em',
    },
    overrides: {
      backgroundColor: '#000000',
      backgroundOpacity: 0.8,
      borderWidth: 1,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
  },
  {
    id: 'clean',
    name: 'Minimal',
    preview: {
      backgroundColor: 'transparent',
      color: '#fff',
      textShadow: 'none',
    },
    overrides: {
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
      borderWidth: 0,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
  },
  {
    id: 'tanne',
    name: 'Grün',
    preview: {
      backgroundColor: '#005538',
      color: '#fff',
      textShadow: 'none',
      padding: '0.2em 0.4em',
      borderRadius: '0.15em',
    },
    overrides: {
      backgroundColor: '#005538',
      backgroundOpacity: 1,
      borderWidth: 0,
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    },
  },
];

interface SubtitleSettingsProps {
  style: SubtitleStyle;
  onStyleChange: (style: SubtitleStyle) => void;
  className?: string;
}

export function SubtitleSettings({ style, onStyleChange, className }: SubtitleSettingsProps) {
  const updateStyle = useCallback(
    (updates: Partial<SubtitleStyle>) => {
      onStyleChange({ ...style, ...updates });
    },
    [style, onStyleChange]
  );

  const resetToDefault = useCallback(() => {
    onStyleChange(defaultSubtitleStyle);
  }, [onStyleChange]);

  const activePresetId = STYLE_PRESETS.find((p) => {
    const o = p.overrides;
    return (
      style.backgroundColor === o.backgroundColor &&
      style.backgroundOpacity === o.backgroundOpacity &&
      style.shadowBlur === o.shadowBlur
    );
  })?.id;

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-grey-200 px-md py-sm dark:border-grey-700">
        <span className="text-sm font-semibold text-foreground-heading">Einstellungen</span>
        <div className="flex items-center gap-1">
          <Button
            onClick={() => updateStyle({ visible: !style.visible })}
            variant={style.visible ? 'default' : 'outline'}
            size="icon"
            className="h-7 w-7"
            title={style.visible ? 'Untertitel ausblenden' : 'Untertitel einblenden'}
          >
            {style.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </Button>
          <Button
            onClick={resetToDefault}
            variant="outline"
            size="icon"
            className="h-7 w-7"
            title="Zurücksetzen"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Stil */}
      <div className="border-b border-grey-200 px-md py-md dark:border-grey-700">
        <Label className="mb-sm block text-xs font-medium text-grey-500">Stil</Label>
        <div className="flex flex-wrap gap-1">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cn(
                'rounded-md border border-grey-200 px-sm py-1 text-xs transition-all hover:border-primary-400 dark:border-grey-700',
                activePresetId === preset.id &&
                  'border-primary-500 bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/20 dark:text-primary-300'
              )}
              onClick={() => onStyleChange({ ...style, ...preset.overrides })}
            >
              {preset.isRecommended && <span className="mr-0.5 text-yellow-500">★</span>}
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Größe */}
      <div className="border-b border-grey-200 px-md py-md dark:border-grey-700">
        <Label className="mb-sm block text-xs font-medium text-grey-500">Schriftgröße</Label>
        <div className="flex items-center gap-sm">
          <span className="text-xs text-grey-400">A</span>
          <Slider
            value={[style.fontSize]}
            onValueChange={([value]) => updateStyle({ fontSize: value })}
            min={12}
            max={60}
            step={1}
            className="flex-1"
          />
          <span className="text-sm font-medium text-grey-400">A</span>
          <span className="w-8 text-right text-xs tabular-nums text-grey-500">
            {style.fontSize}
          </span>
        </div>
      </div>

      {/* Position */}
      <div className="px-md py-md">
        <Label className="mb-sm block text-xs font-medium text-grey-500">Position</Label>
        <div className="flex items-center gap-sm">
          <span className="text-[10px] text-grey-400">Tief</span>
          <Slider
            value={[style.bottomOffset]}
            onValueChange={([value]) => updateStyle({ bottomOffset: value })}
            min={20}
            max={200}
            step={5}
            className="flex-1"
          />
          <span className="text-[10px] text-grey-400">Hoch</span>
          <span className="w-8 text-right text-xs tabular-nums text-grey-500">
            {style.bottomOffset}
          </span>
        </div>
      </div>
    </div>
  );
}
