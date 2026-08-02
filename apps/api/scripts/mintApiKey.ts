/**
 * Admin script — mint an API key for external programmatic access.
 *
 * Usage:
 *   pnpm --filter @gruenerator/api mint-api-key \
 *     --user <user-id> \
 *     --label "partner X" \
 *     --lv HH,BY \
 *     [--expires-in-days 365] \
 *     [--rate-limit 60]
 *
 * Use `--lv '*'` to grant access to all Landesverbände.
 *
 * `--scope` defaults to `notebooks:read`. For the Excel add-in mint a key with
 * `--scope chat:completions` — that one takes no `--lv`.
 *
 * Am MCP-Endpunkt öffnet `notebooks:read` zweierlei: die Werkzeuge
 * `notebooks_*` für die hier vergebenen Landesverbände und die Suche im
 * öffentlichen Programmkorpus. Die Zuordnung steht in
 * `routes/mcp-server/mcpAuth.ts` — `permissions` und `MCP_SCOPES` sind zwei
 * verschiedene Mengen.
 *
 * Prints the plaintext key ONCE — store it immediately, it cannot be recovered.
 */

// Muss vor jedem Import stehen, der `config/env.js` zieht: ESM wertet Importe
// in Quelltextreihenfolge aus, und `env.ts` parst `process.env` beim Laden.
// Ohne diese Zeile laeuft das Skript ohne .env und findet keine Datenbank.
import 'dotenv/config';

import { randomBytes } from 'crypto';

import {
  API_KEY_PERMISSIONS,
  api_keys,
  isApiKeyPermission,
  type ApiKeyScopes,
} from '../database/schema/apiKeys.js';
import { getDrizzleInstance } from '../database/services/DrizzleService.js';
import { getPostgresInstance } from '../database/services/PostgresService/PostgresService.js';
import { hashApiKey } from '../middleware/apiKeyMiddleware.js';

interface ParsedArgs {
  user?: string;
  label?: string;
  lv?: string;
  scope?: string;
  expiresInDays?: number;
  rateLimit?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--user') out.user = value;
    else if (flag === '--label') out.label = value;
    else if (flag === '--lv') out.lv = value;
    else if (flag === '--scope') out.scope = value;
    else if (flag === '--expires-in-days') out.expiresInDays = Number(value);
    else if (flag === '--rate-limit') out.rateLimit = Number(value);
    else continue;
    i++;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.user) throw new Error('--user <profile-id> is required');
  if (!args.label) throw new Error('--label "<description>" is required');

  const permissions = (args.scope ?? 'notebooks:read')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const unknown = permissions.filter((p) => !isApiKeyPermission(p));
  if (unknown.length > 0) {
    throw new Error(
      `Unbekannte Berechtigung(en): ${unknown.join(', ')}. Erlaubt: ${API_KEY_PERMISSIONS.join(', ')}`
    );
  }

  const scopes: ApiKeyScopes = { permissions };

  // Landesverband-Scope gilt nur für die Notebook-Lesezugriffe. Ein reiner
  // chat:completions-Schlüssel hat damit nichts zu tun und soll ihn auch nicht
  // tragen — sonst wächst der Zugriff eines Schlüssels über seinen Zweck hinaus.
  if (permissions.includes('notebooks:read')) {
    if (!args.lv) throw new Error('--lv HH,BY (or "*") is required for notebooks:read');
    scopes.landesverbaende =
      args.lv === '*'
        ? '*'
        : args.lv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
  } else if (args.lv) {
    throw new Error('--lv is only meaningful together with --scope notebooks:read');
  }

  // Initialize Postgres pool so DrizzleInstance can attach.
  await getPostgresInstance().init();

  const plaintext = `gru_${randomBytes(32).toString('hex')}`;
  const hash = hashApiKey(plaintext);
  const prefix = plaintext.slice(0, 12);

  const expiresAt =
    args.expiresInDays && args.expiresInDays > 0
      ? new Date(Date.now() + args.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const db = getDrizzleInstance();
  const [row] = await db
    .insert(api_keys)
    .values({
      user_id: args.user,
      key_hash: hash,
      key_prefix: prefix,
      label: args.label,
      scopes,
      ...(args.rateLimit && args.rateLimit > 0 && { rate_limit_per_minute: args.rateLimit }),
      ...(expiresAt && { expires_at: expiresAt }),
    })
    .returning({ id: api_keys.id });

  console.log('');
  console.log('=== API key minted ===');
  console.log(`id        : ${row.id}`);
  console.log(`user      : ${args.user}`);
  console.log(`label     : ${args.label}`);
  console.log(`scopes    : ${JSON.stringify(scopes)}`);
  console.log(`prefix    : ${prefix}`);
  console.log(`expires   : ${expiresAt ? expiresAt.toISOString() : 'never'}`);
  console.log('');
  console.log(`PLAINTEXT KEY (store now — cannot be recovered):`);
  console.log(`  ${plaintext}`);
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('[mintApiKey] FAILED:', err);
  process.exit(1);
});
