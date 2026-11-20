/**
 * ts-rest-Router der Ordneransicht verbundener Konten (OneDrive, Google Drive).
 *
 * `requireAuth` sitzt am Präfix `/api/connections` (routes.ts). Gelesen wird
 * nur mit dem Token der angemeldeten Person; Inhalte holt erst der Chat-Abruf
 * beim Senden (`connectRetrieval.ts`), diese Route liefert nur die Liste.
 */
import {
  CLOUD_UPLOAD_FIELD,
  CLOUD_UPLOAD_MAX_BYTES,
  connectionsContract,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import axios from 'axios';
import multer from 'multer';

import { env } from '../../config/env.js';
import {
  ConnectionNotAllowedError,
  ConnectionService,
} from '../../services/connections/ConnectionService.js';
import { browseDrive } from '../../services/connections/driveBrowse.js';
import { isDocxBuffer, uploadToDrive } from '../../services/connections/driveUpload.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { Application, NextFunction, Request, Response } from 'express';

const log = createLogger('connectionsContractRouter');

const s = initServer();

function failure<S extends 400 | 403 | 404 | 413 | 500>(
  status: S,
  message: string,
  reauth = false
) {
  return { status, body: { success: false as const, message, reauth } };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CLOUD_UPLOAD_MAX_BYTES, files: 1, fields: 2 },
  defParamCharset: 'utf8',
}).single(CLOUD_UPLOAD_FIELD);

/** Limits werden als JSON in der Fehlerform des Vertrags abgelehnt. */
function cloudUpload(req: Request, res: Response, next: NextFunction): void {
  upload(req, res, (err: unknown) => {
    if (!err) return next();
    const tooLarge = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
    res
      .status(tooLarge ? 413 : 400)
      .json(
        failure(
          tooLarge ? 413 : 400,
          tooLarge ? 'Die Datei ist zu groß.' : 'Die Datei konnte nicht hochgeladen werden.'
        ).body
      );
  });
}

export const connectionsContractRouter = s.router(connectionsContract, {
  browse: async ({ req, params, query }) => {
    const userId = getAuthedUser(req).id;

    let accessToken: string;
    try {
      ({ accessToken } = await ConnectionService.getConnection(userId, params.provider));
    } catch (err) {
      if (err instanceof ConnectionNotAllowedError) return failure(403, err.message);
      log.warn(`[browse] ${params.provider} connection lookup failed`, err);
      return failure(403, 'Konto nicht verbunden oder Zugang abgelaufen.', true);
    }

    try {
      const folder = await browseDrive(params.provider, accessToken, query.folderId);
      return { status: 200 as const, body: { success: true as const, ...folder } };
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401 || status === 403) {
        return failure(403, 'Zugang abgelaufen — bitte neu verbinden.', true);
      }
      if (status === 404 || (err instanceof Error && err.message.startsWith('Invalid'))) {
        return failure(404, 'Ordner nicht gefunden.');
      }
      log.error(`[browse] ${params.provider} listing failed`, err);
      return failure(500, 'Ordner konnte nicht geladen werden.');
    }
  },

  // Die Karte im Konnektor-Verzeichnis öffnet den Link im Popup. Ob die Person
  // den Anbieter verbinden darf, entscheidet `ConnectionService`.
  connectLink: async ({ req, params }) => {
    const userId = getAuthedUser(req).id;
    try {
      const connectLink = await ConnectionService.createConnectLink(userId, params.provider);
      return { status: 200 as const, body: { success: true as const, connectLink } };
    } catch (err) {
      if (err instanceof ConnectionNotAllowedError) return failure(403, err.message);
      log.error(`[connectLink] ${params.provider} failed`, err);
      return failure(500, 'Verbindung konnte nicht gestartet werden.');
    }
  },

  // Neuer Scope gegenüber dem Lesen (OneDrive `Files.ReadWrite`): wer vorher
  // verbunden hat, bekommt von Graph 403 und muss einmal neu zustimmen.
  upload: {
    middleware: [cloudUpload],
    handler: async ({ req, params }) => {
      const userId = getAuthedUser(req).id;
      const file = req.file;
      if (!file || !isDocxBuffer(file.buffer)) {
        return failure(400, 'Nur Word-Dateien (.docx) können exportiert werden.');
      }

      let accessToken: string;
      try {
        ({ accessToken } = await ConnectionService.getConnection(userId, params.provider));
      } catch (err) {
        if (err instanceof ConnectionNotAllowedError) return failure(403, err.message);
        log.warn(`[upload] ${params.provider} connection lookup failed`, err);
        return failure(403, 'Konto nicht verbunden oder Zugang abgelaufen.', true);
      }

      try {
        const result = await uploadToDrive(
          params.provider,
          accessToken,
          file.buffer,
          file.originalname
        );
        return { status: 200 as const, body: { success: true as const, ...result } };
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        if (status === 401 || status === 403) {
          return failure(403, 'Für den Export bitte das Konto neu verbinden.', true);
        }
        log.error(`[upload] ${params.provider} upload failed`, err);
        return failure(500, 'Die Datei konnte nicht gespeichert werden.');
      }
    },
  },

  // Der Picker gibt dem Grünerator erst Zugriff auf die ausgewählten Dateien
  // (Scope `drive.file`). Key und App-ID sind öffentlich, sie landen ohnehin
  // im Browser; sie stehen in der API-Env, damit ein Tausch keinen Web-Build braucht.
  googlePicker: async ({ req }) => {
    const userId = getAuthedUser(req).id;
    const apiKey = env.GOOGLE_PICKER_API_KEY;
    const appId = env.GOOGLE_PICKER_APP_ID;
    if (!apiKey || !appId) {
      log.warn('[googlePicker] GOOGLE_PICKER_API_KEY or GOOGLE_PICKER_APP_ID is not set');
      return failure(404, 'Die Dateiauswahl für Google Drive ist noch nicht eingerichtet.');
    }
    try {
      const { accessToken } = await ConnectionService.getConnection(userId, 'google');
      return { status: 200 as const, body: { success: true as const, accessToken, apiKey, appId } };
    } catch (err) {
      if (err instanceof ConnectionNotAllowedError) return failure(403, err.message);
      log.warn('[googlePicker] google connection lookup failed', err);
      return failure(403, 'Konto nicht verbunden oder Zugang abgelaufen.', true);
    }
  },
});

export function mountConnectionsContractRouter(app: Application): void {
  createExpressEndpoints(connectionsContract, connectionsContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'connectionsContract'),
  });
}
