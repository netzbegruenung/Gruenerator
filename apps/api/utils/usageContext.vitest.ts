import { describe, expect, it } from 'vitest';

import { featureFromPath } from './usageContext.js';

describe('featureFromPath', () => {
  it.each([
    ['/api/monitor/entities/x/summary', 'monitor'],
    ['/api/chat-service/stream', 'chat'],
    ['/api/user-agents/draft', 'chat'],
    ['/api/recurring-tasks/abc/run', 'chat'],
    ['/api/mcp-server', 'chat'],
    ['/api/auth/user-templates/describe-image', 'sharepic'],
    ['/api/custom_prompt', 'texte'],
    ['/api/auth/custom_prompts', 'texte'],
    ['/api/auth/saved_prompts', 'texte'],
    ['/api/voice/tts', 'chat'],
    ['/api/auth/profile', 'other'],
  ])('%s → %s', (path, feature) => {
    expect(featureFromPath(path)).toBe(feature);
  });
});
