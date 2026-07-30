/**
 * Draft a per-Landesverband press recipe (`presse-<lv>.md`) from that LV's own
 * press corpus.
 *
 * Authoring tool, not a runtime feature: it writes a DRAFT next to the existing
 * recipes, which a human reads against the corpus before committing. The point
 * is to reconstruct how a Landesverband actually writes — headline patterns,
 * lead formula, quote architecture, who is quoted with which verbatim role —
 * rather than to invent a plausible-sounding style guide.
 *
 * Pipeline:
 *   1. `extract-lv-pms.ts <lv>`  → documentation/docs/wissen/landesverbaende/_raw/<lv>-{landesverband,fraktion}.json
 *   2. `draft-lv-skill.ts <lv>`  → packages/shared/src/agents/skills/presse-<lv>.draft.md
 *   3. read, correct, rename to presse-<lv>.md
 *   4. `pnpm --filter @gruenerator/shared build:skills`
 *
 * Usage: NODE_OPTIONS=--conditions=development npx tsx apps/api/scripts/draft-lv-skill.ts hessen
 *
 * Model: Mistral Large, the codebase workhorse (mirrors extractRicardaLangStyle.ts).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { LANDESVERBAENDE } from '@gruenerator/shared/agents';
import * as dotenv from 'dotenv';

dotenv.config();

const { generateText } = await import('ai');
const { getModel } = await import('../services/ai/providers.js');

const RAW_DIR = resolve(process.cwd(), 'documentation/docs/wissen/landesverbaende/_raw');
const SKILLS_DIR = resolve(process.cwd(), 'packages/shared/src/agents/skills');
const MODEL = 'mistral-large-latest';

/**
 * Below this many distinct press releases the analysis is guesswork dressed as
 * observation. Same threshold `prAgentInsightService` uses for the same question.
 */
const MIN_SAMPLE = 8;
/** Per document, so a whole corpus still fits one context window. */
const CHARS_PER_DOC = 2500;

interface PmRecord {
  title: string;
  published_at: string | null;
  content: string;
  source_url: string | null;
  source_type: string | null;
}

const META_PROMPT = `Du bist Sprachanalystin für politische Pressearbeit. Du bekommst das echte Pressemitteilungs-Korpus EINES Landesverbands von BÜNDNIS 90/DIE GRÜNEN und rekonstruierst daraus dessen konkreten Schreibstil — so genau, dass jemand anders damit eine PM schreiben kann, die von einer echten nicht zu unterscheiden ist.

Du schreibst den **Fließtext-Teil einer Rezept-Datei**: Markdown, deutsch, ohne Frontmatter, ohne Überschrift der ersten Ebene. Beginne direkt mit der fett gesetzten Kopfzeile im Muster:

**PRESSEMITTEILUNG IM STIL DER GRÜNEN <LAND> (ca. X–Y Zeichen):**

Danach in genau dieser Reihenfolge, jeweils als fett gesetzter Absatz-Anfang:

**Headline-Muster:** Typische Länge in Zeichen, Aufbau (zweiteilig mit Doppelpunkt? Aussagesatz? Zitat in Anführungszeichen?), Anteil Angriff vs. deskriptiv, ob die eigene Marke oder die Gegner\\*innen im Titel stehen. Belege mit 3–4 echten Headlines aus dem Korpus, wortwörtlich in Backticks.

**Dachzeile:** Gibt es eine? Wenn ja, Muster und Beispiele; wenn nein, sag das klar.

**Lead-Formel:** Der Aufbau des ersten Satzes/Absatzes als Schema mit Platzhaltern, plus ein wortwörtliches Beispiel. Nenne die typische Länge.

**Zitat-Architektur:** Wie viele Zitate, wie lang, Attribution voran- oder nachgestellt, welche Attributionsverben in Häufigkeitsreihenfolge, ob indirekte Rede vorkommt.

**Zitatgeber\\*innen (Rollen verbatim verwenden):** Aufzählung der tatsächlich im Korpus zitierten Personen mit ihrer Rollenbezeichnung **exakt so, wie sie im Korpus steht**. Ergänze je Person, zu welchen Themen sie zitiert wird. NUR Personen, die wirklich im Korpus vorkommen.

**Antagonist\\*innen:** Wer wird angegriffen, mit welchen stehenden Frames und welcher Schärfe. Belege mit echten Formulierungen.

**Sprache & Vokabular:** Register (Sie/3. Person oder Du), Genderstern-Konsistenz, regionale Anker (Institutionen, Orte, Programme), wiederkehrende Formeln und Slogans — alles mit wortwörtlichen Belegen.

**Länge:** Gesamtzeichen (Spannweite und Schnitt), Absatzzahl, Zitatzahl.

**Beispiel-Suche (Pflicht):** Ein Absatz, der anweist, IMMER \`gruenerator_pressemitteilung_examples\` zu nutzen, dass die Treffer im LV-Agenten automatisch gefiltert sind, dass \`landesverband\` NICHT selbst als Argument gesetzt wird, und was genau nachgeahmt werden soll.

HARTE REGELN:
- Jede stilistische Behauptung muss aus dem Korpus belegbar sein. Erfinde KEINE Namen, KEINE Rollen, KEINE Slogans, KEINE Ortsbezüge. Wenn etwas im Korpus nicht vorkommt, schreibe es nicht.
- Zitierte Beispiele wortwörtlich aus dem Korpus, in Backticks.
- Wenn ein Muster uneinheitlich ist, beschreibe die Varianten mit ihrem ungefähren Anteil, statt dich auf eine festzulegen.
- Genderstern durchgehend (\\*innen). Kein Fließtext über deine Vorgehensweise, keine Einleitung, kein Fazit.
- Antworte NUR mit dem Markdown-Text.`;

