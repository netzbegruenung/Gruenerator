/**
 * Project API functions
 * Platform-agnostic API calls using shared client
 */

import { getGlobalApiClient } from '../api/client';
import type { Project, ProjectsApiResponse, SaveProjectData, UpdateProjectData } from './types';

const PROJECTS_ENDPOINT = '/subtitler/projects';

/**
 * Fetch all projects for the current user
 */
export async function fetchProjects(): Promise<Project[]> {
  const client = getGlobalApiClient();
  const response = await client.get<ProjectsApiResponse>(PROJECTS_ENDPOINT);

  if (!response.data.success) {
    throw new Error(response.data.error || 'Projekte konnten nicht geladen werden');
  }

  return response.data.projects || [];
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: string): Promise<Project> {
  const client = getGlobalApiClient();
  const response = await client.get<ProjectsApiResponse>(`${PROJECTS_ENDPOINT}/${projectId}`);

  if (!response.data.success || !response.data.project) {
    throw new Error(response.data.error || 'Projekt konnte nicht geladen werden');
  }

  return response.data.project;
}

/**
 * Save a new project
 */
export async function saveProject(projectData: SaveProjectData): Promise<{ project: Project; isNew: boolean }> {
  const client = getGlobalApiClient();
  const response = await client.post<ProjectsApiResponse>(PROJECTS_ENDPOINT, projectData);

  if (!response.data.success || !response.data.project) {
    throw new Error(response.data.error || 'Projekt konnte nicht gespeichert werden');
  }

  return {
    project: response.data.project,
    isNew: response.data.isNew ?? true,
  };
}

/**
 * Update an existing project
 */
export async function updateProject(projectId: string, updates: UpdateProjectData): Promise<Project> {
  const client = getGlobalApiClient();
  const response = await client.put<ProjectsApiResponse>(`${PROJECTS_ENDPOINT}/${projectId}`, updates);

  if (!response.data.success || !response.data.project) {
    throw new Error(response.data.error || 'Projekt konnte nicht aktualisiert werden');
  }

  return response.data.project;
}

/**
 * Delete a project
 */
export async function deleteProject(projectId: string): Promise<void> {
  const client = getGlobalApiClient();
  const response = await client.delete<ProjectsApiResponse>(`${PROJECTS_ENDPOINT}/${projectId}`);

  if (!response.data.success) {
    throw new Error(response.data.error || 'Projekt konnte nicht gelöscht werden');
  }
}

/**
 * Get the video streaming URL for a project
 * Note: This returns a relative URL path - the base URL should be added by the platform
 */
export function getVideoPath(projectId: string): string {
  return `${PROJECTS_ENDPOINT}/${projectId}/video`;
}

/**
 * Get the thumbnail URL for a project
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
