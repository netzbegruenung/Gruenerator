/**
 * Denkt Mistral Medium 3.5 über Cortecs — und wenn nein, wer verschluckt es?
 *
 * Ein erster Lauf am 21.08.2026 kam zu „nur `mistral-small-2603` liefert
 * `reasoning_content`". Das ist ein Befund über EINE Parameterform, nicht über
 * das Modell: Medium 3.5' Regler ist BINÄR (`['none','high']`, `low`/`medium`
 * antworten mit 400, siehe regoloReasoningStream.ts), und ein Router, der einen
 * unbekannten Parameter still fallen lässt, sieht von aussen genauso aus wie
 * ein Modell, das nicht denkt.
 *
 * Diese Probe trennt die beiden Fälle. Drei Dinge machen sie belastbar:
 *
 *  1. **Gegenprobe an der Mistral-API.** Dieselbe Anfrage direkt beim
 *     Hersteller. Erst der Vergleich sagt, ob der Parameter falsch ist oder
 *     unterwegs verloren geht. Ohne sie ist jedes „nein" eine Vermutung.
 *  2. **Vier Trageformen, nicht eine.** `reasoning_effort` ist die OpenAI-Form;
 *     Mistral kennt zusätzlich `prompt_mode`, und offene Gewichte werden über
 *     `chat_template_kwargs`/`think`/`enable_thinking` geschaltet. Ein Router
 *     reicht durch, was er kennt.
 *  3. **Vier Fundorte für das Denken.** `message.reasoning_content`,
 *     `message.reasoning`, `<think>`-Klammern IM Inhalt und
 *     `usage.completion_tokens_details.reasoning_tokens`. Der dritte Fall ist
 *     der heimtückische: das Denken kommt an, steht aber im Antworttext.
 *
 * Ein HTTP 400 ist hier ein POSITIVER Befund — er beweist, dass der Parameter
 * ankommt und bewertet wird. Still durchlaufen ist der verdächtige Fall.
 *
 * ── ERGEBNIS 21.08.2026 ──
 *
 * Mistral Medium 3.5 DENKT — Cortecs verschluckt nur die Bitte darum. Dieselbe
 * Anfrage, derselbe Moment, `reasoning_effort: 'high'`:
 *
 *                        Inhalt   Denken
 *   direkt bei Mistral        0   5529 Zeichen
 *   über Cortecs            152      0
 *
 * Dass verschluckt und nicht abgelehnt wird, zeigen die ungültigen Werte:
 * `low`/`medium` beantwortet Mistral mit einem präzisen 400 („supported values:
 * [high, none]"), über Cortecs kommt ein 200 mit normaler Antwort zurück. Der
 * Parameter wird für dieses Modell also gar nicht erst weitergereicht — falsche
 * Werte brechen nicht, richtige wirken nicht.
 *
 * Es ist KEIN globales Verhalten: `mistral-small-2603` bekommt sein Denken über
 * Cortecs sehr wohl (1183 Zeichen im Block, 673 gestreamt). Cortecs pflegt also
 * eine eigene Fähigkeitskarte je Modell, und die für Medium 3.5 ist falsch —
 * wobei der Katalog selbst `supported_features: ['json_mode','reasoning',
 * 'tools']` für genau dieses Modell ZUSAGT. Der Katalog ist keine Zusicherung,
 * dieselbe Lehre wie beim fail-open `allowed_providers`.
 *
 * Zwei Nebenbefunde, die eine Migration ohnehin bremsen:
 *   - `mistral-medium-2604`, die ID die unser Code an ~20 Stellen benennt, ist
 *     über Cortecs 404. Es gibt nur den Alias `mistral-medium-3.5`, und dass
 *     der dieselben Gewichte trägt, ist Cortecs' Wort, nicht Mistrals.
 *   - `magistral-medium-2509` existiert bei keinem von beiden („Invalid model"
 *     auch direkt) — die ID war geraten. UNGEMESSEN, kein Befund.
 *
 * Die vier Trageformen jenseits von `reasoning_effort` sind bei BEIDEN Wegen
 * gleich tot: `prompt_mode:'reasoning'` → 400 „not enabled for this model",
 * `chat_template_kwargs`/`think`/`enable_thinking` → 422 „Extra inputs are not
 * permitted". Das ist Mistrals Schema, kein Cortecs-Problem.
 *
 * Aufruf: npx tsx --env-file=../../.env scripts/probeCortecsReasoning.ts
 */

const CORTECS = 'https://api.cortecs.ai/v1/chat/completions';
const MISTRAL = 'https://api.mistral.ai/v1/chat/completions';

/** Braucht mehrere Schritte, ist aber kurz zu beantworten — so schlägt ein
 *  Denkblock deutlich zu Buche, ohne dass die Antwort das Budget frisst. */
