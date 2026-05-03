import { useCallback, useEffect, useState } from 'react';
import { FaTrash } from 'react-icons/fa';

import { ACTION_BTN_DANGER, SECTION_HEADER, SECTION_TITLE } from '../primitives';
import { ImageInputPicker } from './tools/ImageInputPicker';

import type { FrameInstance } from '../../utils/frameUtils';

export interface FrameSettingsSectionProps {
  selectedFrame: FrameInstance | null;
  onSetFrameImage: (id: string, file: File, objectUrl: string) => void;
  onUpdateFrame: (id: string, partial: Partial<FrameInstance>) => void;
  onRemoveFrame: (id: string) => void;
}

export function FrameSettingsSection({
  selectedFrame,
  onSetFrameImage,
  onUpdateFrame,
  onRemoveFrame,
}: FrameSettingsSectionProps) {
  const [pickerFile, setPickerFile] = useState<File | null>(null);

  useEffect(() => {
    setPickerFile(null);
  }, [selectedFrame?.id, selectedFrame?.imageSrc]);

  const handlePickerChange = useCallback(
    (file: File | null) => {
      setPickerFile(file);
      if (file && selectedFrame) {
        const objectUrl = URL.createObjectURL(file);
        onSetFrameImage(selectedFrame.id, file, objectUrl);
      }
    },
    [selectedFrame, onSetFrameImage]
  );

  if (!selectedFrame) {
    return (
      <div className="flex flex-col gap-4 p-3">
        <div className={SECTION_HEADER}>
          <span className={SECTION_TITLE}>Kein Rahmen ausgewählt</span>
        </div>
        <p className="text-[12px] text-foreground-muted px-3">
          Wähle einen Rahmen auf der Leinwand aus, um ein Bild hinzuzufügen.
        </p>
      </div>
    );
  }

  const hasImage = selectedFrame.imageSrc != null;

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className={SECTION_HEADER}>
        <span className={SECTION_TITLE}>Ausgewählter Rahmen</span>
        <button
          type="button"
          className={ACTION_BTN_DANGER}
          onClick={() => onRemoveFrame(selectedFrame.id)}
          title="Rahmen entfernen"
        >
          <FaTrash size={12} />
        </button>
      </div>

      <ImageInputPicker value={pickerFile} onChange={handlePickerChange} />

      {hasImage && (
        <div className="flex flex-col gap-2 px-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.8px] text-foreground-muted">
              Zoom
            </span>
            <span className="text-[11px] tabular-nums text-foreground-muted">
              {selectedFrame.imageScale.toFixed(2)}×
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={selectedFrame.imageScale}
            onChange={(e) =>
              onUpdateFrame(selectedFrame.id, { imageScale: parseFloat(e.target.value) })
            }
            className="w-full h-[4px] appearance-none bg-grey-200 dark:bg-grey-700 rounded-[2px] cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:bg-primary-600 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:bg-primary-600 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}
