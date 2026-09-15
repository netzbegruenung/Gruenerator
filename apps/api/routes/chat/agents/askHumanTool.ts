/**
 * `ask_human` — die Rückfrage aus dem laufenden Loop (#3220).
 *
 * Das Tool wird nie wirklich ausgeführt: `wrapTools` fängt den Aufruf VOR
 * Karte, Schritt und Ausführung ab und hält ihn im `askHumanGate` — der Zug
 * pausiert und fragt die Nutzer*in (Suspend/Resume wie bei der
 * Werkzeug-Freigabe). `execute` ist der defensive Rest für den Fall, dass ein
 * Aufrufer am Wrapper vorbei greift (z. B. `createAfterGather` am ungewrappten
 * Katalog): dann passiert nichts Schlimmes, aber auch keine Frage.
 *
 * Der Name ist Vertrag: `ask_human` ist auf Web UND in ausgelieferten
 * Mobile-Binaries als interaktive Karte registriert (AskHumanToolUI /
 * AskHumanCard, `unstable_humanToolNames`), und der Client schickt die Antwort
 * als `{threadId, resume}` an /resume.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

export function makeAskHumanTool(): Tool {
  return tool({
    description: `Stellt der Nutzer*in GENAU EINE kurze Rückfrage und pausiert den Zug, bis sie antwortet.

NUTZE WENN dir eine echte Angabe fehlt, die du nicht selbst nachschlagen kannst — z.B. mehrere gleichwertige Kandidaten in einem Suchergebnis (welche Person? welche Abstimmung?) oder eine fehlende Pflichtangabe.
NICHT für Dinge, die ein Tool beantworten kann, und höchstens EINMAL pro Zug. Rufe ask_human als EINZIGES Tool des Schritts auf.`,
    inputSchema: z.object({
      question: z.string().min(1).max(500).describe('Die EINE konkrete Rückfrage an die Nutzer*in'),
      options: z
        .array(z.string().min(1).max(120))
        .min(2)
        .max(4)
        .optional()
        .describe('2–4 konkrete Antwortmöglichkeiten; Freitext ist immer zusätzlich möglich'),
    }),
    execute: async () => ({ error: 'ask_human wird nie direkt ausgeführt.' }),
  });
}
