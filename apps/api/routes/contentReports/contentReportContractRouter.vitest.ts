import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn<(m: { subject: string; html: string; text: string }) => Promise<boolean>>();
const isEmailConfigured = vi.fn();

vi.mock('../../services/email/index.js', () => ({ sendEmail, isEmailConfigured }));

const req = { user: { id: 'user-1', email: 'reporter@example.org' } } as never;

const body = {
  kind: 'group_post' as const,
  targetId: 'post-42',
  groupId: 'group-7',
  reason: 'harassment' as const,
  note: '<script>alert(1)</script>',
  excerpt: '<b>answer</b>',
};

async function create(b: typeof body) {
  const { contentReportContractRouter } = await import('./contentReportContractRouter.js');
  return contentReportContractRouter.create({ req, body: b } as never);
}

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(true);
  isEmailConfigured.mockReset().mockReturnValue(true);
});

describe('contentReportContractRouter.create', () => {
  it('mails the operator with ids and reporter, escaping the note', async () => {
    const res = await create(body);
    expect(res).toEqual({ status: 200, body: { success: true } });
    const mail = sendEmail.mock.calls[0]![0];
    expect(mail.text).toContain('Ziel-ID: post-42');
    expect(mail.text).toContain('Projekt-ID: group-7');
    expect(mail.text).toContain('Gemeldet von: user-1 (reporter@example.org)');
    expect(mail.subject).toContain('group_post');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('<b>answer</b>');
    expect(mail.html).toContain('&lt;b&gt;answer&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>answer');
  });

  it('returns 500 when the mail cannot be sent', async () => {
    sendEmail.mockResolvedValue(false);
    const res = await create(body);
    expect(res.status).toBe(500);
  });

  it('returns 500 when sendEmail throws', async () => {
    sendEmail.mockRejectedValue(new Error('boom'));
    const res = await create(body);
    expect(res).toEqual({
      status: 500,
      body: { success: false, error: 'Report could not be sent' },
    });
  });
});
