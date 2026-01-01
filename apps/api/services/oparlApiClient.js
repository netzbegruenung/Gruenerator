import axios from 'axios';

import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from 'fs';
import path from 'path';

class OparlApiClient {
  constructor() {
    this.endpoints = this._loadEndpoints();
    this.client = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Gruenerator/1.0'
      },
      timeout: 15000
    });
  }

  _loadEndpoints() {
    try {
      const filePath = path.join(__dirname, '../data/oparl-endpoints.json');
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('[OParlAPI] Failed to load endpoints:', error.message);
      return [];
    }
  }

  searchCity(query) {
    if (!query || query.length < 2) return [];

    const normalizedQuery = query.toLowerCase().trim();
    return this.endpoints.filter(endpoint =>
      endpoint.city.toLowerCase().includes(normalizedQuery)
    );
  }

  async getSystem(systemUrl) {
    try {
      console.log(`[OParlAPI] Fetching system: ${systemUrl}`);
      const response = await this.client.get(systemUrl);
      return response.data;
    } catch (error) {
      console.error(`[OParlAPI] Error fetching system:`, error.message);
      throw new Error(`Fehler beim Abrufen des OParl-Systems: ${error.message}`);
    }
  }

  async getBodies(systemUrl) {
    try {
      const system = await this.getSystem(systemUrl);
      const bodyUrl = system.body;

      if (!bodyUrl) {
        throw new Error('Keine Bodies im System gefunden');
      }

      console.log(`[OParlAPI] Fetching bodies from: ${bodyUrl}`);
      const response = await this.client.get(bodyUrl);

      if (Array.isArray(response.data)) {
        return response.data;
      }
      if (response.data?.data) {
        return response.data.data;
      }
      return [response.data];
    } catch (error) {
      console.error(`[OParlAPI] Error fetching bodies:`, error.message);
      throw new Error(`Fehler beim Abrufen der Bodies: ${error.message}`);
    }
  }

  async getOrganizations(bodyOrUrl) {
    try {
      let organizationUrl;

      if (typeof bodyOrUrl === 'string') {
        organizationUrl = bodyOrUrl;
      } else if (bodyOrUrl.organization) {
        organizationUrl = bodyOrUrl.organization;
      } else {
        throw new Error('Keine Organizations-URL gefunden');
      }

      console.log(`[OParlAPI] Fetching organizations from: ${organizationUrl}`);

      // Try with limit=200 first to get more results
      let response;
      try {
        const urlWithLimit = organizationUrl.includes('?')
          ? `${organizationUrl}&limit=200`
          : `${organizationUrl}?limit=200`;
        response = await this.client.get(urlWithLimit);
      } catch (err) {
        // If 400 error, API doesn't support limit param - try without
        if (err.response?.status === 400) {
          console.log(`[OParlAPI] Retrying organizations without limit param`);
          const cleanUrl = organizationUrl.split('?')[0];
          response = await this.client.get(cleanUrl);
        } else {
          throw err;
        }
      }

      if (Array.isArray(response.data)) {
        return response.data;
      }
      if (response.data?.data) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.error(`[OParlAPI] Error fetching organizations:`, error.message);
      throw new Error(`Fehler beim Abrufen der Organisationen: ${error.message}`);
    }
  }

  findGreenFaction(organizations) {
    const greenKeywords = ['grün', 'grüne', 'grünen', 'green', 'bündnis 90', 'b90'];
    const excludeKeywords = ['amt', 'ausschuss', 'dezernat', 'ressort', 'geschäftsbereich', 'umwelt', 'forsten', 'klima'];

    return organizations.filter(org => {
      const name = (org.name || '').toLowerCase();
      const shortName = (org.shortName || '').toLowerCase();
      const classification = (org.classification || '').toLowerCase();

      // Check if it's a green-related organization
      const isGreen = greenKeywords.some(keyword =>
        name.includes(keyword) || shortName.includes(keyword)
      );

      if (!isGreen) return false;

      // Exclude administrative units (Ämter, Ausschüsse, etc.)
      const isAdminUnit = excludeKeywords.some(keyword => name.includes(keyword));
      if (isAdminUnit) return false;

      // Prefer organizations classified as faction/party
      const isFaction = classification.includes('fraktion') ||
                        classification.includes('partei') ||
                        classification.includes('gruppe') ||
                        name.includes('fraktion');

      // If it has faction-like classification, include it
      // If no classification, also include (might still be a faction)
      return isFaction || !classification;
    });
  }

  async getPapers(bodyOrUrl, options = {}) {
    try {
      let paperUrl;

      if (typeof bodyOrUrl === 'string') {
        paperUrl = bodyOrUrl;
      } else if (bodyOrUrl.paper) {
        paperUrl = bodyOrUrl.paper;
      } else {
        throw new Error('Keine Paper-URL gefunden');
      }

      console.log(`[OParlAPI] Fetching papers from: ${paperUrl}`);

      // Try with limit parameter first, fallback to without
      let response;
      try {
        response = await this.client.get(paperUrl, {
          params: options.limit ? { limit: options.limit } : {}
        });
      } catch (err) {
        if (err.response?.status === 400) {
          // API doesn't support limit param, try without
          console.log(`[OParlAPI] Retrying papers without limit param`);
          response = await this.client.get(paperUrl);
        } else {
          throw err;
        }
      }

      let papers = [];
      if (Array.isArray(response.data)) {
        papers = response.data;
      } else if (response.data?.data) {
        papers = response.data.data;
      }

      // If limit was requested, slice the results
      if (options.limit && papers.length > options.limit) {
        papers = papers.slice(0, options.limit);
      }

      return papers;
    } catch (error) {
      console.error(`[OParlAPI] Error fetching papers:`, error.message);
      throw new Error(`Fehler beim Abrufen der Papers: ${error.message}`);
    }
  }

  async getGreenPapers(systemUrl, limit = 50) {
    try {
      const bodies = await this.getBodies(systemUrl);

      if (!bodies || bodies.length === 0) {
        throw new Error('Keine Bodies gefunden');
      }

      const body = bodies[0];
      console.log(`[OParlAPI] Using body: ${body.name || body.id}`);

      const organizations = await this.getOrganizations(body);
      const greenFactions = this.findGreenFaction(organizations);

      console.log(`[OParlAPI] Found ${greenFactions.length} green faction(s)`);

      const greenFactionIds = new Set(greenFactions.map(org => org.id));

      const allPapers = await this.getPapers(body, { limit });

      const greenPapers = allPapers.filter(paper => {
        // Method 1: Check originatorOrganization
        if (paper.originatorOrganization) {
          const originators = Array.isArray(paper.originatorOrganization)
            ? paper.originatorOrganization
            : [paper.originatorOrganization];

          if (originators.some(org => greenFactionIds.has(org))) {
            return true;
          }
        }

        // Method 2: Check paperType for "Grün" keyword
        const paperType = (paper.paperType || '').toLowerCase();
        if (paperType.includes('grün') || paperType.includes('grüne')) {
          return true;
        }

        // Method 3: Check consultation organizations
        if (paper.consultation && Array.isArray(paper.consultation)) {
          for (const consult of paper.consultation) {
            if (consult.organization) {
              const consultOrgs = Array.isArray(consult.organization)
                ? consult.organization
                : [consult.organization];
              if (consultOrgs.some(org => greenFactionIds.has(org))) {
                return true;
              }
            }
          }
        }

        // Method 4: Check underDirectionOf
        if (paper.underDirectionOf) {
          const directors = Array.isArray(paper.underDirectionOf)
            ? paper.underDirectionOf
            : [paper.underDirectionOf];
          if (directors.some(org => greenFactionIds.has(org))) {
            return true;
          }
        }

        return false;
      });

      console.log(`[OParlAPI] Found ${greenPapers.length} papers from green factions out of ${allPapers.length} total`);

      return {
        papers: greenPapers,
        totalPapers: allPapers.length,
        greenFactions: greenFactions.map(f => ({ id: f.id, name: f.name, shortName: f.shortName })),
        body: { id: body.id, name: body.name },
        hasGreenFactionData: greenFactions.length > 0
      };
    } catch (error) {
      console.error(`[OParlAPI] Error getting green papers:`, error.message);
      throw error;
    }
  }

  getAllEndpoints() {
    return this.endpoints;
  }

  /**
   * Get ALL green papers with pagination support and multi-method detection
   * Used by scraper to fetch all available papers
   */
  async getAllGreenPapers(systemUrl, options = {}) {
    const GREEN_KEYWORDS = ['grün', 'grüne', 'grünen', 'bündnis 90', 'b90', 'green'];
    const { maxPages = 50, pageSize = 100 } = options;

    try {
      const bodies = await this.getBodies(systemUrl);
      if (!bodies || bodies.length === 0) {
        throw new Error('Keine Bodies gefunden');
      }

      const body = bodies[0];
      console.log(`[OParlAPI] getAllGreenPapers: Using body "${body.name || body.id}"`);

      // Get organizations for faction detection
      const organizations = await this.getOrganizations(body);
      const greenFactions = this.findGreenFaction(organizations);
      const greenFactionIds = new Set(greenFactions.map(org => org.id));

      console.log(`[OParlAPI] Found ${greenFactions.length} green faction(s)`);

      // Fetch papers with pagination
      let paperUrl = body.paper;
      if (!paperUrl) {
        throw new Error('Keine Paper-URL gefunden');
      }

      const allGreenPapers = [];
      let pageNum = 1;
      let totalPapersScanned = 0;
      let emptyPages = 0;

      while (pageNum <= maxPages && emptyPages < 3) {
        console.log(`[OParlAPI] Fetching papers page ${pageNum}...`);

        let response;
        try {
          // Use page= parameter for pagination (works with most OParl APIs)
          const separator = paperUrl.includes('?') ? '&' : '?';
          const paginatedUrl = `${paperUrl}${separator}limit=${pageSize}&page=${pageNum}`;
          response = await this.client.get(paginatedUrl);
        } catch (err) {
          if (err.response?.status === 400) {
            // Try without page param (some APIs don't support it)
            try {
              const separator = paperUrl.includes('?') ? '&' : '?';
              response = await this.client.get(`${paperUrl}${separator}limit=${pageSize}`);
              // If no page support, we can only get one page
              pageNum = maxPages + 1;
            } catch (retryErr) {
              console.log(`[OParlAPI] Page ${pageNum} failed, stopping pagination`);
              break;
            }
          } else if (err.response?.status >= 500) {
            console.log(`[OParlAPI] Server error on page ${pageNum}, trying next page...`);
            pageNum++;
            emptyPages++;
            continue;
          } else {
            throw err;
          }
        }

        if (!response) break;

        const papers = response.data?.data || (Array.isArray(response.data) ? response.data : []);
        totalPapersScanned += papers.length;

        if (papers.length === 0) {
          emptyPages++;
          pageNum++;
          continue;
        }

        emptyPages = 0;

        // Detect green papers using multiple methods (priority order from testing)
        let greenFoundThisPage = 0;
        for (const paper of papers) {
          const detection = this._detectGreenPaper(paper, greenFactionIds, GREEN_KEYWORDS);
          if (detection.isGreen) {
            allGreenPapers.push({
              ...paper,
              _detectionMethod: detection.method
            });
            greenFoundThisPage++;
          }
        }

        console.log(`[OParlAPI] Page ${pageNum}: ${papers.length} papers, ${greenFoundThisPage} green`);

        // If we got less than pageSize, we've reached the end
        if (papers.length < pageSize) {
          break;
        }

        pageNum++;
      }

      console.log(`[OParlAPI] getAllGreenPapers: Found ${allGreenPapers.length} green papers (scanned ${totalPapersScanned} total across ${pageNum - 1} pages)`);

      return {
        papers: allGreenPapers,
        greenFactions: greenFactions.map(f => ({ id: f.id, name: f.name, shortName: f.shortName })),
        body: { id: body.id, name: body.name },
        stats: { totalScanned: totalPapersScanned, pagesScanned: pageNum - 1 }
      };
    } catch (error) {
      console.error(`[OParlAPI] Error in getAllGreenPapers:`, error.message);
      throw error;
    }
  }

  /**
   * Multi-method green paper detection based on empirical testing results
   * Priority order: nameKeyword (38 papers) > auxiliaryFileName (32) > paperType (16) > mainFileName (14)
   */
  _detectGreenPaper(paper, greenFactionIds, keywords) {
    // Method 1: nameKeyword - 38 papers in 15 cities (BEST)
    const name = (paper.name || '').toLowerCase();
    if (keywords.some(kw => name.includes(kw))) {
      return { isGreen: true, method: 'nameKeyword' };
    }

    // Method 2: auxiliaryFileName - 32 papers in 8 cities
    if (paper.auxiliaryFile && Array.isArray(paper.auxiliaryFile)) {
      for (const file of paper.auxiliaryFile) {
        const fileName = (file.name || file.fileName || '').toLowerCase();
        if (keywords.some(kw => fileName.includes(kw))) {
          return { isGreen: true, method: 'auxiliaryFileName' };
        }
      }
    }

    // Method 3: paperType - 16 papers in 4 cities
    const paperType = (paper.paperType || '').toLowerCase();
    if (keywords.some(kw => paperType.includes(kw))) {
      return { isGreen: true, method: 'paperType' };
    }

    // Method 4: mainFileName - 14 papers in 8 cities
    if (paper.mainFile) {
      const mainFileName = (paper.mainFile.name || paper.mainFile.fileName || '').toLowerCase();
      if (keywords.some(kw => mainFileName.includes(kw))) {
        return { isGreen: true, method: 'mainFileName' };
      }
    }

    return { isGreen: false, method: null };
  }
}

const oparlApiClient = new OparlApiClient();
export default oparlApiClient;