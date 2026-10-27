import { zipPageImages } from '@gruenerator/canvas-editor/zip';
import { downloadBlob } from '@gruenerator/shared';

/** Bundles the slides of a carousel into one ZIP in the browser and hands it to the user. */
export async function downloadSharepicZip(images: string[], canvasType: string): Promise<void> {
  await downloadBlob(zipPageImages(images), `gruenerator-${canvasType}-${Date.now()}.zip`);
}
