import { describe, expect, it, vi } from 'vitest';

import { CloudExportError } from './cloudExport';
import { buildConnectorSendForm, fetchConnectorTargets, sendToConnector } from './connectorSend';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('buildConnectorSendForm', () => {
  it('carries the text for Slack', () => {
    const form = buildConnectorSendForm({ targetId: 'C1', title: 'T', text: '# Hi' });
    expect(form.get('targetId')).toBe('C1');
    expect(form.get('title')).toBe('T');
    expect(form.get('text')).toBe('# Hi');
    expect(form.get('file')).toBeNull();
  });

  it('carries the Word file for Teams', () => {
    const form = buildConnectorSendForm({
      targetId: 'x',
      title: 'T',
      docx: { blob: new Blob(['a']), filename: 'a.docx' },
    });
    expect((form.get('file') as File).name).toBe('a.docx');
    expect(form.get('text')).toBeNull();
  });
});

describe('fetchConnectorTargets', () => {
  it('encodes the parent and returns the entries', async () => {
    const entries = [{ id: 'a', name: 'A', hasChildren: true, selectable: false }];
    const fetchFn = vi.fn().mockResolvedValue(json({ success: true, entries }));
    expect(await fetchConnectorTargets(fetchFn, 'microsoft-teams', 'b/1')).toEqual(entries);
    expect(fetchFn).toHaveBeenCalledWith('/api/connections/microsoft-teams/targets?parent=b%2F1');
  });

  it('throws a reauth error on 403', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(json({ success: false, message: 'Abgelaufen.', reauth: true }, 403));
    await expect(fetchConnectorTargets(fetchFn, 'slack')).rejects.toMatchObject({
      name: 'CloudExportError',
      reauth: true,
    });
  });
});

describe('sendToConnector', () => {
  it('posts multipart without a Content-Type header', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(json({ success: true, name: 'n', webUrl: 'https://x.test/y' }));
    const result = await sendToConnector(fetchFn, 'slack', {
      targetId: 'C',
      title: 'T',
      text: 'x',
    });
    expect(result.webUrl).toBe('https://x.test/y');
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/connections/slack/send');
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('falls back to the HTTP status when the body is not an error shape', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const error = await sendToConnector(fetchFn, 'slack', { targetId: 'L', title: 'T' }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(CloudExportError);
    expect((error as CloudExportError).reauth).toBe(false);
  });
});
