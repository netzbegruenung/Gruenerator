/**
 * Topic Guard — Prompt security for the public Gruen-O-Mat endpoint.
 *
 * Implements Layer 1 (input screening) and Layer 5 (output leakage detection)
 * of the defense-in-depth strategy. See plan for full 5-layer overview.
 */

// ---------------------------------------------------------------------------
// Layer 1 — Input screening
// ---------------------------------------------------------------------------

interface ScreenResult {
  blocked: boolean;
  reason?: string;
}

/** Patterns specific enough to avoid false positives on political German. */
const INJECTION_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // Role overrides (DE)
  { pattern: /du\s+bist\s+(jetzt|nun|ab\s+sofort)\b/i, reason: 'role_override_de' },
  { pattern: /tu\s+so\s+als\s+ob/i, reason: 'role_override_de' },
  { pattern: /verhalte\s+dich\s+(wie|als)/i, reason: 'role_override_de' },
  // Role overrides (EN)
  { pattern: /\bact\s+as\b/i, reason: 'role_override_en' },
  { pattern: /\bpretend\s+to\s+be\b/i, reason: 'role_override_en' },
  { pattern: /\byou\s+are\s+now\b/i, reason: 'role_override_en' },

  // Instruction overrides (DE)
  { pattern: /ignorier(e|st)?\s+(deine|alle|die)\b/i, reason: 'instruction_override_de' },
  { pattern: /vergiss\s+(deine|alle|die)\b/i, reason: 'instruction_override_de' },
  {
    pattern: /überschreib(e|st)?\s+(deine|die)\s+(regeln|anweisungen)/i,
    reason: 'instruction_override_de',
  },
  // Instruction overrides (EN)
  { pattern: /\bignore\s+(your|all|previous|the)\b/i, reason: 'instruction_override_en' },
  { pattern: /\bforget\s+(your|all|previous|the)\b/i, reason: 'instruction_override_en' },
  { pattern: /\bdisregard\s+(your|all|previous|the)\b/i, reason: 'instruction_override_en' },

  // System prompt extraction (DE)
  { pattern: /wiederhole\s+(deine\s+)?(system\s*)?anweisungen/i, reason: 'extraction_de' },
  { pattern: /was\s+sind\s+deine\s+(regeln|anweisungen|instruktionen)/i, reason: 'extraction_de' },
  {
    pattern: /zeig(e|st)?\s+(mir\s+)?(deine\s+)?(system\s*)?anweisungen/i,
    reason: 'extraction_de',
  },
  { pattern: /gib\s+(mir\s+)?(deinen?\s+)?system\s*prompt/i, reason: 'extraction_de' },
  // System prompt extraction (EN)
  { pattern: /\bsystem\s*prompt\b/i, reason: 'extraction_en' },
  { pattern: /\brepeat\s+(your\s+)?(system\s+)?instructions\b/i, reason: 'extraction_en' },
  { pattern: /\bshow\s+(me\s+)?(your\s+)?(system\s+)?instructions\b/i, reason: 'extraction_en' },
  { pattern: /\bprint\s+(your\s+)?prompt\b/i, reason: 'extraction_en' },

  // Meta-prompting / jailbreak keywords
  { pattern: /\bDAN\b/, reason: 'jailbreak' },
  { pattern: /\bjailbreak\b/i, reason: 'jailbreak' },
  { pattern: /\bdeveloper\s+mode\b/i, reason: 'jailbreak' },
  { pattern: /\bdo\s+anything\s+now\b/i, reason: 'jailbreak' },
];

const OFFTOPIC_PATTERNS: { pattern: RegExp; reason: string }[] = [
  // Code generation requests
  {
    pattern: /schreib(e|st)?\s+mir\s+ein(en)?\s+(python|javascript|code|skript|programm)\b/i,
    reason: 'code_request',
  },
  {
    pattern: /\bwrite\s+(me\s+)?(a\s+)?(python|javascript|code|script|program)\b/i,
    reason: 'code_request',
  },
  // Fenced code blocks in input
  { pattern: /```\w+/i, reason: 'code_block_input' },
];

/**
 * Screen user input for adversarial patterns and off-topic requests.
 * Conservative: patterns are specific to avoid false positives on political German.
 */
export function screenInput(text: string): ScreenResult {
  const normalized = text.replace(/\s+/g, ' ').trim();

  for (const { pattern, reason } of INJECTION_PATTERNS) {
    if (pattern.test(normalized)) {
      return { blocked: true, reason: `injection:${reason}` };
    }
  }

  for (const { pattern, reason } of OFFTOPIC_PATTERNS) {
    if (pattern.test(normalized)) {
      return { blocked: true, reason: `offtopic:${reason}` };
    }
  }

  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Layer 5 — Output leakage detection
// ---------------------------------------------------------------------------

const LEAKAGE_MARKERS = [
  'THEMATISCHE GRENZEN',
  'ZITATIONS-PROTOKOLL',
  'ANTWORT-STIL',
  '## VERBOTEN',
  'systemPromptOverride',
  'handleNotebookStream',
  'user_question>',
  'retrieved_sources>',
  'notebookStreamCore',
];

/**
 * Check if a generated response contains fragments of the system prompt
 * or internal code identifiers that should never appear in output.
 */
export function containsPromptLeakage(output: string): boolean {
  const lower = output.toLowerCase();
  return LEAKAGE_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Response constants
// ---------------------------------------------------------------------------

export const OFF_TOPIC_RESPONSE =
  '🌻 Das liegt leider außerhalb meines Bereichs. Ich bin der Grüne Fragen-Bot und kann dir ' +
  'Auskunft zu den Positionen und Programmen von Bündnis 90/Die Grünen geben.\n\n' +
  'Frag mich zum Beispiel:\n' +
  '- "Was ist eure Position zum Klimaschutz?"\n' +
  '- "Wie steht ihr zur Kindergrundsicherung?"\n' +
  '- "Was plant ihr für die Verkehrswende?"';

export const BLOCKED_RESPONSE =
  '🌻 Ich kann dir gerne Auskunft zu den Positionen und Programmen von ' +
  'Bündnis 90/Die Grünen geben. Stell mir einfach eine Frage zu einem politischen Thema!';
