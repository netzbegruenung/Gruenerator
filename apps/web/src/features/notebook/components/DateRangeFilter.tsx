import { HiXMark } from 'react-icons/hi2';
import '../styles/notebook-filters.css';

interface DateRangeFilterProps {
  label: string;
  min?: string;
  max?: string;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange: () => void;
  onDateToChange: () => void;
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
                    min={min}
                    max={dateTo || max}
                    value={dateFrom || ''}
                    onChange={(e) => onDateFromChange(e.target.value || null)}
                    aria-label="Von Datum"
                />
                <span className="notebook-date-filter-separator">bis</span>
                <input
                    type="date"
                    min={dateFrom || min}
                    max={max}
                    value={dateTo || ''}
                    onChange={(e) => onDateToChange(e.target.value || null)}
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
