/**
 * UnifiedTextSection - Dynamic text editing section for unified tab system
 *
 * Renders text input fields based on a configuration array.
 * For new code, prefer CombinedTextSection which merges this with freeform text support.
 */

import { SidebarHint } from '../components/SidebarHint';
import { TextField } from '../components/TextFieldPrimitives';
import { SIDEBAR_SECTION } from '../primitives';

import type { TextFieldConfig } from '../../configs/unifiedTabs';

import { cn } from '../../utils/cn';

export interface UnifiedTextSectionProps {
  textFields: TextFieldConfig[];
  values: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
  fontSizes?: Record<string, number>;
  onFontSizeChange?: (key: string, size: number) => void;
}

export function UnifiedTextSection({
  textFields,
  values,
  onFieldChange,
  fontSizes,
  onFontSizeChange,
}: UnifiedTextSectionProps) {
  return (
    <div
      className={cn(
        SIDEBAR_SECTION,
        'gap-[var(--spacing-medium)] p-[var(--spacing-medium)] max-canvas-mobile:p-[var(--spacing-small)]'
      )}
    >
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

      <SidebarHint>
        Klicke auf den Text im Canvas, um ihn direkt zu bearbeiten. Du kannst Texte auch per Drag &
        Drop verschieben.
      </SidebarHint>
    </div>
  );
}
