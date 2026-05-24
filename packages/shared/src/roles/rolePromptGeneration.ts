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
