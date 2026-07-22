/**
 * Deterministic adversarial-case generator — expands template matrices that
 * target the regex edges where historical classifier bugs lived (greeting
 * prefixes, umlaut word boundaries, trigger nouns inside pasted material,
 * negated tool requests). Prints candidate JSONL to stdout for HUMAN REVIEW —
 * never wired into CI, never LLM-generated (LLM output drifts toward cases the
 * model finds easy; the real bugs are regex-shaped).
 *
 *   npx tsx evals/tools/generateAdversarial.ts > /tmp/candidates.jsonl
 *   # review, curate, append the keepers to evals/corpus/*.jsonl
 */

interface Candidate {
  id: string;
  prompt: string;
  category: string;
  expect: Record<string, unknown>;
}

const out: Candidate[] = [];
let n = 0;
function emit(category: string, prompt: string, expect: Record<string, unknown>): void {
  out.push({ id: `gen-${category}-${++n}`, prompt, category, expect });
}

// ── Matrix 1: greeting/prefix traps × factual question ─────────────────────
// Historical: `^hi` matched "Hier…", greeting fast-path returned direct@0.95.
const PREFIXES = [
  'Hier ist meine Frage:',
  'Hilfe brauche ich bei Folgendem:',
  'Hallo zusammen,',
  'Moin,',
  'Hi, kurze Frage:',
  'Servus!',
];
const QUESTIONS = [
  'Wie steht die Partei zur Vermögensteuer?',
  'Was fordern die Grünen zur Kindergrundsicherung?',
  'Wie hat die SPD zum Heizungsgesetz abgestimmt?',
];
for (const p of PREFIXES) {
  for (const q of QUESTIONS) {
    emit('greeting-trap', `${p} ${q}`, { routingNot: ['direct'], noCapabilityRefusal: true });
  }
}

// ── Matrix 2: umlaut-initial verbs (ASCII \b broke these) ──────────────────
const UMLAUT_VERBS = ['Äußerte sich', 'Übernimmt', 'Öffnet', 'Ändert', 'Überzeugt'];
const UMLAUT_TAILS = [
  'die Bundesregierung beim Klimageld etwas?',
  'der Bund die Kosten der Ganztagsbetreuung?',
  'die Reform der Netzentgelte den Strommarkt?',
];
for (const v of UMLAUT_VERBS) {
  for (const t of UMLAUT_TAILS) {
    emit('umlaut-verbfirst', `${v} ${t}`, { routingNot: ['direct'] });
  }
}

// ── Matrix 3: trigger nouns inside neutral context (pasted-material shape) ─
const TRIGGER_NOUNS = ['Sharepic', 'Bild', 'Formular', 'Tabelle', 'Präsentation', 'Diagramm'];
const NEUTRAL_FRAMES = [
  (noun: string) =>
    `In unserem letzten Newsletter kam das ${noun} gut an. Was sollten wir beim nächsten Mal inhaltlich verbessern?`,
  (noun: string) =>
    `Die AG Öffentlichkeitsarbeit diskutiert, ob ein ${noun} das richtige Format ist. Welche Kriterien sprechen dafür oder dagegen?`,
  (noun: string) =>
    `Ein Mitglied fragte, wer das ${noun} vom Sommerfest erstellt hat. Wie organisieren andere Ortsverbände sowas?`,
];
const NOUN_TO_TOOL: Record<string, string[]> = {
  Sharepic: ['sharepic'],
  Bild: ['generate_image'],
  Formular: [],
  Tabelle: ['create_sheet'],
  Präsentation: ['create_presentation'],
  Diagramm: [],
};
for (const noun of TRIGGER_NOUNS) {
  for (const frame of NEUTRAL_FRAMES) {
    emit('noun-in-context', frame(noun), {
      ...(NOUN_TO_TOOL[noun].length > 0 ? { toolsMustNotInclude: NOUN_TO_TOOL[noun] } : {}),
      routingNot: ['sharepic', 'image', 'create_sheet', 'create_presentation'],
    });
  }
}

// ── Matrix 4: negated tool requests ────────────────────────────────────────
const NEGATIONS = ['KEIN', 'bitte kein', 'ausdrücklich ohne'];
const NEGATED = [
  { noun: 'Sharepic', tools: ['sharepic'], not: ['sharepic'] },
  { noun: 'Bild', tools: ['generate_image'], not: ['image'] },
];
for (const neg of NEGATIONS) {
  for (const { noun, tools, not } of NEGATED) {
    emit(
      'negated-tool',
      `Ich möchte ${neg} ${noun} — nur eine kurze Text-Zusammenfassung der Argumente für die Mietpreisbremse.`,
      { toolsMustNotInclude: tools, routingNot: not }
    );
  }
}

for (const c of out) console.log(JSON.stringify(c));
console.error(`\n${out.length} candidates — review before committing; dedupe against corpus/.`);
