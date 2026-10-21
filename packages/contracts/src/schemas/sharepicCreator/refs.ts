import { z } from 'zod';

/**
 * An image painted for this draft — a scene background or an infographic's
 * illustration: `ki:<shareToken>` of the file in the user's media library.
 * Only the server writes one; it survives revisions.
 */
export const SHAREPIC_SCENE_REF = /^ki:([\w-]{16,64})$/;
export const isSharepicSceneRef = (filename: string): boolean => SHAREPIC_SCENE_REF.test(filename);

/**
 * A photo the Grünerator-Vorlagen catalogue ships beside its entries
 * (`<intern>/sharepic-vorlagen/assets/<file>`): `vorlage:<file>`. Only the
 * catalogue writes one; a copy of the Vorlage keeps it.
 */
export const SHAREPIC_VORLAGE_REF = /^vorlage:([a-z0-9][a-z0-9-]{0,62}\.(?:jpe?g|png|webp))$/;
export const isSharepicVorlageRef = (filename: string): boolean =>
  SHAREPIC_VORLAGE_REF.test(filename);
/** Where the API serves a `vorlage:` photo. */
export const sharepicVorlageAssetPath = (ref: string): string =>
  `/api/sharepic-vorlagen/assets/${encodeURIComponent(SHAREPIC_VORLAGE_REF.exec(ref)?.[1] ?? '')}`;
/** A ready cut-out: painted for this draft (`ki:`) or shipped by the catalogue (`vorlage:`). */
export const sharepicCutOutRefSchema = z.union([
  z.string().regex(SHAREPIC_SCENE_REF),
  z.string().regex(SHAREPIC_VORLAGE_REF),
]);

/** The user's own photos of one request are numbered `upload:1` … `upload:4`. */
export const SHAREPIC_UPLOAD_MAX = 4;
export const SHAREPIC_UPLOAD_ID = new RegExp(`^upload:[1-${SHAREPIC_UPLOAD_MAX}]$`);
export const isSharepicUploadId = (filename: string): boolean => SHAREPIC_UPLOAD_ID.test(filename);

/** A stock photo's file name, the id of one of the user's own photos, a painted scene or a Vorlage's photo. */
export const sharepicPhotoFilenameSchema = z
  .string()
  .regex(
    new RegExp(
      `^(?:[\\w.-]+\\.jpe?g|${SHAREPIC_UPLOAD_ID.source.slice(1, -1)}|${SHAREPIC_SCENE_REF.source.slice(1, -1)}|${SHAREPIC_VORLAGE_REF.source.slice(1, -1)})$`,
      'i'
    ),
    'filename aus fotos_suchen oder die id eines eigenen Fotos (upload:N) übernehmen'
  )
  // The pattern ignores case for stock names; a Vorlage's file name is exact.
  .refine((f) => !/^vorlage:/i.test(f) || SHAREPIC_VORLAGE_REF.test(f), {
    message: 'vorlage: nur mit dem Dateinamen aus dem Katalog',
  });
