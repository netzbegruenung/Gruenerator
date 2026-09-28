import { FaTrash } from 'react-icons/fa';
import { PiPlusBold, PiTextAa, PiTextHBold } from 'react-icons/pi';

import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile';
import { SidebarHint } from '../components/SidebarHint';
import { TextField } from '../components/TextFieldPrimitives';
import { SIDEBAR_SECTION } from '../sidebarStyles';

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

const MOBILE_ADD_TILE =
  'flex items-center w-full px-3.5 bg-[var(--editor-tile)] text-[var(--editor-text)] border-none rounded-xl cursor-pointer text-left transition-colors duration-150 hover:bg-[var(--editor-surface-hover)]';

// Mobile: Eingabefelder der Vorlage als Kacheln statt mit Rahmen
const MOBILE_FIELD_TILES =
  'max-canvas-mobile:gap-4 max-canvas-mobile:[&_label]:text-[13px] max-canvas-mobile:[&_label]:font-bold max-canvas-mobile:[&_label]:text-[var(--editor-text-muted)] max-canvas-mobile:[&_:is(input[type=text],textarea)]:rounded-xl max-canvas-mobile:[&_:is(input[type=text],textarea)]:border-transparent max-canvas-mobile:[&_:is(input[type=text],textarea)]:bg-[var(--editor-tile)] max-canvas-mobile:[&_:is(input[type=text],textarea)]:text-[var(--editor-text)] max-canvas-mobile:[&_:is(input[type=text],textarea)]:px-3.5 max-canvas-mobile:[&_:is(input[type=text],textarea)]:py-3 max-canvas-mobile:[&_:is(input[type=text],textarea)]:focus:border-[var(--editor-accent)] max-canvas-mobile:[&_textarea+div]:bg-[var(--editor-tile)]';

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
  const isMobile = useIsCanvasMobile();
  const hasFreeformText = onAddHeader !== undefined || onAddText !== undefined;
  const hasTemplateFields = textFields !== undefined && textFields.length > 0;
  const hasCanvasTexts = additionalTexts !== undefined && additionalTexts.length > 0;

  return (
    <div
      className={cn(SIDEBAR_SECTION, 'gap-md p-md max-canvas-mobile:gap-4 max-canvas-mobile:p-0')}
    >
      {hasFreeformText && isMobile && (
        <div className="flex flex-col gap-2.5">
          {onAddHeader && (
            <button
              type="button"
              onClick={onAddHeader}
              className={cn(MOBILE_ADD_TILE, 'h-12 text-[20px] font-black')}
            >
              Überschrift hinzufügen
            </button>
          )}
          {onAddSubheader && (
            <button
              type="button"
              onClick={onAddSubheader}
              className={cn(MOBILE_ADD_TILE, 'h-11 text-[17px] font-bold')}
            >
              Untertitel hinzufügen
            </button>
          )}
          {onAddText && (
            <button
              type="button"
              onClick={onAddText}
              className={cn(MOBILE_ADD_TILE, 'h-10 text-[15px] font-normal')}
            >
              Fließtext hinzufügen
            </button>
          )}
        </div>
      )}

      {hasFreeformText && !isMobile && (
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
        <div className={cn('flex flex-col gap-[var(--spacing-large)]', MOBILE_FIELD_TILES)}>
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
        <div className="flex flex-col gap-xs max-canvas-mobile:gap-2.5">
          <span className="text-xs font-semibold text-foreground uppercase tracking-wide max-canvas-mobile:text-[13px] max-canvas-mobile:font-bold max-canvas-mobile:normal-case max-canvas-mobile:tracking-normal max-canvas-mobile:text-[var(--editor-text-muted)]">
            Texte auf der Leinwand
          </span>
          {additionalTexts.map((text) => (
            <div
              key={text.id}
              className="flex items-center gap-sm p-sm bg-[var(--card-background)] border border-[var(--card-border)] rounded-lg max-canvas-mobile:min-h-11 max-canvas-mobile:py-1 max-canvas-mobile:pl-3.5 max-canvas-mobile:pr-1.5 max-canvas-mobile:bg-[var(--editor-tile)] max-canvas-mobile:border-transparent max-canvas-mobile:rounded-xl"
            >
              <span className="text-xs text-foreground-muted shrink-0 w-5">
                {getTextTypeIcon(text.type)}
              </span>
              <input
                type="text"
                value={text.text}
                onChange={(e) => onUpdateText(text.id, { text: e.target.value })}
                className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-foreground placeholder:text-foreground-muted max-canvas-mobile:text-[15px] max-canvas-mobile:text-[var(--editor-text)]"
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
