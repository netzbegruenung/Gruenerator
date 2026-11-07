/**
 * Anreißer für die Dashboard-Seiten. Die Monitor-Texte kommen bis zu 500
 * Zeichen lang und mitten im Wort abgeschnitten an; gezeigt wird, was in etwa
 * drei Zeilen passt — bis zum letzten ganzen Satz, damit möglichst selten „…"
 * dasteht. Das `line-clamp` der Komponente bleibt als Notbremse.
 */

/** Ungefähr drei Zeilen der schmalsten Spalte, in der ein Anreißer steht. */
export const TEASER_MAX_CHARS = 220;

/** Ein kürzerer erster Satz als so viel vom Budget lohnt sich nicht — dann lieber am Wort kürzen. */
const MIN_SENTENCE_SHARE = 0.4;

// Punkt nach diesen Wörtern beendet keinen Satz („Prof. Dr. Meron Mendel").
const ABBREVIATIONS = new Set([
  'dr',
  'prof',
  'bzw',
  'ca',
  'nr',
  'st',
  'vgl',
  'z.b',
  'u.a',
  'd.h',
  'ggf',
  'inkl',
  'mio',
  'mrd',
]);

/** Satzenden in `text`: Index direkt hinter dem Satzzeichen (samt schließendem Anführungszeichen). */
function sentenceEnds(text: string): number[] {
  const ends: number[] = [];
  const re = /[.!?…]["“”»«']?(?=\s+["„»«]?[A-ZÄÖÜ])/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(0, m.index).split(/\s/).pop() ?? '';
    // „9. November", „1. FC": eine Ordnungszahl, kein Satzende.
    if (m[0].startsWith('.') && (/^\d+$/.test(before) || ABBREVIATIONS.has(before.toLowerCase()))) {
      continue;
    }
    ends.push(m.index + m[0].length);
  }
  if (/[.!?…]["“”»«']?$/.test(text)) ends.push(text.length);
  return ends;
}

/** Kürzt `text` auf höchstens `max` Zeichen — am letzten Satzende, sonst am letzten Wort mit „…". */
export function trimTeaser(text: string, max = TEASER_MAX_CHARS): string {
  const t = text.trim().replace(/\s+/g, ' ');
  const lastSentence = sentenceEnds(t)
    .filter((i) => i <= max)
    .pop();
  if (
    lastSentence !== undefined &&
    (lastSentence === t.length || lastSentence >= max * MIN_SENTENCE_SHARE)
  ) {
    return t.slice(0, lastSentence);
  }
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1).replace(/\s+\S*$/, '');
  return `${cut.replace(/[,;:–-]$/, '')}…`;
}

/**
 * Anreißer ohne die Überschrift davor: manche Landesverbands-Seiten (etwa die
 * Fraktion Hessen) beginnen ihren Text mit dem Titel; er stünde sonst zweimal da.
 */
export function teaser(title: string, text: string): string {
  const t = text.trimStart();
  return trimTeaser(t.startsWith(title) ? t.slice(title.length) : t);
}
