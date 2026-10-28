/**
 * Erzwungener Werkzeugaufruf als `json_schema`, für Modelle, die
 * `tool_choice: 'required'` nicht einhalten.
 *
 * `aiObject` schickt GENAU EIN Werkzeug mit `tool_choice: 'required'`. Manche
 * Modelle hinter unseren Routern halten das nicht ein (Messungen je Modell an
 * der Aufrufstelle: `meliousThinkingFetch.ts`, `cortecsRequestPolicy.ts`),
 * liefern mit `response_format: json_schema` aber verlässlich JSON. Dieser
 * Umbau tauscht auf dem Draht das eine gegen das andere und legt die Antwort
 * auf dem Rückweg wieder als Werkzeugaufruf zurück — sonst wirft das AI SDK
 * selbst („did not contain a tool call even though tool choice was
 * required"), bevor `aiObject` den Text überhaupt sieht.
 *
 * Nur nicht gestreamt und nur bei genau einem Werkzeug: ein Zug mit mehreren
 * Werkzeugen (Agenten-Schleife) bleibt unberührt und scheitert laut.
 */
import { randomUUID } from 'node:crypto';

interface ToolDef {
  function?: { name?: unknown; parameters?: unknown };
}

/** Schreibt `body` um, wenn das Modell in `models` steht; gibt dann den Werkzeugnamen zurück. */
export function forcedToolAsJsonSchema(
  body: Record<string, unknown>,
  models: ReadonlySet<string>
): string | null {
  if (typeof body.model !== 'string' || !models.has(body.model)) return null;
  const tools = body.tools;
  if (!Array.isArray(tools) || tools.length !== 1 || body.tool_choice !== 'required') return null;
  if (body.stream === true) return null;
  const fn = (tools[0] as ToolDef).function;
  if (typeof fn?.name !== 'string' || typeof fn.parameters !== 'object' || fn.parameters === null) {
    return null;
  }
  body.response_format = {
    type: 'json_schema',
    json_schema: { name: fn.name, schema: fn.parameters },
  };
  delete body.tools;
  delete body.tool_choice;
  return fn.name;
}

interface ChatCompletion {
  choices?: { message?: Record<string, unknown>; finish_reason?: unknown }[];
}

/** Ist `content` ein vollständiges JSON-Objekt? Abgeschnittenes oder Fliesstext ist es nicht. */
function isJsonObject(content: string): boolean {
  try {
    const value: unknown = JSON.parse(content);
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

/**
 * Legt den JSON-Text der Antwort als Aufruf des erzwungenen Werkzeugs zurück —
 * nur, wenn er ein vollständiges JSON-Objekt ist. Alles andere (Fliesstext,
 * abgeschnittenes JSON, leer) bleibt Text, so wie das Modell es geschickt hat.
 */
export async function contentAsToolCall(response: Response, toolName: string): Promise<Response> {
  const json = (await response.json()) as ChatCompletion;
  const choice = json.choices?.[0];
  const content = choice?.message?.content;
  if (choice?.message && typeof content === 'string' && isJsonObject(content)) {
    choice.message.content = null;
    choice.message.tool_calls = [
      {
        id: `call_${randomUUID()}`,
        type: 'function',
        function: { name: toolName, arguments: content },
      },
    ];
    if (choice.finish_reason === 'stop') choice.finish_reason = 'tool_calls';
  }
  return new Response(JSON.stringify(json), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
