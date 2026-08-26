-- Admin-kuratierte Sichtbarkeit von Grünerator-Agenten, pro Deployment.
-- Jede Instanz hat ihre eigene Postgres, eine `instance_id`-Spalte braucht es
-- hier also nicht — eine Zeile, die der bgst-Admin schreibt, existiert nur in
-- der Datenbank von bgst.
--
-- Ausnahmetabelle, keine Erlaubnisliste: eine Zeile heißt „aus der Entdeckung
-- ausgeblendet", nicht „freigegeben". Leere Tabelle = jeder Agent sichtbar =
-- wirkungslos auf jedem bestehenden Deployment, bis ein Admin aktiv kuratiert.
-- Ein Direktlink (`/agents/<slug>`) und `getSystemAgent()` bleiben ungefiltert.
--
-- Schlüssel ist der `identifier` — anders als bei Rezepten, wo der Identifier
-- den BESITZENDEN Agenten benennt und sich mehrere Rezepte einen teilen, ist er
-- beim Agenten selbst eindeutig (`SystemAgentId`).

CREATE TABLE IF NOT EXISTS admin_hidden_agents (
  agent_identifier TEXT PRIMARY KEY,
  hidden_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_by        TEXT
);
