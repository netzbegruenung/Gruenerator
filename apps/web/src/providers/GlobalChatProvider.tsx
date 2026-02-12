import {
  ChatProvider,
  GrueneratorChatProvider,
  ChatThreadList,
  TooltipProvider,
} from '@gruenerator/chat';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { webChatAdapter } from '../features/chat/lib/webChatAdapter';
import { useOptimizedAuth } from '../hooks/useAuth';

const PORTAL_SLOT_ID = 'chat-thread-portal-slot';

function ChatThreadPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById(PORTAL_SLOT_ID);
    if (el) {
      setPortalTarget(el);
      return;
    }

    const observer = new MutationObserver(() => {
      const target = document.getElementById(PORTAL_SLOT_ID);
      if (target) {
        setPortalTarget(target);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const handleClick = () => {
    if (!location.pathname.startsWith('/chat')) {
      navigate('/chat');
    }
  };

  if (!portalTarget) return null;

  return createPortal(
    <div onClick={handleClick} className="contents">
      <ChatThreadList />
    </div>,
    portalTarget
  );
}

interface GlobalChatProviderProps {
  children: ReactNode;
}

export function GlobalChatProvider({ children }: GlobalChatProviderProps) {
  const { user } = useOptimizedAuth();

  return (
    <ChatProvider adapter={webChatAdapter}>
      <GrueneratorChatProvider userId={user?.id}>
        <TooltipProvider>
          {children}
          <ChatThreadPortal />
        </TooltipProvider>
      </GrueneratorChatProvider>
    </ChatProvider>
  );
}
