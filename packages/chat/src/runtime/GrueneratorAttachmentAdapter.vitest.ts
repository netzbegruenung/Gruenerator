/**
 * GlitchTip #661: a file picked into the composer was first read at send time,
 * minutes later. By then it had changed on disk, the read failed with
 * NotReadableError, and the error escaped as an unhandled rejection while the
 * user only saw the draft bounce back. The contents are now read at pick time.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAttachmentNoticeStore } from '../stores/attachmentNoticeStore';
import { useChatConfigStore } from '../stores/chatConfigStore';

import { GrueneratorAttachmentAdapter } from './GrueneratorAttachmentAdapter';

const fileToBase64 = vi.hoisted(() => vi.fn<(file: File) => Promise<string>>());

vi.mock('../lib/fileUtils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fileToBase64,
}));

const unreadable = new Error('Die Datei „PM.odt" konnte nicht gelesen werden [NotReadableError]');

function odt(): File {
  return new File(['x'], 'PM.odt', { type: 'application/vnd.oasis.opendocument.text' });
}

describe('GrueneratorAttachmentAdapter', () => {
  beforeEach(() => {
    fileToBase64.mockReset();
    useAttachmentNoticeStore.getState().dismiss();
  });

  it('sends the contents read at pick time, even if the file became unreadable since', async () => {
    const adapter = new GrueneratorAttachmentAdapter();
    let changedOnDisk = false;
    fileToBase64.mockImplementation(() =>
      changedOnDisk ? Promise.reject(unreadable) : Promise.resolve('eA==')
    );

    const pending = await adapter.add({ file: odt() });
    changedOnDisk = true;
    const complete = await adapter.send(pending);

    expect(fileToBase64).toHaveBeenCalledTimes(1);
    expect(complete.content?.[0]).toMatchObject({ type: 'file', data: 'eA==' });
  });

  it('fails the add, not the send, when the file cannot be read', async () => {
    const adapter = new GrueneratorAttachmentAdapter();
    fileToBase64.mockRejectedValue(unreadable);

    await expect(adapter.add({ file: odt() })).rejects.toBe(unreadable);
  });

  it('shows a notice when an attachment fails at send time', async () => {
    const failed = new Error('Upload fehlgeschlagen');
    const promise = Promise.reject(failed);
    useChatConfigStore.setState({
      uploadReelVideo: () => ({ promise, abort: () => {} }),
    });
    const adapter = new GrueneratorAttachmentAdapter();

    const pending = await adapter.add({
      file: new File(['x'], 'clip.mp4', { type: 'video/mp4' }),
    });

    await expect(adapter.send(pending)).rejects.toBe(failed);
    expect(useAttachmentNoticeStore.getState().notice).toMatchObject({
      title: 'Nachricht nicht gesendet',
      description: 'Upload fehlgeschlagen',
    });
  });
});
