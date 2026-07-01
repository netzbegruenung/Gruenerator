import { LANDESVERBAENDE, LV_HUBS, getSystemAgent } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

/**
 * Guards the LV registry ↔ agents contract from the consumer side (chat already
 * runs vitest; @gruenerator/shared does not). The notebook page lists an agent
 * only when `agent.defaultNotebookIds` include the notebookId — so a hub agent that
 * loses its notebook pin silently vanishes from its Landesverband notebook. That is
 * exactly the bug that hid the hand-tuned Öffentlichkeitsarbeit agents for 8 LVs.
 * These assertions fail the build the moment the pin is dropped again.
 */
describe('LV registry agents stay pinned to their notebook', () => {
  for (const lv of LANDESVERBAENDE) {
    describe(lv.title, () => {
      it(`PR agent (${lv.prAgentId}) resolves and pins ${lv.notebookId}`, () => {
        const agent = getSystemAgent(lv.prAgentId);
        expect(agent, `PR agent ${lv.prAgentId} must resolve`).toBeDefined();
        expect(agent?.defaultNotebookIds).toContain(lv.notebookId);
      });

      it(`Bürger agent (${lv.buergerAgentId}) resolves and pins ${lv.notebookId}`, () => {
        const agent = getSystemAgent(lv.buergerAgentId);
        expect(agent, `Bürger agent ${lv.buergerAgentId} must resolve`).toBeDefined();
        expect(agent?.defaultNotebookIds).toContain(lv.notebookId);
      });
    });
  }
});

describe('every hub derives from its registry entry', () => {
  for (const hub of LV_HUBS) {
    it(`${hub.name} hub matches its registry entry`, () => {
      const lv = LANDESVERBAENDE.find((entry) => entry.id === hub.lvId);
      expect(lv, `hub ${hub.slug} must have a registry entry`).toBeDefined();
      expect(hub.notebookId).toBe(lv?.notebookId);
      expect(hub.prAgentId).toBe(lv?.prAgentId);
      expect(hub.buergerAgentId).toBe(lv?.buergerAgentId);
    });
  }
});
