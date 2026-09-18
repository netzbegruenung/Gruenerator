/**
 * Der EINE Ort, an dem ein Rezept-Rumpf nachgeschlagen wird.
 *
 * Bis hierher taten das drei Stellen getrennt — der Einzeldurchlauf in
 * `respondNode`, der Loop über `recipeCatalog.resolveRecipe` und der
 * Social-Knoten — und sie sind dabei dreimal auseinandergelaufen:
 *   - #2930: der Einzelpfad faltete `presse-hessen-partei` auf `presse`, der
 *     Loop-Pfad nicht. EIN angelernter Presse-Stil schaltete damit die Vorgaben
 *     von zwanzig Landesverbands-Rezepten ab.
 *   - #2937: das Preset `antrag` hat kein Systemrezept, stand darum in keinem
 *     Katalog und war auf keinem Pfad erreichbar.
 *   - #2939: der Einzelpfad wies den Titel der Textform aus („Pressemitteilungen"),
 *     während das Modell den Rezepttext „PM Hessen (Partei)" vor sich hatte.
 *
 * Deshalb entscheidet diese Funktion alles, was an der Auswahl hängt, und die
 * Aufrufstellen lesen es nur noch ab:
 *
 *   - `replacesSystem` — der angelernte Stil ERSETZT den Rumpf des Systemrezepts,
 *     bleibt aber unter dessen Überschrift („## AKTIVE PLATTFORM: PM Hessen"),
 *     weil der Stil das Rezept nicht austauscht, sondern ausfüllt. Nur eine freie
 *     Mention ohne Systemrezept läuft unter ihrem eigenen Namen
 *     („## AKTIVE TEXTFORM: …").
 *   - `untrusted` — Nutzertext, der einen Systemprompt erreicht, ohne dass die
 *     Person ihn in DIESEM Turn getippt hat, ist eingefasst (`embedUntrusted`).
 *     Der Aufrufer muss ihn deshalb in seinem `hasUntrusted` mitzählen, damit
 *     die Regelhierarchie im Prompt landet. Der mitgelieferte Systemrumpf ist
 *     eine eigene Anweisung und wird NIE eingefasst.
 *
 * Der Rumpf geht ausschliesslich in den Systemprompt: er wird weder geloggt
 * noch gespeichert, und er ist kein Werkzeug-Ergebnis.
 */
import { type TextFormKind } from '@gruenerator/contracts';
import { hasSystemRecipe, SKILLS } from '@gruenerator/shared/agents';

import { deriveTextFormMention } from '../../agents/langgraph/ChatGraph/nodes/textFormMention.js';
import { embedUntrusted } from '../../routes/chat/services/untrustedContent.js';
import { createLogger } from '../../utils/logger.js';
import { getInternalSkillPrompt } from '../skills/internalPrompts.js';
import {
  getTextFormForInjection,
  getTextFormForInjectionById,
  type TextFormInjection,
} from '../user/textFormRepository.js';
import { type TextFormAccess } from '../user/textFormVisibility.js';

const log = createLogger('resolveRecipeBody');

export interface ResolvedRecipeBody {
  /** Die Zeile aus `user_text_forms`, oder `null` für einen Systemrumpf. */
  id: string | null;
  /**
   * Die kanonische Mention, unter der das Rezept läuft. Leer nur im Fall
   * „per id gepinnt, ohne Mention und ohne ableitbare Preset-Mention": dann
   * identifizieren `id` und `title` die Zeile.
   */
  mention: string;
  title: string;
  body: string;
  source: 'user' | 'system';
  /** Siehe Kopfkommentar: steuert die Überschrift der Aufrufstelle. */
  replacesSystem: boolean;
  /** Siehe Kopfkommentar: der Aufrufer zählt das in `hasUntrusted` mit. */
  untrusted: boolean;
  kind: TextFormKind | null;
  access: TextFormAccess | null;
}

/**
 * Die Preset-Mention IST der Texttyp (`textFormKind.ts`) — der einzige Weg, von
 * einer per id gepinnten Zeile ohne mitgegebene Mention auf ihren Schlüssel zu
 * kommen. `TextFormInjection` trägt die Mention selbst nicht.
 */
