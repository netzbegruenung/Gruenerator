import { HiXMark } from 'react-icons/hi2';
import type { JSX } from 'react';
import '../styles/notebook-filters.css';

interface DateRangeFilterProps {
  label: string;
  min?: unknown;
  max?: unknown;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange: (value: string | null) => void;
  onDateToChange: (value: string | null) => void;
  onClear?: () => void;
}

const DateRangeFilter = ({ label,
    min,
    max,
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
    onClear }: DateRangeFilterProps): JSX.Element => {
    const hasValue = dateFrom || dateTo;

    return (
        <div className="notebook-date-filter">
            <span className="notebook-date-filter-label">{label}</span>
            <div className="notebook-date-filter-inputs">
                <input
                    type="date"
                    min={min as string}
                    max={dateTo || (max as string)}
                    value={dateFrom || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDateFromChange(e.target.value || null)}
                    aria-label="Von Datum"
                />
                <span className="notebook-date-filter-separator">bis</span>
                <input
                    type="date"
                    min={dateFrom || (min as string)}
                    max={max as string}
                    value={dateTo || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDateToChange(e.target.value || null)}
                    aria-label="Bis Datum"
                />
                {hasValue && onClear && (
                    <button
                        type="button"
                        className="notebook-date-filter-clear"
                        onClick={onClear}
                        aria-label="Datumsfilter löschen"
                    >
                        <HiXMark />
                    </button>
                )}
            </div>
        </div>
    );
};

export default DateRangeFilter;
