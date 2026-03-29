// B90/GRÜNE template layouts
import AgendaSlideLayout, {
  Schema as AgendaSchema,
  layoutId as AgendaId,
  layoutName as AgendaName,
  layoutDescription as AgendaDesc,
} from './b90-gruene/AgendaSlide';
import BrandedMessageSlideLayout, {
  Schema as BrandedMessageSchema,
  layoutId as BrandedMessageId,
  layoutName as BrandedMessageName,
  layoutDescription as BrandedMessageDesc,
} from './b90-gruene/BrandedMessageSlide';
import ChartSlideLayout, {
  Schema as ChartSchema,
  layoutId as ChartId,
  layoutName as ChartName,
  layoutDescription as ChartDesc,
} from './b90-gruene/ChartSlide';
import FullBleedImageSlideLayout, {
  Schema as FullBleedImageSchema,
  layoutId as FullBleedImageId,
  layoutName as FullBleedImageName,
  layoutDescription as FullBleedImageDesc,
} from './b90-gruene/FullBleedImageSlide';
import IntroSlideLayout, {
  Schema as IntroSchema,
  layoutId as IntroId,
  layoutName as IntroName,
  layoutDescription as IntroDesc,
} from './b90-gruene/IntroSlide';

// B90/GRÜNE settings
import b90GrueneSettings from './b90-gruene/settings.json';
import TextImageLeftSlideLayout, {
  Schema as TextImageLeftSchema,
  layoutId as TextImageLeftId,
  layoutName as TextImageLeftName,
  layoutDescription as TextImageLeftDesc,
} from './b90-gruene/TextImageLeftSlide';
import TextImageRightSlideLayout, {
  Schema as TextImageRightSchema,
  layoutId as TextImageRightId,
  layoutName as TextImageRightName,
  layoutDescription as TextImageRightDesc,
} from './b90-gruene/TextImageRightSlide';
import TextOnlySlideLayout, {
  Schema as TextOnlySchema,
  layoutId as TextOnlyId,
  layoutName as TextOnlyName,
  layoutDescription as TextOnlyDesc,
} from './b90-gruene/TextOnlySlide';
import ThankYouContactSlideLayout, {
  Schema as ThankYouContactSchema,
  layoutId as ThankYouContactId,
  layoutName as ThankYouContactName,
  layoutDescription as ThankYouContactDesc,
} from './b90-gruene/ThankYouContactSlide';
import TitleImageSlideLayout, {
  Schema as TitleImageSchema,
  layoutId as TitleImageId,
  layoutName as TitleImageName,
  layoutDescription as TitleImageDesc,
} from './b90-gruene/TitleImageSlide';
import {
  type TemplateWithData,
  type TemplateGroupSettings,
  createTemplateEntry,
  type TemplateLayoutsWithSettings,
} from './utils';

// B90/GRÜNE template entries
export const b90GrueneTemplates: TemplateWithData[] = [
  createTemplateEntry(
    IntroSlideLayout,
    IntroSchema,
    IntroId,
    IntroName,
    IntroDesc,
    'b90-gruene',
    'IntroSlide'
  ),
  createTemplateEntry(
    TitleImageSlideLayout,
    TitleImageSchema,
    TitleImageId,
    TitleImageName,
    TitleImageDesc,
    'b90-gruene',
    'TitleImageSlide'
  ),
  createTemplateEntry(
    AgendaSlideLayout,
    AgendaSchema,
    AgendaId,
    AgendaName,
    AgendaDesc,
    'b90-gruene',
    'AgendaSlide'
  ),
  createTemplateEntry(
    TextImageRightSlideLayout,
    TextImageRightSchema,
    TextImageRightId,
    TextImageRightName,
    TextImageRightDesc,
    'b90-gruene',
    'TextImageRightSlide'
  ),
  createTemplateEntry(
    TextImageLeftSlideLayout,
    TextImageLeftSchema,
    TextImageLeftId,
    TextImageLeftName,
    TextImageLeftDesc,
    'b90-gruene',
    'TextImageLeftSlide'
  ),
  createTemplateEntry(
    TextOnlySlideLayout,
    TextOnlySchema,
    TextOnlyId,
    TextOnlyName,
    TextOnlyDesc,
    'b90-gruene',
    'TextOnlySlide'
  ),
  createTemplateEntry(
    ChartSlideLayout,
    ChartSchema,
    ChartId,
    ChartName,
    ChartDesc,
    'b90-gruene',
    'ChartSlide'
  ),
  createTemplateEntry(
    BrandedMessageSlideLayout,
    BrandedMessageSchema,
    BrandedMessageId,
    BrandedMessageName,
    BrandedMessageDesc,
    'b90-gruene',
    'BrandedMessageSlide'
  ),
  createTemplateEntry(
    FullBleedImageSlideLayout,
    FullBleedImageSchema,
    FullBleedImageId,
    FullBleedImageName,
    FullBleedImageDesc,
    'b90-gruene',
    'FullBleedImageSlide'
  ),
  createTemplateEntry(
    ThankYouContactSlideLayout,
    ThankYouContactSchema,
    ThankYouContactId,
    ThankYouContactName,
    ThankYouContactDesc,
    'b90-gruene',
    'ThankYouContactSlide'
  ),
];

// All templates combined
export const allLayouts: TemplateWithData[] = [...b90GrueneTemplates];

// All templates with group settings
export const templates: TemplateLayoutsWithSettings[] = [
  {
    id: 'b90-gruene',
    name: 'B90/GRÜNE Grundlagendesign',
    description: b90GrueneSettings.description,
    settings: b90GrueneSettings as TemplateGroupSettings,
    layouts: b90GrueneTemplates,
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
  return template?.settings || undefined;
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
