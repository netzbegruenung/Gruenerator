import { z } from 'zod';
import { defineToolUiContract } from '../shared/contract';
import { ToolUIIdSchema, ToolUIReceiptSchema, ToolUIRoleSchema } from '../shared/schema';

import { AspectRatioSchema, MediaFitSchema } from '../shared/media';

export const SerializableLinkPreviewSchema = z.object({
  id: ToolUIIdSchema,
  role: ToolUIRoleSchema.optional(),
  receipt: ToolUIReceiptSchema.optional(),
  href: z.string().url(),
  title: z.string().optional(),
  description: z.string().optional(),
  image: z.string().url().optional(),
  domain: z.string().optional(),
  favicon: z.string().url().optional(),
  ratio: AspectRatioSchema.optional(),
  fit: MediaFitSchema.optional(),
  createdAt: z.string().datetime().optional(),
  locale: z.string().optional(),
});

export type SerializableLinkPreview = z.infer<typeof SerializableLinkPreviewSchema>;

const SerializableLinkPreviewSchemaContract = defineToolUiContract(
  'LinkPreview',
  SerializableLinkPreviewSchema
);

export const parseSerializableLinkPreview: (input: unknown) => SerializableLinkPreview =
  SerializableLinkPreviewSchemaContract.parse;

export const safeParseSerializableLinkPreview: (input: unknown) => SerializableLinkPreview | null =
  SerializableLinkPreviewSchemaContract.safeParse;
