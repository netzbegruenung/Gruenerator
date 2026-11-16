/**
 * Die Tagesordnung einer Antragsgrün-Seite, die der Grünerator angelegt hat.
 *
 * `POST <konsultation>/rest/…/agenda` (Admin-Controller `admin/agenda/rest-index`)
 * ersetzt die GANZE Liste — fehlende Punkte werden gelöscht (`AgendaSaver::
 * removeOldAgendaItems`). Der Endpunkt hängt nicht an `RestBase`: er will die
 * Session und das CSRF-Token im Kopf `X-CSRF-Token`, ein Bearer-Token reicht
 * nicht (gemessen 16.11.2026, sonst HTTP 400).
 */
import { AntragsgruenFormError, csrfOf, type FormClient } from './formClient.js';

export interface AgendaEntry {
  /** z. B. „1." oder „TOP 3"; `null` = Antragsgrün nummeriert selbst. */
  code: string | null;
  title: string;
  /** Uhrzeit „HH:MM" oder `null`. */
  time: string | null;
  /** Ob unter diesem Punkt Anträge eingereicht werden können. */
  motions: boolean;
}

export interface AgendaItemRef {
  id: number;
  code: string | null;
  title: string;
}

interface ApiAgendaItem {
  id?: number;
  code?: string | null;
  title?: string;
  children?: ApiAgendaItem[];
}

const TIME_RE = /^\d{1,2}:\d{2}$/;
/** `ConsultationAgendaItem::CODE_AUTO`: Antragsgrün nummeriert selbst, den Code sieht niemand. */
const AUTO_CODE = '#';

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/^top\s*/, '')
    .replace(/[.\s]+$/, '')
    .trim();

export function agendaBody(
  entries: readonly AgendaEntry[],
  motionTypeId: number,
  existing: readonly AgendaItemRef[] = []
) {
  const taken = new Set<number>();
  const keptId = (e: AgendaEntry): number | null => {
    const free = existing.filter((x) => !taken.has(x.id));
    const hit =
      (e.code !== null
        ? free.find((x) => x.code !== null && norm(x.code) === norm(e.code ?? ''))
        : undefined) ?? free.find((x) => norm(x.title) === norm(e.title));
    if (!hit) return null;
    taken.add(hit.id);
    return hit.id;
  };
  return {
    items: entries.map((e) => {
      const id = keptId(e);
      return {
        ...(id !== null && { id }),
        type: 'item',
        code: e.code,
        title: e.title,
        time: e.time && TIME_RE.test(e.time) ? e.time : null,
        settings: {
          has_speaking_list: false,
          in_proposed_procedures: true,
          motion_types: e.motions ? [motionTypeId] : [],
        },
        children: [],
      };
    }),
  };
}

function flatten(items: readonly ApiAgendaItem[]): AgendaItemRef[] {
  return items.flatMap((i) => [
    ...(typeof i.id === 'number'
      ? [{ id: i.id, code: i.code && i.code !== AUTO_CODE ? i.code : null, title: i.title ?? '' }]
      : []),
    ...flatten(i.children ?? []),
  ]);
}

/** Setzt die Tagesordnung (ersetzt die vorhandene) und gibt die angelegten Punkte zurück. */
export async function setAgenda(
  client: FormClient,
  origin: string,
  consultation: string,
  entries: readonly AgendaEntry[],
  motionTypeId: number,
  existing: readonly AgendaItemRef[] = []
): Promise<AgendaItemRef[]> {
  const page = await client.request(`${origin}/${consultation}/admin/agenda`);
  const csrf = csrfOf(page.html);
  if (!csrf)
    throw new AntragsgruenFormError('Kein CSRF-Token auf der Tagesordnungs-Seite', 'agenda');
  const res = await client.request(`${origin}/rest/${consultation}/agenda`, {
    method: 'POST',
    json: { csrf, body: agendaBody(entries, motionTypeId, existing) },
  });
  let items: ApiAgendaItem[] | undefined;
  try {
    items = (JSON.parse(res.html) as { items?: ApiAgendaItem[] }).items;
  } catch {
    items = undefined;
  }
  if (res.status !== 200 || !items) {
    throw new AntragsgruenFormError(
      `Tagesordnung nicht gespeichert (HTTP ${res.status})`,
      'agenda'
    );
  }
  return flatten(items);
}

export async function agendaOf(
  client: FormClient,
  origin: string,
  consultation: string
): Promise<AgendaItemRef[]> {
  const res = await client.request(`${origin}/rest/${consultation}/agenda`);
  try {
    return flatten((JSON.parse(res.html) as { items?: ApiAgendaItem[] }).items ?? []);
  } catch {
    throw new AntragsgruenFormError(`Tagesordnung nicht lesbar (HTTP ${res.status})`, 'agenda');
  }
}

/** Ein Tagesordnungspunkt nach Code („2", „TOP 2", „2.") oder Titel (Teilwort). */
export function findAgendaItem(
  items: readonly AgendaItemRef[],
  wanted: string
): AgendaItemRef | null {
  const w = norm(wanted);
  if (!w) return null;
  const byCode = items.find((i) => i.code !== null && norm(i.code) === w);
  if (byCode) return byCode;
  // Selbst nummerierte Punkte zeigt Antragsgrün als 1., 2., … — eine Zahl ist dann die Position.
  if (/^\d+$/.test(w) && items.every((i) => i.code === null)) {
    return items[Number(w) - 1] ?? null;
  }
  return (
    items.find((i) => norm(i.title) === w) ??
    items.find((i) => i.title.toLowerCase().includes(wanted.trim().toLowerCase())) ??
    null
  );
}
