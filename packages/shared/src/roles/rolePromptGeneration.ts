// Rollen wirken nur noch dort, wo eine Rolle auch tatsächlich gewählt ist: als
// Rollenprofil des „eigenen" Chats. Eine Liste der VERFÜGBAREN Rollen läuft
// nicht mehr in jedem Systemprompt mit — sie kostete bei jeder Anfrage (Chat
// wie Generator-Formulare) Kontext, ohne dass das Modell wissen konnte, welche
// der Rollen gerade gemeint ist. Dieses Modul baut deshalb nur noch die
// Beschreibung für die Profil-Erzeugung und räumt Altbestände aus der Spalte
// `profiles.custom_prompt`.

export interface RolePromptInput {
  rolle: string;
  gliederung?: string;
  bundesland?: string;
  abgeordnete?: string;
  instructions?: string;
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
 * Fassung des Meta-Prompts in `promptGeneratorController.ts`. Hochzählen, wenn
 * sich dort etwas ändert, das die erzeugten Rollenprofile betrifft: Rollen mit
 * älterer (oder fehlender) Fassung erzeugen ihr Profil beim nächsten Öffnen der
 * Einstellungen automatisch neu.
 *
 * Fassung 2 (03.08.2026): Auftrag in Fließtext statt Profil mit Stichpunkten,
 * höchstens 100 statt 600 Wörter — ohne Ton- und Werkzeugregeln, die die
 * Laufzeit ohnehin bei jedem Turn mitschickt.
 */
export const ROLE_PROMPT_VERSION = 2;

/** Rollen ohne Profil oder mit einem aus einer älteren Meta-Prompt-Fassung. */
export function needsRolePromptRefresh(role: { systemPrompt?: string; promptVersion?: number }) {
  return !role.systemPrompt || (role.promptVersion ?? 1) < ROLE_PROMPT_VERSION;
}

/**
 * Marker, die den früher aus den Rollen abgeleiteten Teil von
 * `profiles.custom_prompt` eingezäunt haben. Es schreibt sie niemand mehr —
 * sie stehen aber in gespeicherten Nutzerdaten, also bleiben die Strings
 * eingefroren, damit `stripRoleBlock` Altbestände noch findet.
 */
export const ROLE_BLOCK_START = '<!-- gruenerator:rollen:start -->';
export const ROLE_BLOCK_END = '<!-- gruenerator:rollen:end -->';

/**
 * Die Rollenprosa, die vor dem Markerformat die ganze Spalte belegte. Beide
 * Sätze sind wörtlich so erzeugt worden, sind also ein sicheres Erkennungs-
 * merkmal für maschinengeschriebenen Text — Freitext der Person trifft es
 * nicht.
 */
const LEGACY_ROLE_BLOCK_RE =
  /Du unterstützt eine\*n Mitarbeiter\*in von [^\n]*mit folgenden Rollen:[\s\S]*?Berücksichtige die Zuständigkeiten und die Ebene bei Stil, Detailtiefe und Zielgruppe\./g;

/**
 * Entfernt den gespeicherten Rollenblock samt Inhalt und lässt nur stehen, was
 * die Person selbst geschrieben hat.
 *
 * Auf jedem Lesepfad aufrufen, der in einem Modellprompt endet: die Spalte wird
 * wörtlich in die Systemnachricht gehängt. Ohne diesen Schnitt liefe die
 * Rollenliste bei Bestandsnutzer*innen weiter in jeder Anfrage mit — und die
 * Marker selbst wären Trennzeichen innerhalb der `<untrusted_content>`-Hülle,
 * wo Trennzeichen Bedeutung tragen.
 */
export function stripRoleBlock(prompt: string | null | undefined): string {
  if (!prompt) return '';

  let text = prompt;
  const start = text.indexOf(ROLE_BLOCK_START);
  const end = text.indexOf(ROLE_BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(0, start) + text.slice(end + ROLE_BLOCK_END.length);
  }

  return (
    text
      .replace(LEGACY_ROLE_BLOCK_RE, '')
      .split('\n')
      // Ein halb geschriebener Zaun (nur ein Marker) darf nicht als Text übrig
      // bleiben; der Inhalt daneben gehört der Person und bleibt stehen.
      .filter((line) => line.trim() !== ROLE_BLOCK_START && line.trim() !== ROLE_BLOCK_END)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