const PROMPT =
  'Ein Gemeinderat hat 45 Mitglieder. Für einen Beschluss braucht es zwei Drittel ' +
  'der ANWESENDEN, mindestens aber die Mehrheit aller Mitglieder. Anwesend sind 33. ' +
  'Wie viele Ja-Stimmen sind nötig? Antworte mit einer Zahl und einem kurzen Satz.';

interface Variant {
  readonly name: string;
  readonly body: Record<string, unknown>;
}

const VARIANTS: readonly Variant[] = [
  { name: 'ohne Parameter', body: {} },
  // Der einzige Wert, den Medium 3.5 laut Hersteller neben 'none' annimmt.
  { name: "reasoning_effort:'high'", body: { reasoning_effort: 'high' } },
  // Erwartet 400 auf einem Modell, das den binären Regler wirklich prüft —
  // und genau deshalb aussagekräftig: ein 200 hier heisst „ignoriert".
  { name: "reasoning_effort:'low'", body: { reasoning_effort: 'low' } },
  { name: "reasoning_effort:'medium'", body: { reasoning_effort: 'medium' } },
  // Mistrals eigene Form, die es neben dem OpenAI-Feld führt.
  { name: "prompt_mode:'reasoning'", body: { prompt_mode: 'reasoning' } },
  { name: 'chat_template_kwargs', body: { chat_template_kwargs: { thinking: true } } },
  { name: 'think:true', body: { think: true } },
  { name: 'enable_thinking:true', body: { enable_thinking: true } },
];

/** Zusätzlich nur über Cortecs: den Vermittler auf den Hersteller festnageln. */
const PINNED: Variant = {
  name: "reasoning_effort:'high' + allowed_providers:['mistral']",
  body: { reasoning_effort: 'high', allowed_providers: ['mistral'] },
};

const MODELS = [
  // Der Katalog-Alias UND die ID, die unser Code wirklich benennt — dass beide
  // dasselbe bedienen, ist eine Annahme, keine Zusage.
  'mistral-medium-3.5',
  'mistral-medium-2604',
  'mistral-small-2603',
  // Nicht in Cortecs' Katalog. Läuft hier mit, weil die Gegenprobe zeigt, wie
  // eine ECHTE Denkantwort aussieht — ohne diesen Massstab ist jedes „kein
  // Denken" eine Behauptung über ein Format, das man nie gesehen hat.
  'magistral-medium-2509',
] as const;

interface Finding {
  status: number;
  upstream: string;
  content: number;
  reasoningField: number;
  thinkTags: number;
  reasoningTokens: number | null;
  error: string;
}

function readReasoning(
  json: Record<string, unknown>
): Omit<Finding, 'status' | 'upstream' | 'error'> {
  const choice = (json.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const msg = (choice?.message ?? {}) as Record<string, unknown>;
  // Mistrals eigene API antwortet im Denkmodus mit einer CHUNK-LISTE statt mit
  // einem String — `[{type:'thinking',thinking:[…]},{type:'text',text:'…'}]`.
  // Wer nur den String-Fall liest, misst dort „0 Zeichen Inhalt, 0 Zeichen
  // Denken" und hält ein funktionierendes Modell für stumm. Genau so kam der
  // erste Lauf am 21.08.2026 zu seinem falschen Nein.
  let content = '';
  let chunked = '';
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else if (Array.isArray(msg.content)) {
    for (const part of msg.content as Array<Record<string, unknown>>) {
      const kind = String(part.type ?? '');
      const payload = part[kind] ?? part.text ?? part.content;
      const flat = Array.isArray(payload)
        ? payload
            .map((x) =>
              typeof x === 'string' ? x : String((x as Record<string, unknown>)?.text ?? '')
            )
            .join('')
        : typeof payload === 'string'
          ? payload
          : '';
      if (kind === 'thinking' || kind === 'reasoning') chunked += flat;
      else content += flat;
    }
  }
  const field =
    (typeof msg.reasoning_content === 'string' && msg.reasoning_content) ||
    (typeof msg.reasoning === 'string' && msg.reasoning) ||
    chunked ||
    '';
  // Der heimtückische Fall: das Denken kommt an, steht aber im Antworttext.
  const tagged = content.match(/<think>([\s\S]*?)<\/think>/i);
  const usage = (json.usage ?? {}) as Record<string, unknown>;
  const details = (usage.completion_tokens_details ?? {}) as Record<string, unknown>;
  return {
    content: content.length,
    reasoningField: field.length,
    thinkTags: tagged ? tagged[1].length : 0,
    reasoningTokens: typeof details.reasoning_tokens === 'number' ? details.reasoning_tokens : null,
  };
}

async function probe(
  endpoint: string,
  key: string,
  model: string,
  variant: Variant
): Promise<Finding> {
  const empty = { content: 0, reasoningField: 0, thinkTags: 0, reasoningTokens: null };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: PROMPT }],
        max_tokens: 1500,
        // KEIN `temperature: 0`. Mistral lehnt den Denkmodus bei Greedy-Sampling
        // mit „top_p must be 1 when using greedy sampling" ab — ein Lauf mit
        // Temperatur 0 misst also die Probe, nicht das Modell.
        ...variant.body,
      }),
    });
    const upstream = res.headers.get('x-cortecs-provider') ?? '—';
    const text = await res.text();
    if (!res.ok) {
      let detail = text.slice(0, 160).replace(/\s+/g, ' ');
      try {
        const j = JSON.parse(text) as Record<string, unknown>;
        const m =
          (j.error as Record<string, unknown> | undefined)?.message ?? j.message ?? j.detail;
        if (m) detail = String(m).slice(0, 160).replace(/\s+/g, ' ');
      } catch {
        /* Rohtext reicht */
      }
      return { status: res.status, upstream, ...empty, error: detail };
    }
    return {
      status: res.status,
      upstream,
      ...readReasoning(JSON.parse(text) as Record<string, unknown>),
      error: '',
    };
  } catch (err) {
    // Transportfehler ist UNGEMESSEN, nicht „denkt nicht".
    return { status: 0, upstream: '—', ...empty, error: `TRANSPORT: ${String(err).slice(0, 120)}` };
  }
}

