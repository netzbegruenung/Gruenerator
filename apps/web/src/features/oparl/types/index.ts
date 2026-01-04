export interface OparlPaper {
  id: string;
  title: string;
  city: string;
  date?: string;
  paperType?: string;
  reference?: string;
  fullText?: string;
  sourceUrl?: string;
  mainFileUrl?: string;
  matchedChunk?: string;
  score: number;
}

export interface SearchResult {
  results: OparlPaper[];
  total: number;
}

export interface IndexedCitiesResult {
  cities: string[];
}
