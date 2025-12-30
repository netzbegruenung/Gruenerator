/**
 * PersonDetectionService for gruenerator-mcp
 * Detects when a query is about a specific German MP (Abgeordneter)
 */

import { getBundestagMCPClient } from './BundestagMCPClient.js';

let mpCache = new Map();
let cacheLastUpdated = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000;

const PERSON_PATTERNS = [
    {
        type: 'explicit',
        re: /\b(?:abgeordnete[r]?|mdb)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
        nameGroup: 1
    },
    {
        type: 'activity_query',
        re: /\b(?:anträge?|reden?|anfragen?|aktivitäten?|abstimmungen?)\s+(?:von|durch|des|der)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
        nameGroup: 1
    },
    {
        type: 'action_query',
        re: /\b(?:was\s+hat|wie\s+hat|hat)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\s+(?:gemacht|beantragt|gesagt|gefordert|vorgeschlagen|abgestimmt)/i,
        nameGroup: 1
    },
    {
        type: 'who_is',
        re: /\bwer\s+ist\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
        nameGroup: 1
    },
    {
        type: 'title',
        re: /\b(?:Dr\.|Prof\.)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[\s-][A-ZÄÖÜ][a-zäöüß]+){0,2})\b/i,
        nameGroup: 1
    },
    {
        type: 'direct_name',
        re: /^([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+){1,2})(?:\s+(?:grüne?|bundestag|fraktion|partei|politik)|\s*$)/i,
        nameGroup: 1
    }
];

const KNOWN_GREEN_MPS = [
    'Ricarda Lang', 'Omid Nouripour', 'Robert Habeck', 'Annalena Baerbock',
    'Katrin Göring-Eckardt', 'Anton Hofreiter', 'Britta Haßelmann',
    'Cem Özdemir', 'Steffi Lemke', 'Lisa Badum', 'Katharina Dröge'
];

class PersonDetectionService {
    constructor() {
        this.mcpClient = getBundestagMCPClient();
    }

    async detectPerson(query) {
        const trimmed = (query || '').trim();
        if (!trimmed || trimmed.length < 3) {
            return { detected: false, confidence: 0 };
        }

        const extractedName = this.extractNameFromQuery(trimmed);
        if (!extractedName) {
            return { detected: false, confidence: 0 };
        }

        console.log(`[PersonDetection] Extracted name: "${extractedName}"`);

        await this.ensureCachePopulated();
        const cachedMatch = this.findMatchingMP(extractedName);

        if (cachedMatch && cachedMatch.confidence >= 0.85) {
            console.log(`[PersonDetection] Cache hit: ${cachedMatch.person.vorname} ${cachedMatch.person.nachname} (${cachedMatch.confidence.toFixed(2)})`);
            return {
                detected: true,
                person: cachedMatch.person,
                confidence: cachedMatch.confidence,
                source: 'cache',
                extractedName
            };
        }

        try {
            const result = await this.mcpClient.searchPersonen({
                query: extractedName,
                fraktion: 'GRÜNE',
                limit: 5
            });

            if (result.documents && result.documents.length > 0) {
                const bestMatch = result.documents[0];
                const fullName = `${bestMatch.vorname} ${bestMatch.nachname}`;
                const confidence = this.calculateNameSimilarity(extractedName, fullName);

                if (confidence >= 0.7) {
                    const cacheKey = this.normalizeForCache(fullName);
                    mpCache.set(cacheKey, bestMatch);

                    return {
                        detected: true,
                        person: bestMatch,
                        confidence,
                        source: 'api',
                        extractedName
                    };
                }
            }
        } catch (error) {
            console.error('[PersonDetection] API search failed:', error.message);
        }

        if (cachedMatch && cachedMatch.confidence >= 0.7) {
            return {
                detected: true,
                person: cachedMatch.person,
                confidence: cachedMatch.confidence,
                source: 'cache_weak',
                extractedName
            };
        }

        return { detected: false, confidence: 0, extractedName };
    }

    extractNameFromQuery(query) {
        for (const pattern of PERSON_PATTERNS) {
            const match = query.match(pattern.re);
            if (match && match[pattern.nameGroup]) {
                const name = match[pattern.nameGroup].trim();
                if (name.length >= 2 && !this.isCommonWord(name)) {
                    return name;
                }
            }
        }

        for (const knownName of KNOWN_GREEN_MPS) {
            if (query.toLowerCase().includes(knownName.toLowerCase())) {
                return knownName;
            }
        }

        return null;
    }

    isCommonWord(word) {
        const commonWords = new Set([
            'der', 'die', 'das', 'und', 'oder', 'aber', 'wie', 'was', 'wer',
            'grüne', 'grünen', 'partei', 'bundestag', 'fraktion', 'antrag',
            'politik', 'deutschland', 'berlin', 'thema', 'frage'
        ]);
        return commonWords.has(word.toLowerCase());
    }

