#!/usr/bin/env node
// Hand-ported JS twin of diagnose-federated-links.ts for running inside the
// production gruenerator-api container (which ships only compiled `dist/`).
// Drop this file at /app/apps/api/dist/scripts/diag.mjs so the relative
// imports below resolve into the existing compiled modules.

import dotenv from 'dotenv';
dotenv.config();

import { KeycloakApiClient } from '../utils/keycloak/apiClient.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';

const KEYCLOAK_USERS_PAGE_SIZE = 50;

function parseArgs() {
  const args = process.argv.slice(2);
  let email;
  let fix = false;
  let verbose = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[i + 1];
      i++;
    } else if (args[i] === '--fix') {
      fix = true;
    } else if (args[i] === '--verbose') {
      verbose = true;
    }
  }
  return { email, fix, verbose };
}

async function getAllKeycloakUsers(client) {
  const all = [];
  let offset = 0;
  while (true) {
    const users = await client.listUsers(offset, KEYCLOAK_USERS_PAGE_SIZE);
    if (!users || users.length === 0) break;
    all.push(...users);
    console.log(`  Fetched ${all.length} users...`);
    if (users.length < KEYCLOAK_USERS_PAGE_SIZE) break;
    offset += KEYCLOAK_USERS_PAGE_SIZE;
  }
  return all;
}

async function deleteFederatedLink(client, userId, provider) {
  try {
    await client.deleteFederatedIdentity(userId, provider);
    return true;
  } catch (error) {
    console.error(
      `  Failed to delete link for ${userId}/${provider}:`,
      error?.response?.data || (error instanceof Error ? error.message : String(error))
    );
    return false;
  }
}

