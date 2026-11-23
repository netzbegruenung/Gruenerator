import { describe, expect, it } from 'vitest';

import { getDirectMenuItems } from './menuData';

// Chat and Workplace are the two views of `/start`; they replaced the tabs at the top.
describe('getDirectMenuItems — Chat and Workplace', () => {
  it('gives the start-page view the bare /start and the other one its segment', () => {
    const chatHome = getDirectMenuItems({ home: 'chat' });
    expect(chatHome.startseite?.path).toBe('/start');
    expect(chatHome.workplace?.path).toBe('/start/arbeiten');

    const arbeitenHome = getDirectMenuItems({ home: 'arbeiten' });
    expect(arbeitenHome.startseite?.path).toBe('/start/chat');
    expect(arbeitenHome.workplace?.path).toBe('/start');
  });

  it('marks only the start-page view active on / and bare /start', () => {
    const items = getDirectMenuItems({ home: 'arbeiten' });
    expect(items.workplace?.exactActivePaths).toEqual(['/start/arbeiten', '/', '/start']);
    expect(items.startseite?.exactActivePaths).toEqual(['/start/chat']);
  });

  it('names the entries Chat and Workplace', () => {
    const items = getDirectMenuItems();
    expect(items.startseite?.title).toBe('Chat');
    expect(items.workplace?.title).toBe('Workplace');
  });
});
