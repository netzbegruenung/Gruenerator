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
    <div
      className="border border-grey-300 rounded-md bg-white overflow-hidden transition-colors focus-within:border-primary-500 focus-within:ring-[3px] focus-within:ring-primary-500/15"
      onFocus={onFocus}
      onBlur={onBlur}
    >
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
            toolbarContents: () => <BoldItalicUnderlineToggles />,
          }),
        ]}
      />
    </div>
  );
}
