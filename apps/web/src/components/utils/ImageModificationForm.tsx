import { type JSX, useState } from 'react';
import { FaChevronLeft, FaChevronRight, FaChevronUp, FaChevronDown, FaCog } from 'react-icons/fa';

import { SHAREPIC_GENERATOR, IMAGE_MODIFICATION } from './constants';

import '../../assets/styles/components/controls/font-size-control.css';
import '../../assets/styles/components/controls/color-scheme-control.css';
import '../../assets/styles/components/controls/credit-control.css';
import '../../assets/styles/components/actions/advanced-editing.css';

export interface FontSizeControlProps {
  fontSize?: number;
  onControlChange: (name: string, value: unknown) => void;
  isQuoteType?: boolean;
}

interface FreeFontSizeControlProps {
  fontSize?: number;
  onControlChange: (name: string, value: number) => void;
  min?: number;
  max?: number;
  isQuoteType?: boolean;
}

interface GroupedFontSizeControlProps {
  fontSizes?: Record<string, number>;
  onControlChange: (key: string, value: number) => void;
}

interface InputWithFontSizeProps {
  label: string;
  name: string;
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fontSizePx?: number;
  baseFontSize?: number;
  onFontSizeChange?: (name: string, value: number) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}

interface BalkenOffsetControlProps {
  balkenOffset: number[];
  onControlChange: (name: string, value: number[]) => void;
}

interface ColorSchemeControlProps {
  colorScheme: Array<{ background: string }>;
  onControlChange: (name: string, value: unknown) => void;
}

interface CrossControlBaseProps {
  title: string;
  description: string;
  offset: [number, number];
  onOffsetChange: (offset: [number, number]) => void;
  step: number;
}

interface OffsetControlProps {
  offset: [number, number];
  onOffsetChange: (offset: [number, number]) => void;
}

interface CreditControlProps {
  credit: string;
  onControlChange: (name: string, value: string) => void;
}

interface ImageModificationFormProps {
  fontSize: number;
  balkenOffset: number[];
  colorScheme: Array<{ background: string }>;
  balkenGruppenOffset: [number, number];
  sunflowerOffset: [number, number];
  credit: string;
  onControlChange: (name: string, value: unknown) => void;
}

export const FontSizeControl = ({
  fontSize = 90,
  onControlChange,
  isQuoteType = false,
}: FontSizeControlProps): JSX.Element => {
  const [showSlider, setShowSlider] = useState(false);

  const options = isQuoteType
    ? IMAGE_MODIFICATION.FONT_SIZE.ZITAT_OPTIONS
    : IMAGE_MODIFICATION.FONT_SIZE.OPTIONS;

  const effectiveMin = isQuoteType ? 45 : 75;
  const effectiveMax = isQuoteType ? 80 : 110;

  return (
    <div className="font-size-control">
      <div className="font-size-buttons">
        {options.map((option) => (
          <button
            key={option.label}
            onClick={() => onControlChange('fontSize', option.value)}
            className={fontSize === option.value ? 'active' : ''}
          >
            {option.label}
          </button>
        ))}
        <button
          className={showSlider ? 'active' : ''}
          onClick={() => setShowSlider(!showSlider)}
          title="Freie Schriftgröße"
          type="button"
        >
          <FaCog />
        </button>
        <span className="font-size-value">{fontSize}px</span>
        {showSlider && (
          <input
            type="range"
            min={effectiveMin}
            max={effectiveMax}
            value={Math.max(effectiveMin, Math.min(effectiveMax, fontSize))}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onControlChange('fontSize', parseInt(e.target.value, 10))
            }
            className="font-size-slider"
          />
        )}
      </div>
    </div>
  );
};

export const FreeFontSizeControl = ({
  fontSize = 90,
  onControlChange,
  min = 75,
  max = 110,
  isQuoteType = false,
}: FreeFontSizeControlProps): JSX.Element => {
  const effectiveMin = isQuoteType ? 45 : min;
  const effectiveMax = isQuoteType ? 80 : max;

  return (
    <div className="free-font-size-control">
      <input
        type="range"
        min={effectiveMin}
        max={effectiveMax}
        value={Math.max(effectiveMin, Math.min(effectiveMax, fontSize))}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onControlChange('fontSize', parseInt(e.target.value, 10))
        }
        className="font-size-slider"
      />
      <span className="font-size-value">{fontSize}px</span>
    </div>
  );
};

