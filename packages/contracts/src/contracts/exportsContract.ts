/**
 * ts-rest contract for /api/exports
 *
 * Covers DOCX and PDF export endpoints.
 * Binary responses are typed as `unknown` — consumers must set responseType:'blob'.
 */
import { initContract } from '@ts-rest/core';

import {
  docxExportBodySchema,
  pdfExportBodySchema,
  binaryFileResponseSchema,
  exportErrorResponseSchema,
} from '../schemas/exports.js';

const c = initContract();

export const exportsContract = c.router(
  {
    /**
     * POST /api/exports/docx
     * Generate a DOCX file from HTML content.
     * Response: application/vnd.openxmlformats-officedocument.wordprocessingml.document binary.
     *
     * Axios usage: { responseType: 'blob' }
     */
    generateDocx: {
      method: 'POST',
      path: '/api/exports/docx',
      body: docxExportBodySchema,
      responses: {
        200: binaryFileResponseSchema,
        500: exportErrorResponseSchema,
      },
      summary: 'Generate DOCX from content',
    },

    /**
     * POST /api/exports/pdf
     * Generate a PDF file from HTML content.
     * Response: application/pdf binary.
     *
     * Axios usage: { responseType: 'blob' }
     */
    generatePdf: {
      method: 'POST',
      path: '/api/exports/pdf',
      body: pdfExportBodySchema,
      responses: {
        200: binaryFileResponseSchema,
        500: exportErrorResponseSchema,
      },
      summary: 'Generate PDF from content',
    },
  },
  { pathPrefix: '' }
);
