import { type JSX, useState } from 'react';
import { FaChevronLeft, FaChevronRight, FaChevronUp, FaChevronDown, FaCog } from 'react-icons/fa';

import { cn } from '../../utils/cn';

import { SHAREPIC_GENERATOR, IMAGE_MODIFICATION } from './constants';

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

const sliderClass =
  'flex-1 min-w-[80px] h-1.5 rounded-sm bg-grey-300 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--interactive-accent-color)] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--interactive-accent-color)] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none';

const fontSizeValueClass = 'min-w-[45px] text-foreground text-[0.85em]';

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
    <div className="m-0">
      <div className="flex items-center gap-3 max-md:flex-wrap">
        {options.map((option) => (
          <button
            key={option.label}
            onClick={() => onControlChange('fontSize', option.value)}
            className={cn(
              'flex-1 py-3 px-3 rounded border border-[var(--border-color)] text-foreground bg-[var(--card-background)] cursor-pointer transition-all duration-200',
              'hover:bg-background-alt hover:border-[var(--interactive-accent-color)]',
              fontSize === option.value &&
                'bg-[var(--interactive-accent-color)] border-[var(--interactive-accent-color)] text-white',
              'max-md:flex-[1_1_calc(50%-0.375rem)] max-md:py-2 max-md:text-[0.9em]'
            )}
          >
            {option.label}
          </button>
        ))}
        <button
          className={cn(
            'flex-1 py-3 px-3 rounded border border-[var(--border-color)] text-foreground bg-[var(--card-background)] cursor-pointer transition-all duration-200',
            'hover:bg-background-alt hover:border-[var(--interactive-accent-color)]',
            showSlider &&
              'bg-[var(--interactive-accent-color)] border-[var(--interactive-accent-color)] text-white',
            'max-md:flex-[1_1_calc(50%-0.375rem)] max-md:py-2 max-md:text-[0.9em]'
          )}
          onClick={() => setShowSlider(!showSlider)}
          title="Freie Schriftgröße"
          type="button"
        >
          <FaCog />
        </button>
        <span className="min-w-[50px] text-right text-[0.85em] text-foreground opacity-80">
          {fontSize}px
        </span>
        {showSlider && (
          <input
            type="range"
            min={effectiveMin}
            max={effectiveMax}
            value={Math.max(effectiveMin, Math.min(effectiveMax, fontSize))}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onControlChange('fontSize', parseInt(e.target.value, 10))
            }
            className={sliderClass}
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
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={effectiveMin}
        max={effectiveMax}
        value={Math.max(effectiveMin, Math.min(effectiveMax, fontSize))}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onControlChange('fontSize', parseInt(e.target.value, 10))
        }
        className={sliderClass}
      />
      <span className={fontSizeValueClass}>{fontSize}px</span>
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
    <div className="flex flex-col gap-md">
      {groups.map(({ key, label }) => (
        <div key={key} className="flex flex-col gap-xs">
          <label className="text-[0.9em] text-foreground font-medium">{label}</label>
          <div className="flex items-center gap-sm">
            <input
              type="range"
              min={min}
              max={max}
              value={fontSizes[key] || 100}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onControlChange(key, parseInt(e.target.value, 10))
              }
              className={cn(sliderClass, 'flex-1')}
            />
            <span className="min-w-[50px] text-right text-foreground text-[0.85em]">
              {fontSizes[key] || 100}%
            </span>
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
    <div className="flex flex-col gap-xs">
      <label className="text-[0.85em] text-foreground font-medium opacity-90">{label}</label>
      <div className="flex items-center gap-sm max-sm:flex-wrap">
        <input
          type={type}
          name={name}
          value={value || ''}
          onChange={handleTextChange}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 min-w-0 p-sm border border-[var(--border-color)] rounded-[var(--card-border-radius-small)] bg-[var(--card-background)] text-foreground text-[0.95em] focus:outline-none focus:border-[var(--interactive-accent-color)] disabled:opacity-60 disabled:cursor-not-allowed max-sm:w-full max-sm:flex-none"
        />
        <input
          type="range"
          min={minPx}
          max={maxPx}
          value={currentPx}
          onChange={handleSliderChange}
          disabled={disabled}
          className="w-[70px] h-1.5 rounded-sm bg-grey-300 appearance-none cursor-pointer shrink-0 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--interactive-accent-color)] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--interactive-accent-color)] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-none disabled:opacity-50 disabled:cursor-not-allowed max-sm:flex-1 max-sm:min-w-[60px]"
        />
        <span className="min-w-[42px] text-[0.8em] text-foreground text-right font-mono shrink-0">
          {currentPx}px
        </span>
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

  const arrowBtnClass =
    'bg-transparent border-2 border-[var(--border-color)] text-foreground rounded-[var(--card-border-radius-small)] p-2 cursor-pointer transition-all duration-200 flex items-center justify-center w-8 h-8 hover:bg-[var(--interactive-accent-color)] hover:border-[var(--interactive-accent-color)] hover:text-white max-md:w-7 max-md:h-7 max-md:p-1.5';

  return (
    <div className="flex flex-col gap-3">
      {Array.isArray(balkenOffset) &&
        balkenOffset.map((offset, index) => (
          <div key={index} className="flex items-center justify-center">
            <div className="flex items-center gap-3 p-1 rounded">
              <button
                className={arrowBtnClass}
                onClick={(e: React.MouseEvent) => {
                  console.log('Left button clicked for index:', index); // Debugging
                  e.preventDefault();
                  e.stopPropagation();
                  handleOffsetChange(index, -1);
                }}
              >
                <FaChevronLeft />
              </button>
              <span className="min-w-[50px] text-center text-foreground font-mono text-[0.9em] max-md:min-w-[40px] max-md:text-[0.8em]">
                {offset}px
              </span>
              <button
                className={arrowBtnClass}
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
    <div className="w-full mt-2">
      <div className="flex gap-2 flex-wrap mb-4">
        {IMAGE_MODIFICATION.COLOR_SCHEMES.map((scheme, index) => (
          <button
            key={index}
            className={cn(
              'cursor-pointer bg-none border-2 border-transparent rounded-md p-0.5 transition-all duration-200',
              'hover:border-[var(--klee)]',
              JSON.stringify(colorScheme) === JSON.stringify(scheme.colors) &&
                'border-[var(--interactive-accent-color)]'
            )}
            onClick={() => onControlChange('colorScheme', scheme.colors)}
            aria-label={`${scheme.name} auswählen`}
            type="button"
          >
            <img
              src={scheme.imageSrc}
              alt={scheme.name}
              className="w-[50px] h-auto rounded block"
            />
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {colorScheme.map((line, idx) => (
          <div key={idx} className="flex items-center gap-4">
            <span className="min-w-[55px] text-[0.85em] text-foreground font-medium">
              Zeile {idx + 1}
            </span>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="color"
                value={line.background}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  handleColorChange(idx, e.target.value)
                }
                className="w-8 h-8 p-0 border-2 border-[var(--border-color)] rounded-md cursor-pointer bg-none hover:border-[var(--interactive-accent-color)] [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-none [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-none"
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

  const crossBtnClass =
    'bg-transparent border-2 border-[var(--border-color)] text-foreground rounded-[var(--card-border-radius-small)] p-2 cursor-pointer transition-all duration-200 flex items-center justify-center w-9 h-9 hover:bg-[var(--interactive-accent-color)] hover:border-[var(--interactive-accent-color)] hover:text-white max-md:w-8 max-md:h-8';

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-foreground m-0 mb-sm text-base font-semibold">{title}</h4>
      <p className="text-foreground m-0 mb-sm text-[0.9em] opacity-80">{description}</p>
      <div className="grid grid-cols-3 grid-rows-3 gap-2 w-fit mx-auto">
        <button
          onClick={() => handleMove('up')}
          className={cn(crossBtnClass, 'col-start-2 row-start-1')}
        >
          <FaChevronUp />
        </button>
        <button
          onClick={() => handleMove('left')}
          className={cn(crossBtnClass, 'col-start-1 row-start-2')}
        >
          <FaChevronLeft />
        </button>
        <div className="col-start-2 row-start-2 flex items-center justify-center bg-background-alt [border:var(--border-subtle)] rounded-[var(--card-border-radius-small)] w-9 h-9 max-md:w-8 max-md:h-8">
          <span className="text-foreground text-[0.8em] max-md:text-[0.75em] font-mono text-center whitespace-nowrap">
            {`${offset[0]},${offset[1]}`}
          </span>
        </div>
        <button
          onClick={() => handleMove('right')}
          className={cn(crossBtnClass, 'col-start-3 row-start-2')}
        >
          <FaChevronRight />
        </button>
        <button
          onClick={() => handleMove('down')}
          className={cn(crossBtnClass, 'col-start-2 row-start-3')}
        >
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
  <div className="mt-xs">
    <input
      type="text"
      id="credit"
      value={credit}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
        onControlChange('credit', e.target.value)
      }
      placeholder="www.gruene-musterdorf.de"
      className="w-full py-2 px-3 border border-[var(--border-color)] rounded bg-[var(--card-background)] text-foreground text-[0.9em] transition-colors duration-200 focus:outline-none focus:border-[var(--interactive-accent-color)] placeholder:text-foreground placeholder:opacity-50 max-md:py-2 max-md:px-2 max-md:text-[0.9em]"
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
    <div className="bg-background-alt rounded-[var(--card-border-radius-small)] p-lg mt-lg w-full max-md:p-4">
      <FontSizeControl fontSize={fontSize} onControlChange={onControlChange} />
      <BalkenOffsetControl balkenOffset={balkenOffset} onControlChange={onControlChange} />
      <ColorSchemeControl colorScheme={colorScheme} onControlChange={onControlChange} />
      <div className="mt-6">
        <h3 className="text-foreground-heading m-0 mb-lg text-[1.1em] font-semibold">
          {IMAGE_MODIFICATION.LABELS.OFFSET_CONTROLS_TITLE}
        </h3>
        <p className="text-foreground m-0 mb-sm text-[0.9em] opacity-80">
          {IMAGE_MODIFICATION.LABELS.OFFSET_CONTROLS_DESCRIPTION}
        </p>
        <div className="grid grid-cols-3 gap-6 w-full mt-6 max-lg:grid-cols-2 max-lg:[&>:last-child]:col-span-full max-lg:[&>:last-child]:max-w-[400px] max-lg:[&>:last-child]:mx-auto max-md:grid-cols-1 max-md:gap-4 max-md:[&>:last-child]:col-auto max-md:[&>:last-child]:max-w-none max-md:[&>:last-child]:mx-0">
          <div className="bg-[var(--card-background)] [border:var(--border-subtle)] rounded-[var(--card-border-radius-small)] p-md max-md:p-3">
            <BalkenGruppeControl
              offset={balkenGruppenOffset}
              onOffsetChange={handleBalkenGruppeOffsetChange}
            />
          </div>
          <div className="bg-[var(--card-background)] [border:var(--border-subtle)] rounded-[var(--card-border-radius-small)] p-md max-md:p-3">
            <SonnenblumenControl
              offset={sunflowerOffset}
              onOffsetChange={handleSunflowerOffsetChange}
            />
          </div>
        </div>
      </div>
      <div className="mt-md pt-sm border-t border-t-[var(--border-color)]">
        <h4 className="m-0 mb-xs text-[0.9rem] font-semibold text-foreground-heading">
          Bildnachweis / Credit
        </h4>
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
