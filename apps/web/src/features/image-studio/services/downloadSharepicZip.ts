import { downloadBlob } from '@gruenerator/shared';

import apiClient from '../../../components/utils/apiClient';

/** Bundles the slides of a carousel into one ZIP on the server and hands it to the user. */
export async function downloadSharepicZip(images: string[], canvasType: string): Promise<void> {
  const response = await apiClient.post(
    '/exports/zip',
    { images, canvasType },
    { responseType: 'blob' }
  );
  await downloadBlob(response.data as Blob, `gruenerator-${canvasType}-${Date.now()}.zip`);
}
