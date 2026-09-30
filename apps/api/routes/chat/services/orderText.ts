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

// Befehlsformen mit Wortende, keine Stämme: „Kürzlich", „Macht mit", „Erklärung",
// „Gibt es", „Suchtprävention" eröffnen Stoff, keinen Auftrag — mit `\p{L}*`
// dahinter wurde ein so beginnender Newsletter wieder ganz gelesen (#3912).
const ORDER_OPENING_RE =
  /^(?:(?:hallo|hi|hey|moin|servus)\p{P}*\s+)?(?:bitte\s+)?(?:(?:kannst|könntest|koenntest|würdest|wuerdest)\s+du|ich\s+(?:brauche|möchte|moechte|will|hätte|haette)|(?:(?:schreib|erstell|formulier|verfass|entwerf|recherchier|such|find|pr[üu]f|[üu]berpr[üu]f|beantwort|fass|k[üu]rz|[üu]bersetz|[üu]berarbeit|korrigier|lektorier|mach|zeig|erkl[äa]r|analysier)e?|entwirf|antworte|gib|vergleiche?(?=\s+(?:die|den|das|diese[nrs]?|beide[n]?|mir)(?!\p{L})))(?!\p{L}))/iu;

/**
 * Ein Absatz nur aus Gruß und Dank („Hallo,", „Danke dir!", „Vielen Dank und
 * liebe Grüße") ist weder Auftrag noch Stoff. Als Rand genommen, verdrängte er
 * den Auftrag dazwischen — „Hallo,\n\n<Auftrag>\n\nDanke!" las „Hallo, Danke!".
 * Ein Name dahinter („LG Moritz") ändert daran nichts.
 */
const COURTESY_PREFIX_RE =
  /^(?:(?:hallo|hi|hey|moin|servus|guten|morgen|tag|abend|zusammen|ihr|du|danke|dankeschön|dankeschoen|vielen|lieben|herzlichen|herzliche|besten|beste|liebe|viele|dank|dir|euch|ihnen|schon|mal|im|voraus|und|lg|vg|mfg|grüße|grüsse|gruesse|gruß|gruss|merci|thx|thanks|cheers)(?!\p{L})[\s\p{P}]*)+/iu;

/** Bis zu drei großgeschriebene Wörter nach Gruß oder Dank: „LG Moritz", „Hallo Team,". */
const COURTESY_NAME_TAIL_RE = /^(?:\p{Lu}[\p{L}'-]*[\s\p{P}]*){0,3}$/u;

function isCourtesyParagraph(p: string): boolean {
  const prefix = COURTESY_PREFIX_RE.exec(p);
  return prefix != null && COURTESY_NAME_TAIL_RE.test(p.slice(prefix[0].length));
}

function splitOrder(message: string): { order: string; material: boolean } {
  const t = (message ?? '').trim();
  const paragraphs = t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !isCourtesyParagraph(p));
  const whole = { order: paragraphs.length > 0 ? paragraphs.join('\n\n') : t, material: false };
  if (paragraphs.length < 2) return whole;
  // Nur die Ränder: der Auftrag steht vor oder hinter dem Stoff, und eine kurze
  // Zwischenzeile im Stoff („Schreibt uns!") ist keiner.
  const edges = [paragraphs[0], paragraphs[paragraphs.length - 1]];
  const orders = edges.filter((p) => p.length <= ORDER_PARAGRAPH_MAX || ORDER_OPENING_RE.test(p));
  // Stoff ist erst ein langer Absatz, der kein Auftrag ist. Ohne ihn bleibt es
  // beim ganzen Text: lauter kurze Absätze sind eher ein zerlegter Auftrag
  // (mit einem Gruß, den das Muster oben nicht kennt) als eingefügter Stoff.
  const material = paragraphs.some((p) => p.length > ORDER_PARAGRAPH_MAX && !orders.includes(p));
  if (orders.length === 0 || !material) return whole;
  return { order: orders.join('\n\n'), material: true };
}

export function orderText(message: string): string {
  return splitOrder(message).order;
}

/** „Ersetze den Text durch:", „tausch es gegen …" — der Stoff IST der neue Text. */
const REPLACE_ORDER_RE =
  /(?<!\p{L})(?:ersetz|tausch|austausch)\p{L}*[^.!?]*?(?<!\p{L})(?:durch|gegen)(?!\p{L})/iu;

export function isReplaceOrder(order: string): boolean {
  return REPLACE_ORDER_RE.test(order);
}

/**
 * Darf eine Weiche, die ein Artefakt im Thread bearbeitet (Post, Sharepic),
 * diesen Auftrag für sich beanspruchen?
 *
 * Ohne mitgebrachten Stoff ja — „übersetze das ins Englische" direkt nach
 * einem Post meint den Post. MIT Stoff kann jeder Auftrag, der sein Ziel nicht
 * nennt, den Stoff meinen: „übersetze das", „ins Englische übersetzen",
 * „kürzer bitte", „mach ihn kürzer" (#3918). Dann nur, wenn der Auftrag das
 * Artefakt nennt (`namesTarget`, je Weiche) oder ein Ersetzungsauftrag ist —
 * dort ist der Stoff der Ersatz, nicht der Gegenstand.
 */
export function orderMayMeanArtifact(
  message: string,
  namesTarget: (order: string) => boolean
): boolean {
  const { order, material } = splitOrder(message);
  return !material || namesTarget(order) || isReplaceOrder(order);
}