async function main() {
  const { email, fix, verbose } = parseArgs();

  console.log('='.repeat(70));
  console.log('Federated Identity Link Diagnostic');
  console.log('='.repeat(70));
  console.log(`Mode: ${fix ? 'FIX (will delete stale links)' : 'READ-ONLY (diagnosis only)'}`);
  if (email) console.log(`Filter: ${email}`);
  console.log();

  const kcClient = new KeycloakApiClient();

  try {
    const connected = await kcClient.testConnection();
    if (!connected) {
      console.error('Failed to connect to Keycloak Admin API. Check credentials.');
      process.exit(1);
    }
    console.log('Keycloak connection: OK\n');
  } catch (err) {
    console.error('Keycloak connection failed:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let db = null;
  try {
    db = getPostgresInstance();
    await db.init();
    console.log('Database connection: OK\n');
  } catch (err) {
    console.error('Database connection failed:', err instanceof Error ? err.message : String(err));
    console.log('Continuing without DB cross-reference.\n');
    db = null;
  }

  console.log('Fetching Keycloak users...');
  let kcUsers;
  if (email) {
    const u = await kcClient.findUserByEmail(email);
    kcUsers = u ? [u] : [];
    if (kcUsers.length === 0) {
      console.log(`No Keycloak user found with email: ${email}`);
      process.exit(0);
    }
  } else {
    kcUsers = await getAllKeycloakUsers(kcClient);
  }
  console.log(`Found ${kcUsers.length} Keycloak user(s)\n`);

  const results = [];
  let processed = 0;
  for (const user of kcUsers) {
    processed++;
    if (processed % 20 === 0) console.log(`  Processing ${processed}/${kcUsers.length}...`);

    const fedLinks = await kcClient.getUserFederatedIdentities(user.id);
    const result = {
      keycloakId: user.id,
      email: user.email || '(no email)',
      username: user.username || '(no username)',
      federatedLinks: fedLinks,
      profileMatch: 'no_profile',
      profileKeycloakId: undefined,
      issues: [],
    };

    if (db) {
      try {
        const profile = await db.queryOne(
          'SELECT id, keycloak_id, email FROM profiles WHERE keycloak_id = $1',
          [user.id]
        );
        if (profile) {
          result.profileMatch = 'matched';
          result.profileKeycloakId = profile.keycloak_id;
        } else {
          const profileByEmail = user.email
            ? await db.queryOne(
                'SELECT id, keycloak_id, email FROM profiles WHERE LOWER(email) = LOWER($1)',
                [user.email]
              )
            : null;
          if (profileByEmail) {
            result.profileMatch = 'orphaned_profile';
            result.profileKeycloakId = profileByEmail.keycloak_id;
            result.issues.push(
              `Profile exists by email but keycloak_id mismatch: profile has "${profileByEmail.keycloak_id}", Keycloak user is "${user.id}"`
            );
          }
        }
      } catch {}
    }

    if (!user.email) result.issues.push('Keycloak user has no email — cannot auto-link');

    if (
      fedLinks.length === 0 &&
      (!user.federatedIdentities || user.federatedIdentities.length === 0) &&
      user.email &&
      result.profileMatch !== 'no_profile'
    ) {
      result.issues.push(
        'No federated identity links found, but profile exists — link may have been lost'
      );
    }

    results.push(result);
  }

  const problematic = results.filter((r) => r.issues.length > 0);
  const display = verbose ? results : problematic;

  console.log('\n' + '='.repeat(70));
  console.log(`RESULTS: ${problematic.length} problematic / ${results.length} total users`);
  console.log('='.repeat(70) + '\n');

  if (display.length === 0) {
    console.log('No issues found. All federated identity links appear healthy.');
  }

  for (const r of display) {
    const icon = r.issues.length > 0 ? '!!' : 'OK';
    console.log(`[${icon}] ${r.email} (${r.username})`);
    console.log(`    Keycloak ID: ${r.keycloakId}`);
    console.log(
      `    Profile:     ${r.profileMatch}${r.profileKeycloakId ? ` (profile keycloak_id: ${r.profileKeycloakId})` : ''}`
    );
    console.log(
      `    Fed. Links:  ${r.federatedLinks.length > 0 ? r.federatedLinks.map((l) => `${l.identityProvider} → ${l.userId}`).join(', ') : '(none)'}`
    );
    for (const issue of r.issues) console.log(`    ISSUE: ${issue}`);
    console.log();
  }

  if (fix && problematic.length > 0) {
    console.log('='.repeat(70));
    console.log('APPLYING FIXES');
    console.log('='.repeat(70) + '\n');
    let fixed = 0;
    let failed = 0;
    for (const r of problematic) {
      if (r.federatedLinks.length > 0) {
        for (const link of r.federatedLinks) {
          console.log(`Deleting stale link: ${r.email} → ${link.identityProvider} (${link.userId})`);
          const ok = await deleteFederatedLink(kcClient, r.keycloakId, link.identityProvider);
          if (ok) {
            console.log(`  Deleted. User can re-login to auto-link.\n`);
            fixed++;
          } else failed++;
        }
      } else {
        console.log(
          `Skipping ${r.email}: no federated links to delete. User needs to log in again (auto-link flow will handle it).\n`
        );
      }
      if (r.profileMatch === 'orphaned_profile' && r.profileKeycloakId && db) {
        console.log(
          `Updating profile keycloak_id: "${r.profileKeycloakId}" → "${r.keycloakId}" for ${r.email}`
        );
        try {
          await db.query('UPDATE profiles SET keycloak_id = $1 WHERE keycloak_id = $2', [
            r.keycloakId,
            r.profileKeycloakId,
          ]);
          console.log(`  Profile updated.\n`);
          fixed++;
        } catch (err) {
          console.error(`  Failed to update profile:`, err instanceof Error ? err.message : String(err));
          failed++;
        }
      }
    }
    console.log(`\nDone. Fixed: ${fixed}, Failed: ${failed}`);
  } else if (fix) {
    console.log('No problematic users found — nothing to fix.');
  }

  if (!fix && problematic.length > 0) {
    console.log('Run with --fix to delete stale links and update orphaned profiles.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
