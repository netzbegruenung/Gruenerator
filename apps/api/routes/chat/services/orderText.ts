/**
 * Der Auftrag einer Nachricht, die ihren Stoff mitbringt — für die Weichen, die
 * an einzelnen Wörtern entscheiden, wohin ein Turn geht.
 *
 * Über den ganzen Text gefragt, entscheidet der eingefügte Stoff mit. Beta
 * 29./30.09.2026: ein Newsletter mit „Schreibt uns", „eure Antworten" und
 * „Reels … Untertiteln" machte aus „rechtschreibung korrigieren" darunter
 * erst eine Websuche (#3903), dann eine Reel-Auswahl (#3912). Ein Reizwort im
 * Stoff ist kein Auftrag.
 *
 * Auftrag ist ein Rand-Absatz (erster oder letzter), der kurz ist oder wie ein Auftrag BEGINNT
 * („Schreib …", „Kannst du …", „Bitte …"); Stoff ist ein langer Absatz, der
 * anders beginnt. Der Anfang zählt, weil ein langer Auftrag („Schreib eine
 * Rede über …, mit …") sonst hinter einem kurzen „Bitte kürzer halten."
 * verschwände. Ohne Absätze bleibt es beim ganzen Text — dort lässt sich
 * Stoff von Auftrag nicht trennen.
 *
 * NUR für die Erkennung. Wer den Auftrag ausführt, bekommt weiter die ganze
 * Nachricht: „Ersetze den Text durch:\n\n<neuer Text>" braucht den Stoff.
 */

/** Länger ist kein Auftrag mehr, sondern schon Stoff — es sei denn, er beginnt wie einer. */
const ORDER_PARAGRAPH_MAX = 120;

const ORDER_OPENING_RE =
  /^(?:(?:hallo|hi|hey|moin|servus)\p{P}*\s+)?(?:bitte\s+)?(?:(?:kannst|könntest|koenntest|würdest|wuerdest)\s+du|ich\s+(?:brauche|möchte|moechte|will|hätte|haette)|(?:schreib|erstell|formulier|verfass|entw[iu]rf|entwerf|recherchier|such|find|pr[üu]f|[üu]berpr[üu]f|beantwort|antwort|fass|k[üu]rz|[üu]bersetz|[üu]berarbeit|korrigier|lektorier|mach|gib|zeig|erkl[äa]r|analysier|vergleich)\p{L}*)/iu;

function splitOrder(message: string): { order: string; material: boolean } {
  const t = (message ?? '').trim();
  const paragraphs = t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) return { order: t, material: false };
  // Nur die Ränder: der Auftrag steht vor oder hinter dem Stoff, und eine kurze
  // Zwischenzeile im Stoff („Schreibt uns!") ist keiner.
  const edges = [paragraphs[0], paragraphs[paragraphs.length - 1]];
  const orders = edges.filter((p) => p.length <= ORDER_PARAGRAPH_MAX || ORDER_OPENING_RE.test(p));
  if (orders.length === 0) return { order: t, material: false };
  return { order: orders.join('\n\n'), material: orders.length < paragraphs.length };
}

export function orderText(message: string): string {
  return splitOrder(message).order;
}

/**
 * Die Nachricht bringt Stoff mit, der vom Auftrag getrennt wurde. Dann kann
 * ein „das"/„es" im Auftrag auch den Stoff meinen und nicht das Artefakt im
 * Thread (#3918).
 */
export function carriesMaterial(message: string): boolean {
  return splitOrder(message).material;
}

/** Ein Zeigewort als Objekt, oder ein blosses „Text" — beides kann den Stoff meinen. */
const MATERIAL_REFERENCE_RE = /(?<!\p{L})(?:das|es|dies|dieses|diesen|text)(?!\p{L})/iu;

/** „Ersetze den Text durch:", „tausch es gegen …" — der Stoff IST der neue Text. */
const REPLACE_ORDER_RE =
  /(?<!\p{L})(?:ersetz|tausch|austausch)\p{L}*[^.!?]*?(?<!\p{L})(?:durch|gegen)(?!\p{L})/iu;

/**
 * Der Auftrag kann den mitgebrachten Stoff meinen statt das Artefakt im Thread:
 * „übersetze das ins Englische", „mach den Text kürzer" unter einem eingefügten
 * Text (#3918). Ein Ersetzungsauftrag nicht — dort ist der Stoff der Ersatz.
 * Ob der Auftrag sein Ziel nennt („den Post"), prüft der Aufrufer.
 */
export function pointsAtMaterial(order: string): boolean {
  return MATERIAL_REFERENCE_RE.test(order) && !REPLACE_ORDER_RE.test(order);
}
