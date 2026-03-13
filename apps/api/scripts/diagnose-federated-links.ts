#!/usr/bin/env npx tsx
/**
 * Diagnose Federated Identity Links
 *
 * Identifies Keycloak users with broken/missing federated identity links
 * that cause the "Das Benutzerkonto existiert bereits" error on login.
 *
 * Usage:
 *   npx tsx scripts/diagnose-federated-links.ts [options]
 *
 * Options:
 *   --email <email>   Check a specific user by email
 *   --fix             Delete stale federated links (so auto-link can re-create them)
 *   --verbose         Show detailed output for all users, not just problematic ones
 */

import dotenv from 'dotenv';

dotenv.config();

import {
  KeycloakApiClient,
  type KeycloakUser,
  type FederatedIdentity,
} from '../utils/keycloak/apiClient.js';
import { getPostgresInstance } from '../database/services/PostgresService.js';

const KEYCLOAK_USERS_PAGE_SIZE = 50;

interface DiagnosticResult {
  keycloakId: string;
  email: string;
  username: string;
  federatedLinks: FederatedIdentity[];
  profileMatch: 'matched' | 'orphaned_profile' | 'no_profile';
  profileKeycloakId?: string;
  issues: string[];
}

function parseArgs(): { email?: string; fix: boolean; verbose: boolean } {
  const args = process.argv.slice(2);
  let email: string | undefined;
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

async function getAllKeycloakUsers(client: KeycloakApiClient): Promise<KeycloakUser[]> {
  const allUsers: KeycloakUser[] = [];
  let offset = 0;

  while (true) {
    await client.ensureAuth();
    const response = await (client as any).axiosClient.get('/users', {
      params: { first: offset, max: KEYCLOAK_USERS_PAGE_SIZE, briefRepresentation: false },
    });

    const users: KeycloakUser[] = response.data;
    if (!users || users.length === 0) break;

    allUsers.push(...users);
    console.log(`  Fetched ${allUsers.length} users...`);

    if (users.length < KEYCLOAK_USERS_PAGE_SIZE) break;
    offset += KEYCLOAK_USERS_PAGE_SIZE;
  }

  return allUsers;
}

async function deleteFederatedLink(
  client: KeycloakApiClient,
  userId: string,
  provider: string
): Promise<boolean> {
  try {
    await client.ensureAuth();
    await (client as any).axiosClient.delete(`/users/${userId}/federated-identity/${provider}`);
    return true;
  } catch (error: any) {
    console.error(
      `  Failed to delete link for ${userId}/${provider}:`,
      error.response?.data || error.message
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
  } catch (err: any) {
    console.error('Keycloak connection failed:', err.message);
    process.exit(1);
  }

  let db: any;
  try {
    db = getPostgresInstance();
    await db.init();
    console.log('Database connection: OK\n');
  } catch (err: any) {
    console.error('Database connection failed:', err.message);
    console.log('Continuing without DB cross-reference.\n');
    db = null;
  }

  console.log('Fetching Keycloak users...');
  let kcUsers: KeycloakUser[];

  if (email) {
    const user = await kcClient.findUserByEmail(email);
    kcUsers = user ? [user] : [];
    if (kcUsers.length === 0) {
      console.log(`No Keycloak user found with email: ${email}`);
      process.exit(0);
    }
  } else {
    kcUsers = await getAllKeycloakUsers(kcClient);
  }

  console.log(`Found ${kcUsers.length} Keycloak user(s)\n`);

  const results: DiagnosticResult[] = [];
  let processed = 0;

  for (const user of kcUsers) {
    processed++;
    if (processed % 20 === 0) {
      console.log(`  Processing ${processed}/${kcUsers.length}...`);
    }

    const fedLinks = await kcClient.getUserFederatedIdentities(user.id);

    const result: DiagnosticResult = {
      keycloakId: user.id,
      email: user.email || '(no email)',
      username: user.username || '(no username)',
      federatedLinks: fedLinks,
      profileMatch: 'no_profile',
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
          } else {
            result.profileMatch = 'no_profile';
          }
        }
      } catch {
        // DB query failed, skip cross-reference
      }
    }

    if (!user.email) {
      result.issues.push('Keycloak user has no email — cannot auto-link');
    }

    if (
      fedLinks.length === 0 &&
      user.federatedIdentities &&
      user.federatedIdentities.length === 0
    ) {
      // Local user (gruenerator-user), no IdP link expected — this is fine
    } else if (fedLinks.length === 0 && !user.federatedIdentities?.length) {
      // Might be a user who lost their federated link
      if (user.email && result.profileMatch !== 'no_profile') {
        result.issues.push(
          'No federated identity links found, but profile exists — link may have been lost'
        );
      }
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
    const statusIcon = r.issues.length > 0 ? '!!' : 'OK';
    console.log(`[${statusIcon}] ${r.email} (${r.username})`);
    console.log(`    Keycloak ID: ${r.keycloakId}`);
    console.log(
      `    Profile:     ${r.profileMatch}${r.profileKeycloakId ? ` (profile keycloak_id: ${r.profileKeycloakId})` : ''}`
    );
    console.log(
      `    Fed. Links:  ${r.federatedLinks.length > 0 ? r.federatedLinks.map((l) => `${l.identityProvider} → ${l.userId}`).join(', ') : '(none)'}`
    );

    if (r.issues.length > 0) {
      for (const issue of r.issues) {
        console.log(`    ISSUE: ${issue}`);
      }
    }
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
          console.log(
            `Deleting stale link: ${r.email} → ${link.identityProvider} (${link.userId})`
          );
          const ok = await deleteFederatedLink(kcClient, r.keycloakId, link.identityProvider);
          if (ok) {
            console.log(`  Deleted. User can re-login to auto-link.\n`);
            fixed++;
          } else {
            failed++;
          }
        }
      } else {
        console.log(
          `Skipping ${r.email}: no federated links to delete. ` +
            `User needs to log in again (auto-link flow will handle it).\n`
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
        } catch (err: any) {
          console.error(`  Failed to update profile:`, err.message);
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
