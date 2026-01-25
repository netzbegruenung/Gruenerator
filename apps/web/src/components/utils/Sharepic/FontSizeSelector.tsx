import { FONT_SIZES } from '../../utils/constants';

import type { JSX } from 'react';

interface FontSizeSelectorProps {
  fontSize: string | number;
  handleFontSizeChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}

const FontSizeSelector = ({
  fontSize,
  handleFontSizeChange,
}: FontSizeSelectorProps): JSX.Element => {
  return (
    <div className="form-group">
      <label htmlFor="fontSize">Schriftgröße:</label>
      <select id="fontSize" name="fontSize" value={fontSize} onChange={handleFontSizeChange}>
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
