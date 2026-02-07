/**
 * Temporal Analyzer
 *
 * Detects temporal expressions in German queries and maps them to
 * urgency levels and SearXNG time_range parameters.
 *
 * Handles both relative ("letzte Woche", "heute") and absolute
 * ("Januar 2026", "im letzten Jahr") temporal expressions.
 *
 * Pure regex-based — no LLM calls needed.
 */

export type TemporalUrgency = 'immediate' | 'recent' | 'current' | 'none';

export interface TemporalAnalysis {
  hasTemporal: boolean;
  urgency: TemporalUrgency;
  suggestedTimeRange: string | undefined;
}

// Immediate: today, right now, breaking news
const IMMEDIATE_PATTERNS = [
  /\bheute\b/i,
  /\bgerade\s*(eben|jetzt)?\b/i,
  /\bjetzt\b/i,
  /\bsoeben\b/i,
  /\baktuell(e|es|er|en|em)?\b/i,
  /\beilmeldung\b/i,
  /\bbreaking\b/i,
  /\beben\s+erst\b/i,
  /\bvor\s+(wenigen\s+)?(minuten|stunden)\b/i,
];

// Recent: last few days
const RECENT_PATTERNS = [
  /\bgestern\b/i,
  /\bvorgestern\b/i,
  /\bletzte[rnms]?\s*woche\b/i,
  /\bletzten\s+(tagen?|paar\s+tage)\b/i,
  /\bdiese\s*woche\b/i,
  /\bvor\s+(wenigen\s+)?tagen\b/i,
  /\bvor\s+kurzem\b/i,
  /\bkürzlich\b/i,
  /\bneulich\b/i,
  /\bneueste[nrms]?\b/i,
];

// Current: this month, this year, recent developments
const CURRENT_PATTERNS = [
  /\bdiese[nrms]?\s*monat\b/i,
  /\bletzte[nrms]?\s*monat\b/i,
  /\bdieses\s*jahr\b/i,
  /\bim\s+letzten\s+(monat|jahr)\b/i,
  /\bin\s+den\s+letzten\s+(wochen|monaten)\b/i,
  /\bvor\s+(wenigen\s+)?(wochen|monaten)\b/i,
  /\bentwicklung(en)?\b/i,
  /\bderzeit(ig)?\b/i,
  /\bmomentan\b/i,
  /\bstand\s+(der\s+dinge|heute|jetzt|aktuell)\b/i,
  /\bsituation\b/i,
  /\bstatus\b/i,
];

// German months for absolute date detection
const GERMAN_MONTHS = '(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)';

// Dynamic year detection: current year and next year are "current", current-1 is "recent"
function getYearPatterns(): { currentYears: number[]; recentYear: number } {
  const now = new Date();
  const currentYear = now.getFullYear();
  return {
    currentYears: [currentYear, currentYear + 1],
    recentYear: currentYear - 1,
  };
}

/**
 * Analyze a German query for temporal expressions.
 * Returns urgency level and suggested SearXNG time_range.
 */
export function analyzeTemporality(query: string): TemporalAnalysis {
  // Check immediate patterns
  for (const pattern of IMMEDIATE_PATTERNS) {
    if (pattern.test(query)) {
      return { hasTemporal: true, urgency: 'immediate', suggestedTimeRange: 'day' };
    }
  }

  // Check recent patterns
  for (const pattern of RECENT_PATTERNS) {
    if (pattern.test(query)) {
      return { hasTemporal: true, urgency: 'recent', suggestedTimeRange: 'week' };
    }
  }

  // Check current patterns
  for (const pattern of CURRENT_PATTERNS) {
    if (pattern.test(query)) {
      return { hasTemporal: true, urgency: 'current', suggestedTimeRange: 'month' };
    }
  }

  // Check absolute date patterns
  const { currentYears, recentYear } = getYearPatterns();

  // "Month Year" pattern: "Januar 2026"
  const monthYearPattern = new RegExp(`${GERMAN_MONTHS}\\s+(\\d{4})`, 'i');
  const monthYearMatch = query.match(monthYearPattern);
  if (monthYearMatch) {
    const year = parseInt(monthYearMatch[1]);
    if (currentYears.includes(year)) {
      return { hasTemporal: true, urgency: 'current', suggestedTimeRange: 'month' };
    }
    if (year === recentYear) {
      return { hasTemporal: true, urgency: 'current', suggestedTimeRange: 'year' };
    }
  }

  // Standalone year: "2026", "2025"
  const yearPattern = /\b(20\d{2})\b/;
  const yearMatch = query.match(yearPattern);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    if (currentYears.includes(year)) {
      return { hasTemporal: true, urgency: 'current', suggestedTimeRange: 'year' };
    }
    if (year === recentYear) {
      return { hasTemporal: true, urgency: 'current', suggestedTimeRange: 'year' };
    }
    // Older years don't indicate temporal urgency — they're historical references
  }

  return { hasTemporal: false, urgency: 'none', suggestedTimeRange: undefined };
}
