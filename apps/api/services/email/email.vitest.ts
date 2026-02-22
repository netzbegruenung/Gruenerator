import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Templates are pure functions — safe to import statically
import {
  escapeHtml,
  renderContentDeliveryTemplate,
  renderDocumentShareTemplate,
} from './templates.js';

// ─── Template Tests (pure, no env dependency) ───────────────────────────────

describe('escapeHtml', () => {
  it('escapes all HTML special characters', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands and single quotes', () => {
    expect(escapeHtml("A&B's")).toBe('A&amp;B&#39;s');
  });

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('renderDocumentShareTemplate', () => {
  const params = {
    recipientName: 'Anna',
    senderName: 'Max',
    documentTitle: 'Klimaschutzantrag',
    documentUrl: 'https://gruenerator.eu/docs/abc123',
    permissionLevel: 'editor',
  };

  it('returns html and text', () => {
    const result = renderDocumentShareTemplate(params);
    expect(result.html).toBeDefined();
    expect(result.text).toBeDefined();
  });

  it('html contains recipient name and document title', () => {
    const { html } = renderDocumentShareTemplate(params);
    expect(html).toContain('Anna');
    expect(html).toContain('Klimaschutzantrag');
    expect(html).toContain('Max');
  });

  it('html contains the document link as CTA button', () => {
    const { html } = renderDocumentShareTemplate(params);
    expect(html).toContain('https://gruenerator.eu/docs/abc123');
  });

  it('maps editor to Bearbeiten', () => {
    const { html, text } = renderDocumentShareTemplate(params);
    expect(html).toContain('Bearbeiten');
    expect(text).toContain('Bearbeiten');
  });

  it('maps viewer to Lesen', () => {
    const { text } = renderDocumentShareTemplate({ ...params, permissionLevel: 'viewer' });
    expect(text).toContain('Lesen');
  });

  it('maps owner to Eigentümer', () => {
    const { text } = renderDocumentShareTemplate({ ...params, permissionLevel: 'owner' });
    expect(text).toContain('Eigentümer');
  });

  it('plain text contains document URL', () => {
    const { text } = renderDocumentShareTemplate(params);
    expect(text).toContain('https://gruenerator.eu/docs/abc123');
  });

  it('escapes HTML in user-provided fields', () => {
    const { html } = renderDocumentShareTemplate({
      ...params,
      senderName: '<img onerror=alert(1)>',
    });
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror');
  });

  it('html is valid table-based layout with DOCTYPE', () => {
    const { html } = renderDocumentShareTemplate(params);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('role="presentation"');
    expect(html).toContain('#316049');
  });
});

describe('renderContentDeliveryTemplate', () => {
  it('includes greeting when recipientName provided', () => {
    const { html, text } = renderContentDeliveryTemplate({
      recipientName: 'Lisa',
      contentTitle: 'Sharepic',
      hasAttachment: false,
    });
    expect(html).toContain('Lisa');
    expect(text).toContain('Hallo Lisa');
  });

  it('omits greeting when no recipientName', () => {
    const { text } = renderContentDeliveryTemplate({
      contentTitle: 'Sharepic',
      hasAttachment: false,
    });
    expect(text).not.toContain('Hallo');
  });

  it('includes attachment note when hasAttachment is true', () => {
    const { html, text } = renderContentDeliveryTemplate({
      contentTitle: 'PDF Report',
      hasAttachment: true,
    });
    expect(html).toContain('Anhang');
    expect(text).toContain('Anhang');
  });

  it('omits attachment note when hasAttachment is false', () => {
    const { text } = renderContentDeliveryTemplate({
      contentTitle: 'PDF Report',
      hasAttachment: false,
    });
    expect(text).not.toContain('Anhang');
  });

  it('includes content description when provided', () => {
    const { html } = renderContentDeliveryTemplate({
      contentTitle: 'Test',
      contentDescription: 'A nice sharepic about trees',
      hasAttachment: false,
    });
    expect(html).toContain('A nice sharepic about trees');
  });
});

// ─── Email Service Tests (requires mocking nodemailer + env) ─────────────────

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
const mockVerify = vi.fn().mockResolvedValue(true);

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
    })),
  },
}));

