-- Remove the dead "Briefing-Agents" stub: DB tables existed but no backend
-- runtime (route/service/worker/cron) was ever built. Superseded by the generic
-- recurring_tasks feature. Safe on fresh DBs (IF EXISTS); cleans existing/prod.
DROP TABLE IF EXISTS briefing_executions;
DROP TABLE IF EXISTS briefing_agents;
