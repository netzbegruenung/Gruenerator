/** Postfach im Dateibrowser: oben Ordner, darunter Mails; eine Suche geht an den Anbieter. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gmail = { listLabels: vi.fn(), listMessages: vi.fn(), getMessageText: vi.fn() };
const outlook = { listFolders: vi.fn(), listMessages: vi.fn(), getMessageText: vi.fn() };
vi.mock('../api-clients/gmailClient.js', () => gmail);
vi.mock('../api-clients/outlookMailClient.js', () => outlook);

const { browseMail, formatMailText, mailEntryName, readMailAsText } =
  await import('./mailBrowse.js');

beforeEach(() => {
  for (const fn of [...Object.values(gmail), ...Object.values(outlook)]) fn.mockReset();
});

describe('browseMail', () => {
  it('shows folders at the top level', async () => {
    outlook.listFolders.mockResolvedValue([{ id: 'inbox', name: 'Posteingang' }]);
    const result = await browseMail('microsoft-mail', 'tok');
    expect(result.entries).toEqual([
      {
        id: 'inbox',
        name: 'Posteingang',
        isFolder: true,
        mimeType: null,
        size: null,
        isSupported: false,
      },
    ]);
  });

  it('searches the whole mailbox from the top level', async () => {
    gmail.listMessages.mockResolvedValue({
      truncated: true,
      messages: [{ id: 'a', subject: 'PM', from: 'Kim <k@x.de>', receivedAt: null }],
    });
    const result = await browseMail('google-mail', 'tok', undefined, 'pm');
    expect(gmail.listMessages).toHaveBeenCalledWith('tok', { query: 'pm' });
    expect(result.truncated).toBe(true);
    expect(result.entries[0]).toMatchObject({
      id: 'a',
      name: 'PM — Kim',
      isFolder: false,
      mimeType: 'message/rfc822',
      isSupported: true,
    });
  });

  it('passes the folder to the provider', async () => {
    outlook.listMessages.mockResolvedValue({ truncated: false, messages: [] });
    await browseMail('microsoft-mail', 'tok', 'inbox');
    expect(outlook.listMessages).toHaveBeenCalledWith('tok', { folderId: 'inbox' });
  });
});

describe('entry name and text', () => {
  it('names a mail by subject, sender and date', () => {
    expect(
      mailEntryName({
        id: 'x',
        subject: '',
        from: '"Kim Grün" <k@x.de>',
        receivedAt: '2026-11-18T10:00:00Z',
      })
    ).toBe('(kein Betreff) — Kim Grün · 18. Nov. 2026');
  });

  it('puts the headers above the body', () => {
    expect(
      formatMailText({ subject: 'S', from: 'a', to: ['b'], cc: [], date: null, body: ' Text ' })
    ).toBe('Betreff: S\nVon: a\nAn: b\n\nText');
  });

  it('reads through the right provider', async () => {
    gmail.getMessageText.mockResolvedValue({
      subject: 'S',
      from: 'a',
      to: [],
      cc: [],
      date: null,
      body: 'B',
    });
    expect(await readMailAsText('google-mail', 'tok', 'id1')).toContain('B');
    expect(gmail.getMessageText).toHaveBeenCalledWith('tok', 'id1');
    expect(outlook.getMessageText).not.toHaveBeenCalled();
  });
});
