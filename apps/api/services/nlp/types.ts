export interface NounCount {
  noun: string;
  count: number;
}

export interface KeywordEntry<Topic = string | null> {
  keyword: string;
  count: number;
  topic: Topic;
}

export interface PersonEntry {
  person: string;
  count: number;
}

export interface NlpClassificationResult<Topic extends string = string> {
  id: string;
  topics: Partial<Record<Topic, number>>;
  primaryTopic: Topic | null;
  topNouns: NounCount[];
}

export interface LemmaCount {
  lemma: string;
  pos: string;
  count: number;
}

export interface FormCount {
  form: string;
  count: number;
}

/** One text's result from `/analyze/text-stats` (services/nlp/.../text_stats.py). */
export interface TextStatsResult {
  id: string;
  tokens: number;
  words: number;
  sentences: number;
  /** Top-N content lemmas of this text — cut at `top_n`, not a full list. */
  lemmas: LemmaCount[];
  /** Surface forms per requested lemma, keyed exactly as requested; complete counts. */
  forms: Record<string, FormCount[]>;
}
