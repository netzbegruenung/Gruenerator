import { FaTrash, FaCopy } from 'react-icons/fa';

import { COLOR_SCHEMES } from '../../utils/dreizeilenLayout';
import {
  ACTION_BTN,
  ACTION_BTN_DANGER,
  SECTION_HEADER,
  SECTION_TITLE,
  SIDEBAR_SECTION,
} from '../primitives';

import type { BalkenInstance, BalkenMode } from '../../primitives';

import { cn } from '../../utils/cn';
// form-inputs.css is expected to be provided by the consuming app

export interface BalkenSectionProps {
  onAddBalken: (mode: BalkenMode) => void;
  selectedBalken: BalkenInstance | null;
  onUpdateBalken: (id: string, partial: Partial<BalkenInstance>) => void;
  onRemoveBalken: (id: string) => void;
  onDuplicateBalken?: (id: string) => void;
}

export function BalkenSection({
  onAddBalken,
  selectedBalken,
  onUpdateBalken,
  onRemoveBalken,
  onDuplicateBalken,
}: BalkenSectionProps) {
  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-[1rem]')}>
      {/* Add buttons */}
      <div className="flex gap-[0.75rem]">
        <button
          type="button"
          className="flex flex-1 flex-col items-center gap-[0.5rem] rounded-lg border border-transparent bg-transparent p-[0.75rem] text-sm text-[var(--font-color)] transition-[background,border-color] duration-150 ease-in-out hover:border-[var(--border-default,rgba(0,0,0,0.12))] hover:bg-[var(--hover-color-alt,#f0f0f0)] relative cursor-pointer"
          onClick={() => onAddBalken('single')}
          title="Neuen einzelnen Balken hinzufügen"
        >
          <div className="flex flex-col gap-[3px] w-[48px] h-[32px] justify-center items-start">
            <div className="h-[6px] bg-primary-600 rounded-[1px] -skew-x-[15deg] w-[40px]" />
          </div>
          <span>1 Balken +</span>
        </button>
        <button
          type="button"
          className="flex flex-1 flex-col items-center gap-[0.5rem] rounded-lg border border-transparent bg-transparent p-[0.75rem] text-sm text-[var(--font-color)] transition-[background,border-color] duration-150 ease-in-out hover:border-[var(--border-default,rgba(0,0,0,0.12))] hover:bg-[var(--hover-color-alt,#f0f0f0)] relative cursor-pointer"
          onClick={() => onAddBalken('triple')}
          title="Neue 3er-Balkengruppe hinzufügen"
        >
          <div className="flex flex-col gap-[3px] w-[48px] h-[32px] justify-center items-start">
            <div className="h-[6px] bg-primary-600 rounded-[1px] -skew-x-[15deg] w-[40px]" />
            <div className="h-[6px] bg-primary-600 rounded-[1px] -skew-x-[15deg] w-[32px]" />
            <div className="h-[6px] bg-primary-600 rounded-[1px] -skew-x-[15deg] w-[24px]" />
          </div>
          <span>3 Balken +</span>
        </button>
      </div>

      {/* Settings shown only when a balken is selected */}
      {selectedBalken && (
        <div className="flex flex-col gap-[0.75rem]">
          <div className={cn(SECTION_HEADER, 'max-md:hidden')}>
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
            <button
              className={ACTION_BTN_DANGER}
              onClick={() => onRemoveBalken(selectedBalken.id)}
              title="Balken entfernen"
            >
              <FaTrash size={12} />
            </button>
          </div>

          {/* Color scheme row */}
          <div className="flex gap-[0.5rem] flex-wrap">
            {COLOR_SCHEMES.map((scheme) => (
              <button
                key={scheme.id}
                type="button"
                className={cn(
                  'w-[32px] h-[32px] p-[4px] bg-background-pure border-2 border-transparent rounded-md cursor-pointer transition-all duration-150 ease-in-out hover:border-primary-300',
                  selectedBalken.colorSchemeId === scheme.id && 'border-primary-500'
                )}
                onClick={() => onUpdateBalken(selectedBalken.id, { colorSchemeId: scheme.id })}
                title={scheme.label}
              >
                <div className="flex flex-col gap-[2px] h-full justify-center">
                  {scheme.colors.slice(0, 3).map((color, i) => (
                    <div
                      key={i}
                      className="h-[5px] rounded-[1px] -skew-x-[15deg]"
                      style={{ backgroundColor: color.background }}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* Width slider */}
          <div className="flex items-center gap-[0.5rem]">
            <span className="text-[0.8125rem] text-grey-600 min-w-[40px] max-md:hidden">
              Breite
            </span>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={selectedBalken.widthScale}
              onChange={(e) =>
                onUpdateBalken(selectedBalken.id, { widthScale: parseFloat(e.target.value) })
              }
              className="flex-1 h-[4px] appearance-none bg-grey-200 dark:bg-grey-700 rounded-[2px] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:bg-primary-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:bg-primary-600 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer"
            />
            <span className="text-[0.8125rem] text-grey-600 min-w-[36px] text-right">
              {Math.round(selectedBalken.widthScale * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
