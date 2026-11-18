/**
 * `group_content_shares` hat genau einen Schreiber: `groupShareWriter.ts`. Er
 * prüft das Projekt (`assertCanShareToGroup` — sonst könnte jedes Mitglied ins
 * System-Projekt teilen, dem alle angehören), hebt einen privaten Inhalt auf
 * 'groups' und schreibt über den Unique-Key. Als jeder Freigabe-Weg das selbst
 * nachbaute, liefen die Wege auseinander (Notebook hob vor der Prüfung, kein
 * Weg war gegen Doppelte sicher).
 *
 * Der Wächter liest den Quelltext: jede Datei, die die Tabelle beschreibt, ist
 * der Schreiber oder steht unten mit Begründung. Die Liste ist in beide
 * Richtungen exakt — ein toter Eintrag ist ebenso rot wie ein neuer Schreiber.
 */
import { readdirSync, readFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

import { describe, expect, it } from 'vitest';

const API_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const WRITER = 'services/groups/groupShareWriter.ts';
const WRITE = /\b(?:INSERT\s+INTO|DELETE\s+FROM|UPDATE)\s+group_content_shares\b/;

/** Schreiben an der Tabelle vorbei, jedes mit seinem Grund. */
const EXEMPT: Record<string, string> = {
  // Kopiert die Freigaben eines Boards auf eine neue Karte — kein Projekt wird
  // gewählt, die Zeilen bestanden schon (ON CONFLICT DO NOTHING).
  'services/boards/boardSharingService.ts': 'derived copy of existing shares',
  // Endgültiges Löschen eines Dokuments aus dem Papierkorb, in der Purge-Transaktion.
  'services/docs/CollaborativeDocumentService.ts': 'purge of a trashed document',
  // Notiz und Anheftung einer bestehenden Freigabe — keine Rechte, kein Zugriff.
  'services/groups/groupFeed.ts': 'feed note and pin of an existing share',
  // Eigene Beiträge eines Projekts: Zeile und Beitrag entstehen und gehen in
  // einer Transaktion, die `canShare` des Feeds davor prüft.
  'services/groups/groupPosts.ts': 'group posts, transactional with the post',
  // Ein Projekt wird endgültig gelöscht: alle seine Freigaben mit.
  'services/groups/groupTrash.ts': 'purge of a trashed project',
  // Ein Wolke-Link wird gelöscht; die Freigaben darauf zeigten ins Leere.
  'utils/integrations/nextcloud/shareManager.ts': 'cascade of a deleted Wolke link',
};

function shareWriters(): string[] {
  return readdirSync(API_ROOT, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.vitest.ts'))
    .filter((f) => !f.split('/').some((seg) => seg === 'node_modules' || seg === 'dist'))
    .filter((f) => WRITE.test(readFileSync(join(API_ROOT, f), 'utf8')))
    .map((f) => relative(API_ROOT, join(API_ROOT, f)))
    .sort();
}

describe('group share write guard', () => {
  it('lets only the writer and the listed exceptions write group_content_shares', () => {
    expect(shareWriters()).toEqual([WRITER, ...Object.keys(EXEMPT)].sort());
  });

  it('gates the writer through assertCanShareToGroup', () => {
    const source = readFileSync(join(API_ROOT, WRITER), 'utf8');
    expect(source).toContain('assertCanShare: assertCanShareToGroup');
    expect(source).toMatch(/await deps\.assertCanShare\(groupId, userId\)/);
  });

  it('writes through the unique key, never a SELECT-then-INSERT', () => {
    const source = readFileSync(join(API_ROOT, WRITER), 'utf8');
    expect(source).toContain('ON CONFLICT (group_id, content_type, content_id)');
  });
});
