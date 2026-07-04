import { Calendar } from '@gruenerator/ui';

// Calendar is react-day-picker based and renders inline (no overlay).
// Props mirror DayPicker: mode (single|range), selected, defaultMonth.
// We localize weekday + caption labels via inline formatters so no locale
// package import is needed (previews are static).

const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const deFormatters = {
  formatCaption: (date: Date) => `${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
  formatWeekdayName: (date: Date) => WEEKDAYS[date.getDay()],
};

const JUNE_2026 = new Date(2026, 5, 1);

// Single-date selection — the canonical use (e.g. picking a Veranstaltungsdatum).
// Week starts Monday, as is standard in Germany.
export function SingleDate() {
  return (
    <Calendar
      mode="single"
      selected={new Date(2026, 5, 18)}
      defaultMonth={JUNE_2026}
      weekStartsOn={1}
      formatters={deFormatters}
    />
  );
}

// Date range — e.g. a Kampagnen-Zeitraum spanning several days.
export function DateRange() {
  return (
    <Calendar
      mode="range"
      selected={{ from: new Date(2026, 5, 8), to: new Date(2026, 5, 14) }}
      defaultMonth={JUNE_2026}
      weekStartsOn={1}
      formatters={deFormatters}
    />
  );
}
