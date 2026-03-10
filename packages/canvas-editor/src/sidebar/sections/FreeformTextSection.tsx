/**
 * FreeformTextSection - Text management for the freeform canvas mode.
 *
 * Provides buttons to add header/body text elements and lists existing
 * additional texts with inline controls for editing and deletion.
 */

import { FaTrash } from 'react-icons/fa';
import { PiTextAa, PiTextHBold } from 'react-icons/pi';

import { SidebarHint } from '../components/SidebarHint';
import { SIDEBAR_SECTION } from '../primitives';

import type { AdditionalText } from '../../configs/types';

import { cn } from '../../utils/cn';

export interface FreeformTextSectionProps {
  additionalTexts: AdditionalText[];
  onAddHeader: () => void;
  onAddText: () => void;
  onUpdateText: (id: string, partial: Partial<AdditionalText>) => void;
  onRemoveText: (id: string) => void;
}

export function FreeformTextSection({
  additionalTexts,
  onAddHeader,
  onAddText,
  onUpdateText,
  onRemoveText,
}: FreeformTextSectionProps) {
  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-md p-md max-canvas-mobile:p-sm')}>
      {/* Add buttons */}
      <div className="flex gap-sm">
        <button
          type="button"
          onClick={onAddHeader}
          className="flex-1 flex items-center justify-center gap-xs py-sm px-md bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm font-semibold transition-colors duration-150 hover:bg-primary-700"
        >
          <PiTextHBold size={16} />
          Überschrift
        </button>
        <button
          type="button"
          onClick={onAddText}
          className="flex-1 flex items-center justify-center gap-xs py-sm px-md bg-[var(--card-background)] text-foreground border border-[var(--card-border)] rounded-lg cursor-pointer text-sm font-semibold transition-colors duration-150 hover:bg-background-alt"
        >
          <PiTextAa size={16} />
          Fließtext
        </button>
      </div>

      {/* Existing texts list */}
      {additionalTexts.length > 0 && (
        <div className="flex flex-col gap-xs">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
            Texte auf der Leinwand
          </span>
          {additionalTexts.map((text) => (
            <div
              key={text.id}
              className="flex items-center gap-sm p-sm bg-[var(--card-background)] border border-[var(--card-border)] rounded-lg"
            >
              <span className="text-xs text-foreground-muted shrink-0 w-5">
                {text.type === 'header' ? <PiTextHBold size={14} /> : <PiTextAa size={14} />}
              </span>
              <input
                type="text"
                value={text.text}
                onChange={(e) => onUpdateText(text.id, { text: e.target.value })}
                className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-foreground-muted"
                placeholder={text.type === 'header' ? 'Überschrift...' : 'Text...'}
              />
              <button
                type="button"
                onClick={() => onRemoveText(text.id)}
                className="shrink-0 size-7 flex items-center justify-center bg-transparent border-none rounded-md cursor-pointer text-foreground-muted transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
                aria-label="Text entfernen"
              >
                <FaTrash size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {additionalTexts.length === 0 && (
        <SidebarHint>
          Füge Überschriften oder Fließtext hinzu. Du kannst sie dann per Drag & Drop auf der
          Leinwand positionieren und direkt bearbeiten.
        </SidebarHint>
      )}
    </div>
  );
}
