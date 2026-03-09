import { FaCheck, FaChevronLeft, FaChevronRight, FaTrash, FaCopy } from 'react-icons/fa';
import { HiColorSwatch, HiAdjustments, HiArrowsExpand } from 'react-icons/hi';

import { SidebarSlider } from '../components/SidebarSlider';
import { ACTION_BTN, ACTION_BTN_DANGER, SECTION_HEADER, SECTION_TITLE } from '../primitives';
import { SubsectionTabBar, type Subsection } from '../SubsectionTabBar';

import type { BalkenInstance } from '../../primitives/BalkenGroup';
import type { ColorScheme } from '../../utils/dreizeilenLayout';

import { cn } from '@/utils/cn';

export interface BalkenSettingsSectionProps {
  selectedBalken: BalkenInstance;
  onUpdateBalken: (id: string, partial: Partial<BalkenInstance>) => void;
  onRemoveBalken: (id: string) => void;
  onDuplicateBalken?: (id: string) => void;
  colorSchemes: ColorScheme[];
  isPrimary: boolean;
}

export function BalkenSettingsSection({
  selectedBalken,
  onUpdateBalken,
  onRemoveBalken,
  onDuplicateBalken,
  colorSchemes,
  isPrimary,
}: BalkenSettingsSectionProps) {
  const STEP = 5;
  const activeSchemeId = selectedBalken.colorSchemeId;
  const colorScheme = colorSchemes.find((s) => s.id === activeSchemeId) ?? colorSchemes[0];
  const barOffsets = selectedBalken.barOffsets ?? [0, 0, 0];

  const handleNudgeLeft = (index: number) => {
    const newOffsets = [...barOffsets] as [number, number, number];
    newOffsets[index] = barOffsets[index] - STEP;
    onUpdateBalken(selectedBalken.id, { barOffsets: newOffsets });
  };

  const handleNudgeRight = (index: number) => {
    const newOffsets = [...barOffsets] as [number, number, number];
    newOffsets[index] = barOffsets[index] + STEP;
    onUpdateBalken(selectedBalken.id, { barOffsets: newOffsets });
  };

  const colorContent = (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-semibold text-foreground-muted uppercase tracking-[0.8px] max-md:hidden">
        Farbschema
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2">
        {colorSchemes.map((scheme) => {
          const isActive = activeSchemeId === scheme.id;
          return (
            <button
              key={scheme.id}
              className={cn(
                'relative p-2 bg-transparent border border-transparent rounded-lg cursor-pointer transition-all duration-200 hover:bg-hover-alt',
                isActive && 'border-primary-500 bg-background-alt'
              )}
              onClick={() => onUpdateBalken(selectedBalken.id, { colorSchemeId: scheme.id })}
              type="button"
              title={scheme.label}
            >
              <div className="flex flex-col gap-[3px]">
                {scheme.colors.map((color, i) => (
                  <span
                    key={i}
                    className="h-2 rounded-sm -skew-x-[12deg]"
                    style={{
                      backgroundColor: color.background,
                      marginLeft: i === 0 ? 0 : i === 1 ? 4 : 8,
                      marginRight: i === 0 ? 8 : i === 1 ? 4 : 0,
                    }}
                  />
                ))}
              </div>
              {isActive && (
                <span className="absolute top-1 right-1 size-4 bg-primary-500 text-white rounded-full flex items-center justify-center">
                  <FaCheck size={8} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  const widthContent = (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-semibold text-foreground-muted uppercase tracking-[0.8px] max-md:hidden">
        Balkenbreite
      </div>
      <SidebarSlider
        value={selectedBalken.widthScale}
        onValueChange={(val) => onUpdateBalken(selectedBalken.id, { widthScale: val })}
        min={isPrimary ? 0.9 : 0.5}
        max={isPrimary ? 1.1 : 2.0}
        step={isPrimary ? 0.01 : 0.1}
        showValue={false}
      />
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-grey-500">Schmal</span>
        <span className="text-[10px] text-grey-500">Breit</span>
      </div>
    </div>
  );

  const finetuneContent = (
    <div className="flex flex-col gap-3">
      <div className="text-[11px] font-semibold text-foreground-muted uppercase tracking-[0.8px] max-md:hidden">
        Feinabstimmung
      </div>
      <div className="flex flex-col gap-2 p-3 bg-background-alt border border-grey-200 dark:border-grey-700 rounded-lg">
        {[0, 1, 2].map((index) => {
          const colorPair = colorScheme.colors[index];
          return (
            <div key={index} className="flex items-center justify-center gap-3">
              <button
                type="button"
                className="size-7 flex items-center justify-center bg-grey-100 dark:bg-grey-800 border border-grey-300 dark:border-grey-600 rounded-md text-grey-600 dark:text-grey-300 cursor-pointer transition-all duration-150 hover:bg-primary-50 hover:border-primary-400 hover:text-primary-600 active:scale-95"
                onClick={() => handleNudgeLeft(index)}
                aria-label="Nach links verschieben"
              >
                <FaChevronLeft size={10} />
              </button>
              <div
                className="w-20 h-5 rounded-[3px] shadow-[0_1px_3px_rgba(0,0,0,0.15)] transition-[transform,box-shadow] duration-150"
                style={{
                  backgroundColor: colorPair.background,
                  transform: `translateX(${barOffsets[index] / 10}px) skewX(-12deg)`,
                }}
              />
              <button
                type="button"
                className="size-7 flex items-center justify-center bg-grey-100 dark:bg-grey-800 border border-grey-300 dark:border-grey-600 rounded-md text-grey-600 dark:text-grey-300 cursor-pointer transition-all duration-150 hover:bg-primary-50 hover:border-primary-400 hover:text-primary-600 active:scale-95"
                onClick={() => handleNudgeRight(index)}
                aria-label="Nach rechts verschieben"
              >
                <FaChevronRight size={10} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const subsections: Subsection[] = [
    { id: 'colors', icon: HiColorSwatch, label: 'Farbschema', content: colorContent },
    { id: 'width', icon: HiArrowsExpand, label: 'Balkenbreite', content: widthContent },
  ];

  if (selectedBalken.mode === 'triple') {
    subsections.push({
      id: 'finetune',
      icon: HiAdjustments,
      label: 'Feinabstimmung',
      content: finetuneContent,
    });
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className={SECTION_HEADER}>
        <span className={SECTION_TITLE}>Ausgewählter Balken</span>
        {onDuplicateBalken && (
          <button
            className={ACTION_BTN}
            onClick={() => onDuplicateBalken(selectedBalken.id)}
            title="Balken duplizieren"
          >
            <FaCopy size={12} />
          </button>
        )}
        {!isPrimary && (
          <button
            className={ACTION_BTN_DANGER}
            onClick={() => onRemoveBalken(selectedBalken.id)}
            title="Balken entfernen"
          >
            <FaTrash size={12} />
          </button>
        )}
      </div>
      <SubsectionTabBar subsections={subsections} defaultSubsection="colors" />
    </div>
  );
}
