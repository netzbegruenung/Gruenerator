import { forwardRef, type ReactNode } from 'react';

import { useEditorStore } from '../../stores/editorStore';

import { cn } from '@/utils/cn';

interface EditorLayoutProps {
  sidebar: ReactNode;
  preview: ReactNode;
}

export const EditorLayout = forwardRef<HTMLDivElement, EditorLayoutProps>(function EditorLayout(
  { sidebar, preview },
  ref
) {
  const { isMobileEditorOpen, toggleMobileEditor } = useEditorStore();

  return (
    <div className="grid grid-cols-[1fr_1fr] h-[calc(100vh-60px)] overflow-hidden max-lg:grid-cols-1 max-lg:grid-rows-[1fr_auto]">
      <div
        className={cn(
          'flex flex-col bg-grey-50 border-r border-grey-200 h-full overflow-hidden',
          'max-lg:fixed max-lg:bottom-0 max-lg:left-0 max-lg:right-0 max-lg:h-auto max-lg:max-h-[75vh] max-lg:translate-y-[calc(100%-56px)] max-lg:transition-transform max-lg:duration-300 max-lg:ease-[cubic-bezier(0.4,0,0.2,1)] max-lg:rounded-t-2xl max-lg:shadow-[0_-4px_20px_rgba(0,0,0,0.15)] max-lg:z-[100] max-lg:border-r-0 max-lg:border-t max-lg:border-grey-200',
          isMobileEditorOpen && 'max-lg:translate-y-0'
        )}
      >
        <div
          className="lg:hidden flex justify-center p-3 cursor-grab touch-none"
          onClick={toggleMobileEditor}
        >
          <div className="w-10 h-1 bg-grey-400 rounded-full" />
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">{sidebar}</div>
      </div>

      <div className="flex flex-col bg-grey-100 h-full overflow-hidden max-lg:h-[calc(100vh-60px-56px)]">
        <div className="flex items-center justify-between py-sm px-md bg-white border-b border-grey-200">
          <h3 className="m-0 text-base font-medium text-grey-700">Vorschau</h3>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth" ref={ref}>
          <div className="min-h-full bg-white shadow-[0_0_40px_rgba(0,0,0,0.08)] m-md rounded-lg overflow-hidden max-lg:m-sm">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
});