    _isGrueneFraktion(person) {
        const gruenePatterns = ['GRÜNE', 'BÜNDNIS 90/DIE GRÜNEN', 'B90/GRÜNE'];

        const fraktion = person.fraktion;
        if (fraktion) {
            const fraktionArray = Array.isArray(fraktion) ? fraktion : [fraktion];
            if (fraktionArray.some(f => gruenePatterns.some(p => f.includes(p)))) {
                return true;
            }
        }

        if (person.person_roles && Array.isArray(person.person_roles)) {
            for (const role of person.person_roles) {
                if (role.fraktion && gruenePatterns.some(p => role.fraktion.includes(p))) {
                    return true;
                }
            }
        }

        return false;
    }

    findMatchingMP(name) {
        const normalizedSearch = this.normalizeForCache(name);

        if (mpCache.has(normalizedSearch)) {
            return { person: mpCache.get(normalizedSearch), confidence: 1.0 };
        }

        let bestMatch = null;
        let bestSimilarity = 0;

        for (const [cachedName, person] of mpCache.entries()) {
            const similarity = this.calculateNameSimilarity(normalizedSearch, cachedName);
            if (similarity > bestSimilarity && similarity >= 0.7) {
                bestSimilarity = similarity;
                bestMatch = person;
            }
        }

        return bestMatch ? { person: bestMatch, confidence: bestSimilarity } : null;
    }

    calculateNameSimilarity(name1, name2) {
        const n1 = this.normalizeForCache(name1);
        const n2 = this.normalizeForCache(name2);

        if (n1.includes(n2) || n2.includes(n1)) {
            const shorter = n1.length < n2.length ? n1 : n2;
            const longer = n1.length >= n2.length ? n1 : n2;
            return shorter.length / longer.length * 0.95;
        }

        const maxLen = Math.max(n1.length, n2.length);
        if (maxLen === 0) return 1.0;

        const distance = this.levenshteinDistance(n1, n2);
        return 1 - (distance / maxLen);
    }

    levenshteinDistance(s1, s2) {
        const m = s1.length;
        const n = s2.length;
        const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + cost
                );
            }
        }
        return dp[m][n];
    }

    normalizeForCache(name) {
        return (name || '')
            .toLowerCase()
            .replace(/ä/g, 'ae')
            .replace(/ö/g, 'oe')
            .replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss')
            .replace(/[^a-z\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    async ensureCachePopulated() {
        const now = Date.now();
        if (mpCache.size > 0 && (now - cacheLastUpdated) < CACHE_TTL) {
            return;
        }
        await this.refreshMPCache();
    }

    async refreshMPCache() {
        try {
            console.log('[PersonDetection] Refreshing MP cache...');

            const result = await this.mcpClient.searchPersonen({
                fraktion: 'GRÜNE',
                wahlperiode: 20,
                limit: 100
            });

            if (result.documents && result.documents.length > 0) {
                mpCache.clear();

                // First add known MPs to ensure they're in cache
                for (const name of KNOWN_GREEN_MPS) {
                    const normalized = this.normalizeForCache(name);
                    const [vorname, ...rest] = name.split(' ');
                    mpCache.set(normalized, { vorname, nachname: rest.join(' '), fraktion: 'GRÜNE' });
                }

                // Then add from API, filtering to GRÜNE only
                for (const person of result.documents) {
                    const isGruene = this._isGrueneFraktion(person);
                    if (!isGruene) continue;

                    const fullName = `${person.vorname} ${person.nachname}`;
                    const normalizedName = this.normalizeForCache(fullName);
                    mpCache.set(normalizedName, person);

                    const lastName = this.normalizeForCache(person.nachname);
                    if (!mpCache.has(lastName)) {
                        mpCache.set(lastName, person);
                    }
                }
                cacheLastUpdated = Date.now();
                console.log(`[PersonDetection] Cached ${mpCache.size} entries`);
            }
        } catch (error) {
            console.error('[PersonDetection] Cache refresh failed:', error.message);
            for (const name of KNOWN_GREEN_MPS) {
                const normalized = this.normalizeForCache(name);
                if (!mpCache.has(normalized)) {
                    const [vorname, ...rest] = name.split(' ');
                    mpCache.set(normalized, { vorname, nachname: rest.join(' '), fraktion: 'GRÜNE' });
                }
            }
        }
    }

    getCacheStats() {
        return {
            size: mpCache.size,
            lastUpdated: cacheLastUpdated ? new Date(cacheLastUpdated).toISOString() : null,
            ttlRemaining: cacheLastUpdated ? Math.max(0, CACHE_TTL - (Date.now() - cacheLastUpdated)) : 0
        };
    }
}

let serviceInstance = null;

function getPersonDetectionService() {
    if (!serviceInstance) {
        serviceInstance = new PersonDetectionService();
    }
    return serviceInstance;
}

export { PersonDetectionService, getPersonDetectionService };
