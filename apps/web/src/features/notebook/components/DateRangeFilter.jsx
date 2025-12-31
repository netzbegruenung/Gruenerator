import PropTypes from 'prop-types';
import { HiXMark } from 'react-icons/hi2';
import '../styles/notebook-filters.css';

const DateRangeFilter = ({
    label,
    min,
    max,
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
    onClear
}) => {
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

DateRangeFilter.propTypes = {
    label: PropTypes.string.isRequired,
    min: PropTypes.string,
    max: PropTypes.string,
    dateFrom: PropTypes.string,
    dateTo: PropTypes.string,
    onDateFromChange: PropTypes.func.isRequired,
    onDateToChange: PropTypes.func.isRequired,
    onClear: PropTypes.func
};

export default DateRangeFilter;
