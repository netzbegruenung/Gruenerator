/**
 * `subtitler_projects.video_path` marker for a project whose video lives in system storage:
 * `system-media:<storage_key>`. A storage key, not an absolute path, so the persisted row does
 * not depend on the container layout (SYSTEM_MEDIA_DIR, a later S3 driver). Resolve it through
 * `getSystemMediaStorage()`.
 */
const PREFIX = 'system-media:';

export const systemMediaMarker = (storageKey: string): string => `${PREFIX}${storageKey}`;

export const isSystemMediaMarker = (videoPath: string): boolean => videoPath.startsWith(PREFIX);
