-- Wie schnell jedes Modell tatsächlich antwortet, im Fünf-Minuten-Fenster.
--
-- Gefüllt von services/ai/modelLatencyStore.ts; gelesen beim Boot, um die
-- Basislinie von services/ai/modelHealth.ts vorzuwärmen. Ohne diese Tabelle
-- wäre jeder Worker nach einem Deploy ein paar Dutzend Aufrufe lang urteilslos
-- — genau das Fenster, in dem ein frischer Deploy und eine Störung
-- zusammenfallen.
--
-- `worker` gehört in den Primärschlüssel, weil jeder Cluster-Worker seine
-- eigenen Proben hält. Zwei p50 lassen sich nicht addieren, also bekommt jeder
-- Worker seine eigene Zeile; die Leseseite aggregiert über beide.

CREATE TABLE IF NOT EXISTS ai_model_latency (
  bucket_start TIMESTAMPTZ NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  worker SMALLINT NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  slow_verdicts INTEGER NOT NULL DEFAULT 0,
  p50_tokens_per_sec DOUBLE PRECISION,
  p50_ttft_ms INTEGER,
  CONSTRAINT ai_model_latency_pk PRIMARY KEY (bucket_start, provider, model, worker)
);

CREATE INDEX IF NOT EXISTS idx_ai_model_latency_lookup
  ON ai_model_latency (provider, model, bucket_start DESC);
