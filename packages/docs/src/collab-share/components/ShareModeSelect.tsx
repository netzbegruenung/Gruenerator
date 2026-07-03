import { SHARE_MODE_OPTIONS } from '../constants.js';
import { type ShareMode } from '../types.js';

interface ShareModeSelectProps {
  value: ShareMode;
  onChange: (mode: ShareMode) => void;
  disabled?: boolean;
}

export const ShareModeSelect = ({ value, onChange, disabled }: ShareModeSelectProps) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-grey-500">Zugriffsmodus</label>
    <select
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
    <p className="mt-1 text-xs text-grey-500 dark:text-grey-400">
      {SHARE_MODE_OPTIONS.find((o) => o.value === value)?.description}
    </p>
  </div>
);
