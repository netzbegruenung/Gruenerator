import { useCallback, useRef } from 'react';
import { PiFrameCornersFill, PiTrashFill } from 'react-icons/pi';

import type { FrameClipType, FrameInstance } from '../../utils/frameUtils';

export interface RahmenSectionProps {
  onAddFrame: (clipType: FrameClipType) => void;
  selectedFrame: FrameInstance | null;
  onSetFrameImage?: (id: string, file: File, objectUrl: string) => void;
  onRemoveFrame?: (id: string) => void;
}

export function RahmenSection({
  onAddFrame,
  selectedFrame,
  onSetFrameImage,
  onRemoveFrame,
}: RahmenSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && selectedFrame && onSetFrameImage) {
        const objectUrl = URL.createObjectURL(file);
        onSetFrameImage(selectedFrame.id, file, objectUrl);
      }
      if (e.target) {
        e.target.value = '';
      }
    },
    [selectedFrame, onSetFrameImage]
  );

  const hasImage = selectedFrame?.imageSrc != null;

  return (
    <div className="sidebar-section sidebar-section--formen">
      <div className="sidebar-card-grid">
        <button
          className="sidebar-selectable-card"
          onClick={() => onAddFrame('circle')}
          title="Kreisrahmen hinzufuegen"
          type="button"
        >
          <div className="sidebar-selectable-card__preview">
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: '2px dashed #005538',
              }}
            />
          </div>
        </button>
        <button
          className="sidebar-selectable-card"
          onClick={() => onAddFrame('rounded-rect')}
          title="Rechteckrahmen hinzufuegen"
          type="button"
        >
          <div className="sidebar-selectable-card__preview">
            <PiFrameCornersFill size={24} />
          </div>
        </button>
      </div>

      {selectedFrame && (
        <div className="sidebar-section" style={{ marginTop: 12 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          {onSetFrameImage && (
            <button
              type="button"
              className="sidebar-action-btn"
              onClick={handleImageClick}
              style={{ width: '100%', marginBottom: 8 }}
            >
              {hasImage ? 'Bild aendern' : 'Bild hinzufuegen'}
            </button>
          )}
          {onRemoveFrame && (
            <button
              type="button"
              className="sidebar-action-btn sidebar-action-btn--danger"
              onClick={() => onRemoveFrame(selectedFrame.id)}
              style={{ width: '100%' }}
            >
              <PiTrashFill size={14} />
              <span style={{ marginLeft: 4 }}>Rahmen entfernen</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
