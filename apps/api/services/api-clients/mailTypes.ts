/** Was Gmail und Outlook gleich liefern: eine Zeile der Liste, eine Mail als Text. */
export interface MailMessageSummary {
  id: string;
  subject: string;
  from: string;
  /** ISO-Zeitpunkt; null, wenn der Anbieter keinen liefert. */
  receivedAt: string | null;
}

export interface MailMessageText {
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  date: string | null;
  body: string;
}
