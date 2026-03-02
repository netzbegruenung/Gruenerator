import { useChatConfigStore } from '@gruenerator/chat';
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import { ChatPage } from './pages/ChatPage';
import { StartPage } from './pages/StartPage';

export function App() {
  useEffect(() => {
    useChatConfigStore.getState().configure({
      fetch: (url, opts) => fetch(url, { ...opts }),
      onUnauthorized: () => {},
    });
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StartPage />} />
        <Route path="/chat/:collectionId" element={<ChatPage />} />
        <Route path="*" element={<StartPage />} />
      </Routes>
    </BrowserRouter>
  );
}
