# Redis Checkpointer Deployment Guide

## Overview

This fix resolves the issue where the interactive antrag flow works locally but gets stuck on production servers. The problem was caused by LangGraph's `MemorySaver` storing checkpoints in-process memory, which doesn't work across multiple cluster workers.

## What Changed

### Files Modified

1. **`agents/langgraph/RedisCheckpointer.mjs`** (NEW)
   - Custom Redis-backed checkpointer implementing LangGraph's `BaseCheckpointSaver` interface
   - Stores graph checkpoints in Redis for cross-worker access
   - Includes diagnostic logging with worker PID tracking

2. **`agents/langgraph/interactiveAntragGraph.mjs`**
   - Replaced `new MemorySaver()` with `new RedisCheckpointer(redisClient)`
   - Added imports for RedisCheckpointer and redisClient

3. **`routes/antraege/experimentalRoutes.mjs`**
   - Added worker PID logging to track which worker handles each request
   - Enhanced logging for submitted answers

## Testing Locally

### 1. Test with Multiple Workers

Set `WORKER_COUNT=2` in your `.env` or environment to simulate production:

```bash
cd /home/morit/gruenerator/gruenerator_backend
export WORKER_COUNT=2
npm run start:dev
```

### 2. Test Interactive Flow

```bash
# 1. Initiate session (will be handled by worker A or B)
curl -X POST http://localhost:3000/api/antraege/experimental/initiate \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "thema": "mehr windkraft in alfter",
    "details": "test",
    "requestType": "antrag"
  }'

# Note the sessionId from response

# 2. Continue session (may be handled by different worker)
curl -X POST http://localhost:3000/api/antraege/experimental/continue \
  -H "Content-Type: application/json" \
  -H "Cookie: your-session-cookie" \
  -d '{
    "sessionId": "exp_1234567890_abc123",
    "answers": {
      "q1": "answer 1",
      "q2": "answer 2",
      "q3": "answer 3",
      "q4": "answer 4",
      "q5": "answer 5"
    }
  }'
```

### 3. Expected Log Output (Success)

**Initiate Request:**
```
[experimental][EXP-xxx][PID:12345] POST /api/antraege/experimental/initiate
[RedisCheckpointer][PID:12345] Initialized with TTL=7200s
[InteractiveAntragGraph] Interrupting graph - will resume at next node
[RedisCheckpointer][PID:12345] put: exp_1234567890_abc123:
[RedisCheckpointer][PID:12345] Stored checkpoint for exp_1234567890_abc123 (TTL: 7200s)
```

**Continue Request (different worker):**
```
[experimental][EXP-yyy][PID:67890] POST /api/antraege/experimental/continue
[experimental][EXP-yyy] Submitted answers: [ 'q1', 'q2', 'q3', 'q4', 'q5' ]
[RedisCheckpointer][PID:67890] getTuple: exp_1234567890_abc123:
[RedisCheckpointer][PID:67890] Retrieved checkpoint for exp_1234567890_abc123 (writes: 0)
[InteractiveAntragGraph] Resumed after interrupt - analyzing answers  ✅ THIS IS KEY!
[InteractiveAntragGraph] Generation completed: 1672 chars
```

### 4. Verify Success Indicators

✅ **Success signs:**
- Different PIDs between initiate and continue (proves cross-worker functionality)
- "Retrieved checkpoint" log appears in continue request
- "Resumed after interrupt - analyzing answers" log appears
- Continue request duration > 5000ms (actual processing time)
- Final generation completes with result

❌ **Failure signs (old behavior):**
- "No checkpoint found" in continue request
- Continue request completes in <100ms
- No "Resumed after interrupt" log
- Flow stuck at "questions_asked" state

## Production Deployment

### Option 1: Direct Deploy to Server

```bash
# SSH to your server
ssh your-server

# Navigate to backend directory
cd /path/to/gruenerator_backend

# Pull latest changes
git pull origin test-branch  # or your branch name

# Restart the service
sudo systemctl restart gruenerator-backend
```

