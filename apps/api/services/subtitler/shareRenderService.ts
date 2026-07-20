/**
 * Background render for share-from-project when a project has no pre-rendered
 * subtitled video yet. Extracted from the legacy shareController so the
 * ts-rest share handlers stay thin.
 */
import fs from 'fs';
import path from 'path';

import { createLogger } from '../../utils/logger.js';

import { getSubtitlerShareService } from './shareService.js';

import { getSubtitlerProjectService } from './index.js';

import type { SubtitlerProject } from './types.js';

const fsPromises = fs.promises;
const log = createLogger('subtitler-share-render');

export async function triggerBackgroundRender(
  userId: string,
  projectId: string,
  shareToken: string,
  project: SubtitlerProject
): Promise<void> {
  try {
    const projService = getSubtitlerProjectService();
    await projService.ensureInitialized();
    const { processProjectExport } = await import('./exportService.js');

    log.info(`Background render starting for share ${shareToken}`);
    const result = await processProjectExport(
      {
        id: project.id,
        video_path: project.video_path,
        subtitles: project.subtitles,
        style_preference: project.style_preference,
        height_preference: project.height_preference,
      },
      projService
    );

    const subtitledVideoRelativePath = `${userId}/${projectId}/subtitled_${Date.now()}.mp4`;
    const subtitledVideoFullPath = projService.getSubtitledVideoPath(subtitledVideoRelativePath);

    await fsPromises.mkdir(path.dirname(subtitledVideoFullPath), { recursive: true });
    await fsPromises.copyFile(result.outputPath, subtitledVideoFullPath);
    await projService.updateSubtitledVideoPath(userId, projectId, subtitledVideoRelativePath);

    const service = getSubtitlerShareService();
    await service.ensureInitialized();
    await service.finalizeShare(shareToken, subtitledVideoFullPath);

    try {
      await fsPromises.unlink(result.outputPath);
    } catch {
      /* ignore cleanup error */
    }
    log.info(`Background render complete for share ${shareToken}`);
  } catch (error: unknown) {
    log.error(`Background render failed for ${shareToken}:`, error);
    const service = getSubtitlerShareService();
    await service.ensureInitialized();
    await service.markShareFailed(shareToken);
  }
}
