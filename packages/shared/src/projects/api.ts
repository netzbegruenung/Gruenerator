/**
 * Project API functions
 * Platform-agnostic API calls using the ts-rest contracts client.
 *
 * Project CRUD flows through `getContractsClient().subtitler.*` so web and
 * mobile share one typed path. The contract's `SubtitlerProject` is
 * nullability-wide (tolerates legacy rows) and lacks `upload_id`; the local
 * `Project` is the tighter shape the app reads off — the `as unknown as`
 * casts are the documented FE-boundary assertion (the contract already
 * validated the wire shape at runtime).
 */

import { getGlobalApiClient } from '../api/client.js';
import { getContractsClient } from '../api/contractsClient.js';

import type { Project, SaveProjectData, UpdateProjectData } from './types.js';

const PROJECTS_ENDPOINT = '/subtitler/projects';

function errorFrom(body: unknown, fallback: string): string {
  const b = body as { error?: string } | null;
  return b?.error || fallback;
}

/**
 * Fetch all projects for the current user
 */
export async function fetchProjects(): Promise<Project[]> {
  const res = await getContractsClient().subtitler.listProjects();
  if (res.status !== 200) {
    throw new Error(errorFrom(res.body, 'Projekte konnten nicht geladen werden'));
  }
  return res.body.projects as unknown as Project[];
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: string): Promise<Project> {
  const res = await getContractsClient().subtitler.getProject({ params: { projectId } });
  if (res.status !== 200) {
    throw new Error(errorFrom(res.body, 'Projekt konnte nicht geladen werden'));
  }
  return res.body.project as unknown as Project;
}

/**
 * Save a new project
 */
export async function saveProject(
  projectData: SaveProjectData
): Promise<{ project: Project; isNew: boolean }> {
  const res = await getContractsClient().subtitler.createProject({
    body: {
      ...projectData,
      subtitles: projectData.subtitles ?? [],
      videoMetadata: projectData.videoMetadata as Record<string, unknown> | undefined,
    },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(errorFrom(res.body, 'Projekt konnte nicht gespeichert werden'));
  }
  return {
    project: res.body.project as unknown as Project,
    isNew: res.body.isNew ?? true,
  };
}

/**
 * Update an existing project
 */
export async function updateProject(
  projectId: string,
  updates: UpdateProjectData
): Promise<Project> {
  const res = await getContractsClient().subtitler.updateProject({
    params: { projectId },
    body: updates,
  });
  if (res.status !== 200) {
    throw new Error(errorFrom(res.body, 'Projekt konnte nicht aktualisiert werden'));
  }
  return res.body.project as unknown as Project;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  const res = await getContractsClient().subtitler.deleteProject({ params: { projectId } });
  if (res.status !== 200) {
    throw new Error(errorFrom(res.body, 'Projekt konnte nicht gelöscht werden'));
  }
}

/**
 * Get the video streaming URL for a project (binary route — stays raw).
 * Note: This returns a relative URL path - the base URL should be added by the platform
 */
export function getVideoPath(projectId: string): string {
  return `${PROJECTS_ENDPOINT}/${projectId}/video`;
}

/**
 * Get the thumbnail URL for a project (binary route — stays raw).
 * Note: This returns a relative URL path - the base URL should be added by the platform
 */
export function getThumbnailPath(projectId: string): string {
  return `${PROJECTS_ENDPOINT}/${projectId}/thumbnail`;
}

/**
 * Get full video URL with base URL
 * Uses the API client's base URL
 */
export function getVideoUrl(projectId: string): string {
  const client = getGlobalApiClient();
  const baseURL = client.defaults.baseURL || '';
  return `${baseURL}${getVideoPath(projectId)}`;
}

/**
 * Get full thumbnail URL with base URL
 * Uses the API client's base URL
 */
export function getThumbnailUrl(projectId: string): string {
  const client = getGlobalApiClient();
  const baseURL = client.defaults.baseURL || '';
  return `${baseURL}${getThumbnailPath(projectId)}`;
}
