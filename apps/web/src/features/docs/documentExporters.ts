import { docxDefaultSchemaMappings, DOCXExporter } from '@blocknote/xl-docx-exporter';
import { odtDefaultSchemaMappings, ODTExporter } from '@blocknote/xl-odt-exporter';
import { docsEditorSchema } from '@gruenerator/docs';

// The default mappings only know BlockNote's own types; the exporters throw on
// any custom type of the editor schema that has no entry here.
const mentionAsText = (mention: { props: { userName: string } }) => ({
  type: 'text' as const,
  text: `@${mention.props.userName}`,
  styles: {},
});

export function createDocxExporter() {
  return new DOCXExporter(docsEditorSchema, {
    ...docxDefaultSchemaMappings,
    inlineContentMapping: {
      ...docxDefaultSchemaMappings.inlineContentMapping,
      mention: (ic, exporter) => exporter.transformStyledText(mentionAsText(ic)),
    },
  });
}

export function createOdtExporter() {
  return new ODTExporter(docsEditorSchema, {
    ...odtDefaultSchemaMappings,
    inlineContentMapping: {
      ...odtDefaultSchemaMappings.inlineContentMapping,
      mention: (ic, exporter) => exporter.transformStyledText(mentionAsText(ic)),
    },
  });
}
