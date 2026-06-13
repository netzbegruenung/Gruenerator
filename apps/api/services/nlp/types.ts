export interface NounCount {
  noun: string;
  count: number;
}

export interface KeywordEntry<Topic = string | null> {
  keyword: string;
  count: number;
  topic: Topic;
}

export interface NlpClassificationResult<Topic extends string = string> {
  id: string;
  topics: Partial<Record<Topic, number>>;
  primaryTopic: Topic | null;
  topNouns: NounCount[];
}
