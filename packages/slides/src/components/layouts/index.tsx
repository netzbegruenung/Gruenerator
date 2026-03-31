import {
  type TemplateWithData,
  type TemplateGroupSettings,
  createTemplateEntry,
  type TemplateLayoutsWithSettings,
} from './utils';

// ── Grüne templates ─────────────────────────────────────────────────────────

import AgendaSlide, {
  Schema as AgendaSchema,
  layoutId as AgendaId,
  layoutName as AgendaName,
  layoutDescription as AgendaDesc,
} from './gruene/AgendaSlide';
import BrandedMessageSlide, {
  Schema as BrandedMessageSchema,
  layoutId as BrandedMessageId,
  layoutName as BrandedMessageName,
  layoutDescription as BrandedMessageDesc,
} from './gruene/BrandedMessageSlide';
import ChartSlide, {
  Schema as ChartSchema,
  layoutId as ChartId,
  layoutName as ChartName,
  layoutDescription as ChartDesc,
} from './gruene/ChartSlide';
import FullBleedImageSlide, {
  Schema as FullBleedImageSchema,
  layoutId as FullBleedImageId,
  layoutName as FullBleedImageName,
  layoutDescription as FullBleedImageDesc,
} from './gruene/FullBleedImageSlide';
import IntroSlide, {
  Schema as IntroSchema,
  layoutId as IntroId,
  layoutName as IntroName,
  layoutDescription as IntroDesc,
} from './gruene/IntroSlide';
import TextImageLeftSlide, {
  Schema as TextImageLeftSchema,
  layoutId as TextImageLeftId,
  layoutName as TextImageLeftName,
  layoutDescription as TextImageLeftDesc,
} from './gruene/TextImageLeftSlide';
import TextImageRightSlide, {
  Schema as TextImageRightSchema,
  layoutId as TextImageRightId,
  layoutName as TextImageRightName,
  layoutDescription as TextImageRightDesc,
} from './gruene/TextImageRightSlide';
import TextOnlySlide, {
  Schema as TextOnlySchema,
  layoutId as TextOnlyId,
  layoutName as TextOnlyName,
  layoutDescription as TextOnlyDesc,
} from './gruene/TextOnlySlide';
import ThankYouContactSlide, {
  Schema as ThankYouContactSchema,
  layoutId as ThankYouContactId,
  layoutName as ThankYouContactName,
  layoutDescription as ThankYouContactDesc,
} from './gruene/ThankYouContactSlide';
import TitleImageSlide, {
  Schema as TitleImageSchema,
  layoutId as TitleImageId,
  layoutName as TitleImageName,
  layoutDescription as TitleImageDesc,
} from './gruene/TitleImageSlide';

// ── Grüne template settings ─────────────────────────────────────────────────

const grueneSettings: TemplateGroupSettings = {
  description: 'BÜNDNIS 90/DIE GRÜNEN Präsentationsvorlagen im offiziellen Corporate Design',
  ordered: false,
  default: true,
};

// ── Template entries ────────────────────────────────────────────────────────

export const grueneTemplates: TemplateWithData[] = [
  createTemplateEntry(
    IntroSlide,
    IntroSchema,
    IntroId,
    IntroName,
    IntroDesc,
    'gruene',
    'IntroSlide'
  ),
  createTemplateEntry(
    AgendaSlide,
    AgendaSchema,
    AgendaId,
    AgendaName,
    AgendaDesc,
    'gruene',
    'AgendaSlide'
  ),
  createTemplateEntry(
    TextOnlySlide,
    TextOnlySchema,
    TextOnlyId,
    TextOnlyName,
    TextOnlyDesc,
    'gruene',
    'TextOnlySlide'
  ),
  createTemplateEntry(
    TextImageRightSlide,
    TextImageRightSchema,
    TextImageRightId,
    TextImageRightName,
    TextImageRightDesc,
    'gruene',
    'TextImageRightSlide'
  ),
  createTemplateEntry(
    TextImageLeftSlide,
    TextImageLeftSchema,
    TextImageLeftId,
    TextImageLeftName,
    TextImageLeftDesc,
    'gruene',
    'TextImageLeftSlide'
  ),
  createTemplateEntry(
    BrandedMessageSlide,
    BrandedMessageSchema,
    BrandedMessageId,
    BrandedMessageName,
    BrandedMessageDesc,
    'gruene',
    'BrandedMessageSlide'
  ),
  createTemplateEntry(
    ChartSlide,
    ChartSchema,
    ChartId,
    ChartName,
    ChartDesc,
    'gruene',
    'ChartSlide'
  ),
  createTemplateEntry(
    FullBleedImageSlide,
    FullBleedImageSchema,
    FullBleedImageId,
    FullBleedImageName,
    FullBleedImageDesc,
    'gruene',
    'FullBleedImageSlide'
  ),
  createTemplateEntry(
    TitleImageSlide,
    TitleImageSchema,
    TitleImageId,
    TitleImageName,
    TitleImageDesc,
    'gruene',
    'TitleImageSlide'
  ),
  createTemplateEntry(
    ThankYouContactSlide,
    ThankYouContactSchema,
    ThankYouContactId,
    ThankYouContactName,
    ThankYouContactDesc,
    'gruene',
    'ThankYouContactSlide'
  ),
];

// ── Backward-compatible exports ─────────────────────────────────────────────

/** @deprecated Use grueneTemplates instead */
export const generalTemplates: TemplateWithData[] = grueneTemplates;
/** @deprecated Use grueneTemplates instead */
export const neoGeneralTemplates: TemplateWithData[] = [];

// All templates combined
export const allLayouts: TemplateWithData[] = [...grueneTemplates];

// For UseCases we need to combine all templates into a single array with settings
export const templates: TemplateLayoutsWithSettings[] = [
  {
    id: 'gruene',
    name: 'GRÜNE',
    description: grueneSettings.description,
    settings: grueneSettings,
    layouts: grueneTemplates,
  },
];

// Helper to get templates by group ID
export function getTemplatesByTemplateName(templateId: string): TemplateWithData[] {
  const template = templates.find((t) => t.id === templateId);
  return template?.layouts || [];
}

export function getSchemaByTemplateId(templateId: string): any {
  const template = templates.find((t) => t.id === templateId);
  return (
    template?.layouts.map((t) => {
      return {
        id: t.layoutId,
        name: t.layoutName,
        description: t.layoutDescription,
        json_schema: t.schemaJSON,
      };
    }) || {}
  );
}

export function getSettingsByTemplateId(templateId: string): TemplateGroupSettings | undefined {
  const template = templates.find((t) => t.id === templateId);
  return template?.settings;
}

// Helper to get template by layout ID
export function getTemplateByLayoutId(layoutId: string): TemplateWithData | undefined {
  return allLayouts.find((t) => t.layoutId === layoutId);
}

export function getLayoutByLayoutId(layout: string): TemplateWithData | undefined {
  const templateName = layout.split(':')[0];

  const template = templates.find((t) => t.id === templateName);
  if (template) {
    return template.layouts.find((t) => t.layoutId === layout);
  }
  return undefined;
}
