-- Seit 11/2026 stehen Rezepte vor den Agents, denen sie gehören (#6005, #6120,
-- #6125, #6129): der Marktplatz listet diese Agents nicht mehr. Wer einen davon
-- in „Meine Grüneratoren" geholt hat, bekommt hier sein Standard-Rezept dazu —
-- additiv, der Agent-Eintrag bleibt und öffnet weiter. Mit dem Datum des
-- Agent-Eintrags, damit das Rezept in der Übersicht neben ihm steht.
--
-- Zuordnung Agent → Standard-Rezept: `defaultRecipeMention` des Agents, sonst
-- sein einziges Rezept; bei der Öffentlichkeitsarbeit (sieben Rezepte, kein
-- Standard) `presse`. Geprüft gegen die Registry in
-- `services/user/libraryRecipesMigration.vitest.ts`.
INSERT INTO user_library_items (user_id, item_kind, item_ref, created_at)
SELECT li.user_id, 'recipe', m.recipe, li.created_at
FROM user_library_items li
JOIN (VALUES
  ('gruenerator-antrag', 'antrag'),
  ('gruenerator-beschluesse-bayern', 'beschluss-bayern'),
  ('gruenerator-beschluesse-berlin', 'beschluss-berlin'),
  ('gruenerator-beschluesse-brandenburg', 'beschluss-brandenburg'),
  ('gruenerator-beschluesse-hessen', 'beschluss-hessen'),
  ('gruenerator-beschluesse-mecklenburg-vorpommern', 'beschluss-mv'),
  ('gruenerator-beschluesse-nordrhein-westfalen', 'beschluss-nrw'),
  ('gruenerator-beschluesse-saarland', 'beschluss-saarland'),
  ('gruenerator-beschluesse-sachsen-anhalt', 'beschluss-sachsen-anhalt'),
  ('gruenerator-beschluesse-thueringen', 'beschluss-thueringen'),
  ('gruenerator-buergeranfragen-bayern', 'buerger-bayern'),
  ('gruenerator-buergeranfragen-berlin', 'buerger-berlin'),
  ('gruenerator-buergeranfragen-brandenburg', 'buerger-brandenburg'),
  ('gruenerator-buergeranfragen-hamburg', 'buerger-hamburg'),
  ('gruenerator-buergeranfragen-hessen', 'buerger-hessen'),
  ('gruenerator-buergeranfragen-mecklenburg-vorpommern', 'buerger-mv'),
  ('gruenerator-buergeranfragen-nordrhein-westfalen', 'buerger-nrw'),
  ('gruenerator-buergeranfragen-oesterreich', 'buerger-at'),
  ('gruenerator-buergeranfragen-saarland', 'buerger-saarland'),
  ('gruenerator-buergeranfragen-sachsen-anhalt', 'buerger-sachsen-anhalt'),
  ('gruenerator-buergeranfragen-schleswig-holstein', 'buerger-schleswig-holstein'),
  ('gruenerator-buergeranfragen-thueringen', 'buerger-thueringen'),
  ('gruenerator-buergerservice', 'buergermail'),
  ('gruenerator-bundestag', 'bundestagsrecherche'),
  ('gruenerator-einfache-sprache', 'einfache-sprache'),
  ('gruenerator-leichte-sprache', 'leichte-sprache'),
  ('gruenerator-oeffentlichkeitsarbeit', 'presse'),
  ('gruenerator-oeffentlichkeitsarbeit-at', 'presse-at'),
  ('gruenerator-oeffentlichkeitsarbeit-bayern', 'presse-bayern-partei'),
  ('gruenerator-oeffentlichkeitsarbeit-berlin', 'presse-berlin-partei'),
  ('gruenerator-oeffentlichkeitsarbeit-brandenburg', 'presse-brandenburg'),
  ('gruenerator-oeffentlichkeitsarbeit-hamburg', 'presse-hamburg'),
  ('gruenerator-oeffentlichkeitsarbeit-hessen', 'presse-hessen-partei'),
  ('gruenerator-oeffentlichkeitsarbeit-mecklenburg-vorpommern', 'presse-mv-partei'),
  ('gruenerator-oeffentlichkeitsarbeit-nordrhein-westfalen', 'presse-nrw'),
  ('gruenerator-oeffentlichkeitsarbeit-saarland', 'presse-saarland'),
  ('gruenerator-oeffentlichkeitsarbeit-sachsen-anhalt', 'presse-sachsen-anhalt-partei'),
  ('gruenerator-oeffentlichkeitsarbeit-schleswig-holstein', 'presse-schleswig-holstein'),
  ('gruenerator-oeffentlichkeitsarbeit-thueringen', 'presse-thueringen'),
  ('gruenerator-rede-schreiber', 'rede'),
  ('gruenerator-wahlprogramm-bayern', 'wahlprogramm-bayern'),
  ('gruenerator-wahlprogramm-berlin', 'wahlprogramm-berlin'),
  ('gruenerator-wahlprogramm-brandenburg', 'wahlprogramm-brandenburg'),
  ('gruenerator-wahlprogramm-sachsen-anhalt', 'wahlprogramm-sachsen-anhalt'),
  ('gruenerator-wahlprogramm-thueringen', 'wahlprogramm-thueringen'),
  ('gruenerator-wahlpruefsteine', 'wahlpruefstein'),
  ('gruenerator-wahlpruefsteine-bayern', 'wahlpruefstein-bayern'),
  ('gruenerator-wahlpruefsteine-berlin', 'wahlpruefstein-berlin'),
  ('gruenerator-wahlpruefsteine-brandenburg', 'wahlpruefstein-brandenburg'),
  ('gruenerator-wahlpruefsteine-hamburg', 'wahlpruefstein-hamburg'),
  ('gruenerator-wahlpruefsteine-hessen', 'wahlpruefstein-hessen'),
  ('gruenerator-wahlpruefsteine-mecklenburg-vorpommern', 'wahlpruefstein-mv'),
  ('gruenerator-wahlpruefsteine-nordrhein-westfalen', 'wahlpruefstein-nrw'),
  ('gruenerator-wahlpruefsteine-oesterreich', 'wahlpruefstein-at'),
  ('gruenerator-wahlpruefsteine-saarland', 'wahlpruefstein-saarland'),
  ('gruenerator-wahlpruefsteine-sachsen-anhalt', 'wahlpruefstein-sachsen-anhalt'),
  ('gruenerator-wahlpruefsteine-schleswig-holstein', 'wahlpruefstein-schleswig-holstein'),
  ('gruenerator-wahlpruefsteine-thueringen', 'wahlpruefstein-thueringen')
) AS m(agent, recipe) ON m.agent = li.item_ref
WHERE li.item_kind = 'agent'
ON CONFLICT ON CONSTRAINT user_library_items_unique DO NOTHING;
