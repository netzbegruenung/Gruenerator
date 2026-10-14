import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendEmail = vi.fn<(m: { subject: string; html: string; text: string }) => Promise<boolean>>();
const isEmailConfigured = vi.fn();
const recordContentReport = vi.fn();

vi.mock('../../services/email/index.js', () => ({ sendEmail, isEmailConfigured }));
vi.mock('../../services/contentReports/contentReportsService.js', () => ({
  recordContentReport,
}));

const req = { user: { id: 'user-1', email: 'reporter@example.org' } } as never;

const body = {
  kind: 'group_post' as const,
  targetId: 'post-42',
  groupId: 'group-7',
  reason: 'harassment' as const,
  note: '<script>alert(1)</script>',
  excerpt: '<b>answer</b>',
};

async function create(b: Omit<typeof body, 'kind'> & { kind: string }) {
  const { contentReportContractRouter } = await import('./contentReportContractRouter.js');
  return contentReportContractRouter.create({ req, body: b } as never);
}

beforeEach(() => {
  sendEmail.mockReset().mockResolvedValue(true);
  isEmailConfigured.mockReset().mockReturnValue(true);
  recordContentReport
    .mockReset()
    .mockResolvedValue({ ok: true, value: { stored: true, hidden: false } });
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

  it('stores the report for the signed-in user before mailing', async () => {
    await create(body);
    expect(recordContentReport).toHaveBeenCalledWith('user-1', body);
  });

  it('keeps the stored report when the mail fails or SMTP is missing', async () => {
    sendEmail.mockResolvedValue(false);
    expect(await create(body)).toEqual({ status: 200, body: { success: true } });
    sendEmail.mockRejectedValue(new Error('boom'));
    expect(await create(body)).toEqual({ status: 200, body: { success: true } });
    isEmailConfigured.mockReturnValue(false);
    expect(await create(body)).toEqual({ status: 200, body: { success: true } });
  });

  it('answers a repeated report with 200 and sends no second mail', async () => {
    recordContentReport.mockResolvedValue({ ok: true, value: { stored: false, hidden: false } });
    expect(await create(body)).toEqual({ status: 200, body: { success: true } });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('passes a refused report through without mailing', async () => {
    recordContentReport.mockResolvedValue({
      ok: false,
      status: 400,
      message: 'Eigene Inhalte kannst du nicht melden.',
    });
    const res = await create({ ...body, kind: 'studio_asset' });
    expect(res).toEqual({
      status: 400,
      body: { success: false, error: 'Eigene Inhalte kannst du nicht melden.' },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('notes an auto-hide in the mail', async () => {
    recordContentReport.mockResolvedValue({ ok: true, value: { stored: true, hidden: true } });
    await create({ ...body, kind: 'studio_asset' });
    expect(sendEmail.mock.calls[0]![0].text).toContain('Status: Automatisch ausgeblendet');
  });

  it('returns 500 when storing the report throws', async () => {
    recordContentReport.mockRejectedValue(new Error('db down'));
    const res = await create(body);
    expect(res).toEqual({
      status: 500,
      body: { success: false, error: 'Report could not be sent' },
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
