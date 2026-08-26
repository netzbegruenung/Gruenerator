import { useId } from 'react';

import { SHARE_MODE_OPTIONS } from '../constants.js';
import { type ShareMode } from '../types.js';

interface ShareModeSelectProps {
  value: ShareMode;
  onChange: (mode: ShareMode) => void;
  disabled?: boolean;
}

export const ShareModeSelect = ({ value, onChange, disabled }: ShareModeSelectProps) => {
  // The label used to float free of the select, so the control reached screen
  // readers unnamed (WCAG 4.1.2) and the mode description was never announced
  // with it. `useId` rather than a fixed id because a page can hold more than
  // one share dialog, and duplicates would re-point the label.
  const selectId = useId();
  const descriptionId = `${selectId}-description`;

  return (
    <div>
      <label htmlFor={selectId} className="mb-1 block text-xs font-medium text-grey-500">
        Zugriffsmodus
      </label>
      <select
        id={selectId}
        aria-describedby={descriptionId}
        value={value}
        onChange={(e) => onChange(e.target.value as ShareMode)}
        disabled={disabled}
        className="w-full rounded-md border border-grey-200 bg-background px-2.5 py-2 text-sm outline-none focus:border-primary-500 dark:border-grey-700"
      >
        {SHARE_MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <p id={descriptionId} className="mt-1 text-xs text-grey-500 dark:text-grey-400">
        {SHARE_MODE_OPTIONS.find((o) => o.value === value)?.description}
      </p>
    </div>
  );
};