describe('emailService', () => {
  beforeEach(() => {
    vi.stubEnv('BREVO_SMTP_HOST', 'smtp.test.com');
    vi.stubEnv('BREVO_SMTP_PORT', '587');
    vi.stubEnv('BREVO_SMTP_USER', 'testuser');
    vi.stubEnv('BREVO_SMTP_PASS', 'testpass');
    vi.resetModules();
    mockSendMail.mockClear();
    mockVerify.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function loadService() {
    return await import('./emailService.js');
  }

  describe('sendEmail', () => {
    it('sends an email with correct options', async () => {
      const { sendEmail } = await loadService();

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
      });

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledOnce();
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Subject',
          html: '<p>Hello</p>',
          text: 'Hello',
        })
      );
    });

    it('includes from address', async () => {
      const { sendEmail } = await loadService();

      await sendEmail({
        to: 'x@y.com',
        subject: 'S',
        html: '<p>H</p>',
        text: 'H',
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ from: expect.any(String) })
      );
    });

    it('passes attachments when provided', async () => {
      const { sendEmail } = await loadService();

      const attachment = {
        filename: 'image.png',
        content: Buffer.from('fake-png'),
        contentType: 'image/png',
      };

      await sendEmail({
        to: 'x@y.com',
        subject: 'With file',
        html: '<p>See attached</p>',
        text: 'See attached',
        attachments: [attachment],
      });

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [expect.objectContaining({ filename: 'image.png' })],
        })
      );
    });

    it('returns false on SMTP error', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP timeout'));
      const { sendEmail } = await loadService();

      const result = await sendEmail({
        to: 'x@y.com',
        subject: 'Fail',
        html: '<p>F</p>',
        text: 'F',
      });

      expect(result).toBe(false);
    });
  });

  describe('sendEmail when unconfigured', () => {
    it('returns false when SMTP host is missing', async () => {
      vi.stubEnv('BREVO_SMTP_HOST', '');
      vi.resetModules();
      const { sendEmail } = await loadService();

      const result = await sendEmail({
        to: 'x@y.com',
        subject: 'S',
        html: '<p>H</p>',
        text: 'H',
      });

      expect(result).toBe(false);
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  describe('sendDocumentShareEmail', () => {
    it('sends a share email with correct subject and recipient', async () => {
      const { sendDocumentShareEmail } = await loadService();

      const result = await sendDocumentShareEmail({
        recipientEmail: 'anna@gruene.de',
        recipientName: 'Anna',
        senderName: 'Max',
        documentId: 'doc-123',
        documentTitle: 'Antrag Klimaschutz',
        permissionLevel: 'editor',
      });

      expect(result).toBe(true);
      expect(mockSendMail).toHaveBeenCalledOnce();

      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('anna@gruene.de');
      expect(call.subject).toContain('Max');
      expect(call.subject).toContain('geteilt');
      expect(call.html).toContain('Anna');
      expect(call.html).toContain('Antrag Klimaschutz');
      expect(call.html).toContain('/docs/doc-123');
      expect(call.text).toContain('Anna');
      expect(call.text).toContain('/docs/doc-123');
    });
  });

  describe('sendContentDeliveryEmail', () => {
    it('sends content email without attachment', async () => {
      const { sendContentDeliveryEmail } = await loadService();

      const result = await sendContentDeliveryEmail({
        recipientEmail: 'user@test.com',
        contentTitle: 'Mein Sharepic',
      });

      expect(result).toBe(true);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.to).toBe('user@test.com');
      expect(call.subject).toContain('Mein Sharepic');
      expect(call.attachments).toBeUndefined();
    });

    it('sends content email with attachment', async () => {
      const { sendContentDeliveryEmail } = await loadService();

      const result = await sendContentDeliveryEmail({
        recipientEmail: 'user@test.com',
        contentTitle: 'PDF Export',
        attachment: {
          filename: 'report.pdf',
          content: Buffer.from('fake-pdf'),
          contentType: 'application/pdf',
        },
      });

      expect(result).toBe(true);
      const call = mockSendMail.mock.calls[0][0];
      expect(call.attachments).toHaveLength(1);
      expect(call.attachments[0].filename).toBe('report.pdf');
    });
  });

  describe('verifyEmailConnection', () => {
    it('returns true when SMTP connection is valid', async () => {
      const { verifyEmailConnection } = await loadService();
      const result = await verifyEmailConnection();
      expect(result).toBe(true);
      expect(mockVerify).toHaveBeenCalledOnce();
    });

    it('returns false when verify throws', async () => {
      mockVerify.mockRejectedValueOnce(new Error('Connection refused'));
      const { verifyEmailConnection } = await loadService();
      const result = await verifyEmailConnection();
      expect(result).toBe(false);
    });

    it('returns false when unconfigured', async () => {
      vi.stubEnv('BREVO_SMTP_HOST', '');
      vi.resetModules();
      const { verifyEmailConnection } = await loadService();
      const result = await verifyEmailConnection();
      expect(result).toBe(false);
      expect(mockVerify).not.toHaveBeenCalled();
    });
  });
});
