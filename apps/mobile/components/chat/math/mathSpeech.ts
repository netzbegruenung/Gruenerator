/**
 * German spoken text for a formula, for screen readers. Walks MathJax's MathML
 * tree synchronously, so it runs in the same lazy-loaded path as the SVG
 * conversion (see `mathjaxSvg.ts`). Anything it does not know throws
 * internally and yields `null`: the caller then keeps the TeX source as the
 * label, which beats a bare "Formel".
 */

/** The part of MathJax's `MmlNode` this walker reads. */
export interface SpeechNode {
  kind: string;
  childNodes: SpeechNode[];
  getText?: () => string;
}

class Unsupported extends Error {}

const GREEK: Record<string, string> = {
  α: 'Alpha',
  β: 'Beta',
  γ: 'Gamma',
  δ: 'Delta',
  ε: 'Epsilon',
  ϵ: 'Epsilon',
  ζ: 'Zeta',
  η: 'Eta',
  θ: 'Theta',
  ϑ: 'Theta',
  ι: 'Iota',
  κ: 'Kappa',
  λ: 'Lambda',
  μ: 'My',
  ν: 'Ny',
  ξ: 'Xi',
  π: 'Pi',
  ρ: 'Rho',
  σ: 'Sigma',
  τ: 'Tau',
  υ: 'Ypsilon',
  φ: 'Phi',
  ϕ: 'Phi',
  χ: 'Chi',
  ψ: 'Psi',
  ω: 'Omega',
  Γ: 'großes Gamma',
  Δ: 'großes Delta',
  Θ: 'großes Theta',
  Λ: 'großes Lambda',
  Ξ: 'großes Xi',
  Π: 'großes Pi',
  Σ: 'großes Sigma',
  Φ: 'großes Phi',
  Ψ: 'großes Psi',
  Ω: 'großes Omega',
};

const FUNCTIONS: Record<string, string> = {
  sin: 'Sinus',
  cos: 'Kosinus',
  tan: 'Tangens',
  log: 'Logarithmus',
  ln: 'natürlicher Logarithmus',
  exp: 'Exponentialfunktion',
  lim: 'Limes',
  max: 'Maximum',
  min: 'Minimum',
};

const OPERATORS: Record<string, string> = {
  '+': 'plus',
  '-': 'minus',
  '−': 'minus',
  '·': 'mal',
  '⋅': 'mal',
  '*': 'mal',
  '×': 'mal',
  '÷': 'geteilt durch',
  '/': 'geteilt durch',
  '=': 'ist gleich',
  '≠': 'ist ungleich',
  '<': 'kleiner als',
  '>': 'größer als',
  '≤': 'kleiner oder gleich',
  '≥': 'größer oder gleich',
  '≈': 'ungefähr gleich',
  '≡': 'kongruent',
  '∼': 'proportional zu',
  '∝': 'proportional zu',
  '→': 'Pfeil nach rechts',
  '←': 'Pfeil nach links',
  '↔': 'Pfeil in beide Richtungen',
  '⇒': 'daraus folgt',
  '⇔': 'genau dann, wenn',
  '∞': 'unendlich',
  '±': 'plus minus',
  '∓': 'minus plus',
  '%': 'Prozent',
  '°': 'Grad',
  '!': 'Fakultät',
  '∈': 'Element von',
  '∉': 'kein Element von',
  '⊂': 'Teilmenge von',
  '⊆': 'Teilmenge oder gleich',
  '∪': 'vereinigt mit',
  '∩': 'geschnitten mit',
  '∀': 'für alle',
  '∃': 'es existiert',
  '∂': 'partielle Ableitung',
  '∇': 'Nabla',
  '…': 'und so weiter',
  '⋯': 'und so weiter',
  '(': 'Klammer auf',
  ')': 'Klammer zu',
  '[': 'eckige Klammer auf',
  ']': 'eckige Klammer zu',
  '{': 'geschweifte Klammer auf',
  '}': 'geschweifte Klammer zu',
  '|': 'senkrechter Strich',
  '∑': 'Summe',
  '∏': 'Produkt',
  '∫': 'Integral',
  '∮': 'Kurvenintegral',
  ',': ',',
  ';': ';',
  ':': ':',
  '.': '.',
  // Invisible function application, multiplication and separator.
  '⁡': '',
  '⁢': '',
  '⁣': '',
  '⁤': '',
};

const BIG_OPERATORS = new Set(['∑', '∏', '∫', '∮']);

const ACCENTS: Record<string, (base: string) => string> = {
  '¯': (b) => `${b} quer`,
  '‾': (b) => `${b} quer`,
  '―': (b) => `${b} quer`,
  '^': (b) => `${b} Dach`,
  ˆ: (b) => `${b} Dach`,
  '~': (b) => `${b} Tilde`,
  '˜': (b) => `${b} Tilde`,
  '˙': (b) => `${b} Punkt`,
  '→': (b) => `Vektor ${b}`,
  '⃗': (b) => `Vektor ${b}`,
};

const ROOT_INDEX: Record<string, string> = { '3': 'dritte', '4': 'vierte' };

const PASS_THROUGH = new Set([
  'math',
  'mrow',
  'inferredMrow',
  'mstyle',
  'mpadded',
  'TeXAtom',
  'semantics',
]);

function text(node: SpeechNode): string {
  return node.getText?.() ?? '';
}

