import { createContext } from 'react';

/**
 * The notebook id from the `[id]` segment of `app/notebook/[id]/_layout.tsx`.
 * The anchor page beneath the notebook chat gets no params of its own — not
 * even the `[id]` of its own path — and expo-router 58 dropped
 * `Stack.Screen initialParams`, so the layout hands the id down this way.
 */
export const NotebookIdContext = createContext<string | null>(null);
