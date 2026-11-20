import { describe, expect, it } from 'vitest';

import { decodeTeamsRef, encodeTeamsRef, type TeamsRef } from './teamsIds.js';

describe('teamsIds', () => {
  // Channel ids carry `:` and `@`, drive ids `!` — the encoding must survive all of them.
  it.each<TeamsRef>([
    { kind: 'team', teamId: '172b0cce-e65d-44ce-9a49-91d9f2e8493a' },
    { kind: 'channel', teamId: 't1', channelId: '19:561fbdbbfca848a4@thread.tacv2' },
    { kind: 'item', driveId: 'b!2SInBlQrN0K8-GXMy9qN', itemId: '01H7CFEKENJSSIUHGADZ' },
  ])('round-trips %o', (ref) => {
    expect(decodeTeamsRef(encodeTeamsRef(ref))).toEqual(ref);
  });

  it('rejects anything that is not a well-formed reference', () => {
    expect(decodeTeamsRef('01H7CFEKENJSSIUHGADZ')).toBeNull();
    expect(decodeTeamsRef('team.')).toBeNull();
    expect(decodeTeamsRef('channel.dDE')).toBeNull();
    expect(decodeTeamsRef('item.a/b.c')).toBeNull();
    expect(decodeTeamsRef('folder.dDE')).toBeNull();
  });
});
