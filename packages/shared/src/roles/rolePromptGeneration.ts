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

  return `Du unterstützt eine*n Mitarbeiter*in von ${partyName} mit folgenden Rollen:\n\n${roleLines.join('\n')}\n\nPasse deine Antworten an die jeweils relevante Rolle an. Berücksichtige die Zuständigkeiten und die Ebene bei Stil, Detailtiefe und Zielgruppe.`;
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
