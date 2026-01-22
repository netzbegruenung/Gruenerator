import { z } from 'zod';

export const clientConfigTool = {
  name: 'get_client_config',
  description: 'Generiert eine fertige Konfiguration für verschiedene MCP-Clients (Claude Desktop, Cursor, VS Code). Gibt JSON zurück, das direkt in die jeweilige Config-Datei eingefügt werden kann.',

  inputSchema: {
    client: z.enum(['claude', 'cursor', 'vscode', 'chatgpt']).describe('Für welchen Client die Config generiert werden soll: claude, cursor, vscode, oder chatgpt')
  },

  handler({ client }, baseUrl) {
    const configs = {
      claude: {
        description: 'Füge dies zu deiner claude_desktop_config.json hinzu',
        configPath: {
          macos: '~/Library/Application Support/Claude/claude_desktop_config.json',
          windows: '%APPDATA%\\Claude\\claude_desktop_config.json',
          linux: '~/.config/Claude/claude_desktop_config.json'
        },
        config: {
          mcpServers: {
            gruenerator: {
              url: `${baseUrl}/mcp`
            }
          }
        }
      },

      cursor: {
        description: 'Füge dies zu deiner Cursor MCP-Konfiguration hinzu',
        configPath: {
          all: '.cursor/mcp.json im Projektordner oder global in den Cursor-Einstellungen'
        },
        config: {
          mcpServers: {
            gruenerator: {
              url: `${baseUrl}/mcp`
            }
          }
        }
      },

      vscode: {
        description: 'Füge dies zu deiner VS Code settings.json hinzu (GitHub Copilot MCP)',
        configPath: {
          all: 'VS Code Einstellungen (Cmd/Ctrl+,) → Suche nach "mcp"'
        },
        config: {
          'mcp.servers': {
            gruenerator: {
              type: 'http',
              url: `${baseUrl}/mcp`
            }
          }
        }
      },

      chatgpt: {
        description: 'In ChatGPT: Settings → Connectors → Create',
        configPath: {
          all: 'ChatGPT Settings → Apps & Connectors → Connectors → Create'
        },
        config: {
          url: `${baseUrl}/mcp`,
          note: 'Paste the URL when creating a new connector'
        }
      }
    };

    const clientConfig = configs[client];

    return {
      client,
      serverUrl: `${baseUrl}/mcp`,
      ...clientConfig,
      instructions: [
        `1. ${clientConfig.description}`,
        '2. Kopiere die "config" in deine Konfigurationsdatei',
        '3. Starte die Anwendung neu',
        '4. Der Gruenerator MCP Server sollte nun verfügbar sein'
      ]
    };
  }
};

function _generateClientConfigs(baseUrl: string) {
  return {
    claude: clientConfigTool.handler({ client: 'claude' }, baseUrl),
    cursor: clientConfigTool.handler({ client: 'cursor' }, baseUrl),
    vscode: clientConfigTool.handler({ client: 'vscode' }, baseUrl),
    chatgpt: clientConfigTool.handler({ client: 'chatgpt' }, baseUrl)
  };
}
