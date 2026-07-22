/**
 * Deterministic assertions — one per failure class we've hit live, so each is
 * caught automatically forever. Pure: (trace, expect) → AssertionResult[].
 * Subjective quality (groundedness, honesty nuance) is left to the optional LLM
 * judge; these are the mechanical checks the SSE trace can prove on its own.
 */
import {
  type AssertionResult,
  type ChatTrace,
  type EvalExpect,
  type ScenarioContext,
} from './types.js';

const SEARCH_TOOL_RE = /search/i;
const INTERNAL_TOOL = 'gruenerator_search';
const WEB_TOOLS = ['web_search', 'scrape_url'];
const CAPABILITY_REFUSAL_RE =
  /kann kein(e|en)?\s+(bild|bilder|sharepic|grafik|kachel)|textbasiert|nur ein(?:\s+\w+)?\s+(text|sprach)modell|ich kann keine\s+(bilder|sharepics)/i;
/** Text denies an action (edit/change) — must not appear when ops were applied. */
const ACTION_DENIAL_RE =
  /konnte (die|das|den|keine?)?\s*\S*\s*(nicht|leider nicht)\s*(ändern|bearbeiten|anpassen|finden)|kann (die|das|den)?\s*\S*\s*nicht (ändern|bearbeiten|anpassen)|leider nicht möglich|keine antwort (finden|gefunden)|nicht durchführen/i;
/** Text claims research/tool work — must not appear when 0 tools ran. */
const CLAIMED_WORK_RE =
  /ich habe (recherchiert|gesucht|nachgeschlagen|die (quellen|dokumente) (durchsucht|geprüft))|(meine|die) (recherche|suche) (ergab|zeigt|hat ergeben)|laut meiner (suche|recherche)/i;

/** Bracketed citation numbers, e.g. [3] or [3, 7] → [3,7]. */
function bracketedCiteNumbers(text: string): number[] {
  const nums: number[] = [];
  for (const m of text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)) {
    for (const n of m[1].split(/\s*,\s*/)) nums.push(Number(n));
  }
  return nums;
}

/** A citation number written as a bare token instead of `[N]` — the "unclean"
 *  case (e.g. "im gebotenen Umfang 20." meaning [20]). Deliberately narrow to
 *  avoid false positives on numbered headings ("### 1. Atomkraft"), list
 *  ordinals ("1. …") and quantities ("1–2 Millionen"): require a LOWERCASE
 *  letter + single space + the number + sentence punctuation, and the number
 *  must itself be a citation elsewhere. Ranges (1–2) and units (20 Mio.) don't
 *  match; headings start with '#'/line-start, not a lowercase letter. */
function bareCitationNumbers(text: string, citeNums: Set<number>): number[] {
  const bare: number[] = [];
  for (const m of text.matchAll(/[a-zäöüß]\s(\d{1,2})(?=[.,;:](?:\s|$))/gu)) {
    const n = Number(m[1]);
    if (citeNums.has(n)) bare.push(n);
  }
  return bare;
}

function fail(name: string, detail: string): AssertionResult {
  return { name, pass: false, detail };
}
function ok(name: string, detail = ''): AssertionResult {
  return { name, pass: true, detail };
}

