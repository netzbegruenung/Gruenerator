// Builds the combined system prompt from a user's roles. Pure function shared by
// web + mobile. Typed structurally (not against @gruenerator/chat's UserRole) to
// avoid a cross-package dependency — any object with these fields is accepted.

export interface RolePromptInput {
  rolle: string;
  gliederung?: string;
  bundesland?: string;
  abgeordnete?: string;
  instructions?: string;
}

/**
 * Markers that fence the role-derived part of `profiles.custom_prompt`. The
 * same field also holds the free-text "Anweisungen" the user types in the
 * Personalisierung tab, so the role block has to be replaceable in place
 * instead of overwriting everything. Frozen strings — they sit in stored user
 * data, so changing them orphans every existing block.
 */
export const ROLE_BLOCK_START = '<!-- gruenerator:rollen:start -->';
export const ROLE_BLOCK_END = '<!-- gruenerator:rollen:end -->';

export function generateProfilePrompt(roles: RolePromptInput[], isAustrian: boolean): string {
  if (roles.length === 0) return '';

  const partyName = isAustrian ? 'Die Grünen – Die Grüne Alternative' : 'Bündnis 90/Die Grünen';

  const roleLines = roles.map((r) => {
    const parts = [r.rolle];
    if (r.gliederung) parts.push(r.gliederung);
    if (r.bundesland) parts.push(r.bundesland);
    if (r.abgeordnete) parts.push(`(${r.abgeordnete})`);
    let line = `- ${parts.join(', ')}`;
    if (r.instructions) line += `\n  Hinweis: ${r.instructions}`;
    return line;
  });

  // Kein Schlusssatz mehr ("Passe deine Antworten an die jeweils relevante
  // Rolle an ..."): dieser Block landet bei JEDER Anfrage — Chat wie
  // Generator-Formulare — im Systemprompt, und beide Leser rahmen ihn bereits
  // mit genau dieser Anweisung ein (respondNode: "Befolge diese Profilangaben
  // bei allen Antworten — sie legen Ton und Kontext fest"). Was hier steht,
  // sind die Daten; die Anweisung darauf gehört an die Einbettungsstelle.
  return `Rollen bei ${partyName}:\n\n${roleLines.join('\n')}`;
}

/**
 * Die Beschreibung, aus der `/api/chat-service/generate-system-prompt` das
 * Rollenprofil erzeugt. Liegt hier, damit Anlegen und späteres Neu-Erzeugen
 * einer Rolle dieselbe Beschreibung schicken — sonst driftet ein neu erzeugtes
 * Profil gegen das ursprüngliche, ohne dass sich an der Rolle etwas geändert
 * hätte.
 */
export function buildRoleDescription(
  role: RolePromptInput,
  ebeneLabel: string,
  isAustrian: boolean
): string {
  const lines = [`Ebene: ${ebeneLabel}`, `Rolle: ${role.rolle}`];
  if (role.bundesland) lines.push(`Bundesland: ${role.bundesland}`);
  if (role.gliederung) lines.push(`${ebeneLabel}: ${role.gliederung}`);
  if (role.abgeordnete) lines.push(`Abgeordnete*r: ${role.abgeordnete}`);
  if (isAustrian) lines.push('Land: Österreich (Die Grünen – Die Grüne Alternative)');
  if (role.instructions) lines.push(`Zusätzliche Anweisungen: ${role.instructions}`);
  return lines.join('\n');
}

/**
 * Splice `roleBlock` into `existing` between the markers, leaving any free-text
 * the user wrote around it untouched. An empty `roleBlock` removes the fenced
 * section (last role deleted) without touching the rest.
 *
 * Not a plain string replace: the whole point is that saving a role must not
 * silently wipe the "Anweisungen" textarea, which writes the same column.
 */
export function mergeRoleBlock(existing: string | null | undefined, roleBlock: string): string {
  const current = existing ?? '';
  const fenced = roleBlock.trim()
    ? `${ROLE_BLOCK_START}\n${roleBlock.trim()}\n${ROLE_BLOCK_END}`
    : '';

  const start = current.indexOf(ROLE_BLOCK_START);
  const end = current.indexOf(ROLE_BLOCK_END);

  if (start !== -1 && end !== -1 && end > start) {
    const before = current.slice(0, start).trimEnd();
    const after = current.slice(end + ROLE_BLOCK_END.length).trimStart();
    return [before, fenced, after].filter(Boolean).join('\n\n');
  }

  // No block yet (or a half-written one we can't trust): append after the
  // free text, dropping any stray lone marker so we never nest fences.
  const cleaned = current
    .split('\n')
    .filter((line) => line.trim() !== ROLE_BLOCK_START && line.trim() !== ROLE_BLOCK_END)
    .join('\n')
    .trim();
  return [cleaned, fenced].filter(Boolean).join('\n\n');
}

/**
 * Drop the fence markers, keeping the role text between them. Call this on
 * every read that ends up in a model prompt: the markers are a storage detail
 * of `profiles.custom_prompt`, and the column is injected verbatim into the
 * system message. Left in, they reach the model as stray delimiters inside the
 * `<untrusted_content>` wrapper — where delimiters carry meaning.
 */
export function stripRoleMarkers(prompt: string | null | undefined): string {
  if (!prompt) return '';
  return prompt
    .split('\n')
    .filter((line) => line.trim() !== ROLE_BLOCK_START && line.trim() !== ROLE_BLOCK_END)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
