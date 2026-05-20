import { FaTrash } from 'react-icons/fa';
import { PiPlusBold, PiTextAa, PiTextHBold } from 'react-icons/pi';

import { SidebarHint } from '../components/SidebarHint';
import { TextField } from '../components/TextFieldPrimitives';
import { SIDEBAR_SECTION } from '../primitives';

import type { AdditionalText } from '../../configs/types';
import type { TextFieldConfig } from '../../configs/unifiedTabs';

import { cn } from '../../utils/cn';

export interface CombinedTextSectionProps {
  onAddHeader?: () => void;
  onAddSubheader?: () => void;
  onAddText?: () => void;
  additionalTexts?: AdditionalText[];
  onUpdateText?: (id: string, partial: Partial<AdditionalText>) => void;
  onRemoveText?: (id: string) => void;
  textFields?: TextFieldConfig[];
  values?: Record<string, string>;
  onFieldChange?: (key: string, value: string) => void;
  fontSizes?: Record<string, number>;
  onFontSizeChange?: (key: string, size: number) => void;
}

function getTextTypeIcon(type: AdditionalText['type']) {
  if (type === 'header' || type === 'subheader') return <PiTextHBold size={14} />;
  return <PiTextAa size={14} />;
}

function getTextTypePlaceholder(type: AdditionalText['type']) {
  if (type === 'header') return 'Überschrift...';
  if (type === 'subheader') return 'Untertitel...';
  return 'Text...';
}

export function CombinedTextSection({
  onAddHeader,
  onAddSubheader,
  onAddText,
  additionalTexts,
  onUpdateText,
  onRemoveText,
  textFields,
  values,
  onFieldChange,
  fontSizes,
  onFontSizeChange,
}: CombinedTextSectionProps) {
  const hasFreeformText = onAddHeader !== undefined || onAddText !== undefined;
  const hasTemplateFields = textFields !== undefined && textFields.length > 0;
  const hasCanvasTexts = additionalTexts !== undefined && additionalTexts.length > 0;

  return (
    <div className={cn(SIDEBAR_SECTION, 'gap-md p-md max-canvas-mobile:p-sm')}>
      {hasFreeformText && (
        <>
          {onAddText && (
            <button
              type="button"
              onClick={onAddText}
              className="flex items-center justify-center gap-xs w-full py-2.5 bg-primary-600 text-white border-none rounded-lg cursor-pointer text-sm font-semibold transition-colors duration-150 hover:bg-primary-700"
            >
              <PiPlusBold size={14} />
              Textfeld hinzufügen
            </button>
          )}

          <div className="flex flex-col gap-1.5">
            {onAddHeader && (
              <button
                type="button"
                onClick={onAddHeader}
                className="w-full text-left py-3 px-4 bg-[var(--card-background)] border border-[var(--card-border)] rounded-lg cursor-pointer transition-all duration-150 hover:bg-hover-alt hover:border-grey-300 dark:hover:border-grey-600"
              >
                <span className="font-[GrueneTypeNeue,Arial,sans-serif] text-xl font-bold text-foreground">
                  Titel
                </span>
              </button>
            )}
            {onAddSubheader && (
              <button
                type="button"
                onClick={onAddSubheader}
                className="w-full text-left py-2.5 px-4 bg-[var(--card-background)] border border-[var(--card-border)] rounded-lg cursor-pointer transition-all duration-150 hover:bg-hover-alt hover:border-grey-300 dark:hover:border-grey-600"
              >
                <span className="font-[GrueneTypeNeue,Arial,sans-serif] text-base font-bold text-foreground">
                  Untertitel
                </span>
              </button>
            )}
            {onAddText && (
              <button
                type="button"
                onClick={onAddText}
                className="w-full text-left py-2 px-4 bg-[var(--card-background)] border border-[var(--card-border)] rounded-lg cursor-pointer transition-all duration-150 hover:bg-hover-alt hover:border-grey-300 dark:hover:border-grey-600"
              >
                <span className="font-[PT_Sans,Arial,sans-serif] text-sm text-foreground">
                  Text
                </span>
              </button>
            )}
          </div>
        </>
      )}

      {hasTemplateFields && values && onFieldChange && (
        <div className="flex flex-col gap-[var(--spacing-large)] max-canvas-mobile:gap-[var(--spacing-medium)]">
          {textFields.map((fieldConfig) => {
            const fontSize = fieldConfig.fontSizeStateKey
              ? fontSizes?.[fieldConfig.fontSizeStateKey]
              : undefined;

            const handleFontSizeChange =
              fieldConfig.fontSizeStateKey && onFontSizeChange
                ? (size: number) => onFontSizeChange(fieldConfig.fontSizeStateKey!, size)
                : undefined;

            return (
              <TextField
                key={fieldConfig.key}
                config={fieldConfig}
                value={values[fieldConfig.key] || ''}
                onChange={(val) => onFieldChange(fieldConfig.key, val)}
                fontSize={fontSize}
                onFontSizeChange={handleFontSizeChange}
              />
            );
          })}
        </div>
      )}

      {hasCanvasTexts && onUpdateText && onRemoveText && (
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
                {getTextTypeIcon(text.type)}
              </span>
              <input
                type="text"
                value={text.text}
                onChange={(e) => onUpdateText(text.id, { text: e.target.value })}
                className="flex-1 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-foreground-muted"
                placeholder={getTextTypePlaceholder(text.type)}
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

      {!hasFreeformText && !hasTemplateFields && !hasCanvasTexts && (
        <SidebarHint>
          Klicke auf den Text im Canvas, um ihn direkt zu bearbeiten. Du kannst Texte auch per Drag
          & Drop verschieben.
        </SidebarHint>
      )}

      {hasFreeformText && !hasCanvasTexts && (
        <SidebarHint>
          Füge Überschriften oder Fließtext hinzu. Du kannst sie dann per Drag & Drop auf der
          Leinwand positionieren und direkt bearbeiten.
        </SidebarHint>
      )}
    </div>
  );
}
