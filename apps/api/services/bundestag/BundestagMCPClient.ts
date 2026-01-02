/**
 * Client for the Bundestag MCP Server
 * Calls the existing bundestag-mcp server at https://bundestagapi.moritz-waechter.de
 * instead of directly calling the DIP API
 */

import type {
  PersonSearchParams,
  DrucksachenSearchParams,
  AktivitaetenSearchParams,
  SearchResult
} from './types.js';

const BUNDESTAG_MCP_URL = process.env.BUNDESTAG_MCP_URL || 'https://bundestagapi.moritz-waechter.de';
const REQUEST_TIMEOUT = 30000;

/**
 * MCP JSON-RPC request structure
 */
interface MCPRequest {
    jsonrpc: '2.0';
    id: number;
    method: 'tools/call';
    params: {
        name: string;
        arguments: Record<string, any>;
    };
}

/**
 * MCP JSON-RPC response structure
 */
interface MCPResponse {
    jsonrpc: '2.0';
    id: number;
    result?: {
        content?: Array<{
            type: string;
            text: string;
        }>;
    };
    error?: {
        code: number;
        message: string;
    };
}

class BundestagMCPClient {
    private baseUrl: string;
    private sessionId: string | null;

    constructor(baseUrl: string = BUNDESTAG_MCP_URL) {
        this.baseUrl = baseUrl;
        this.sessionId = null;
    }

    private async _callTool(toolName: string, args: Record<string, any> = {}): Promise<SearchResult> {
        const url = `${this.baseUrl}/mcp`;

        const body: MCPRequest = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
                name: toolName,
                arguments: args
            }
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json, text/event-stream'
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Bundestag MCP error: ${response.status}`);
            }

            const result: MCPResponse = await response.json();

            if (result.error) {
                throw new Error(result.error.message || 'MCP tool call failed');
            }

            // Parse the content from MCP response
            if (result.result?.content?.[0]?.text) {
                const parsed = JSON.parse(result.result.content[0].text);
                // Normalize: API returns 'results', services expect 'documents'
                if (parsed.results && !parsed.documents) {
                    parsed.documents = parsed.results;
                }
                return parsed;
            }

            return result.result || {};
        } catch (err) {
            clearTimeout(timeoutId);
            if (err instanceof Error && err.name === 'AbortError') {
                throw new Error(`Bundestag MCP timeout after ${REQUEST_TIMEOUT}ms`);
            }
            throw err;
        }
    }

    /**
     * Search for MPs/persons
     * @param params - Search parameters
     * @returns Search results
     */
    async searchPersonen(params: PersonSearchParams = {}): Promise<SearchResult> {
        return this._callTool('bundestag_search_personen', {
            query: params.query,
            fraktion: params.fraktion,
            wahlperiode: params.wahlperiode || 20,
            limit: params.limit || 10
        });
    }

    /**
     * Get a specific person by ID
     * @param id - Person ID
     * @returns Person details
     */
    async getPerson(id: string | number): Promise<SearchResult> {
        return this._callTool('bundestag_get_person', { id: String(id) });
    }

    /**
     * Search Drucksachen (parliamentary documents)
     * @param params - Search parameters
     * @returns Search results
     */
    async searchDrucksachen(params: DrucksachenSearchParams = {}): Promise<SearchResult> {
        return this._callTool('bundestag_search_drucksachen', {
            query: params.query,
            urheber: params.urheber,
            drucksachetyp: params.drucksachetyp,
            wahlperiode: params.wahlperiode || 20,
            limit: params.limit || 20
        });
    }

    /**
     * Search activities (speeches, questions, etc.)
     * @param params - Search parameters
     * @returns Search results
     */
    async searchAktivitaeten(params: AktivitaetenSearchParams = {}): Promise<SearchResult> {
        return this._callTool('bundestag_search_aktivitaeten', {
            person_id: params.person_id ? String(params.person_id) : undefined,
            aktivitaetsart: params.aktivitaetsart,
            wahlperiode: params.wahlperiode || 20,
            limit: params.limit || 30
        });
    }
}

// Singleton instance
let clientInstance: BundestagMCPClient | null = null;

function getBundestagMCPClient(): BundestagMCPClient {
    if (!clientInstance) {
        clientInstance = new BundestagMCPClient();
    }
    return clientInstance;
}

export {
    BundestagMCPClient,
    getBundestagMCPClient
};
