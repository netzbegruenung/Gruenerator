/**
 * Einen Antrag auf einer Antragsgrün-Seite einstellen, die der Grünerator für
 * die Person angelegt hat.
 *
 * Der Weg (am 16.11.2026 gegen Antragsgrün 4.18.1 gemessen):
 *
 * 1. Login des Grünerator-Kontos per Formular (`login` aus `createSite.ts`),
 * 2. JWT aus der Session: `GET <konsultation>/token`. Der REST-Login
 *    (`POST /rest/user/login`) geht auf einer neuen Seite nicht — sie steht im
 *    Wartungsmodus, und eine Anfrage ohne Token gilt dort nicht als Admin.
 *    Mit dem Token ist auch `apiEnabled` nicht nötig; die öffentliche API
 *    bleibt aus.
 * 3. `GET /rest/<konsultation>/motion-types` für die Abschnitte,
 * 4. `POST /rest/<konsultation>/motion` (snake_case), Antwort 201.
 *
 * Vorher prüft der Ablauf, dass das Grünerator-Konto und die Person noch Admin
 * der Seite sind (`requireAdmins`). Ist eines von beiden ausgetragen, legt der
 * Grünerator dort nichts mehr an — auch wenn die Seite eingeloggten Personen
 * Anträge erlaubt.
 */
import * as cheerio from 'cheerio';

import { markdownToHtml } from '../../markdown/MarkdownService.js';

import { agendaOf, findAgendaItem } from './agenda.js';
import { AntragsgruenFormError, FormClient } from './formClient.js';
import { login, requireAdmins, type HostingConfig } from './session.js';

export interface MotionRequest {
  /** Startseite der Konsultation, wie in `antragsgruen_hosted_sites.url`. */
  siteUrl: string;
  title: string;
  /** Antragstext als Markdown. */
  text: string;
  /** Begründung als Markdown, optional. */
  reason: string | null;
  /** `email` ist die Kontaktadresse, die Antragsgrün je Antragsteller*in verlangt (nur für Admins sichtbar). */
  initiator: { name: string; email: string; organization: string | null };
  /** Tagesordnungspunkt nach Code oder Titel, `null` = keiner. */
  agendaItem: string | null;
}

export interface CreatedMotion {
  id: number;
  url: string | null;
  status: string;
}

interface MotionTypeSection {
  id: number;
  type: string;
  title: string;
  required: string;
}

interface MotionType {
  id: number;
  sections: MotionTypeSection[];
}

/** `https://kv-x.antragsgruen.de/kv-x` → Ursprung und Konsultationspfad. */
export function splitSiteUrl(siteUrl: string): { origin: string; consultation: string } {
  const url = new URL(siteUrl);
  const consultation = url.pathname.split('/').filter(Boolean)[0];
  if (!consultation) throw new AntragsgruenFormError(`Keine Konsultation in ${siteUrl}`, 'site');
  return { origin: url.origin, consultation };
}

/** Klartext aus Antragsgrüns HTML-Statustitel — per Parser, nicht per Regex. */
function stripTags(html: string): string {
  return cheerio.load(html).text().trim();
}

async function restJson<T>(
  client: FormClient,
  url: string,
  token: string,
  body?: unknown
): Promise<{ status: number; body: T }> {
  const res = await client.request(url, {
    method: body === undefined ? 'GET' : 'POST',
    bearer: token,
    ...(body !== undefined && { json: { body } }),
  });
  try {
    return { status: res.status, body: JSON.parse(res.html) as T };
  } catch {
    throw new AntragsgruenFormError(`Keine JSON-Antwort (HTTP ${res.status})`, 'rest');
  }
}

