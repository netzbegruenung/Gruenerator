/**
 * ts-rest-Vertrag der Konnektor-Testseite (Admin).
 *
 * Alle Endpunkte hängen unter `/api/auth/admin/connector-test`: `requireAuth`
 * greift am Präfix (routes.ts), die Admin-Rolle prüft jeder Handler selbst mit
 * `requireInstanceAdmin` — dieselbe Bauform wie chunkInspectorContract.
 *
 * Bewusst NICHT `/api/connections/*`: das ist der Nutzerpfad, und dort bleibt
 * Google ausgeblendet, bis diese Seite gezeigt hat, dass es trägt.
 */
import { initContract } from '@ts-rest/core';

import {
  connectorTestConnectResponseSchema,
  connectorTestDisconnectResponseSchema,
  connectorTestErrorSchema,
  connectorTestPickerResponseSchema,
  connectorTestProbeBodySchema,
  connectorTestProbeResponseSchema,
  connectorTestProviderParamsSchema,
  connectorTestReadBodySchema,
  connectorTestReadResponseSchema,
  connectorTestStatusResponseSchema,
} from '../schemas/connectorTest.js';

const c = initContract();

const ERRORS = {
  401: connectorTestErrorSchema,
  403: connectorTestErrorSchema,
  500: connectorTestErrorSchema,
} as const;

export const connectorTestContract = c.router(
  {
    status: {
      method: 'GET',
      path: '/api/auth/admin/connector-test',
      responses: { 200: connectorTestStatusResponseSchema, ...ERRORS },
      summary: 'Verbindungsstand Google/Microsoft der eigenen Person (Admin)',
    },

    connect: {
      method: 'POST',
      path: '/api/auth/admin/connector-test/:provider/connect',
      pathParams: connectorTestProviderParamsSchema,
      body: c.noBody(),
      responses: { 200: connectorTestConnectResponseSchema, ...ERRORS },
      summary: 'Nango-Connect-Link, auf einen Anbieter beschränkt (Admin)',
    },

    probe: {
      method: 'POST',
      path: '/api/auth/admin/connector-test/:provider/probe',
      pathParams: connectorTestProviderParamsSchema,
      body: connectorTestProbeBodySchema,
      responses: { 200: connectorTestProbeResponseSchema, ...ERRORS },
      summary: 'Token holen und eine Dateiliste abrufen (Admin)',
    },

    picker: {
      method: 'GET',
      path: '/api/auth/admin/connector-test/google/picker',
      responses: {
        200: connectorTestPickerResponseSchema,
        404: connectorTestErrorSchema,
        ...ERRORS,
      },
      summary: 'Access-Token, API-Key und App-ID für den Google Picker (Admin)',
    },

    read: {
      method: 'POST',
      path: '/api/auth/admin/connector-test/:provider/read',
      pathParams: connectorTestProviderParamsSchema,
      body: connectorTestReadBodySchema,
      responses: { 200: connectorTestReadResponseSchema, ...ERRORS },
      summary: 'Eine Datei über den @connect-Abruf des Chats lesen (Admin)',
    },

    disconnect: {
      method: 'DELETE',
      path: '/api/auth/admin/connector-test/:provider',
      pathParams: connectorTestProviderParamsSchema,
      body: c.noBody(),
      responses: { 200: connectorTestDisconnectResponseSchema, ...ERRORS },
      summary: 'Nango-Verbindung trennen (Admin)',
    },
  },
  { pathPrefix: '' }
);
