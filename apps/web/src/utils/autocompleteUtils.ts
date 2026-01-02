/**
 * Autocomplete Utilities
 * Provides fuzzy matching, alias support, and react-select integration
 */

/**
 * Platform aliases for social media generators
 * Maps platform IDs to common shorthand names
 */
export const PLATFORM_ALIASES = {
  instagram: ['insta', 'ig', 'gram'],
  facebook: ['fb', 'face'],
  twitter: ['x', 'tweet', 'tw', 'mastodon', 'masto', 'bsky', 'bluesky'],
  linkedin: ['li', 'linked'],
  pressemitteilung: ['presse', 'pm', 'press'],
  sharepic: ['share', 'pic', 'bild'],
  actionIdeas: ['action', 'aktion', 'ideen', 'idee'],
  reelScript: ['reel', 'tiktok', 'script', 'skript', 'video']
};

/**
 * Fuzzy match score between input and target
 * @param input - User input to match
 * @param target - Target string to match against
 * @returns Score from 0 to 1 (1 = exact match)
 */
export const fuzzyMatch = (input: string | null | undefined, target: string | null | undefined): number => {
  if (!input || !target) return 0;

  const inputLower = input.toLowerCase().trim();
  const targetLower = target.toLowerCase().trim();

  if (inputLower === targetLower) return 1;

  if (targetLower.startsWith(inputLower)) {
    return 0.9 + (inputLower.length / targetLower.length) * 0.1;
  }

  if (targetLower.includes(inputLower)) {
    return 0.7 + (inputLower.length / targetLower.length) * 0.2;
  }

  const words = targetLower.split(/(?=[A-Z])|[-_\s]/);
  for (const word of words) {
    if (word.startsWith(inputLower)) {
      return 0.8;
    }
  }

  return 0;
};

/**
 * Find matches with alias support
 * @param {string} input - User input
 * @param {Array} options - Array of { value, label } objects
 * @param {Object} config - Configuration options
 * @returns {Object} { matches, bestMatch, isUniqueMatch }
 */
interface FindMatchesConfig {
  aliases?: Record<string, string[]>;
  threshold?: number;
  minChars?: number;
}

interface OptionItem {
  value?: string;
  id?: string;
  label?: string;
  [key: string]: unknown;
}

export const findMatches = (input: string, options: OptionItem[], config: FindMatchesConfig = {}) => {
  const { aliases = PLATFORM_ALIASES, threshold = 0.5, minChars = 1 } = config;

  if (!input || input.length < minChars) {
    return { matches: options, bestMatch: null, isUniqueMatch: false };
  }

  const inputLower = input.toLowerCase().trim();

  for (const [value, aliasArray] of Object.entries(aliases)) {
    if ((aliasArray as string[]).some((alias: string) => alias.toLowerCase() === inputLower)) {
      const exactMatch = options.find(opt =>
        (opt.value || opt.id) === value
      );
      if (exactMatch) {
        return {
          matches: [exactMatch],
          bestMatch: exactMatch,
          isUniqueMatch: true
        };
      }
    }
  }

  const scored = options.map(option => {
    const label = option.label || '';
    const value = option.value || option.id || '';
    const optionAliases = (aliases as Record<string, string[]>)[value] || [];

    const scores = [
      fuzzyMatch(input, label as string),
      fuzzyMatch(input, value as string),
      ...optionAliases.map((alias: string) => fuzzyMatch(input, alias))
    ];

    return {
      option,
      score: Math.max(...scores)
    };
  });

  const matches = scored
    .filter(s => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .map(s => s.option);

  return {
    matches,
    bestMatch: matches[0] || null,
    isUniqueMatch: matches.length === 1
  };
};

interface FilterOption {
  value: string;
  label: string;
}

/**
 * Create filter option function for react-select
 * @param aliases - Alias map (defaults to PLATFORM_ALIASES)
 * @returns Filter function for react-select
 */
export const createFilterOption = (aliases: Record<string, string[]> = PLATFORM_ALIASES) => {
  return (option: FilterOption, inputValue: string): boolean => {
    if (!inputValue) return true;

    const optionData = {
      value: option.value,
      label: option.label
    };

    const { matches } = findMatches(inputValue, [optionData], { aliases, threshold: 0.5 });
    return matches.length > 0;
  };
};

/**
 * Check if input exactly matches an alias
 * @param input - User input
 * @param aliases - Alias map
 * @returns Matched platform value or null
 */
export const getExactAliasMatch = (input: string | null | undefined, aliases: Record<string, string[]> = PLATFORM_ALIASES): string | null => {
  if (!input) return null;

  const inputLower = input.toLowerCase().trim();

  for (const [value, aliasArray] of Object.entries(aliases)) {
    if (aliasArray.some(alias => alias.toLowerCase() === inputLower)) {
      return value;
    }
  }

  return null;
};

/**
 * Detect platform mentions in text content
 * Scans text for platform names and aliases, returns detected platform IDs
 * @param text - Text content to scan
 * @param aliases - Alias map (defaults to PLATFORM_ALIASES)
 * @returns Array of detected platform IDs
 */
export const detectPlatformsInText = (text: string | null | undefined, aliases: Record<string, string[]> = PLATFORM_ALIASES): string[] => {
  if (!text) return [];

  const textLower = text.toLowerCase();
  const detectedPlatforms = new Set<string>();

  for (const [platformId, platformAliases] of Object.entries(aliases)) {
    const platformLower = platformId.toLowerCase();
    const wordBoundaryPattern = new RegExp(`\\b${platformLower}\\b`, 'i');
    if (wordBoundaryPattern.test(text)) {
      detectedPlatforms.add(platformId);
      continue;
    }

    for (const alias of platformAliases) {
      const aliasPattern = new RegExp(`\\b${alias.toLowerCase()}\\b`, 'i');
      if (aliasPattern.test(text)) {
        detectedPlatforms.add(platformId);
        break;
      }
    }
  }

  return Array.from(detectedPlatforms);
};