/** Die Abschnitte eines Antrags: Titel, Antragstext, Begründung — erkannt am Typ, Text nach Titel. */
export function motionSections(
  type: MotionType,
  req: Pick<MotionRequest, 'title' | 'text' | 'reason'>
): { section_id: number; data: string }[] {
  const out: { section_id: number; data: string }[] = [];
  const texts = type.sections.filter((s) => s.type === 'TextSimple');
  const reason = texts.find((s) => /begr[üu]ndung/i.test(s.title));
  const body = texts.find((s) => s !== reason);
  for (const s of type.sections) {
    if (s.type === 'Title') out.push({ section_id: s.id, data: req.title });
    else if (s === body) out.push({ section_id: s.id, data: markdownToHtml(req.text) });
    else if (s === reason && req.reason)
      out.push({ section_id: s.id, data: markdownToHtml(req.reason) });
    else if (s.required === 'yes') {
      throw new AntragsgruenFormError(
        `Der Antragstyp verlangt den Abschnitt „${s.title}" (${s.type}), den der Grünerator nicht füllen kann`,
        'motion-type'
      );
    }
  }
  if (!body)
    throw new AntragsgruenFormError('Der Antragstyp hat keinen Antragstext', 'motion-type');
  return out;
}

/**
 * JWT aus der Session des Grünerator-Kontos und der Antragstyp der Seite.
 * Der REST-Login ginge im Wartungsmodus nicht (siehe Kopf).
 */
/** JWT aus der Session des Grünerator-Kontos (10 Minuten gültig, an die Seite gebunden). */
export async function tokenOf(
  client: FormClient,
  origin: string,
  consultation: string
): Promise<string> {
  const tokenPage = await client.request(`${origin}/${consultation}/token`);
  let token: string | undefined;
  try {
    token = (JSON.parse(tokenPage.html) as { token?: string }).token;
  } catch {
    token = undefined;
  }
  if (!token) throw new AntragsgruenFormError('Kein Token für die Seite', 'token');
  return token;
}

export async function motionTypeOf(
  client: FormClient,
  origin: string,
  consultation: string
): Promise<{ token: string; type: MotionType }> {
  const token = await tokenOf(client, origin, consultation);

  const types = await restJson<{ items?: MotionType[] }>(
    client,
    `${origin}/rest/${consultation}/motion-types`,
    token
  );
  const type = types.body.items?.[0];
  if (types.status !== 200 || !type) {
    throw new AntragsgruenFormError(`Keine Antragstypen (HTTP ${types.status})`, 'motion-type');
  }
  return { token, type };
}

export async function createMotionOnHostedSite(
  req: MotionRequest,
  config: HostingConfig,
  client: FormClient = new FormClient()
): Promise<CreatedMotion> {
  const { origin, consultation } = splitSiteUrl(req.siteUrl);
  await login(client, config);

  // Die Kontaktadresse ist die des Grünerator-Kontos der Person (`orderAntragsgruenMotion`).
  await requireAdmins(client, origin, consultation, req.initiator.email);

  const { token, type } = await motionTypeOf(client, origin, consultation);

  let agendaItemId: number | null = null;
  if (req.agendaItem) {
    const items = await agendaOf(client, origin, consultation);
    const hit = findAgendaItem(items, req.agendaItem);
    if (!hit) {
      const list = items.map((i) => `${i.code ? `${i.code} ` : ''}${i.title}`).join(', ');
      throw new AntragsgruenFormError(
        `Kein Tagesordnungspunkt „${req.agendaItem}"${list ? ` (vorhanden: ${list})` : ' — die Seite hat keine Tagesordnung'}`,
        'agenda-item'
      );
    }
    agendaItemId = hit.id;
  }

  const created = await restJson<{
    id?: number;
    url_html?: string | null;
    status_title?: string;
    message?: string;
    errors?: unknown;
  }>(client, `${origin}/rest/${consultation}/motion`, token, {
    motion_type_id: type.id,
    ...(agendaItemId !== null && { agenda_item_id: agendaItemId }),
    sections: motionSections(type, req),
    initiators: [
      {
        person_type: req.initiator.organization ? 'organization' : 'person',
        name: req.initiator.organization ?? req.initiator.name,
        contact_email: req.initiator.email,
        ...(req.initiator.organization && { contact_name: req.initiator.name }),
      },
    ],
  });
  if (created.status !== 201 || typeof created.body.id !== 'number') {
    const detail = created.body.message ?? JSON.stringify(created.body.errors ?? '');
    throw new AntragsgruenFormError(
      `Antrag abgelehnt (HTTP ${created.status}): ${detail}`,
      'create'
    );
  }
  return {
    id: created.body.id,
    url: created.body.url_html ?? null,
    status: stripTags(created.body.status_title ?? ''),
  };
}
