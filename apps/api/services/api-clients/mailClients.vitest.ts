/**
 * Was hier leise falsch werden könnte: eine Suche, die aus ihren
 * Anführungszeichen ausbricht, eine HTML-Mail ohne Text, eine Kennung, die
 * ungeprüft in einen Pfad gelangt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('axios', () => ({ default: { get } }));

const gmail = await import('./gmailClient.js');
const outlook = await import('./outlookMailClient.js');

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

beforeEach(() => get.mockReset());

describe('outlook', () => {
  it('sorts the folder by date without a search', async () => {
    get.mockResolvedValue({ data: { value: [] } });
    await outlook.listMessages('tok', { folderId: 'AAMk-1=' });
    expect(get.mock.calls[0][0]).toContain('/me/mailFolders/AAMk-1=/messages');
    expect(get.mock.calls[0][1].params).toMatchObject({ $orderby: 'receivedDateTime desc' });
  });

  it('searches the whole mailbox and keeps the query inside its quotes', async () => {
    get.mockResolvedValue({
      data: {
        value: [
          {
            id: 'm1',
            subject: 'PM',
            from: { emailAddress: { name: 'Kim', address: 'kim@x.de' } },
            receivedDateTime: '2026-11-18T10:00:00Z',
          },
        ],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next',
      },
    });
    const result = await outlook.listMessages('tok', { query: 'pm "x" OR y' });
    expect(get.mock.calls[0][0]).toMatch(/\/me\/messages$/);
    expect(get.mock.calls[0][1].params.$search).toBe('"pm  x  OR y"');
    expect(get.mock.calls[0][1].params.$orderby).toBeUndefined();
    expect(result).toEqual({
      truncated: true,
      messages: [
        { id: 'm1', subject: 'PM', from: 'Kim <kim@x.de>', receivedAt: '2026-11-18T10:00:00Z' },
      ],
    });
  });

  it('asks for a text body and rejects ids that could leave the path', async () => {
    get.mockResolvedValue({
      data: {
        subject: 'Hallo',
        from: { emailAddress: { address: 'a@b.de' } },
        toRecipients: [{ emailAddress: { name: 'C', address: 'c@d.de' } }],
        body: { content: 'Text' },
      },
    });
    const m = await outlook.getMessageText('tok', 'm1');
    expect(get.mock.calls[0][1].headers.Prefer).toBe('outlook.body-content-type="text"');
    expect(m).toMatchObject({ subject: 'Hallo', from: 'a@b.de', to: ['C <c@d.de>'], body: 'Text' });
    await expect(outlook.getMessageText('tok', '../me')).rejects.toThrow(/Invalid/);
  });
});

describe('gmail', () => {
  it('lists system labels first and own labels sorted, hiding the rest', async () => {
    get.mockResolvedValue({
      data: {
        labels: [
          { id: 'SENT', name: 'SENT', type: 'system' },
          { id: 'SPAM', name: 'SPAM', type: 'system' },
          { id: 'INBOX', name: 'INBOX', type: 'system' },
          { id: 'Label_2', name: 'Presse', type: 'user' },
          { id: 'Label_1', name: 'Anträge', type: 'user' },
        ],
      },
    });
    expect(await gmail.listLabels('tok')).toEqual([
      { id: 'INBOX', name: 'Posteingang' },
      { id: 'SENT', name: 'Gesendet' },
      { id: 'Label_1', name: 'Anträge' },
      { id: 'Label_2', name: 'Presse' },
    ]);
  });

  it('fetches subject and sender per message', async () => {
    get
      .mockResolvedValueOnce({ data: { messages: [{ id: 'abc' }], nextPageToken: 'n' } })
      .mockResolvedValueOnce({
        data: {
          id: 'abc',
          internalDate: String(Date.UTC(2026, 10, 18)),
          payload: {
            headers: [
              { name: 'Subject', value: 'Termin' },
              { name: 'From', value: 'Kim <kim@x.de>' },
            ],
          },
        },
      });
    const result = await gmail.listMessages('tok', { labelId: 'INBOX', query: 'termin' });
    expect(get.mock.calls[0][1].params).toMatchObject({ labelIds: 'INBOX', q: 'termin' });
    expect(result).toEqual({
      truncated: true,
      messages: [
        {
          id: 'abc',
          subject: 'Termin',
          from: 'Kim <kim@x.de>',
          receivedAt: '2026-11-18T00:00:00.000Z',
        },
      ],
    });
  });

  it('reads text/plain, falls back to html without markup', async () => {
    get.mockResolvedValueOnce({
      data: {
        id: 'a',
        payload: {
          mimeType: 'multipart/alternative',
          headers: [
            { name: 'Subject', value: 'S' },
            { name: 'To', value: 'a@b.de, c@d.de' },
          ],
          parts: [
            { mimeType: 'text/plain', body: { data: b64('Hallo Welt') } },
            { mimeType: 'text/html', body: { data: b64('<p>Hallo <b>HTML</b></p>') } },
          ],
        },
      },
    });
    const plain = await gmail.getMessageText('tok', 'a');
    expect(plain).toMatchObject({ subject: 'S', to: ['a@b.de', 'c@d.de'], body: 'Hallo Welt' });

    get.mockResolvedValueOnce({
      data: {
        id: 'b',
        payload: {
          mimeType: 'multipart/mixed',
          parts: [{ mimeType: 'text/html', body: { data: b64('<p>Hallo <b>HTML</b></p>') } }],
        },
      },
    });
    const html = await gmail.getMessageText('tok', 'b');
    expect(html.body).toContain('Hallo HTML');
    expect(html.body).not.toContain('<');
  });
});
