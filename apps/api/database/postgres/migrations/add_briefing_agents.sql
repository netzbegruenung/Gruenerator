-- Briefing Agents: autonomous scheduled agents that collect data and send email briefings

CREATE TABLE IF NOT EXISTS briefing_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,

    config JSONB NOT NULL DEFAULT '{}',

    schedule_type VARCHAR(20) NOT NULL DEFAULT 'daily'
        CHECK (schedule_type IN ('hourly', 'daily', 'weekly')),
    schedule_hour INTEGER DEFAULT 8 CHECK (schedule_hour BETWEEN 0 AND 23),
    schedule_timezone TEXT DEFAULT 'Europe/Berlin',

    delivery_email TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    last_executed_at TIMESTAMPTZ,
    execution_count INTEGER DEFAULT 0,
    consecutive_empty_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_briefing_agents_user ON briefing_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_briefing_agents_due ON briefing_agents(is_active, schedule_type, last_executed_at);

CREATE TRIGGER update_briefing_agents_updated_at
    BEFORE UPDATE ON briefing_agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS briefing_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES briefing_agents(id) ON DELETE CASCADE,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'empty')),

    results_count INTEGER DEFAULT 0,
    results_summary TEXT,
    results_raw JSONB,

    started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_briefing_executions_agent ON briefing_executions(agent_id, started_at DESC);
