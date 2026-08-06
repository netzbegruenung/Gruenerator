/**
 * Fehleraufstellung Chat-Artefakt-Erstellung — siehe CHAT-AGENTIC-BUGS.md für
 * Root-Cause-Details je Eintrag. Dokumentationsartefakt, nicht zur Laufzeit
 * konsumiert. Alle 4 sind in dieser PR behoben bzw. gemildert (#3).
 */
export interface KnownAgenticBug {
  id: number;
  title: string;
  file: string;
  status: 'fixed' | 'mitigated';
  symptom: string;
  fix: string;
}

export const KNOWN_AGENTIC_BUGS: readonly KnownAgenticBug[] = [
  {
    id: 1,
    title: 'Dedup-Guard blockiert create_board/boards_tasks fälschlich als Duplikat',
    file: 'apps/api/routes/chat/services/agenticLoop/wrapTools.ts:198,215-218',
    status: 'fixed',
    symptom:
      'Board-Folgeaufrufe im selben Turn werden als blockiert (near_duplicate) abgelehnt, weil personalDataTools keinen serverName tragen und skipNearDuplicate dadurch immer false ist.',
    fix: 'NEAR_DUPLICATE_EXEMPT_TOOLS (types.ts) — skipNearDuplicate berücksichtigt zusätzlich ein Tool-Set statt ausschließlich !!server.',
  },
  {
    id: 2,
    title: 'board_generation trifft die Modell-eigene Output-Grenze ohne Recovery',
    file: 'apps/api/services/ai/config.ts:81-101',
    status: 'fixed',
    symptom:
      'Ein 12-Karten-Board trifft mistral-medium-2604s 16384-Token-Ceiling und ein erzwungener Tool-Call ohne verwertbares Ergebnis (stop_reason=tool_use) lief in die generische Fehlermeldung statt in die Repair-Logik.',
    fix: 'generateStructured.ts erkennt diesen Fall jetzt zusätzlich (noToolDespiteForced) und behandelt ihn wie stop_reason=length — Repair-dann-Torso-Pfad statt generischer Fehler.',
  },
  {
    id: 3,
    title: 'GreenPT/gemma4 ignoriert think:false und läuft in Gateway-Timeout',
    file: 'apps/api/services/ai/greenptThinkingFetch.ts:31-34',
    status: 'mitigated',
    symptom:
      'doc_generation über greenpt/gemma4 scheitert nach 3 identischen Retries mit AI_APICallError: Gateway Timeout, weil gemma4 laut eigenem Code-Kommentar Reasoning-Flags ignoriert.',
    fix: 'execute.ts gibt greenpt nur noch 1 statt 2 Retries — erreicht die bestehende Provider-Fallback-Kette schneller. Die Wurzelursache (Output-Budget-Floor für die think-Lane) bleibt offen, im Code selbst als Follow-up benannt.',
  },
  {
    id: 4,
    title: 'Verworfener Agentic-Turn hat kein User-sichtbares Signal',
    file: 'apps/api/routes/chat/services/postResponseService.ts:477-491',
    status: 'fixed',
    symptom:
      'Ein fertig generierter Turn (27-247s Laufzeit, 102-463 Zeichen) wird verworfen, wenn die pending-Zeile vor dem Finalize gelöscht wurde — sichtbar nur als Server-Log-Warnung, nicht für die*den Nutzer*in.',
    fix: 'PersistOutcome.discarded + neuer turn_discarded-Warning-Code, verdrahtet an allen 3 Persist-Aufrufstellen. Kein Re-Insert der Zeile — das Verwerfen selbst bleibt by design.',
  },
];
