import { DEFAULT_SCHEDULE, EMPTY_FORM } from '@gruenerator/shared/grueneratoren';
import { beforeEach, describe, expect, it } from 'vitest';

import { __resetAsyncStorage } from '../test/stubs/async-storage';

import {
  isResumableCreateDraft,
  migrateAgentEditorSession,
  useAgentEditorStore,
} from './agentEditorStore';

const get = () => useAgentEditorStore.getState();

beforeEach(() => {
  __resetAsyncStorage();
  get().reset();
});

describe('agentEditorStore', () => {
  it('starts a clean session and marks edits dirty', () => {
    get().start({
      identifier: 'klima-abc123',
      variant: 'agent',
      taskId: null,
      form: { ...EMPTY_FORM, title: 'Klima' },
      schedule: DEFAULT_SCHEDULE,
      dirty: false,
    });
    expect(get().active).toBe(true);
    expect(get().dirty).toBe(false);

    get().patch({ systemRole: 'Du bist ein Agent.' });
    expect(get().dirty).toBe(true);
    expect(get().form.title).toBe('Klima');
    expect(get().form.systemRole).toBe('Du bist ein Agent.');

    get().patchSchedule({ hour: 7 });
    expect(get().schedule.hour).toBe(7);
    expect(get().schedule.frequency).toBe(DEFAULT_SCHEDULE.frequency);
  });

  it('keeps the created agent id until a new session starts', () => {
    get().start({
      identifier: null,
      variant: 'recurring',
      taskId: null,
      form: EMPTY_FORM,
      schedule: DEFAULT_SCHEDULE,
      dirty: true,
    });
    get().setCreatedIdentifier('agent-x1');
    get().patch({ title: 'Neu' });
    expect(get().createdIdentifier).toBe('agent-x1');

    get().start({
      identifier: null,
      variant: 'agent',
      taskId: null,
      form: EMPTY_FORM,
      schedule: DEFAULT_SCHEDULE,
      dirty: false,
    });
    expect(get().createdIdentifier).toBeNull();
  });

  it('offers only a dirty create session for resuming', () => {
    const base = {
      identifier: null,
      variant: 'agent' as const,
      taskId: null,
      form: EMPTY_FORM,
      schedule: DEFAULT_SCHEDULE,
    };
    get().start({ ...base, dirty: false });
    expect(isResumableCreateDraft(get())).toBe(false);
    get().patch({ title: 'x' });
    expect(isResumableCreateDraft(get())).toBe(true);
    get().start({ ...base, identifier: 'a-1', dirty: true });
    expect(isResumableCreateDraft(get())).toBe(false);
    get().reset();
    expect(isResumableCreateDraft(get())).toBe(false);
  });
});

describe('migrateAgentEditorSession', () => {
  it('drops garbage', () => {
    expect(migrateAgentEditorSession(null).active).toBe(false);
    expect(migrateAgentEditorSession({ form: 'x' }).active).toBe(false);
  });

  it('fills missing form and schedule fields from the defaults', () => {
    const out = migrateAgentEditorSession({
      active: true,
      identifier: 'a-1',
      variant: 'recurring',
      form: { title: 'Alt', systemRole: 'Lange Anleitung' },
      schedule: { hour: 6 },
      dirty: true,
    });
    expect(out.form.systemRole).toBe('Lange Anleitung');
    expect(out.form.enabledTools).toEqual(EMPTY_FORM.enabledTools);
    expect(out.schedule.hour).toBe(6);
    expect(out.schedule.delivery).toBe(DEFAULT_SCHEDULE.delivery);
    expect(out.variant).toBe('recurring');
    expect(out.taskId).toBeNull();
  });
});
