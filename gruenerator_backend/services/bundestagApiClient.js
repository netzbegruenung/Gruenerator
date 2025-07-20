const axios = require('axios');

/**
 * Bundestag API Client Service
 * 
 * Provides access to the DIP (Dokumentations- und Informationssystem für Parlamentsmaterialien)
 * API to fetch parliamentary documents, proceedings, and activities.
 * 
 * API Documentation: https://search.dip.bundestag.de/api/v1/openapi.yaml
 */
class BundestagApiClient {
  constructor() {
    this.baseURL = 'https://search.dip.bundestag.de/api/v1';
    this.apiKey = process.env.BUNDESTAG_API_KEY;
    
    if (!this.apiKey) {
      console.error('[BundestagAPI] BUNDESTAG_API_KEY environment variable is not set');
      throw new Error('BUNDESTAG_API_KEY environment variable is required');
    }
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Gruenerator/1.0',
        'Authorization': `ApiKey ${this.apiKey}` // Add Authorization header for Bundestag API
      },
      timeout: 10000 // 10 second timeout
    });
  }

  /**
   * Search for Drucksachen (printed documents) with text content
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results (default: 5)
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Array of document objects
   */
  async searchDrucksachenWithText(query, limit = 5, filters = {}) {
    try {
      const params = {
        q: query,
        limit: Math.min(limit, 10), // Cap at 10 to avoid overloading
        apikey: this.apiKey,
        ...filters
      };

      console.log(`[BundestagAPI] Searching Drucksachen with text for query: "${query}"`);
      const response = await this.client.get('/drucksache-text', { params });
      
      if (response.data && response.data.documents) {
        const documents = response.data.documents.slice(0, limit);
        console.log(`[BundestagAPI] Found ${documents.length} Drucksachen with text`);
        
        // Debug: Log field structure of first document
        if (documents.length > 0) {
          const firstDoc = documents[0];
          console.log(`[BundestagAPI] Drucksachen field analysis:`, {
            documentId: firstDoc.id,
            availableFields: Object.keys(firstDoc),
            hasText: !!firstDoc.text,
            textLength: firstDoc.text ? firstDoc.text.length : 0,
            textPreview: firstDoc.text ? firstDoc.text.substring(0, 100) + '...' : 'NO TEXT',
            titel: firstDoc.titel
          });
        }
        
        return documents.map(doc => ({
          id: doc.id,
          title: doc.titel || 'Unbenannte Drucksache',
          type: 'drucksache',
          date: doc.datum,
          text: doc.text,
          nummer: doc.dokumentnummer,
          wahlperiode: doc.wahlperiode,
          dokumentart: doc.dokumentart,
          url: `https://dip.bundestag.de/vorgang/${doc.id}`,
          relevance: 'high' // All results considered relevant for now
        }));
      }
      
      return [];
    } catch (error) {
      console.error('[BundestagAPI] Error searching Drucksachen with text:', error.message);
      throw new Error(`Fehler beim Suchen von Drucksachen: ${error.message}`);
    }
  }

  /**
   * Search for Plenarprotokolle (plenary protocols) with text content
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results (default: 3)
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Array of protocol objects
   */
  async searchPlenarprotokolleWithText(query, limit = 3, filters = {}) {
    try {
      const params = {
        q: query,
        limit: Math.min(limit, 5), // Cap at 5 for protocols as they're longer
        apikey: this.apiKey,
        ...filters
      };

      console.log(`[BundestagAPI] Searching Plenarprotokolle with text for query: "${query}"`);
      const response = await this.client.get('/plenarprotokoll-text', { params });
      
      if (response.data && response.data.documents) {
        const protocols = response.data.documents.slice(0, limit);
        console.log(`[BundestagAPI] Found ${protocols.length} Plenarprotokolle with text`);
        
        // Debug: Log field structure of first document
        if (protocols.length > 0) {
          const firstDoc = protocols[0];
          console.log(`[BundestagAPI] Plenarprotokolle field analysis:`, {
            documentId: firstDoc.id,
            availableFields: Object.keys(firstDoc),
            hasText: !!firstDoc.text,
            textLength: firstDoc.text ? firstDoc.text.length : 0,
            textPreview: firstDoc.text ? firstDoc.text.substring(0, 100) + '...' : 'NO TEXT',
            titel: firstDoc.titel
          });
        }
        
        return protocols.map(doc => ({
          id: doc.id,
          title: doc.titel || `Plenarprotokoll ${doc.dokumentnummer}`,
          type: 'plenarprotokoll',
          date: doc.datum,
          text: doc.text,
          nummer: doc.dokumentnummer,
          wahlperiode: doc.wahlperiode,
          url: `https://dip.bundestag.de/vorgang/${doc.id}`,
          relevance: 'medium'
        }));
      }
      
      return [];
    } catch (error) {
      console.error('[BundestagAPI] Error searching Plenarprotokolle with text:', error.message);
      throw new Error(`Fehler beim Suchen von Plenarprotokollen: ${error.message}`);
    }
  }

  /**
   * Search for Vorgänge (proceedings)
   * @param {string} query - Search query
   * @param {number} limit - Maximum number of results (default: 3)
   * @param {Object} filters - Additional filters
   * @returns {Promise<Array>} Array of proceeding objects
   */
  async searchVorgaenge(query, limit = 3, filters = {}) {
    try {
      const params = {
        q: query,
        limit: Math.min(limit, 5),
        apikey: this.apiKey,
        ...filters
      };

      console.log(`[BundestagAPI] Searching Vorgänge for query: "${query}"`);
      const response = await this.client.get('/vorgang', { params });
      
      if (response.data && response.data.documents) {
        const proceedings = response.data.documents.slice(0, limit);
        console.log(`[BundestagAPI] Found ${proceedings.length} Vorgänge`);
        
        return proceedings.map(doc => ({
          id: doc.id,
          title: doc.titel || 'Unbenannter Vorgang',
          type: 'vorgang',
          date: doc.datum,
          beratungsstand: doc.beratungsstand,
          initiative: doc.initiative,
          sachgebiet: doc.sachgebiet,
          url: `https://dip.bundestag.de/vorgang/${doc.id}`,
          relevance: 'low'
        }));
      }
      
      return [];
    } catch (error) {
      console.error('[BundestagAPI] Error searching Vorgänge:', error.message);
      throw new Error(`Fehler beim Suchen von Vorgängen: ${error.message}`);
    }
  }

  /**
   * Comprehensive search across multiple document types
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Object containing results from different document types
   */
  async searchAll(query, options = {}) {
    const {
      includeDrucksachen = true,
      includePlenarprotokolle = true,
      includeVorgaenge = false, // Disabled by default as they don't have full text
      maxDrucksachen = 5,
      maxPlenarprotokolle = 3,
      maxVorgaenge = 2
    } = options;

    console.log(`[BundestagAPI] Starting comprehensive search for: "${query}"`);
    
    const searchPromises = [];
    
    if (includeDrucksachen) {
      searchPromises.push(
        this.searchDrucksachenWithText(query, maxDrucksachen)
          .catch(error => {
            console.error('[BundestagAPI] Drucksachen search failed:', error.message);
            return [];
          })
      );
    }
    
    if (includePlenarprotokolle) {
      searchPromises.push(
        this.searchPlenarprotokolleWithText(query, maxPlenarprotokolle)
          .catch(error => {
            console.error('[BundestagAPI] Plenarprotokolle search failed:', error.message);
            return [];
          })
      );
    }
    
    if (includeVorgaenge) {
      searchPromises.push(
        this.searchVorgaenge(query, maxVorgaenge)
          .catch(error => {
            console.error('[BundestagAPI] Vorgänge search failed:', error.message);
            return [];
          })
      );
    }

    try {
      const results = await Promise.all(searchPromises);
      
      // Extract individual result arrays
      const drucksachen = includeDrucksachen ? results[0] || [] : [];
      const plenarprotokolle = includePlenarprotokolle ? results[includeDrucksachen ? 1 : 0] || [] : [];
      const vorgaenge = includeVorgaenge ? results[(includeDrucksachen ? 1 : 0) + (includePlenarprotokolle ? 1 : 0)] || [] : [];
      
      // Create flat array with type information
      const flatResults = [
        ...drucksachen.map(doc => ({ ...doc, type: 'drucksache' })),
        ...plenarprotokolle.map(doc => ({ ...doc, type: 'plenarprotokoll' })),
        ...vorgaenge.map(doc => ({ ...doc, type: 'vorgang' }))
      ];
      
      const response = {
        query,
        results: flatResults,
        totalResults: flatResults.length,
        metadata: {
          counts: {
            drucksachen: drucksachen.length,
            plenarprotokolle: plenarprotokolle.length,
            vorgaenge: vorgaenge.length
          }
        }
      };
      
      console.log(`[BundestagAPI] Comprehensive search completed. Total results: ${response.totalResults}`);
      console.log(`[BundestagAPI] Results breakdown: ${drucksachen.length} Drucksachen, ${plenarprotokolle.length} Plenarprotokolle, ${vorgaenge.length} Vorgänge`);
      return response;
    } catch (error) {
      console.error('[BundestagAPI] Error in comprehensive search:', error.message);
      throw new Error(`Fehler bei der Bundestag API Suche: ${error.message}`);
    }
  }

  /**
   * Get document content by ID and type
   * @param {string} id - Document ID
   * @param {string} type - Document type ('drucksache', 'plenarprotokoll', 'vorgang')
   * @returns {Promise<Object>} Document object with content
   */
  async getDocumentById(id, type) {
    try {
      let endpoint;
      switch (type) {
        case 'drucksache':
          endpoint = `/drucksache-text/${id}`;
          break;
        case 'plenarprotokoll':
          endpoint = `/plenarprotokoll-text/${id}`;
          break;
        case 'vorgang':
          endpoint = `/vorgang/${id}`;
          break;
        default:
          throw new Error(`Unbekannter Dokumenttyp: ${type}`);
      }

      console.log(`[BundestagAPI] Fetching document ${id} of type ${type}`);
      console.log(`[BundestagAPI] Using endpoint: ${endpoint}`);
      console.log(`[BundestagAPI] Authentication: Authorization header + apikey query param`);
      
      const response = await this.client.get(endpoint, {
        params: { apikey: this.apiKey } // Keep query param as fallback
      });
      
      if (response.data) {
        console.log(`[BundestagAPI] Successfully fetched document ${id}`);
        console.log(`[BundestagAPI] Document has text content: ${!!response.data.text}, length: ${response.data.text ? response.data.text.length : 0}`);
        
        // Enhanced logging when text is missing
        if (!response.data.text) {
          console.log(`[BundestagAPI] Missing text content for ${id}:`, {
            type,
            endpoint,
            availableFields: Object.keys(response.data),
            hasAbstract: !!response.data.abstract,
            abstractValue: response.data.abstract,
            responseSize: JSON.stringify(response.data).length,
            titel: response.data.titel
          });
        } else {
          console.log(`[BundestagAPI] Document fields: ${Object.keys(response.data).join(', ')}`);
        }
        
        return response.data;
      }
      
      throw new Error('Dokument nicht gefunden');
    } catch (error) {
      console.error(`[BundestagAPI] Error fetching document ${id}:`, error.message);
      throw new Error(`Fehler beim Laden des Dokuments: ${error.message}`);
    }
  }

  /**
   * Test API connection and authentication
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      console.log('[BundestagAPI] Testing API connection...');
      const response = await this.client.get('/drucksache', { 
        params: { 
          limit: 1,
          apikey: this.apiKey 
        } 
      });
      
      const isConnected = response.status === 200;
      console.log(`[BundestagAPI] Connection test ${isConnected ? 'successful' : 'failed'}`);
      return isConnected;
    } catch (error) {
      console.error('[BundestagAPI] Connection test failed:', error.message);
      return false;
    }
  }
}

// Create and export a singleton instance
const bundestagApiClient = new BundestagApiClient();

module.exports = bundestagApiClient;