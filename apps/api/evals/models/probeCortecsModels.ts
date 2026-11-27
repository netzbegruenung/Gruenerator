/**
 * Sonde für neue Cortecs-Modelle, bevor eines in `AI_LANES` landet.
 * Spricht die OpenAI-kompatible API direkt an, nicht die Fassade: gemessen wird
 * das Modell beim Anbieter, nicht unser Routing.
 *
 *   pnpm eval:cortecs basics nemotron-3.5-super-vl inkling-2-small
 *   EVAL_IMAGE=./shot.png pnpm eval:cortecs basics <modell…>   # mit Vision-Probe
 *   pnpm eval:cortecs needle <modell> 100000 400000 900000      # Zielgröße in Tokens
 *
 * `basics`: Insta-Post (gestreamt, Zeit bis zum ersten Token), Werkzeugaufruf,
 * `response_format: json_object`, optional ein Bild.
 * `needle`: ein Fakt in der Mitte eines langen Textes aus `documentation/`.
 * Die Zielgröße ist eine Schätzung (3 Zeichen je Token); die echte Zahl steht
 * in `prompt_tokens` der Antwort.
 *
 * Falle: Über dem tatsächlichen Fenster nimmt Cortecs die Anfrage an, rechnet
 * sie voll ab und kürzt `max_tokens` auf den Rest — die Antwort ist dann leer
 * mit `finish_reason: length`. Deshalb wird `finish_reason` immer ausgegeben.
 * Ergebnisse: `results-2026-11-27.md`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const URL = 'https://api.cortecs.ai/v1/chat/completions';
const KEY = process.env.CORTECS_API_KEY;
if (!KEY) throw new Error('CORTECS_API_KEY fehlt');

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: number;
}
interface Message {
  content: string | null;
  tool_calls?: { function: { name: string; arguments: string } }[];
}
interface Completion {
  choices: { message: Message; finish_reason: string }[];
  usage?: Usage;
}

async function complete(
  model: string,
  body: Record<string, unknown>,
  timeoutMs = 900_000
): Promise<{ r: Completion; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, ...body }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { r: (await res.json()) as Completion, ms: Date.now() - t0 };
}

async function streamed(model: string, prompt: string) {
  const t0 = Date.now();
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  let ttft: number | null = null;
  let text = '';
  let usage: Usage | null = null;
  let buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk as Uint8Array, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data:') || line.includes('[DONE]')) continue;
      const d = JSON.parse(line.slice(5)) as {
        usage?: Usage;
        choices?: { delta: Record<string, string | null> }[];
      };
      if (d.usage) usage = d.usage;
      for (const c of d.choices ?? []) {
        const piece = c.delta.content ?? c.delta.reasoning_content ?? c.delta.reasoning;
        if (piece && ttft === null) ttft = Date.now() - t0;
        text += c.delta.content ?? '';
      }
    }
  }
  return { text, ttft, ms: Date.now() - t0, usage };
}

async function basics(model: string): Promise<void> {
  console.log(`\n=== ${model}`);
  const post = await streamed(
    model,
    'Schreibe einen Instagram-Post (max. 80 Wörter) für die Grünen zum Ausbau von Radwegen in der Stadt. Deutsch, Du-Form, 2 Hashtags.'
  );
  console.log(
    `[text] ${post.ms} ms, erstes Token ${post.ttft} ms, reasoning ${post.usage?.completion_tokens_details?.reasoning_tokens}/${post.usage?.completion_tokens}, cost ${post.usage?.cost}\n${post.text}`
  );

  const tool = await complete(model, {
    max_tokens: 1500,
    tool_choice: 'auto',
    tools: [
      {
        type: 'function',
        function: {
          name: 'websuche',
          description: 'Sucht im Web',
          parameters: {
            type: 'object',
            properties: { query: { type: 'string' }, max_results: { type: 'integer' } },
            required: ['query'],
          },
        },
      },
    ],
    messages: [
      {
        role: 'user',
        content: 'Was hat der Bundestag diese Woche zum Klimageld beschlossen? Nutze die Websuche.',
      },
    ],
  });
  const call = tool.r.choices[0]?.message.tool_calls?.[0]?.function;
  console.log(`[tool] ${tool.ms} ms ${call ? `${call.name}(${call.arguments})` : 'KEIN AUFRUF'}`);

  const json = await complete(model, {
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content:
          'Extrahiere als JSON {"personen":[...],"orte":[...]} aus: "Annalena Baerbock traf in Wien Werner Kogler und flog dann nach Brüssel." Nur JSON.',
      },
    ],
  });
  const raw = json.r.choices[0]?.message.content ?? '';
  let valid = true;
  try {
    JSON.parse(raw);
  } catch {
    valid = false;
  }
  console.log(`[json] ${json.ms} ms ${valid ? 'gültig' : 'UNGÜLTIG'}: ${raw.slice(0, 200)}`);

  const imagePath = process.env.EVAL_IMAGE;
  if (imagePath) {
    const b64 = readFileSync(imagePath).toString('base64');
    const vision = await complete(model, {
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Beschreibe das Bild in 2 Sätzen auf Deutsch. Lies ggf. sichtbaren Text vor.',
            },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } },
          ],
        },
      ],
    });
    console.log(
      `[vision] ${vision.ms} ms ${(vision.r.choices[0]?.message.content ?? '').slice(0, 400)}`
    );
  }
}

function markdownUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'intern') return [];
    if (statSync(p).isDirectory()) return markdownUnder(p);
    return name.endsWith('.md') ? [p] : [];
  });
}

const NEEDLE =
  '\n\nWICHTIGE NOTIZ: Der geheime Codename des Ortsverbands Kleinmachnow lautet "Blaue Libelle 7342".\n\n';

async function needle(model: string, targetTokens: number): Promise<void> {
  const root = resolve(import.meta.dirname, '../../../../documentation');
  let hay = markdownUnder(root)
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n');
  const chars = targetTokens * 3;
  while (hay.length < chars) hay += hay;
  hay = hay.slice(0, chars);
  const mid = Math.floor(hay.length / 2);
  const doc = hay.slice(0, mid) + NEEDLE + hay.slice(mid);
  try {
    const { r, ms } = await complete(model, {
      max_tokens: 16_000,
      messages: [
        {
          role: 'user',
          content: `${doc}\n\n---\nFrage: Wie lautet der geheime Codename des Ortsverbands Kleinmachnow? Antworte nur mit dem Codenamen.`,
        },
      ],
    });
    const answer = r.choices[0]?.message.content ?? '';
    console.log(
      `${model} ziel=${targetTokens / 1000}k prompt_tokens=${r.usage?.prompt_tokens} ${Math.round(ms / 1000)} s ` +
        `treffer=${answer.includes('7342')} finish=${r.choices[0]?.finish_reason} completion=${r.usage?.completion_tokens} cost=${r.usage?.cost}`
    );
  } catch (e) {
    console.log(`${model} ziel=${targetTokens / 1000}k FEHLER ${(e as Error).message}`);
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'basics') {
  for (const m of rest) await basics(m);
} else if (mode === 'needle') {
  const [model, ...sizes] = rest;
  if (!model) throw new Error('Modell fehlt');
  await Promise.all(sizes.map((s) => needle(model, Number(s))));
} else {
  throw new Error('Modus: basics | needle');
}