export const GroupedFontSizeControl = ({
  fontSizes = { main: 100, circle: 100, footer: 100 },
  onControlChange,
}: GroupedFontSizeControlProps): JSX.Element => {
  const groups = [
    { key: 'main', label: 'Haupttext' },
    { key: 'circle', label: 'Datum-Kreis' },
    { key: 'footer', label: 'Ort & Adresse' },
  ];
  const min = 70;
  const max = 130;

  return (
    <div className="grouped-font-size-control">
      {groups.map(({ key, label }) => (
        <div key={key} className="grouped-font-size-control__group">
          <label className="grouped-font-size-control__label">{label}</label>
          <div className="grouped-font-size-control__slider-row">
            <input
              type="range"
              min={min}
              max={max}
              value={fontSizes[key] || 100}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onControlChange(key, parseInt(e.target.value, 10))
              }
              className="font-size-slider"
            />
            <span className="font-size-value">{fontSizes[key] || 100}%</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const InputWithFontSize = ({
  label,
  name,
  value,
  onChange,
  fontSizePx,
  baseFontSize = 60,
  onFontSizeChange,
  placeholder = '',
  type = 'text',
  disabled = false,
}: InputWithFontSizeProps): JSX.Element => {
  const minPx = Math.round(baseFontSize * 0.7);
  const maxPx = Math.round(baseFontSize * 1.3);
  const currentPx = fontSizePx ?? baseFontSize;

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (onChange) {
      onChange({ target: { name, value: e.target.value } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    if (onFontSizeChange) {
      onFontSizeChange(name, parseInt(e.target.value, 10));
    }
  };

  return (
    <div className="input-with-fontsize">
      <label className="input-with-fontsize__label">{label}</label>
      <div className="input-with-fontsize__row">
        <input
          type={type}
          name={name}
          value={value || ''}
          onChange={handleTextChange}
          placeholder={placeholder}
          disabled={disabled}
          className="input-with-fontsize__input"
        />
        <input
          type="range"
          min={minPx}
          max={maxPx}
          value={currentPx}
          onChange={handleSliderChange}
          disabled={disabled}
          className="input-with-fontsize__slider"
        />
        <span className="input-with-fontsize__value">{currentPx}px</span>
      </div>
    </div>
  );
};

export const BalkenOffsetControl = ({
  balkenOffset,
  onControlChange,
}: BalkenOffsetControlProps): JSX.Element => {
  console.log('BalkenOffsetControl rendered with:', balkenOffset); // Debugging

  const handleOffsetChange = (index: number, direction: number): void => {
    console.log('handleOffsetChange called:', index, direction); // Debugging
    if (!Array.isArray(balkenOffset)) {
      console.warn('Invalid balkenOffset:', balkenOffset);
      return;
    }
    const newOffset = [...balkenOffset];
    newOffset[index] = Math.max(-250, Math.min(250, newOffset[index] + direction * 50));
    console.log('New balkenOffset:', newOffset); // Debugging
    onControlChange('balkenOffset', newOffset);
  };

  return (
    <div className="balken-offset-control">
      {Array.isArray(balkenOffset) &&
        balkenOffset.map((offset, index) => (
          <div key={index} className="balken-offset-control-item">
            <div className="balken-offset-buttons">
              <button
                onClick={(e: React.MouseEvent) => {
                  console.log('Left button clicked for index:', index); // Debugging
                  e.preventDefault();
                  e.stopPropagation();
                  handleOffsetChange(index, -1);
                }}
              >
                <FaChevronLeft />
              </button>
              <span>{offset}px</span>
              <button
                onClick={(e: React.MouseEvent) => {
                  console.log('Right button clicked for index:', index); // Debugging
                  e.preventDefault();
                  e.stopPropagation();
                  handleOffsetChange(index, 1);
                }}
              >
                <FaChevronRight />
              </button>
            </div>
          </div>
        ))}
    </div>
  );
};

BalkenOffsetControl.defaultProps = {
  balkenOffset: SHAREPIC_GENERATOR.DEFAULT_BALKEN_OFFSET,
};

export const ColorSchemeControl = ({
  colorScheme,
  onControlChange,
}: ColorSchemeControlProps): JSX.Element => {
  const handleColorChange = (lineIndex: number, value: string): void => {
    const newScheme = colorScheme.map((line, idx) =>
      idx === lineIndex ? { background: value } : line
    );
    onControlChange('colorScheme', newScheme);
  };

  return (
    <div className="color-scheme-control">
      <div className="color-scheme-presets">
        {IMAGE_MODIFICATION.COLOR_SCHEMES.map((scheme, index) => (
          <button
            key={index}
            className={`color-scheme-preset ${JSON.stringify(colorScheme) === JSON.stringify(scheme.colors) ? 'active' : ''}`}
            onClick={() => onControlChange('colorScheme', scheme.colors)}
            aria-label={`${scheme.name} auswählen`}
            type="button"
          >
            <img src={scheme.imageSrc} alt={scheme.name} />
          </button>
        ))}
      </div>
      <div className="color-scheme-inputs">
        {colorScheme.map((line, idx) => (
          <div key={idx} className="color-scheme-line">
            <span className="color-scheme-line__label">Zeile {idx + 1}</span>
            <label className="color-input-wrapper">
              <input
                type="color"
                value={line.background}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleColorChange(idx, e.target.value)
                }
                className="color-input"
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

const CrossControlBase = ({
  title,
  description,
  offset,
  onOffsetChange,
  step,
}: CrossControlBaseProps): JSX.Element => {
  const handleMove = (direction: 'up' | 'down' | 'left' | 'right'): void => {
    const newOffset: [number, number] = [offset[0], offset[1]];
    switch (direction) {
      case 'up':
        newOffset[1] -= step;
        break;
      case 'down':
        newOffset[1] += step;
        break;
      case 'left':
        newOffset[0] -= step;
        break;
      case 'right':
        newOffset[0] += step;
        break;
      default:
        break;
    }
    onOffsetChange(newOffset);
  };

  return (
    <div className="cross-control">
      <h4>{title}</h4>
      <p>{description}</p>
      <div className="cross-grid">
        <button onClick={() => handleMove('up')} className="cross-button up">
          <FaChevronUp />
        </button>
        <button onClick={() => handleMove('left')} className="cross-button left">
          <FaChevronLeft />
        </button>
        <div className="offset-display">
          <span className="offset-value">{`${offset[0]},${offset[1]}`}</span>
        </div>
        <button onClick={() => handleMove('right')} className="cross-button right">
          <FaChevronRight />
        </button>
        <button onClick={() => handleMove('down')} className="cross-button down">
          <FaChevronDown />
        </button>
      </div>
    </div>
  );
};

export const BalkenGruppeControl = ({
  offset,
  onOffsetChange,
}: OffsetControlProps): JSX.Element => (
  <CrossControlBase
    title={IMAGE_MODIFICATION.LABELS.BALKEN_GRUPPE_TITLE}
    description={IMAGE_MODIFICATION.LABELS.BALKEN_GRUPPE_DESCRIPTION}
    offset={offset}
    onOffsetChange={onOffsetChange}
    step={IMAGE_MODIFICATION.BALKEN_GRUPPE_STEP}
  />
);

export const SonnenblumenControl = ({
  offset,
  onOffsetChange,
}: OffsetControlProps): JSX.Element => (
  <CrossControlBase
    title={IMAGE_MODIFICATION.LABELS.SUNFLOWER_TITLE}
    description={IMAGE_MODIFICATION.LABELS.SUNFLOWER_DESCRIPTION}
    offset={offset}
    onOffsetChange={onOffsetChange}
    step={IMAGE_MODIFICATION.SUNFLOWER_STEP}
  />
);

export const CreditControl = ({ credit, onControlChange }: CreditControlProps): JSX.Element => (
  <div className="credit-control">
    <input
      type="text"
      id="credit"
      value={credit}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onControlChange('credit', e.target.value)
      }
      placeholder="www.gruene-musterdorf.de"
    />
  </div>
);

const ImageModificationForm = ({
  fontSize,
  balkenOffset,
  colorScheme,
  balkenGruppenOffset,
  sunflowerOffset,
  credit,
  onControlChange,
}: ImageModificationFormProps): JSX.Element => {
  const handleBalkenGruppeOffsetChange = (newOffset: [number, number]): void => {
    const offsetDiff: [number, number] = [
      newOffset[0] - balkenGruppenOffset[0],
      newOffset[1] - balkenGruppenOffset[1],
    ];

    onControlChange('balkenGruppenOffset', newOffset);
    onControlChange('sunflowerOffset', [
      sunflowerOffset[0] + offsetDiff[0],
      sunflowerOffset[1] + offsetDiff[1],
    ]);
  };

  const handleSunflowerOffsetChange = (newOffset: [number, number]): void => {
    onControlChange('sunflowerOffset', newOffset);
  };

  return (
    <div className="image-modification-form">
      <FontSizeControl fontSize={fontSize} onControlChange={onControlChange} />
      <BalkenOffsetControl balkenOffset={balkenOffset} onControlChange={onControlChange} />
      <ColorSchemeControl colorScheme={colorScheme} onControlChange={onControlChange} />
      <div className="offset-controls-group">
        <h3>{IMAGE_MODIFICATION.LABELS.OFFSET_CONTROLS_TITLE}</h3>
        <p>{IMAGE_MODIFICATION.LABELS.OFFSET_CONTROLS_DESCRIPTION}</p>
        <div className="offset-controls-content">
          <BalkenGruppeControl
            offset={balkenGruppenOffset}
            onOffsetChange={handleBalkenGruppeOffsetChange}
          />
          <SonnenblumenControl
            offset={sunflowerOffset}
            onOffsetChange={handleSunflowerOffsetChange}
          />
        </div>
      </div>
      <div className="credit-control-section">
        <h4>Bildnachweis / Credit</h4>
        <CreditControl credit={credit} onControlChange={onControlChange} />
      </div>
    </div>
  );
};

ImageModificationForm.defaultProps = {
  fontSize: SHAREPIC_GENERATOR.DEFAULT_FONT_SIZE,
  balkenOffset: SHAREPIC_GENERATOR.DEFAULT_BALKEN_OFFSET,
  colorScheme: SHAREPIC_GENERATOR.DEFAULT_COLOR_SCHEME,
  balkenGruppenOffset: [0, 0],
  sunflowerOffset: [0, 0],
  credit: '',
};

export default ImageModificationForm;
