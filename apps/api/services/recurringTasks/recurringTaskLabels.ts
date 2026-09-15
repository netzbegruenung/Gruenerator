/**
 * Menschenlesbare Etiketten für wiederkehrende Aufgaben — Takt und Zustellung.
 *
 * Zwei Verbraucher, deshalb kein Inline-Helfer: das `recurring_tasks`-Werkzeug
 * (Vorschauzeilen der Karte, Listenzeilen) und `confirmController.executeAction`
 * (die Bestätigungsmeldung nach dem Klick). `apps/web` hat sein eigenes
 * `describeRecurrence` in `scheduleState.ts`; das darf hier nicht importiert
 * werden, und die Wortwahl unterscheidet sich bewusst (Satz statt Listeneintrag).
 */
import type { RecurringTaskDelivery, ScheduleRecurrence } from '@gruenerator/contracts';

const WEEKDAY_LABELS_DE = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];

export const DELIVERY_LABELS_DE: Record<RecurringTaskDelivery, string> = {
  document: 'als Dokument',
  summary: 'als Benachrichtigung/E-Mail',
  thread: 'als neuer Chat',
};

export function describeRecurrence(rec: ScheduleRecurrence): string {
  const time = `${String(rec.hour).padStart(2, '0')}:${String(rec.minute).padStart(2, '0')} Uhr`;
  if (rec.frequency === 'daily') return `täglich um ${time}`;
  if (rec.frequency === 'weekly') {
    const days = (rec.byweekday ?? [])
      .map((d) => WEEKDAY_LABELS_DE[d] ?? '')
      .filter(Boolean)
      .join(', ');
    return days ? `wöchentlich (${days}) um ${time}` : `wöchentlich um ${time}`;
  }
  return rec.bymonthday ? `monatlich am ${rec.bymonthday}. um ${time}` : `monatlich um ${time}`;
}

/**
 * `toLocaleString` ohne `timeZone` nimmt die Zeitzone des SERVERS, und der
 * Container läuft in UTC. Gemessen: „um 09:00 Uhr" korrekt angelegt, in
 * derselben Nachricht als „Nächste Ausführung: 07:00" gemeldet — die Aufgabe
 * war richtig, die Bestätigung log. Wien und Berlin teilen sich CET/CEST, die
 * Wahl ändert also nur den Namen, nicht die Stunde; sie steht trotzdem am
 * Locale, weil eine österreichische Nutzerin keine deutsche Zeitzone genannt
 * bekommen soll, wenn das Feld einmal sichtbar wird.
 */
export function formatNextRun(iso: string, locale: string): string {
  const displayZone = locale === 'de-AT' ? 'Europe/Vienna' : 'Europe/Berlin';
  return new Date(iso).toLocaleString('de-DE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: displayZone,
  });
}
