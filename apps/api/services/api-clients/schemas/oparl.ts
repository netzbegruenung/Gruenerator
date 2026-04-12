import { z } from 'zod';

// ── System (/oparl/v1.0/system) ───────────────────────────────────────────────

export const oparlSystemSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  body: z.string().optional(),
});

export type OparlSystem = z.infer<typeof oparlSystemSchema>;

// ── Body (/oparl/v1.0/body) ───────────────────────────────────────────────────

export const oparlBodySchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  organization: z.string().optional(),
  paper: z.string().optional(),
  meeting: z.string().optional(),
  person: z.string().optional(),
});

export type OparlBody = z.infer<typeof oparlBodySchema>;

// OParl body endpoints return either a bare array, a { data: T[] } wrapper, or
// a single object.  Model all three variants so callers can validate.

export const oparlBodyListResponseSchema = z.union([
  z.array(oparlBodySchema),
  z.object({ data: z.array(oparlBodySchema) }),
  oparlBodySchema,
]);

export type OparlBodyListResponse = z.infer<typeof oparlBodyListResponseSchema>;

// ── Organization (/oparl/…/organization) ─────────────────────────────────────

export const oparlOrganizationSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  shortName: z.string().optional(),
  classification: z.string().optional(),
});

export type OparlOrganization = z.infer<typeof oparlOrganizationSchema>;

// OParl organization list: array or { data: T[] } wrapper
export const oparlOrganizationListResponseSchema = z.union([
  z.array(oparlOrganizationSchema),
  z.object({ data: z.array(oparlOrganizationSchema) }),
]);

export type OparlOrganizationListResponse = z.infer<typeof oparlOrganizationListResponseSchema>;

// ── File attachment ───────────────────────────────────────────────────────────

export const oparlFileSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  fileName: z.string().optional(),
  accessUrl: z.string().optional(),
  downloadUrl: z.string().optional(),
  mimeType: z.string().optional(),
});

export type OparlFile = z.infer<typeof oparlFileSchema>;

// ── Consultation ──────────────────────────────────────────────────────────────

export const oparlConsultationSchema = z.object({
  organization: z.union([z.string(), z.array(z.string())]).optional(),
});

export type OparlConsultation = z.infer<typeof oparlConsultationSchema>;

// ── Paper (/oparl/…/paper) ───────────────────────────────────────────────────

export const oparlPaperSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  reference: z.string().optional(),
  paperType: z.string().optional(),
  originatorOrganization: z.union([z.string(), z.array(z.string())]).optional(),
  underDirectionOf: z.union([z.string(), z.array(z.string())]).optional(),
  consultation: z.array(oparlConsultationSchema).optional(),
  mainFile: oparlFileSchema.optional(),
  auxiliaryFile: z.array(oparlFileSchema).optional(),
  date: z.string().optional(),
});

export type OparlPaper = z.infer<typeof oparlPaperSchema>;

// OParl paper list: array or { data: T[] } wrapper (same polymorphism as bodies)
export const oparlPaperListResponseSchema = z.union([
  z.array(oparlPaperSchema),
  z.object({ data: z.array(oparlPaperSchema) }),
]);

export type OparlPaperListResponse = z.infer<typeof oparlPaperListResponseSchema>;
