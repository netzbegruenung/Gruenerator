/**
 * EXPERIMENTAL — presentational recurrence + delivery picker. Controlled via
 * `value`/`onChange` (a {@link ScheduleState}). Shared by the agent builder's
 * Zeitplan tab; mirrors the structured recurrence editor from the board
 * ScheduleDialog (frequency / time / weekday / month-day / timezone / delivery).
 */
import { type ScheduleFrequency, type RecurringTaskDelivery } from '@gruenerator/contracts';

import { DELIVERY_LABEL, TIMEZONES, WEEKDAYS, type ScheduleState } from './scheduleState';

const selectCls =
  'h-11 w-full rounded-sm border-0 bg-input-bg px-sm text-sm text-input-text outline-none transition-all focus-visible:ring-[3px] focus-visible:ring-ring/50';
const labelCls = 'flex flex-col gap-xs text-sm font-medium';

interface RecurrenceFieldsProps {
  value: ScheduleState;
  onChange: (next: ScheduleState) => void;
}

export function RecurrenceFields({ value, onChange }: RecurrenceFieldsProps) {
  const patch = (p: Partial<ScheduleState>) => onChange({ ...value, ...p });

  const time = `${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}`;
  const onTime = (t: string) => {
    const [h, m] = t.split(':').map((n) => parseInt(n, 10));
    patch({ hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 });
  };

  const toggleWeekday = (day: number) =>
    patch({
      byweekday: value.byweekday.includes(day)
        ? value.byweekday.filter((d) => d !== day)
        : [...value.byweekday, day].sort((a, b) => a - b),
    });

  return (
    <div className="flex flex-col gap-md">
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <label className={labelCls}>
          Häufigkeit
          <select
            className={selectCls}
            value={value.frequency}
            onChange={(e) => patch({ frequency: e.target.value as ScheduleFrequency })}
          >
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
          </select>
        </label>
        <label className={labelCls}>
          Uhrzeit
          <input
            type="time"
            className={selectCls}
            value={time}
            onChange={(e) => onTime(e.target.value)}
          />
        </label>
      </div>

      {value.frequency === 'weekly' && (
        <div className={labelCls}>
          Wochentage
          <div className="flex flex-wrap gap-xs">
            {WEEKDAYS.map((label, day) => {
              const active = value.byweekday.includes(day);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className={`h-9 w-10 rounded-md border text-xs font-medium transition-colors ${
                    active
                      ? 'border-primary-500 bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'border-grey-200 text-grey-500 dark:border-grey-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value.frequency === 'monthly' && (
        <label className={labelCls}>
          Tag im Monat
          <input
            type="number"
            min={1}
            max={31}
            className={selectCls}
            value={value.bymonthday}
            onChange={(e) =>
              patch({ bymonthday: Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)) })
            }
          />
        </label>
      )}

      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <label className={labelCls}>
          Zeitzone
          <select
            className={selectCls}
            value={value.timezone}
            onChange={(e) => patch({ timezone: e.target.value })}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelCls}>
          Lieferung
          <select
            className={selectCls}
            value={value.delivery}
            onChange={(e) => patch({ delivery: e.target.value as RecurringTaskDelivery })}
          >
            {(Object.keys(DELIVERY_LABEL) as RecurringTaskDelivery[]).map((d) => (
              <option key={d} value={d}>
                {DELIVERY_LABEL[d]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