function presetMention(form: TextFormInjection): string | null {
  return form.kind === 'preset' ? form.textType : null;
}

/**
 * Ob dieser angelernte Stil den Rumpf eines mitgelieferten Rezepts ersetzt.
 *
 * Mit bekannter Mention ist das schlicht `hasSystemRecipe`. Ohne sie (id-Pfad
 * ohne Mention) antwortet die Zeile selbst: `kind: 'recipe'` entsteht laut
 * `resolveTextFormKind` ausschliesslich für Mentions mit Systemrezept, `custom`
 * ausschliesslich für solche ohne, und ein Preset hängt an seinem Texttyp
 * (`antrag` hat als einziges keinen Eintrag in `SKILLS`).
 */
function overridesSystemRecipe(form: TextFormInjection, mention: string): boolean {
  if (mention) return hasSystemRecipe(mention);
  if (form.kind === 'recipe') return true;
  const preset = presetMention(form);
  return preset !== null && hasSystemRecipe(preset);
}

function fromUserForm(form: TextFormInjection, mention: string): ResolvedRecipeBody {
  const skill = mention ? SKILLS.find((s) => s.mention === mention) : undefined;
  return {
    id: form.id,
    mention,
    // Gibt es ein Systemrezept, trägt die Überschrift dessen Titel — der Stil
    // ersetzt den Rezepttext, nicht das Rezept (#2939).
    title: skill?.title ?? form.title,
    body: embedUntrusted('nutzer_anweisung', form.styleBlock),
    source: 'user',
    replacesSystem: overridesSystemRecipe(form, mention),
    untrusted: true,
    kind: form.kind,
    access: form.access,
  };
}

/**
 * Rezept-Rumpf für Prompt-Bau. Reihenfolge:
 *
 * 1. `recipeId` (die gepinnte Zeile eines Agenten oder einer Auswahl im
 *    Composer) — eine Umbenennung der Mention tauscht das Rezept damit nicht
 *    still unter der Konfiguration aus.
 * 2. Der angelernte Stil zur Mention.
 * 3. Der mitgelieferte Rezepttext.
 *
 * Eine id, die die Person nicht (mehr) sehen darf, fällt auf 2./3. zurück statt
 * den Turn zu kippen: eine zurückgezogene Freigabe ist ein erwarteter Zustand,
 * kein Fehler.
 *
 * `null` heisst „es gibt keinen Rumpf" — namentlich, wenn `INTERN_CONTENT_DIR`
 * nie ausgerollt wurde. Im Einzeldurchlauf degradiert das still auf die
 * Basisrolle; als Werkzeug-Ergebnis MUSS der Aufrufer das als Fehlschlag
 * ausweisen, sonst meldet das Modell „Rezept geladen" und schreibt generisch.
 */
export async function resolveRecipeBody(params: {
  mention: string | null;
  recipeId?: string | null;
  userId: string | null;
}): Promise<ResolvedRecipeBody | null> {
  const { userId } = params;
  const mention = deriveTextFormMention(params.mention);
  const recipeId = params.recipeId ?? null;

  if (recipeId && userId) {
    const form = await getTextFormForInjectionById(recipeId, userId);
    if (form) return fromUserForm(form, mention ?? presetMention(form) ?? '');
    log.debug(
      `[Rezept] gepinnte id nicht sichtbar, faellt auf Mention zurueck id=${recipeId} mention=${mention ?? '-'}`
    );
  }

  if (userId && mention) {
    const form = await getTextFormForInjection(userId, mention);
    if (form) return fromUserForm(form, mention);
  }

  const skill = mention ? SKILLS.find((s) => s.mention === mention) : undefined;
  if (!skill) return null;
  const internal = getInternalSkillPrompt(skill.mention);
  if (!internal) return null;

  return {
    id: null,
    mention: skill.mention,
    title: skill.title,
    body: internal,
    source: 'system',
    replacesSystem: false,
    untrusted: false,
    kind: null,
    access: null,
  };
}
