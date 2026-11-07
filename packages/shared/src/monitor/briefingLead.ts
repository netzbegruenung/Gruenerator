import { type MonitorArticle, type TopicCategory, type TopicScore } from '@gruenerator/contracts';

/**
 * Der Leitsatz oben auf /briefing, aus Daten, die ohnehin geladen sind:
 * „Heute bestimmt <Thema> die Nachrichten. Über die Grünen wird vor allem zu
 * <Thema> berichtet." Bewusst Themen statt Personen — die Keywords sind
 * kleingeschriebene Einzel-Nomen („ilse", „aigner"), Namen daraus wären geraten.
 */
export interface BriefingLead {
  /** Das größte Thema des Tages, bei Gleichstand die beiden größten. */
  news: TopicCategory[];
  /**
   * Das häufigste Thema der Grünen-Berichte; `{ count }`, wenn kein Thema genug
   * Berichte trägt (dann nennt der Satz nur die Zahl); `quiet`, wenn es heute
   * kaum Berichte gab.
   */
  greens: TopicCategory[] | { count: number } | 'quiet';
}

/**
 * Unter so vielen Grünen-Artikeln — insgesamt bzw. mit demselben Thema — wäre
 * „vor allem zu X" eine Behauptung über ein, zwei Treffer. Gemessen am
 * 06.11.2026: 2 von 7 Berichten trugen „Bildung" (der Antisemitismus-Streit
 * um Claudia Roth), der Satz hätte das Thema des Tages behauptet.
 */
export const MIN_GREENS_ARTICLES = 3;

/** Liegt das zweite Thema so nah am ersten, nennt der Satz beide. */
const TIE_RATIO = 0.9;

function leaders(counts: Array<[TopicCategory, number]>): TopicCategory[] {
  const sorted = counts.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const [first, second] = sorted;
  if (!first) return [];
  return second && second[1] >= first[1] * TIE_RATIO ? [first[0], second[0]] : [first[0]];
}

export function buildBriefingLead(
  topics: TopicScore[],
  greensArticles: MonitorArticle[]
): BriefingLead | null {
  const news = leaders(topics.map((t) => [t.topic, t.articleCount]));
  if (news.length === 0) return null;

  if (greensArticles.length < MIN_GREENS_ARTICLES) return { news, greens: 'quiet' };

  const counts = new Map<TopicCategory, number>();
  for (const a of greensArticles) {
    if (a.primaryTopic) counts.set(a.primaryTopic, (counts.get(a.primaryTopic) ?? 0) + 1);
  }
  const greens = leaders([...counts]);
  const strongEnough = (counts.get(greens[0]) ?? 0) >= MIN_GREENS_ARTICLES;
  return { news, greens: strongEnough ? greens : { count: greensArticles.length } };
}
