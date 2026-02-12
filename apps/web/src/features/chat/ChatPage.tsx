import { GrueneratorThread } from '@gruenerator/chat';

import useSidebarStore from '../../stores/sidebarStore';

export default function ChatPage() {
  const { isOpen, toggle } = useSidebarStore();

  return (
    <div className="flex h-[calc(100vh-var(--header-height,80px))] overflow-hidden bg-background">
      <main className="flex flex-1 flex-col overflow-hidden">
        <GrueneratorThread sidebarOpen={isOpen} onToggleSidebar={toggle} />
      </main>
    </div>
  );
}
