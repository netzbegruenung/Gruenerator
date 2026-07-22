/**
 * Pure date-serial helpers — leaf module with NO Univer imports, so tests can
 * import it without dragging react-dom into a node environment.
 */

/** ISO date (yyyy-mm-dd, optional time) that we convert to an Excel serial. */
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;

/**
 * ISO date string → Excel serial number (epoch 1899-12-30; 25569 = 1970-01-01).
 * Done deterministically in code because the model must NOT emit the serial
 * itself — it can't compute the epoch and hallucinates wrong values (e.g.
 * "2026-03-15" came back as 43167 = 2018-03-07). The value is stored numeric;
 * a separate set_number_format op renders it as a date.
 */
export function isoToExcelSerial(iso: string): number {
  const ms = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : `${iso}Z`);
  return ms / 86_400_000 + 25569;
}