/** Streaming hat einen eigenen Kanal (`delta.reasoning_content`) — ein Router
 *  kann ihn getrennt vom Blockformat verlieren. */
async function probeStream(endpoint: string, key: string, model: string): Promise<string> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: PROMPT }],
      max_tokens: 1500,
      stream: true,
      reasoning_effort: 'high',
    }),
  });
  if (!res.ok) return `HTTP ${res.status} ${(await res.text()).slice(0, 100).replace(/\s+/g, ' ')}`;
  let text = 0;
  let reasoning = 0;
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try {
        const chunk = JSON.parse(line.slice(6)) as Record<string, unknown>;
        const delta = ((chunk.choices as Array<Record<string, unknown>>)?.[0]?.delta ??
          {}) as Record<string, unknown>;
        if (typeof delta.content === 'string') text += delta.content.length;
        else if (Array.isArray(delta.content)) {
          for (const part of delta.content as Array<Record<string, unknown>>) {
            const kind = String(part.type ?? '');
            const flat = String(part[kind] ?? part.text ?? '');
            if (kind === 'thinking' || kind === 'reasoning') reasoning += flat.length;
            else text += flat.length;
          }
        }
        if (typeof delta.reasoning_content === 'string')
          reasoning += delta.reasoning_content.length;
        if (typeof delta.reasoning === 'string') reasoning += delta.reasoning.length;
      } catch {
        /* Teilstück */
      }
    }
  }
  return `Inhalt ${text}, Denken ${reasoning}`;
}

function row(label: string, f: Finding): string {
  const pad = label.padEnd(46);
  if (f.status === 0) return `  ${pad} ${f.error}`;
  if (f.status !== 200) return `  ${pad} HTTP ${f.status} — ${f.error}`;
  const found =
    f.reasoningField > 0
      ? `Feld ${f.reasoningField}`
      : f.thinkTags > 0
        ? `<think> ${f.thinkTags}`
        : f.reasoningTokens
          ? `usage ${f.reasoningTokens} tok`
          : '—';
  return `  ${pad} Inhalt ${String(f.content).padStart(4)} | Denken ${found.padEnd(12)} | ${f.upstream}`;
}

async function main(): Promise<void> {
  const cortecsKey = process.env.CORTECS_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!cortecsKey) throw new Error('CORTECS_API_KEY fehlt');
  if (!mistralKey)
    console.warn(
      'MISTRAL_API_KEY fehlt — die Gegenprobe entfällt, der Lauf ist dann nicht schlüssig.'
    );

  for (const model of MODELS) {
    console.log(`\n═══ ${model} ═══`);
    console.log(' über Cortecs');
    for (const v of [...VARIANTS, PINNED]) {
      console.log(row(v.name, await probe(CORTECS, cortecsKey, model, v)));
    }
    console.log(
      `  ${'gestreamt, reasoning_effort:high'.padEnd(46)} ${await probeStream(CORTECS, cortecsKey, model)}`
    );

    if (!mistralKey) continue;
    console.log(' direkt bei Mistral (Gegenprobe)');
    for (const v of VARIANTS) {
      console.log(row(v.name, await probe(MISTRAL, mistralKey, model, v)));
    }
    console.log(
      `  ${'gestreamt, reasoning_effort:high'.padEnd(46)} ${await probeStream(MISTRAL, mistralKey, model)}`
    );
  }
}

void main();
