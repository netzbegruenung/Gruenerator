#!/usr/bin/env node
// Jeder Anbieter, der laut Routing-Tabelle Eingaben verarbeitet, muss in der
// Datenschutzerklärung als Auftragsverarbeiter stehen. Cortecs schrieb ab August
// 2026 die meisten Antworten und fehlte dort trotzdem (#3517) — die Tabelle in
// `Datenschutz.tsx` wird von Hand gepflegt, die Routing-Tabelle nicht, und
// nichts verglich die beiden.
//
// Nur in eine Richtung: `models.json` kennt die Modell-Lanes, aber weder
// Reranking noch Websuche noch Sprachausgabe. Die Erklärung darf also mehr
// Anbieter nennen, nur keinen weniger.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MODELS = 'documentation/src/generated/models.json';
const NOTICE = 'apps/web/src/components/pages/Impressum_Datenschutz_Terms/Datenschutz.tsx';

const { hosts } = JSON.parse(readFileSync(join(ROOT, MODELS), 'utf8'));
const notice = readFileSync(join(ROOT, NOTICE), 'utf8');

// Einträge tragen eine Flagge hinter dem Namen („Cortecs 🇱🇺").
const names = hosts.map((h) => h.replace(/[^\p{L}\p{N}\s.&-]/gu, '').trim());
const missing = names.filter((name) => !notice.includes(name));

if (names.length === 0) {
  console.error(`✗ ${MODELS}: keine Hosts gefunden — die Prüfung liefe ins Leere.`);
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`✗ Anbieter aus ${MODELS} fehlen in ${NOTICE}:`);
  for (const name of missing) console.error(`  - ${name}`);
  console.error(
    '\nWer Eingaben verarbeitet, gehört in die Übersicht der Auftragsverarbeiter — samt Anschrift.'
  );
  process.exit(1);
}
console.log(`✓ Alle ${names.length} Modell-Hosts stehen in der Datenschutzerklärung.`);
