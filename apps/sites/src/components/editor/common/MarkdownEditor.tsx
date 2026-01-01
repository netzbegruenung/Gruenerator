import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import '../../../styles/components/markdown-editor.css';

interface MarkdownEditorProps {
  value: string;
  onChange: (md: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  minHeight?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  onFocus,
  onBlur,
  placeholder,
}: MarkdownEditorProps) {
  return (
    <div className="markdown-editor" onFocus={onFocus} onBlur={onBlur}>
      <MDXEditor
        markdown={value}
        onChange={onChange}
        placeholder={placeholder}
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => <BoldItalicUnderlineToggles />
          }),
        ]}
      />
    </div>
  );
}
