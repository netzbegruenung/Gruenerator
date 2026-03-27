import type { ModeDefinition, ExtraFieldConfig, ModeState } from '../../texte/modes/types';
import type { GeneratorConfig } from '../types/generatorTypes';

export function configToModeDefinition(config: GeneratorConfig): ModeDefinition {
  const fields = config.form_schema.fields;

  const mainField =
    fields.find((f) => f.type === 'textarea') ?? fields.find((f) => f.type === 'text');

  const extraFields: ExtraFieldConfig[] = fields
    .filter((f) => f !== mainField)
    .map((f) => ({
      key: f.name,
      type: (f.type === 'text' ? 'input' : f.type) as ExtraFieldConfig['type'],
      placeholder: f.placeholder ?? f.label,
      label: f.label,
      required: f.required,
      options:
        f.type === 'select' ? f.options?.map((o) => ({ id: o.value, label: o.label })) : undefined,
    }));

  const defaults: ModeState = {};
  for (const f of fields) {
    if (f !== mainField && f.defaultValue) {
      defaults[f.name] = f.defaultValue;
    }
  }

  return {
    id: `custom-${config.slug}`,
    endpoint: '/custom_generator',
    instructionType: 'custom_generator',
    componentName: `custom-${config.slug}`,
    defaultMode: 'balanced',
    searchQueryFields: mainField ? [mainField.name] : [],
    placeholder: mainField?.placeholder ?? 'Beschreibe dein Anliegen...',
    useMarkdown: true,
    extraFields: extraFields.length > 0 ? extraFields : undefined,
    defaults: Object.keys(defaults).length > 0 ? defaults : undefined,
    buildSubmitFields: (prompt: string, state: ModeState) => {
      const formData: Record<string, unknown> = {};
      for (const f of fields) {
        if (f === mainField) {
          formData[f.name] = prompt;
        } else {
          formData[f.name] = state[f.name] ?? f.defaultValue ?? '';
        }
      }
      return { slug: config.slug, formData };
    },
  };
}
