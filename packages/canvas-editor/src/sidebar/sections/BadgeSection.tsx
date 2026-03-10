import {
  PillBadgePreviewIcon,
  StorerPreviewIcon,
  SingleBalkenPreviewIcon,
  TripleBalkenPreviewIcon,
} from './BadgePreviewIcons';

import type { BalkenMode } from '../../primitives';

export interface BadgeSectionProps {
  onAddPillBadge?: (preset?: string) => void;
  onAddCircleBadge?: (preset?: string) => void;
  onAddBalken?: (mode: BalkenMode) => void;
}

export function BadgeSection({ onAddPillBadge, onAddCircleBadge, onAddBalken }: BadgeSectionProps) {
  return (
    <div className="flex flex-col gap-md max-canvas-mobile:!p-0 max-canvas-mobile:!m-0">
      <div className="grid grid-cols-2 gap-[8px]">
        {onAddPillBadge && (
          <button
            type="button"
            className="flex flex-col items-center gap-[6px] px-[6px] pt-[10px] pb-[8px] border border-transparent rounded-lg bg-transparent cursor-pointer transition-[border-color,background-color] duration-150 text-[11px] text-foreground hover:border-primary-400 hover:bg-hover-alt"
            onClick={() => onAddPillBadge()}
            title="Pill-Badge hinzufügen"
          >
            <div className="flex items-center justify-center min-h-[36px]">
              <PillBadgePreviewIcon size={48} />
            </div>
            <span>Pill-Badge</span>
          </button>
        )}
        {onAddCircleBadge && (
          <button
            type="button"
            className="flex flex-col items-center gap-[6px] px-[6px] pt-[10px] pb-[8px] border border-transparent rounded-lg bg-transparent cursor-pointer transition-[border-color,background-color] duration-150 text-[11px] text-foreground hover:border-primary-400 hover:bg-hover-alt"
            onClick={() => onAddCircleBadge()}
            title="Störer hinzufügen"
          >
            <div className="flex items-center justify-center min-h-[36px]">
              <StorerPreviewIcon size={48} />
            </div>
            <span>Störer</span>
          </button>
        )}
        {onAddBalken && (
          <>
            <button
              type="button"
              className="flex flex-col items-center gap-[6px] px-[6px] pt-[10px] pb-[8px] border border-transparent rounded-lg bg-transparent cursor-pointer transition-[border-color,background-color] duration-150 text-[11px] text-foreground hover:border-primary-400 hover:bg-hover-alt"
              onClick={() => onAddBalken('single')}
              title="Einzelnen Balken hinzufügen"
            >
              <div className="flex items-center justify-center min-h-[36px]">
                <SingleBalkenPreviewIcon size={48} />
              </div>
              <span>1 Balken</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-[6px] px-[6px] pt-[10px] pb-[8px] border border-transparent rounded-lg bg-transparent cursor-pointer transition-[border-color,background-color] duration-150 text-[11px] text-foreground hover:border-primary-400 hover:bg-hover-alt"
              onClick={() => onAddBalken('triple')}
              title="Dreifach-Balken hinzufügen"
            >
              <div className="flex items-center justify-center min-h-[36px]">
                <TripleBalkenPreviewIcon size={48} />
              </div>
              <span>3 Balken</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
