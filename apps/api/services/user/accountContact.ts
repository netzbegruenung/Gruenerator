/**
 * Name und E-Mail-Adresse des Kontos, wenn ein fremder Dienst der Person
 * selbst etwas zuschicken soll (Antragsgrün: Zugangsdaten, nuudel: Admin-Link).
 *
 * Immer die Adresse des Kontos, nie eine aus dem Chat — sonst schickte ein
 * fremder Dienst auf Zuruf Mails an beliebige Dritte.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

export interface AccountContact {
  email: string;
  nameGiven: string;
  nameFamily: string;
}

const DELIVERABLE_EMAIL_RE = /^[^@\s]+@[^@\s:]+\.[a-z]{2,}$/i;

/**
 * `null`, wenn das Konto keine zustellbare Adresse hat: eine Adresse wie
 * `dev@localhost:3001` legte bei Antragsgrün ein Konto an, dessen Zugangsdaten
 * nie ankommen.
 */
export async function deliverableContactOf(userId: string): Promise<AccountContact | null> {
  const rows = (await getPostgresInstance().query(
    `SELECT email, first_name, last_name, display_name FROM profiles WHERE id = $1`,
    [userId]
  )) as {
    email: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
  }[];
  const p = rows[0];
  if (!p?.email || !DELIVERABLE_EMAIL_RE.test(p.email)) return null;
  const [given, ...family] = (p.display_name ?? '').trim().split(/\s+/);
  return {
    email: p.email,
    nameGiven: p.first_name?.trim() || given || '',
    nameFamily: p.last_name?.trim() || family.join(' '),
  };
}
