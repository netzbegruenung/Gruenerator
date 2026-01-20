/**
 * Client for the Bundestag MCP Server
 * Calls the bundestag-mcp server for DIP API data
 */

const BUNDESTAG_MCP_URL = process.env.BUNDESTAG_MCP_URL || 'https://bundestagapi.moritz-waechter.de';
const REQUEST_TIMEOUT = 30000;

class BundestagMCPClient {
    private baseUrl: string;

    constructor(baseUrl = BUNDESTAG_MCP_URL) {
        this.baseUrl = baseUrl;
    }

    async _callTool(toolName: string, args: Record<string, unknown> = {}) {
        const url = `${this.baseUrl}/mcp`;

        const body = {
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

            const result = await response.json();

            if (result.error) {
                throw new Error(result.error.message || 'MCP tool call failed');
            }

            if (result.result?.content?.[0]?.text) {
                const parsed = JSON.parse(result.result.content[0].text);
                // Normalize: API returns 'results', services expect 'documents'
                if (parsed.results && !parsed.documents) {
                    parsed.documents = parsed.results;
                }
                return parsed;
            }

            return result.result;
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error(`Bundestag MCP timeout after ${REQUEST_TIMEOUT}ms`);
            }
            throw err;
        }
    }

    async searchPersonen(params: Record<string, unknown> = {}) {
        return this._callTool('bundestag_search_personen', {
            query: params.query,
            fraktion: params.fraktion,
            wahlperiode: params.wahlperiode || 20,
            limit: params.limit || 10
        });
    }

    async getPerson(id) {
        return this._callTool('bundestag_get_person', { id: String(id) });
    }

    async searchDrucksachen(params: Record<string, unknown> = {}) {
        return this._callTool('bundestag_search_drucksachen', {
            query: params.query,
            urheber: params.urheber,
            drucksachetyp: params.drucksachetyp,
            wahlperiode: params.wahlperiode || 20,
            limit: params.limit || 20
        });
    }

    async searchAktivitaeten(params: Record<string, unknown> = {}) {
        return this._callTool('bundestag_search_aktivitaeten', {
            person_id: params.person_id ? String(params.person_id) : undefined,
            aktivitaetsart: params.aktivitaetsart,
            wahlperiode: params.wahlperiode || 20,
            limit: params.limit || 30
        });
    }
}

let clientInstance = null;

function getBundestagMCPClient() {
    if (!clientInstance) {
        clientInstance = new BundestagMCPClient();
    }
    return clientInstance;
}

export { BundestagMCPClient, getBundestagMCPClient };