### Option 2: Using Your Deployment Script

If you have a deployment automation:

```bash
# From your local machine
./deploy.sh production
```

### Verify Production Deployment

1. **Check logs for RedisCheckpointer initialization:**
```bash
sudo journalctl -u gruenerator-backend -f | grep RedisCheckpointer
```

Expected output:
```
[RedisCheckpointer] Initialized with TTL=7200s
```

2. **Monitor interactive flow:**
```bash
sudo journalctl -u gruenerator-backend -f | grep -E "experimental|RedisCheckpointer|InteractiveAntragGraph"
```

3. **Test the flow from frontend:**
   - Enable "Interactive Antrag" beta feature in your profile
   - Create a new antrag with interactive mode
   - Answer the questions
   - Verify generation completes

### Debugging Production Issues

If the flow still doesn't work after deployment:

1. **Check Redis connectivity:**
```bash
sudo -u postgres psql -d gruenerator -c "SELECT 1;"  # Wrong - this is postgres
# Actually check Redis:
redis-cli -u $REDIS_URL ping
```

2. **Verify worker count:**
```bash
sudo journalctl -u gruenerator-backend | grep "Starting.*workers"
```

Expected: `Starting 2 workers (WORKER_COUNT: 2)` or similar

3. **Check for Redis errors:**
```bash
sudo journalctl -u gruenerator-backend | grep -i "redis.*error"
```

4. **Verify checkpoint storage:**
```bash
# Connect to Redis and check for checkpoint keys
redis-cli -u $REDIS_URL
> KEYS langgraph:checkpoint:*
> TTL langgraph:checkpoint:exp_*  # Should show ~7200 or less
```

## Rollback Plan

If issues occur, rollback by reverting the commits:

```bash
cd /home/morit/gruenerator/gruenerator_backend
git revert HEAD  # or specific commit hash
sudo systemctl restart gruenerator-backend
```

Or temporarily disable clustering:

```bash
# Set WORKER_COUNT=1 in production .env
sudo nano /path/to/.env
# Change: WORKER_COUNT=1
sudo systemctl restart gruenerator-backend
```

## Performance Considerations

- **Redis calls per flow:** ~3-5 (put on initiate, getTuple on continue, put during generation)
- **Checkpoint TTL:** 2 hours (matches session TTL)
- **Average checkpoint size:** ~5-20KB (serialized graph state)
- **Redis memory impact:** Minimal (~1MB per 50 active sessions)

## Monitoring

Key metrics to monitor:

1. **Checkpoint success rate:**
```bash
grep "Retrieved checkpoint" /var/log/gruenerator/backend.log | wc -l
```

2. **Cross-worker requests:**
```bash
# Compare PID between initiate and continue
grep "experimental.*initiate\|experimental.*continue" /var/log/gruenerator/backend.log | grep -o "PID:[0-9]*"
```

3. **Resume success:**
```bash
grep "Resumed after interrupt" /var/log/gruenerator/backend.log | wc -l
```

## Expected Behavior After Fix

### Local (WORKER_COUNT=2)
- ✅ Flow completes successfully
- ✅ Different workers can handle initiate vs continue
- ✅ Checkpoints persist across workers via Redis

### Production (WORKER_COUNT=2+)
- ✅ Flow completes successfully
- ✅ Load balanced across workers without issues
- ✅ Session state survives even if worker restarts
- ✅ "Resumed after interrupt" appears in logs

## Support

If you encounter issues:

1. Capture full logs from both requests:
```bash
sudo journalctl -u gruenerator-backend --since "5 minutes ago" | grep -E "EXP-|RedisCheckpointer|InteractiveAntragGraph" > debug.log
```

2. Check Redis connectivity and keys:
```bash
redis-cli -u $REDIS_URL KEYS "langgraph:*"
```

3. Verify both workers are running:
```bash
ps aux | grep "gruenerator" | grep -v grep
```