function loadCorpus(lvId: string): PmRecord[] {
  const files = [`${lvId}-landesverband.json`, `${lvId}-fraktion.json`];
  const records: PmRecord[] = [];
  for (const file of files) {
    const path = resolve(RAW_DIR, file);
    if (!existsSync(path)) continue;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as PmRecord[];
    records.push(...parsed.filter((r) => r.content && r.content.trim().length > 200));
  }
  return records;
}

function renderCorpus(records: readonly PmRecord[]): string {
  return records
    .map((r, i) => {
      const meta = [r.published_at, r.source_type].filter(Boolean).join(' · ');
      return `### PM ${i + 1}${meta ? ` (${meta})` : ''}\nTitel: ${r.title}\n\n${r.content.slice(0, CHARS_PER_DOC)}`;
    })
    .join('\n\n---\n\n');
}

async function main(): Promise<void> {
  const lvId = process.argv[2];
  if (!lvId) {
    console.error('Usage: draft-lv-skill.ts <landesverband-id>');
    console.error(`Known: ${LANDESVERBAENDE.map((lv) => lv.id).join(', ')}`);
    process.exit(1);
  }

  const lv = LANDESVERBAENDE.find((entry) => entry.id === lvId);
  if (!lv) {
    console.error(`Unknown Landesverband "${lvId}".`);
    console.error(`Known: ${LANDESVERBAENDE.map((entry) => entry.id).join(', ')}`);
    process.exit(1);
  }

  const records = loadCorpus(lvId);
  console.log(`Corpus for ${lv.title}: ${records.length} press releases`);
  if (records.length < MIN_SAMPLE) {
    console.error(
      `Only ${records.length} usable PMs (need ${MIN_SAMPLE}). Run extract-lv-pms.ts ${lvId} first — ` +
        `and if that also comes up empty, this Landesverband has nothing indexed yet. ` +
        `A recipe written from too little is worse than no recipe: it reads as observed fact.`
    );
    process.exit(1);
  }

  const prompt = `Landesverband: BÜNDNIS 90/DIE GRÜNEN ${lv.title}
Regionale Schwerpunkte laut Registry: ${lv.themes}

Hier das vollständige Korpus (${records.length} Pressemitteilungen):

${renderCorpus(records)}`;

  console.log(`Analysing with ${MODEL} …`);
  const { text } = await generateText({
    model: getModel('mistral', MODEL),
    system: META_PROMPT,
    prompt,
    temperature: 0.3,
  });

  const outPath = resolve(SKILLS_DIR, `presse-${lvId}.draft.md`);
  writeFileSync(outPath, `${text.trim()}\n`, 'utf8');
  console.log(`\nWrote ${outPath} (${text.length} chars)`);
  console.log(
    'Read it against the corpus, add the frontmatter, rename to ' +
      `presse-${lvId}.md, then run: pnpm --filter @gruenerator/shared build:skills`
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
