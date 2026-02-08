import {
  PillBadgePreviewIcon,
  StorerPreviewIcon,
  SingleBalkenPreviewIcon,
  TripleBalkenPreviewIcon,
} from './BadgePreviewIcons';

import type { BalkenMode } from '../../primitives';

import './BadgeSection.css';

export interface BadgeSectionProps {
  onAddPillBadge?: (preset?: string) => void;
  onAddCircleBadge?: (preset?: string) => void;
  onAddBalken?: (mode: BalkenMode) => void;
}

export function BadgeSection({ onAddPillBadge, onAddCircleBadge, onAddBalken }: BadgeSectionProps) {
  return (
    <div className="sidebar-section sidebar-section--badges">
      <div className="badge-preview-buttons">
        {onAddPillBadge && (
          <button
            type="button"
            className="badge-preview-btn"
            onClick={() => onAddPillBadge()}
            title="Pill-Badge hinzufügen"
          >
            <div className="badge-preview-icon">
              <PillBadgePreviewIcon size={48} />
            </div>
            <span>Pill-Badge</span>
          </button>
        )}
        {onAddCircleBadge && (
          <button
            type="button"
            className="badge-preview-btn"
            onClick={() => onAddCircleBadge()}
            title="Störer hinzufügen"
          >
            <div className="badge-preview-icon">
              <StorerPreviewIcon size={48} />
            </div>
            <span>Störer</span>
          </button>
        )}
        {onAddBalken && (
          <>
            <button
              type="button"
              className="badge-preview-btn"
              onClick={() => onAddBalken('single')}
              title="Einzelnen Balken hinzufügen"
            >
              <div className="badge-preview-icon">
                <SingleBalkenPreviewIcon size={48} />
              </div>
              <span>1 Balken</span>
            </button>
            <button
              type="button"
              className="badge-preview-btn"
              onClick={() => onAddBalken('triple')}
              title="Dreifach-Balken hinzufügen"
            >
              <div className="badge-preview-icon">
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