export function runAssertions(
  trace: ChatTrace,
  expect: EvalExpect,
  ctx?: ScenarioContext
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const toolNames = trace.toolCalls.map((t) => t.toolName);

  if (trace.error) {
    // A dead stream fails everything meaningfully — surface it once.
    return [fail('streamCompleted', trace.error)];
  }

  if (expect.sameThread) {
    if (!ctx?.firstThreadId) {
      results.push(fail('sameThread', 'no threadId captured on the first turn'));
    } else {
      results.push(
        trace.threadId === ctx.firstThreadId
          ? ok('sameThread')
          : fail(
              'sameThread',
              `threadId ${trace.threadId ?? 'null'} ≠ first turn's ${ctx.firstThreadId} (thread re-minted)`
            )
      );
    }
  }

  if (expect.editsPreviousArtifact) {
    const prior = new Set(ctx?.priorArtifactIds ?? []);
    // The edit target must be an artifact from an earlier turn: matched via edit
    // events' ids or any prior id appearing in this turn's tool-call args.
    const argsJson = JSON.stringify(trace.toolCalls.map((t) => t.args));
    const referencedPrior =
      trace.referencedIds.some((id) => prior.has(id)) ||
      [...prior].some((id) => argsJson.includes(id));
    if (prior.size === 0) {
      // No id was capturable from the create turn — fall back to "an edit
      // event fired at all" so the scenario still catches total misses.
      results.push(
        trace.editorOps || trace.sharepicUpdated
          ? ok('editsPreviousArtifact', 'edit event fired (no prior ids captured)')
          : fail('editsPreviousArtifact', 'no edit event and no prior artifact ids captured')
      );
    } else {
      results.push(
        referencedPrior
          ? ok('editsPreviousArtifact')
          : fail(
              'editsPreviousArtifact',
              `no reference to prior artifact(s) [${[...prior].join(', ')}]; referenced: [${trace.referencedIds.join(', ')}]`
            )
      );
    }
  }

  if (expect.narrationMatchesAction) {
    const actionHappened = trace.editorOps || trace.sharepicUpdated || trace.imageGenerated;
    const denial = trace.fullText.match(ACTION_DENIAL_RE);
    const claimed = trace.fullText.match(CLAIMED_WORK_RE);
    if (actionHappened && denial) {
      results.push(
        fail('narrationMatchesAction', `edit applied but text denies it: "${denial[0]}"`)
      );
    } else if (trace.toolCalls.length === 0 && claimed) {
      results.push(
        fail('narrationMatchesAction', `0 tool calls but text claims work: "${claimed[0]}"`)
      );
    } else {
      results.push(ok('narrationMatchesAction'));
    }
  }

  if (expect.routing != null) {
    results.push(
      trace.intent === expect.routing
        ? ok('routing')
        : fail('routing', `intent=${trace.intent ?? 'null'} expected ${expect.routing}`)
    );
  }

  if (expect.routingNot != null && expect.routingNot.length > 0) {
    results.push(
      trace.intent != null && expect.routingNot.includes(trace.intent)
        ? fail('routingNot', `intent=${trace.intent} is in the forbidden set (intent/tools lost)`)
        : ok('routingNot')
    );
  }

  if (expect.demoted) {
    results.push(
      trace.agentic ? ok('demoted') : fail('demoted', 'intent event had no agentic:true')
    );
  }

  for (const tool of expect.toolsMustInclude ?? []) {
    results.push(
      toolNames.includes(tool)
        ? ok(`tool:${tool}`)
        : fail(`tool:${tool}`, `missing; called: [${toolNames.join(', ')}]`)
    );
  }

  for (const group of expect.toolsAnyOf ?? []) {
    results.push(
      group.some((tool) => toolNames.includes(tool))
        ? ok(`toolAnyOf:${group.join('|')}`)
        : fail(`toolAnyOf:${group.join('|')}`, `none called; called: [${toolNames.join(', ')}]`)
    );
  }

  if (expect.toolNameMatches != null) {
    const re = new RegExp(expect.toolNameMatches);
    results.push(
      toolNames.some((t) => re.test(t))
        ? ok('toolNameMatches')
        : fail(
            'toolNameMatches',
            `no tool matched /${expect.toolNameMatches}/; called: [${toolNames.join(', ')}]`
          )
    );
  }

  for (const tool of expect.toolsMustNotInclude ?? []) {
    results.push(
      !toolNames.includes(tool)
        ? ok(`noTool:${tool}`)
        : fail(`noTool:${tool}`, `unexpectedly called`)
    );
  }

  if (expect.maxToolCalls != null) {
    results.push(
      trace.toolCalls.length <= expect.maxToolCalls
        ? ok('maxToolCalls')
        : fail('maxToolCalls', `${trace.toolCalls.length} > ${expect.maxToolCalls}`)
    );
  }

  if (expect.generatesSharepic) {
    results.push(
      trace.sharepicGenerated
        ? ok('generatesSharepic')
        : fail('generatesSharepic', 'no sharepic_complete with variants')
    );
  }

  if (expect.internalOnly) {
    const internalReturned = trace.toolCalls.some(
      (t) => t.toolName === INTERNAL_TOOL && t.ok && !/0 Ergebnisse/i.test(t.summary ?? '')
    );
    const webUsed = trace.toolCalls.filter((t) => WEB_TOOLS.includes(t.toolName));
    results.push(
      !(internalReturned && webUsed.length > 0)
        ? ok('internalOnly')
        : fail(
            'internalOnly',
            `web used despite internal hits: [${webUsed.map((t) => t.toolName).join(', ')}]`
          )
    );
  }

  if (expect.noInventedUrls) {
    const badScrape = trace.toolCalls.filter(
      (t) => t.toolName === 'scrape_url' && (!t.ok || t.result?.error != null)
    );
    results.push(
      badScrape.length === 0
        ? ok('noInventedUrls')
        : fail('noInventedUrls', `${badScrape.length} scrape_url call(s) failed (404/invented)`)
    );
  }

  if (expect.cited) {
    const cites = bracketedCiteNumbers(trace.fullText);
    const citeSet = new Set(cites);
    if (cites.length === 0) {
      results.push(fail('cited', 'no [N] citation markers in the answer'));
    } else {
      const overflow = cites.filter((n) => trace.sources > 0 && n > trace.sources);
      const bare = bareCitationNumbers(trace.fullText, citeSet);
      if (overflow.length > 0) {
        results.push(
          fail('cited', `cites [${overflow.join(',')}] beyond ${trace.sources} sources`)
        );
      } else if (bare.length > 0) {
        results.push(fail('cited', `bare (unbracketed) citation number(s): ${bare.join(', ')}`));
      } else {
        results.push(ok('cited', `${cites.length} clean citation(s)`));
      }
    }
  }

  if (expect.grounded) {
    const searchedOk = trace.toolCalls.some((t) => SEARCH_TOOL_RE.test(t.toolName) && t.ok);
    results.push(
      trace.sources > 0 || searchedOk
        ? ok('grounded', `${trace.sources} citations`)
        : fail('grounded', 'no citations and no successful search')
    );
  }

  if (expect.noCapabilityRefusal) {
    const m = trace.fullText.match(CAPABILITY_REFUSAL_RE);
    results.push(
      !m ? ok('noCapabilityRefusal') : fail('noCapabilityRefusal', `refused: "${m[0]}"`)
    );
  }

  for (const topic of expect.topicsCovered ?? []) {
    const present = trace.fullText.toLowerCase().includes(topic.toLowerCase());
    results.push(
      present ? ok(`topic:${topic}`) : fail(`topic:${topic}`, 'not covered in the answer')
    );
  }

  if (expect.correctsFalsePremise) {
    const negates = /\b(nein|nicht|stimmt nicht|falsch|kein[e]?|im gegenteil|tatsächlich)\b/i.test(
      trace.fullText
    );
    results.push(
      negates
        ? ok('correctsFalsePremise')
        : fail('correctsFalsePremise', 'no negation/correction of the false premise')
    );
  }

  if (expect.maxLatencyMs != null) {
    results.push(
      trace.latencyMs <= expect.maxLatencyMs
        ? ok('latency', `${trace.latencyMs}ms`)
        : fail('latency', `${trace.latencyMs}ms > ${expect.maxLatencyMs}ms`)
    );
  }

  return results;
}
