/**
 * Kennungen der Teams-Ordneransicht. Der Client kennt nur einen flachen
 * `folderId`/`fileId`; Teams hat aber drei Ebenen (Team → Kanal → Dateien in
 * der Bibliothek des Teams), und eine Datei braucht zwei Graph-Kennungen
 * (Bibliothek + Element). Kanal-IDs enthalten `:` und `@`, deshalb ist jedes
 * Teil base64url-kodiert und die Teile sind mit `.` getrennt.
 *
 * Die Kennung ist kein Geheimnis und keine Berechtigung: Graph prüft jeden
 * Zugriff mit dem Token der Person.
 */
export type TeamsRef =
  | { kind: 'team'; teamId: string }
  | { kind: 'channel'; teamId: string; channelId: string }
  | { kind: 'item'; driveId: string; itemId: string };

const enc = (part: string) => Buffer.from(part, 'utf8').toString('base64url');
const dec = (part: string) => Buffer.from(part, 'base64url').toString('utf8');

export function encodeTeamsRef(ref: TeamsRef): string {
  switch (ref.kind) {
    case 'team':
      return `team.${enc(ref.teamId)}`;
    case 'channel':
      return `channel.${enc(ref.teamId)}.${enc(ref.channelId)}`;
    case 'item':
      return `item.${enc(ref.driveId)}.${enc(ref.itemId)}`;
  }
}

const B64URL = /^[A-Za-z0-9_-]+$/;

/** `null` for anything that is not a well-formed Teams reference. */
export function decodeTeamsRef(id: string): TeamsRef | null {
  const [kind, ...parts] = id.split('.');
  if (parts.length === 0 || !parts.every((p) => B64URL.test(p))) return null;
  const values = parts.map(dec);
  if (values.some((v) => v.length === 0)) return null;
  if (kind === 'team' && values.length === 1) return { kind, teamId: values[0] };
  if (kind === 'channel' && values.length === 2) {
    return { kind, teamId: values[0], channelId: values[1] };
  }
  if (kind === 'item' && values.length === 2) {
    return { kind, driveId: values[0], itemId: values[1] };
  }
  return null;
}
