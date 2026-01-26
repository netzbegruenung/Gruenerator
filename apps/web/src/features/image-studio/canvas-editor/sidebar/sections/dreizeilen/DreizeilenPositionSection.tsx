import { FaChevronLeft, FaChevronRight, FaCheck } from 'react-icons/fa';
import { HiColorSwatch, HiAdjustments, HiArrowsExpand } from 'react-icons/hi';

import { SidebarSlider } from '../../components/SidebarSlider';
import { SubsectionTabBar, type Subsection } from '../../SubsectionTabBar';

import type { ColorScheme } from '../../../utils/dreizeilenLayout';
import './DreizeilenPositionSection.css';

export interface DreizeilenPositionSectionProps {
  widthScale: number;
  onWidthScaleChange: (value: number) => void;
  barOffsets: [number, number, number];
  onBarOffsetChange: (index: number, value: number) => void;
  colorScheme: ColorScheme;
  colorSchemes: ColorScheme[];
  activeSchemeId: string;
  onSchemeChange: (schemeId: string) => void;
  onReset: () => void;
}

export function DreizeilenPositionSection({
  widthScale,
  onWidthScaleChange,
  barOffsets,
  onBarOffsetChange,
  colorScheme,
  colorSchemes,
  activeSchemeId,
  onSchemeChange,
  onReset,
}: DreizeilenPositionSectionProps) {
  const STEP = 5; // pixels per arrow click

  const handleNudgeLeft = (index: number) => {
    onBarOffsetChange(index, barOffsets[index] - STEP);
  };

  const handleNudgeRight = (index: number) => {
    onBarOffsetChange(index, barOffsets[index] + STEP);
  };

  // Color Scheme Subsection Content
  const colorContent = (
    <div className="position-subsection">
      <div className="position-subheader">Farbschema</div>
      <div className="color-scheme-grid">
        {colorSchemes.map((scheme) => {
          const isActive = activeSchemeId === scheme.id;
          return (
            <button
              key={scheme.id}
              className={`color-scheme-card ${isActive ? 'color-scheme-card--active' : ''}`}
              onClick={() => onSchemeChange(scheme.id)}
              type="button"
              title={scheme.label}
            >
              <div className="color-scheme-preview">
                {scheme.colors.map((color, i) => (
                  <span
                    key={i}
                    className="color-scheme-preview__bar"
                    style={{ backgroundColor: color.background }}
                  />
                ))}
              </div>
              {isActive && (
                <span className="color-scheme-card__check">
                  <FaCheck size={8} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  // Fine-tuning Subsection Content
  const finetuneContent = (
    <div className="position-subsection">
      <div className="position-subheader">Feinabstimmung</div>
      <div className="individual-bar-controls">
        {[0, 1, 2].map((index) => {
          const colorPair = colorScheme.colors[index];

          return (
            <div key={index} className="bar-control-row">
              <button
                type="button"
                className="bar-nudge-btn"
                onClick={() => handleNudgeLeft(index)}
                aria-label="Nach links verschieben"
              >
                <FaChevronLeft size={10} />
              </button>
              <div
                className="bar-preview"
                style={{
                  backgroundColor: colorPair.background,
                  transform: `translateX(${barOffsets[index] / 10}px) skewX(-12deg)`,
                }}
              />
              <button
                type="button"
                className="bar-nudge-btn"
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

  // Width Scale Subsection Content
  const widthContent = (
    <div className="position-subsection">
      <div className="position-subheader">Balkenbreite</div>
      <SidebarSlider
        value={widthScale}
        onValueChange={onWidthScaleChange}
        min={0.9}
        max={1.1}
        step={0.01}
        showValue={false}
      />
      <div className="sidebar-slider-bounds">
        <span>Schmal</span>
        <span>Breit</span>
      </div>
    </div>
  );

  const subsections: Subsection[] = [
    { id: 'colors', icon: HiColorSwatch, label: 'Farbschema', content: colorContent },
    { id: 'finetune', icon: HiAdjustments, label: 'Feinabstimmung', content: finetuneContent },
    { id: 'width', icon: HiArrowsExpand, label: 'Balkenbreite', content: widthContent },
  ];

  return (
    <div className="sidebar-section sidebar-section--dreizeilen-position">
      <SubsectionTabBar subsections={subsections} defaultSubsection="colors" />
    </div>
  );
}