/** A node that reads as one word group: a single token, or a row of one. */
function isSimple(node: SpeechNode): boolean {
  if (node.kind === 'mrow' || node.kind === 'inferredMrow' || node.kind === 'TeXAtom') {
    return node.childNodes.length === 1 && isSimple(node.childNodes[0]);
  }
  return node.kind === 'mi' || node.kind === 'mn';
}

function rows(parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}

function token(node: SpeechNode): string {
  const value = text(node).trim();
  switch (node.kind) {
    case 'mn':
      return value.replace('.', ',');
    case 'mtext':
      return value.replace(/\s+/g, ' ');
    default: {
      // MathJax emits both `mi` and `mo` for names like `lim` and for `%`.
      if (value in FUNCTIONS) return FUNCTIONS[value];
      if (value in GREEK) return GREEK[value];
      if (value === '′' || value === "'") return 'Strich';
      if (value in OPERATORS) return OPERATORS[value];
      if (node.kind === 'mi' && /^[A-Z]$/.test(value)) return `großes ${value}`;
      if (node.kind === 'mi' && /^[A-Za-z]+$/.test(value)) return value;
      throw new Unsupported(`${node.kind} ${value}`);
    }
  }
}

function limits(op: SpeechNode, under: string | null, over: string | null): string {
  const name = token(op);
  if (name === 'Limes') {
    return `Limes${under ? ` für ${under.replace('Pfeil nach rechts', 'gegen')}` : ''}`;
  }
  const lower = under?.replace(/ ist gleich /g, ' gleich ');
  if (lower && over) return `${name} von ${lower} bis ${over}${name === 'Integral' ? '' : ' über'}`;
  if (lower) return `${name} über ${lower}`;
  if (over) return `${name} bis ${over}`;
  return name;
}

function isLimitsBase(base: SpeechNode): boolean {
  return (
    (base.kind === 'mo' && BIG_OPERATORS.has(text(base).trim())) ||
    (['mi', 'mo'].includes(base.kind) && text(base).trim() === 'lim')
  );
}

function speak(node: SpeechNode): string {
  const kids = node.childNodes;
  const sub = (i: number) => speak(kids[i]);
  switch (node.kind) {
    case 'mi':
    case 'mn':
    case 'mo':
    case 'mtext':
      return token(node);
    case 'mspace':
    case 'mphantom':
      return '';
    case 'mfrac': {
      const [n, d] = [sub(0), sub(1)];
      return isSimple(kids[0]) && isSimple(kids[1])
        ? `${n} durch ${d}`
        : `Bruch: Zähler ${n}, Nenner ${d}`;
    }
    case 'msup': {
      const exponent = kids[1];
      const base = sub(0);
      if (exponent.kind === 'mo' && ['′', "'"].includes(text(exponent).trim())) {
        return `${base} Strich`;
      }
      if (exponent.kind === 'mn' && text(exponent).trim() === '2') return `${base} Quadrat`;
      return isSimple(exponent)
        ? `${base} hoch ${speak(exponent)}`
        : `${base} hoch ${speak(exponent)} Ende hoch`;
    }
    case 'msub':
      return isSimple(kids[1])
        ? `${sub(0)} Index ${sub(1)}`
        : `${sub(0)} Index ${sub(1)} Ende Index`;
    case 'msubsup':
      if (isLimitsBase(kids[0])) return limits(kids[0], sub(1), sub(2));
      return `${sub(0)} Index ${sub(1)} hoch ${sub(2)}`;
    case 'munderover':
      if (isLimitsBase(kids[0])) return limits(kids[0], sub(1), sub(2));
      throw new Unsupported('munderover');
    case 'munder':
      if (isLimitsBase(kids[0])) return limits(kids[0], sub(1), null);
      throw new Unsupported('munder');
    case 'mover': {
      if (isLimitsBase(kids[0])) return limits(kids[0], null, sub(1));
      const accent = ACCENTS[text(kids[1]).trim()];
      if (kids[1].kind === 'mo' && accent) return accent(sub(0));
      throw new Unsupported('mover');
    }
    case 'msqrt': {
      const body = rows(kids.map(speak));
      return kids.length === 1 && isSimple(kids[0])
        ? `Wurzel aus ${body}`
        : `Wurzel aus ${body} Ende Wurzel`;
    }
    case 'mroot': {
      const index = text(kids[1]).trim();
      const ordinal = kids[1].kind === 'mn' ? ROOT_INDEX[index] : undefined;
      if (index === '2') return `Wurzel aus ${sub(0)}`;
      return `${ordinal ?? `${sub(1)}-te`} Wurzel aus ${sub(0)}`;
    }
    case 'mtable': {
      const lines = kids.map(
        (row, i) =>
          `Zeile ${i + 1}: ${row.childNodes.map((cell) => rows(cell.childNodes.map(speak))).join(', ')}`
      );
      return `Matrix mit ${kids.length} Zeilen. ${lines.join('. ')}`;
    }
    default:
      if (PASS_THROUGH.has(node.kind)) return rows(kids.map(speak));
      throw new Unsupported(node.kind);
  }
}

/** The German spoken form of a MathML tree, or `null` when it has none. */
export function mathToSpeech(root: SpeechNode): string | null {
  try {
    const spoken = speak(root)
      .replace(/\s+/g, ' ')
      .replace(/ ([,;:.])/g, '$1')
      .trim();
    return spoken || null;
  } catch {
    // Unsupported construct, or a walker bug: either way the label stays TeX.
    return null;
  }
}
