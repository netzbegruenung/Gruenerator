#!/usr/bin/env node
// Test vector-optimized planner
import { buildPlannerPromptGeneral } from './agents/langgraph/prompts.mjs';

console.log("=== Vector Search Optimized Planner Test ===");

const question = "Welche Initiativen hat Ihre Partei zur Verbesserung des Radverkehrs ergriffen?";
console.log("Question:", question);

const { system } = buildPlannerPromptGeneral();
console.log("\n=== Optimized Prompt (Key Changes) ===");
const lines = system.split('\n');
const keyLines = lines.filter(line =>
  line.includes('SINGLE most important word') ||
  line.includes('Start with SINGLE WORDS') ||
  line.includes('NEVER add formal/legal terms') ||
  line.includes('Maximum 3 words') ||
  line.includes('EXACT words from question') ||
  line.includes('GOOD:') ||
  line.includes('BAD:')
);
keyLines.forEach(line => console.log(line));

console.log("\n=== Expected Better Results ===");
console.log("🎯 OPTIMAL queries for bike path document:");
console.log("1. 'Radverkehr' (single word from question)");
console.log("2. 'Initiative Partei' (exact words from question)");
console.log("3. 'Radwegebau' (compound version)");
console.log("4. 'Kreis Planung' (context words from document)");

console.log("\n❌ OLD BAD queries that failed:");
console.log("- 'Radweg Radwege Regelung' (added irrelevant 'Regelung')");
console.log("- 'Fahrradweg Fahrradinfrastruktur Vorschrift' (too formal)");

console.log("\n🎯 Document contains: 'Radwegebau an Kreisstraßen', 'Initiative', 'Personalstelle'");
console.log("✅ New approach should find direct matches!");

console.log("\nTest complete. The new planner should generate much more targeted, effective queries.");