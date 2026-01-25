import { IMAGE_STUDIO_TYPES } from './typeConfig';

export interface FontRequirement {
  fontFamily: string;
  fontSize: number;
}

const GRUENE_TYPE_NEUE: FontRequirement = {
  fontFamily: 'GrueneTypeNeue',
  fontSize: 75,
};

export const TEMPLATE_FONT_REQUIREMENTS: Partial<Record<string, FontRequirement>> = {
  [IMAGE_STUDIO_TYPES.DREIZEILEN]: GRUENE_TYPE_NEUE,
  [IMAGE_STUDIO_TYPES.ZITAT]: GRUENE_TYPE_NEUE,
  [IMAGE_STUDIO_TYPES.ZITAT_PURE]: GRUENE_TYPE_NEUE,
  [IMAGE_STUDIO_TYPES.INFO]: GRUENE_TYPE_NEUE,
  [IMAGE_STUDIO_TYPES.VERANSTALTUNG]: GRUENE_TYPE_NEUE,
  [IMAGE_STUDIO_TYPES.SIMPLE]: GRUENE_TYPE_NEUE,
};

export function getFontRequirements(type: string | null): FontRequirement | null {
  if (!type) return null;
  return TEMPLATE_FONT_REQUIREMENTS[type] || null;
}
