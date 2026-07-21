/**
 * Judge rubrics — each builds a deterministic prompt over a turn from
 * last-run.json. The judge model returns strict JSON: {pass, reason}.
 * These check text-vs-evidence consistency, not taste; the evidence (citations,
 * tool calls, earlier answers) is embedded in the prompt.
 */
import { type TurnResult } from '../types.js';

export interface JudgePrompt {
  system: string;
  user: string;
}

export type RubricName =
  | 'groundedness'
  | 'narration_consistency'
  | 'known_answer'
  | 'german_quality'
  | 'parity';

const VERDICT_INSTRUCTION = `Antworte AUSSCHLIESSLICH mit einem JSON-Objekt: {"pass": true|false, "reason": "<ein Satz Begründung>"}. Kein anderer Text.`;

function fmtCitations(citations: unknown[]): string {
  return citations
    .map((c, i) => {
      const r = (c ?? {}) as Record<string, unknown>;
      const title = String(r.title ?? r.source ?? r.url ?? 'Quelle');
      const excerpt = String(r.excerpt ?? r.snippet ?? r.content ?? r.text ?? '').slice(0, 600);
      return `[${i + 1}] ${title}\n${excerpt}`;
    })
    .join('\n\n');
}

function fmtToolCalls(turn: TurnResult): string {
  if (turn.toolCalls.length === 0) return '(keine Tool-Aufrufe)';
  return turn.toolCalls
    .map((t) => `- ${t.toolName} → ${t.ok ? 'ok' : 'FEHLER'}${t.summary ? `: ${t.summary}` : ''}`)
    .join('\n');
}

export function buildRubricPrompt(
  rubric: RubricName,
  turn: TurnResult,
  opts: { facts?: string[]; category?: string; firstTurn?: TurnResult }
): JudgePrompt | null {
  switch (rubric) {
    case 'groundedness': {
      if (turn.citations.length === 0) return null;
      return {
        system: `Du prüfst, ob eine Antwort durch ihre nummerierten Quellen gedeckt ist. Für jede Aussage mit einer [N]-Markierung: Stützt der Auszug von Quelle N die Aussage tatsächlich? Eine Antwort besteht (pass=true), wenn keine [N]-Markierung eine Aussage stützt, die die Quelle nicht hergibt. ${VERDICT_INSTRUCTION}`,
        user: `ANTWORT:\n${turn.fullText}\n\nQUELLEN:\n${fmtCitations(turn.citations)}`,
      };
    }
    case 'narration_consistency': {
      const actions = [
        turn.editorOps ? 'Editor-Operationen wurden angewendet' : null,
        turn.sharepicUpdated ? 'Ein Sharepic wurde bearbeitet' : null,
        turn.artifactIds.length > 0 ? `Artefakte erstellt: ${turn.artifactIds.length}` : null,
      ].filter(Boolean);
      return {
        system: `Du prüfst, ob der Antworttext zu den tatsächlich ausgeführten Aktionen passt. pass=false, wenn der Text (a) Aktionen behauptet, die nicht stattfanden (z.B. "ich habe recherchiert" ohne Tool-Aufrufe), oder (b) Aktionen leugnet oder als unmöglich darstellt, die laut Protokoll stattfanden (z.B. "konnte ich nicht ändern" trotz angewendeter Änderung). ${VERDICT_INSTRUCTION}`,
        user: `TATSÄCHLICHE AKTIONEN:\n${fmtToolCalls(turn)}\n${actions.length > 0 ? actions.join('\n') : ''}\n\nANTWORTTEXT:\n${turn.fullText}`,
      };
    }
    case 'known_answer': {
      if (!opts.facts || opts.facts.length === 0) return null;
      return {
        system: `Du prüfst eine Antwort gegen bekannte Fakten. pass=false NUR, wenn die Antwort einem der Fakten widerspricht. Auslassungen sind erlaubt (pass=true). ${VERDICT_INSTRUCTION}`,
        user: `FAKTEN:\n${opts.facts.map((f) => `- ${f}`).join('\n')}\n\nANTWORT:\n${turn.fullText}`,
      };
    }
    case 'german_quality': {
      const atNote = opts.category?.includes('locale-at')
        ? ' Die Antwort richtet sich an ein österreichisches Publikum: Wo die Quellen österreichische Institutionen nennen, müssen die österreichischen Begriffe verwendet werden (Nationalrat, nicht Bundestag).'
        : '';
      return {
        system: `Du prüfst sprachliche Qualität. pass=false bei: englischen Satzfragmenten, Meta-Kommentaren über Prompts/Anweisungen, abgebrochenen Sätzen, Platzhaltern, oder unidiomatischem Deutsch.${atNote} ${VERDICT_INSTRUCTION}`,
        user: `ANTWORT:\n${turn.fullText}`,
      };
    }
    case 'parity': {
      if (!opts.firstTurn) return null;
      return {
        system: `Du vergleichst zwei Antworten auf inhaltlich dieselbe Frage — eine vom Gesprächsanfang, eine vom Gesprächsende. pass=false, wenn die spätere Antwort inhaltlich schlechter ist: widersprüchlich zur früheren, deutlich weniger substanziell, ungegroundet wo die frühere Quellen hatte, oder thematisch abgedriftet. ${VERDICT_INSTRUCTION}`,
        user: `FRÜHE ANTWORT (Turn ${opts.firstTurn.turnIndex}):\n${opts.firstTurn.fullText}\n\nSPÄTE ANTWORT (Turn ${turn.turnIndex}):\n${turn.fullText}`,
      };
    }
    default:
      return null;
  }
}
