/**
 * Eine Bestätigungskarte, die der Client nicht kennt, verwirft er still
 * (`parseSSEStream` am Enum). Deshalb meldet er im Request, was er darstellt,
 * und `emitToolConfirmAction` lehnt alles andere ab, bevor das Modell eine
 * Karte ankündigt, die niemand sieht.
 */
import { CONFIRM_ACTION_TYPES_APP_1_7_0, confirmActionTypeSchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EndgueltigerWerkzeugFehler } from '../agents/toolFailure.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SSEWriter } from './sseHelpers.js';

const store = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('./pendingActionStore.js', () => ({ pendingActionStore: { store } }));

const { emitToolConfirmAction } = await import('./confirmActionService.js');
const { SSEWriter: RealSSEWriter } = await import('./sseHelpers.js');

const action = {
  actionId: 'a1',
  type: 'add_project_text',
  userId: 'u1',
  threadId: 't1',
  payload: { groupId: 'g1', groupName: 'Klima-OV', title: 'Notiz', content: 'Text' },
  createdAt: 0,
} as unknown as PendingAction;

function writer(renders: (type: string) => boolean) {
  const send = vi.fn();
  return { sse: { send, rendersConfirmAction: renders } as unknown as SSEWriter, send };
}

describe('emitToolConfirmAction and the client’s card list', () => {
  beforeEach(() => store.mockClear());

  it('refuses a card the client cannot draw: nothing sent, nothing stored', async () => {
    const { sse, send } = writer(() => false);
    const err = await emitToolConfirmAction(sse, action, []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EndgueltigerWerkzeugFehler);
    expect((err as EndgueltigerWerkzeugFehler).fehler).toMatchObject({
      fehlerArt: 'nicht_verfuegbar',
      error: expect.stringContaining('App-Version') as unknown,
    });
    expect(send).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });

  it('sends and stores a card the client draws', async () => {
    const { sse, send } = writer(() => true);
    await emitToolConfirmAction(sse, action, [{ key: 'Projekt', value: 'Klima-OV' }]);
    expect(send).toHaveBeenCalledWith(
      'confirm_action',
      expect.objectContaining({ actionId: 'a1', type: 'add_project_text' })
    );
    expect(store).toHaveBeenCalledOnce();
  });
});

describe('SSEWriter.rendersConfirmAction', () => {
  const res = { write: () => true, end: () => {}, writableEnded: false, destroyed: false };
  const make = () => new RealSSEWriter(res as never);

  it('allows every card until the request says otherwise', () => {
    expect(make().rendersConfirmAction('add_project_text')).toBe(true);
  });

  it('a client without the field gets the 1.7.0 set: the newer cards are refused', () => {
    const sse = make();
    sse.setConfirmActionTypes(CONFIRM_ACTION_TYPES_APP_1_7_0);
    expect(sse.rendersConfirmAction('create_group')).toBe(true);
    for (const newer of [
      'add_project_text',
      'apply_canvas_deck_edit',
      'create_antragsgruen_site',
      'create_antragsgruen_motion',
      'set_antragsgruen_agenda',
    ]) {
      expect(sse.rendersConfirmAction(newer)).toBe(false);
    }
  });
});

describe('CONFIRM_ACTION_TYPES_APP_1_7_0', () => {
  it('is frozen: a new card type goes into the enum only, never into this list', () => {
    // As shipped in app 1.7.0 (7c87c91816). Changing it breaks the old apps it describes.
    expect([...CONFIRM_ACTION_TYPES_APP_1_7_0]).toEqual([
      'save_as_doc',
      'modify_doc',
      'modify_board',
      'share_doc',
      'create_group',
      'join_group',
      'add_cloud_connection',
      'attach_wolke_folder',
      'set_notebook_visibility',
      'share_notebook',
      'set_group_visibility',
      'create_recurring_task',
      'create_user_agent',
      'share_user_agent',
      'share_text_form',
    ]);
    for (const t of CONFIRM_ACTION_TYPES_APP_1_7_0) {
      expect(confirmActionTypeSchema.options).toContain(t);
    }
  });
});
