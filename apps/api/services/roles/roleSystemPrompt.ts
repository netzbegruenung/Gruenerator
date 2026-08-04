/**
 * Setzt den Systemprompt eines Rollen-Chats aus einem parteiinternen Baustein
 * und dem Kontext der konkreten Rolle zusammen.
 *
 * Der Client schickt nur noch eine Referenz (Ebene + Bezeichnung), nie den
 * Text: der Baustein liegt im privaten Repo und darf den Server nicht
 * verlassen — dieselbe Grenze wie bei den Rezepten. Alles, was den Text
 * ausliefern würde (User-Defaults, Request-Body, Thread-Settings), trägt
 * deshalb nur die Referenz.
 *
 * Aufbau des Ergebnisses, bewusst dieselbe Form wie ein erzeugtes Rollenprofil:
 *
 *   <Baustein: Identität, Auftrag, Maßstab — generisch für die Rolle>
 *
 *   Dein Kontext: Kreisverband Köln, Nordrhein-Westfalen. Büro von X.
 *   Außerdem gilt: <eigene Anweisung der Person>
 *
 *   Schreibe auf Deutsch, in der Du-Form, mit Genderstern.
 *
 * Der Kontext steht bewusst NEBEN dem Baustein statt in ihm: sonst bräuchte
 * jede Datei im Privat-Repo Bedingungen für fehlende Felder ("im Kreisverband
 * {{gliederung}}", wenn keine Gliederung angegeben ist) — also eine
 * Template-Sprache. Prosa plus angehängter Kontext kommt ohne aus.
 */
import { AT_EBENEN, DE_EBENEN, type UserRole, roleBausteinKey } from '@gruenerator/shared/roles';

import { createLogger } from '../../utils/logger.js';
import { localizePlaceholders } from '../localization/index.js';
import { type Locale } from '../localization/types.js';
import { getInternalRolePrompt } from '../skills/internalPrompts.js';

const log = createLogger('roleSystemPrompt');

/** Die Referenz, die der Client statt des Prompttextes schickt. */
export interface RoleRef {
  ebene: string;
  rolle: string;
}

/** Schlusszeile: Register für die Pfade, die keinen Tool-Block anhängen. */
const REGISTER_LINE = 'Schreibe auf Deutsch, in der Du-Form, mit Genderstern.';

function buildContextLine(role: UserRole, ebeneLabel: string): string {
  const parts: string[] = [];
  if (role.gliederung) parts.push(`${ebeneLabel} ${role.gliederung}`);
  else if (ebeneLabel) parts.push(`Ebene ${ebeneLabel}`);
  if (role.bundesland) parts.push(role.bundesland);
  if (role.abgeordnete) parts.push(`Büro von ${role.abgeordnete}`);
  return parts.length > 0 ? `Dein Kontext: ${parts.join(', ')}.` : '';
}

/**
 * Der fertige Systemprompt zu einer Rolle, oder null, wenn es keinen Baustein
 * gibt (frei eingetippte Rolle) oder das Verzeichnis nie ausgerollt wurde.
 *
 * Null heißt: der Turn läuft mit dem Basis-Agenten weiter. Das ist die richtige
 * Degradierung — eine erfundene Ersatz-Persona wäre schlechter als gar keine.
 */
export function resolveRoleSystemPrompt(role: UserRole, locale: Locale): string | null {
  const ebenen = locale === 'de-AT' ? AT_EBENEN : DE_EBENEN;
  const ebeneLabel = ebenen.find((e) => e.id === role.ebene)?.label ?? '';
  const key = roleBausteinKey(role.ebene, role.rolle);
  if (!key) return null;

  const baustein = getInternalRolePrompt(key);
  if (!baustein) {
    log.warn(
      `Kein Baustein für Rolle "${role.rolle}" (Schlüssel ${key}) — der Rollen-Chat ` +
        'läuft mit dem Basis-Agenten. INTERN_CONTENT_DIR/rollen prüfen.'
    );
    return null;
  }

  const contextLine = buildContextLine(role, ebeneLabel);
  const ownInstruction = role.instructions?.trim()
    ? `Außerdem gilt: ${role.instructions.trim()}`
    : '';
  const context = [contextLine, ownInstruction].filter(Boolean).join('\n');

  return [localizePlaceholders(baustein, locale), context, REGISTER_LINE]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Die Rolle aus der gespeicherten Rollenliste, auf die eine Referenz zeigt.
 *
 * Gematcht wird über Ebene UND Bezeichnung: dieselbe Bezeichnung kommt auf
 * mehreren Ebenen vor („Presse & Social-Media" im Kreis- wie im Ortsverband),
 * die Ebene allein wäre ebenso mehrdeutig.
 */
export function findRole(roles: UserRole[], ref: RoleRef): UserRole | null {
  return roles.find((r) => r.ebene === ref.ebene && r.rolle === ref.rolle) ?? null;
}

/**
 * Der Systemprompt für eine aufgelöste Rolle, mit der richtigen Rangfolge.
 *
 * Katalogrollen bekommen den Baustein. Frei eingetippte Rollen haben keinen
 * (`resolveRoleSystemPrompt` → null) — dort bleibt der KI-generierte Prompt
 * maßgeblich: erst die gespeicherte Rolle (`role.systemPrompt`), sonst der
 * mit dem Request geschickte Text (Bestandsdaten, die den Text noch
 * mitschicken, oder ein Turn kurz nach dem Anlegen der Rolle, bevor sie
 * gespeichert ist).
 */
export function resolveCustomSystemPrompt(
  role: UserRole,
  locale: Locale,
  rawCustomSystemPrompt: string | null | undefined
): string | undefined {
  return (
    resolveRoleSystemPrompt(role, locale) ?? role.systemPrompt ?? rawCustomSystemPrompt ?? undefined
  );
}
