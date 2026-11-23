/**
 * Wolke-Ordner als Projektwissen (#5945, experimentell). Logik und Rechte in
 * `services/groups/projectWolkeFolders.ts`; hier nur die Abbildung auf HTTP.
 */
import { groupsContract } from '@gruenerator/contracts';

import {
  ProjectWolkeFolderError,
  attachProjectWolkeFolder,
  detachProjectWolkeFolder,
  listProjectWolkeFolders,
  syncProjectWolkeFolderNow,
} from '../../../../services/groups/projectWolkeFolders.js';
import { toUserFacingMessage } from '../../../../utils/errors/index.js';

import { getUserId, groupErrorResponse, s } from './shared.js';

export const wolkeFolderRoutes = {
  listGroupWolkeFolders: s.route(groupsContract.listGroupWolkeFolders, async (args) => {
    try {
      const folders = await listProjectWolkeFolders(args.params.groupId, getUserId(args.req));
      return { status: 200 as const, body: { success: true as const, folders } };
    } catch (error) {
      return groupErrorResponse(
        'listGroupWolkeFolders',
        'Wolke-Ordner konnten nicht geladen werden.',
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
      if (error instanceof ProjectWolkeFolderError && error.status !== 404) {
        return {
          status: error.status,
          body: { success: false as const, message: toUserFacingMessage(error) },
        };
      }
      return groupErrorResponse(
        'attachGroupWolkeFolder',
        'Der Wolke-Ordner ließ sich nicht anhängen.',
        error
      );
    }
  }),

  syncGroupWolkeFolder: s.route(groupsContract.syncGroupWolkeFolder, async (args) => {
    try {
      const result = await syncProjectWolkeFolderNow({
        groupId: args.params.groupId,
        userId: getUserId(args.req),
        folderId: args.params.folderId,
      });
      return { status: 200 as const, body: { success: true as const, ...result } };
    } catch (error) {
      if (error instanceof ProjectWolkeFolderError && error.status === 404) {
        return {
          status: 404 as const,
          body: { success: false as const, message: toUserFacingMessage(error) },
        };
      }
      return groupErrorResponse('syncGroupWolkeFolder', 'Der Abgleich ist fehlgeschlagen.', error);
    }
  }),

  detachGroupWolkeFolder: s.route(groupsContract.detachGroupWolkeFolder, async (args) => {
    try {
      await detachProjectWolkeFolder({
        groupId: args.params.groupId,
        userId: getUserId(args.req),
        folderId: args.params.folderId,
      });
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      if (error instanceof ProjectWolkeFolderError && error.status === 404) {
        return {
          status: 404 as const,
          body: { success: false as const, message: toUserFacingMessage(error) },
        };
      }
      return groupErrorResponse(
        'detachGroupWolkeFolder',
        'Der Ordner ließ sich nicht trennen.',
        error
      );
    }
  }),
};
