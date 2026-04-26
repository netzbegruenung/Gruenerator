/**
 * Shared AI capability builder for the three presentation templates.
 *
 * Pres-title, pres-image, and pres-content all share the same core actions
 * (setTitle, setSubtitle, setBodyText, setBodyText2, setColorMode) but each
 * exposes a different subset of text fields. This builder takes the field
 * inventory per template and produces a TemplateAiCapabilities accordingly.
 */
import type { TemplateAiCapabilities } from '../../ai/types';
import type { CanvasAiSnapshot } from '@gruenerator/contracts';

import type { PresentationSlideState, PresentationSlideActions } from './presentationTypes';

export type PresentationTextField = 'title' | 'subtitle' | 'bodyText' | 'bodyText2';

const FIELD_LABELS: Record<PresentationTextField, string> = {
  title: 'Titel',
  subtitle: 'Untertitel',
  bodyText: 'Haupttext',
  bodyText2: 'Zweiter Absatz',
};

const FIELD_FONT_SIZE_SETTERS: Record<PresentationTextField, keyof PresentationSlideActions> = {
  title: 'handleTitleFontSizeChange',
  subtitle: 'handleSubtitleFontSizeChange',
  bodyText: 'handleBodyFontSizeChange',
  bodyText2: 'handleBody2FontSizeChange',
};

const FIELD_TEXT_SETTERS: Record<PresentationTextField, keyof PresentationSlideActions> = {
  title: 'setTitle',
  subtitle: 'setSubtitle',
  bodyText: 'setBodyText',
  bodyText2: 'setBodyText2',
};

export function createPresentationAiCapabilities(args: {
  template: 'pres-title' | 'pres-image' | 'pres-content';
  fields: PresentationTextField[];
}): TemplateAiCapabilities<PresentationSlideState, PresentationSlideActions> {
  const { template, fields } = args;

  return {
    supportedOperations: ['set-text', 'set-color-mode', 'set-font-size'],

    describeForAi: (state): CanvasAiSnapshot => ({
      template,
      textFields: fields.map((f) => ({
        field: f,
        label: FIELD_LABELS[f],
        value: (state[f] as string | undefined) ?? '',
      })),
      currentColorMode: state.colorMode,
      elementsSummary: [],
    }),

    applyOverrides: {
      'set-text': (op, actions) => {
        if (!fields.includes(op.field as PresentationTextField)) {
          throw new Error(`Diese Präsentationsvorlage hat kein Feld "${op.field}"`);
        }
        const setterKey = FIELD_TEXT_SETTERS[op.field as PresentationTextField];
        const setter = actions[setterKey] as (v: string) => void;
        setter(op.value);
      },
      'set-color-mode': (op, actions) => {
        actions.setColorMode(op.mode);
      },
      'set-font-size': (op, actions) => {
        if (!fields.includes(op.field as PresentationTextField)) {
          throw new Error(`Diese Präsentationsvorlage hat kein Schriftgrößen-Feld "${op.field}"`);
        }
        const setterKey = FIELD_FONT_SIZE_SETTERS[op.field as PresentationTextField];
        const setter = actions[setterKey] as (size: number) => void;
        setter(op.size);
      },
    },
  };
}
