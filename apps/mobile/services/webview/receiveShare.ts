import { type WebViewOutboundMessage } from '@gruenerator/shared';

import { base64ToBytes, shareBytesAsFile } from '../share';

type ShareMessage = Extract<WebViewOutboundMessage, { type: 'SHARE_FILE' }>;

/**
 * Opens the share sheet for a file the page wants shared. `text` is not passed
 * on: a file share through expo-sharing has no caption field.
 */
export async function receiveShare(message: ShareMessage): Promise<void> {
  await shareBytesAsFile(
    base64ToBytes(message.data),
    message.filename,
    message.title ?? 'Teilen',
    message.mime
  );
}
