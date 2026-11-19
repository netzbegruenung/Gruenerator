/**
 * ts-rest-Vertrag der Ordneransicht verbundener Konten.
 *
 * Hängt unter `/api/connections`, wo `requireAuth` am Präfix sitzt (routes.ts).
 * Ein abgelaufener Konto-Zugang antwortet mit 403, nicht 401: 401 heisst im
 * Chat-Client „unsere Sitzung ist weg“ und löst die Sitzungsprüfung aus.
 *
 * Die alte Route `/:providerKey/files` bleibt daneben stehen: sie liefert die
 * Rohformen der Anbieter, und ausgelieferte Mobile-Apps lesen sie weiter.
 */
import { initContract } from '@ts-rest/core';

import {
  driveBrowseErrorSchema,
  driveBrowseParamsSchema,
  driveBrowseQuerySchema,
  driveBrowseResponseSchema,
  driveConnectLinkResponseSchema,
  driveUploadBodySchema,
  driveUploadResponseSchema,
  googlePickerConfigResponseSchema,
} from '../schemas/connections.js';

const c = initContract();

export const connectionsContract = c.router(
  {
    browse: {
      method: 'GET',
      path: '/api/connections/:provider/browse',
      pathParams: driveBrowseParamsSchema,
      query: driveBrowseQuerySchema,
      responses: {
        200: driveBrowseResponseSchema,
        403: driveBrowseErrorSchema,
        404: driveBrowseErrorSchema,
        500: driveBrowseErrorSchema,
      },
      summary: 'Einen Ordner des verbundenen Laufwerks auflisten',
    },
    connectLink: {
      method: 'POST',
      path: '/api/connections/:provider/connect-link',
      pathParams: driveBrowseParamsSchema,
      body: c.noBody(),
      responses: {
        200: driveConnectLinkResponseSchema,
        403: driveBrowseErrorSchema,
        500: driveBrowseErrorSchema,
      },
      summary: 'Nango-Link zum Verbinden genau dieses Laufwerks',
    },
    upload: {
      method: 'POST',
      path: '/api/connections/:provider/upload',
      pathParams: driveBrowseParamsSchema,
      contentType: 'multipart/form-data',
      body: driveUploadBodySchema,
      responses: {
        200: driveUploadResponseSchema,
        400: driveBrowseErrorSchema,
        403: driveBrowseErrorSchema,
        413: driveBrowseErrorSchema,
        500: driveBrowseErrorSchema,
      },
      summary: 'Eine Word-Datei in das verbundene Laufwerk exportieren',
    },
    googlePicker: {
      method: 'GET',
      path: '/api/connections/google/picker',
      responses: {
        200: googlePickerConfigResponseSchema,
        403: driveBrowseErrorSchema,
        404: driveBrowseErrorSchema,
        500: driveBrowseErrorSchema,
      },
      summary: 'Token, API-Key und App-ID für den Google Picker',
    },
  },
  { pathPrefix: '' }
);
