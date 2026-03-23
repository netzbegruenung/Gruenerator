import { config } from '../config.ts';

const MISTRAL_CHAT_URL = 'https://api.mistral.ai/v1/chat/completions';

interface SearchSource {
  index: number;
  title: string;
  url: string | null;
  excerpt: string;
  collection?: string;
  score: number;
}

interface SynthesisResult {
  answer: string;
  sources: SearchSource[];
  metadata: {
    responseTimeMs: number;
    model: string;
    sourcesUsed: number;
  };
}

const SYSTEM_PROMPT_DETAILED = `Du bist ein Experte für politische Dokumentenanalyse. Stütze dich dabei AUSSCHLIESSLICH auf die bereitgestellten Quellen.

## QUELLENTREUE:
- Verwende AUSSCHLIESSLICH Informationen aus den bereitgestellten Quellen.
- JEDE Faktenaussage MUSS mit mindestens einer Quellenangabe [n] belegt werden.
- Sätze OHNE Quellenangabe sind NUR für Einleitungen, Übergänge und Zusammenfassungen erlaubt.
- Falls die Quellen zu einem Aspekt der Frage KEINE Informationen enthalten: Sage dies offen, statt Informationen zu ergänzen.
- Erfinde KEINE Fakten, Zahlen oder Zusammenhänge, die nicht in den Quellen stehen.

## ZITATIONS-PROTOKOLL:
- Verwende eckige Klammern: [1], [2], [3]. Keine [0].
- Nur IDs aus der Quellenliste verwenden. Keine erfinden.
- Setze [n] NACH dem Satzzeichen: "...Aussage.[1]" NICHT "...Aussage[1]."
- Bei mehreren Quellen für eine Aussage: "statement.[1][3][5]"
- JEDE Faktenaussage braucht mindestens eine Quellenangabe.

## STIL:
- Schreibe in FLIESSTEXT mit Struktur, KEINE reinen Bullet-Listen.
- Erkläre auf Basis der Quellen, WARUM etwas wichtig ist.
- Bei Widersprüchen in Quellen: Benenne sie transparent.

## VERBOTEN:
- Informationen aus eigenem Wissen, die nicht in den Quellen belegt sind
- Faktenaussagen ohne Quellenangabe
- Code-Blöcke oder Backticks
- Finale "Quellen"-Sektion (wird separat angezeigt)`;

const SYSTEM_PROMPT_FAST = `Du bist ein Experte für politische Dokumentenanalyse. Beantworte die Frage AUSSCHLIESSLICH basierend auf den bereitgestellten Informationen. Füge KEINE Informationen aus eigenem Wissen hinzu.

- Antworte präzise und sachlich auf Deutsch.
- Fasse die wichtigsten Punkte zusammen.
- Keine Quellenangaben nötig.
- Keine Informationen, die nicht aus dem bereitgestellten Kontext stammen.`;

export async function synthesizeAnswer(
  question: string,
  searchResults: Array<{
    title: unknown;
    url: unknown;
    excerpt: string;
    score: number;
    collection?: string;
    sourceCollection?: string;
  }>,
  mode: 'detailed' | 'fast' = 'detailed'
): Promise<SynthesisResult> {
  if (!config.mistral?.apiKey) {
    throw new Error('MISTRAL_API_KEY nicht konfiguriert');
  }

  const startTime = Date.now();

  const sources: SearchSource[] = searchResults.map((r, i) => ({
    index: i + 1,
    title: String(r.title || 'Unbekannt'),
    url: (r.url as string) || null,
    excerpt: String(r.excerpt || ''),
    collection: (r.collection || (r.sourceCollection as string)) as string | undefined,
    score: r.score,
  }));

  const systemPrompt = mode === 'detailed' ? SYSTEM_PROMPT_DETAILED : SYSTEM_PROMPT_FAST;

  let userPrompt: string;
  if (mode === 'detailed') {
    const validIds = sources.map((s) => s.index).join(', ');
    const sourceList = sources
      .map((s) => {
        const tag = s.collection ? `[${s.collection}] ` : '';
        return `${s.index}. ${tag}${s.title} — "${s.excerpt}"`;
      })
      .join('\n');
    userPrompt = `Frage: ${question}\n\nGültige Quellen-IDs: ${validIds}\nVerwende AUSSCHLIESSLICH diese IDs für Quellenangaben.\n\nVerfügbare Quellen:\n${sourceList}`;
  } else {
    const context = sources
      .map((s) => {
        const tag = s.collection ? `[${s.collection}] ` : '';
        return `${tag}${s.title}: "${s.excerpt}"`;
      })
      .join('\n\n');
    userPrompt = `Frage: ${question}\n\nKontext:\n${context}`;
  }

  const response = await fetch(MISTRAL_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.mistral.apiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: mode === 'detailed' ? 2500 : 1500,
      temperature: mode === 'detailed' ? 0.2 : 0.3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mistral API Fehler: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const answer = data.choices?.[0]?.message?.content || '';
  const responseTimeMs = Date.now() - startTime;

  console.error(
    `[AnswerSynthesis] Generated ${mode} answer (${answer.length} chars, ${responseTimeMs}ms)`
  );

  return {
    answer,
    sources,
    metadata: {
      responseTimeMs,
      model: 'mistral-small-latest',
      sourcesUsed: sources.length,
    },
  };
}
