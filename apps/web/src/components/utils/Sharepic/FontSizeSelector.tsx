import { FONT_SIZES } from '../../utils/constants';

interface FontSizeSelectorProps {
  fontSize: unknown;
  handleFontSizeChange: () => void;
}

const FontSizeSelector = ({ fontSize, handleFontSizeChange }: FontSizeSelectorProps): JSX.Element => {
  return (
    <div className="form-group">
      <label htmlFor="fontSize">Schriftgröße:</label>
      <select
        id="fontSize"
        name="fontSize"
        value={fontSize}
        onChange={handleFontSizeChange}
      >
        {Object.entries(FONT_SIZES).map(([key, value]) => (
          <option key={key} value={key}>
            {key.toUpperCase()} ({value}px)
          </option>
        ))}
      </select>
    </div>
  );
};

export default FontSizeSelector;
