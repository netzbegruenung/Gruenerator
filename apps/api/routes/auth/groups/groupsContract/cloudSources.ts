/**
 * Synchronisierte Ablagen als Projektwissen (#5945, experimentell). Logik und
 * Rechte in `services/groups/projectCloudSources.ts`; hier nur die Abbildung
 * auf HTTP.
 */
import { groupsContract } from '@gruenerator/contracts';

import {
  ProjectCloudSourceError,
  attachProjectDriveFiles,
  attachProjectWolkeFolder,
  detachProjectCloudSource,
  listProjectCloudSources,
  syncProjectCloudSourceNow,
} from '../../../../services/groups/projectCloudSources.js';
import { toUserFacingMessage } from '../../../../utils/errors/index.js';

import { getUserId, groupErrorResponse, s } from './shared.js';

function knownError<S extends 400 | 404 | 409>(error: unknown, statuses: readonly S[]) {
  if (
    error instanceof ProjectCloudSourceError &&
    (statuses as readonly number[]).includes(error.status)
  ) {
    return {
      status: error.status as S,
      body: { success: false as const, message: toUserFacingMessage(error) },
    };
  }
  return null;
}

export const cloudSourceRoutes = {
  listGroupCloudSources: s.route(groupsContract.listGroupCloudSources, async (args) => {
    try {
      const sources = await listProjectCloudSources(args.params.groupId, getUserId(args.req));
      return { status: 200 as const, body: { success: true as const, sources } };
    } catch (error) {
      return groupErrorResponse(
        'listGroupCloudSources',
        'Verbundene Ablagen konnten nicht geladen werden.',
        error
      );
    }
  }),

  attachGroupWolkeFolder: s.route(groupsContract.attachGroupWolkeFolder, async (args) => {
    try {
      const result = await attachProjectWolkeFolder({
        groupId: args.params.groupId,
        userId: getUserId(args.req),
        url: args.body.url,
        includeSubfolders: args.body.includeSubfolders,
        name: args.body.name ?? null,
      });
      return { status: 200 as const, body: { success: true as const, ...result } };
    } catch (error) {
      return (
        knownError(error, [400, 409] as const) ??
        groupErrorResponse(
          'attachGroupWolkeFolder',
          'Der Wolke-Ordner ließ sich nicht anhängen.',
          error
        )
      );
    }
  }),

  attachGroupDriveFiles: s.route(groupsContract.attachGroupDriveFiles, async (args) => {
    try {
      const result = await attachProjectDriveFiles({
        groupId: args.params.groupId,
        userId: getUserId(args.req),
        files: args.body.files,
      });
      return { status: 200 as const, body: { success: true as const, ...result } };
    } catch (error) {
      return (
        knownError(error, [400] as const) ??
        groupErrorResponse(
          'attachGroupDriveFiles',
          'Die Drive-Dateien ließen sich nicht hinzufügen.',
          error
        )
      );
    }
  }),

  syncGroupCloudSource: s.route(groupsContract.syncGroupCloudSource, async (args) => {
    try {
      const result = await syncProjectCloudSourceNow({
        groupId: args.params.groupId,
        userId: getUserId(args.req),
        sourceId: args.params.sourceId,
      });
      return { status: 200 as const, body: { success: true as const, ...result } };
    } catch (error) {
      return (
        knownError(error, [404] as const) ??
        groupErrorResponse('syncGroupCloudSource', 'Der Abgleich ist fehlgeschlagen.', error)
      );
    }
  }),

  detachGroupCloudSource: s.route(groupsContract.detachGroupCloudSource, async (args) => {
    try {
      await detachProjectCloudSource({
        groupId: args.params.groupId,
        userId: getUserId(args.req),
        sourceId: args.params.sourceId,
      });
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return (
        knownError(error, [404] as const) ??
        groupErrorResponse('detachGroupCloudSource', 'Die Quelle ließ sich nicht trennen.', error)
      );
    }
  }),
};
