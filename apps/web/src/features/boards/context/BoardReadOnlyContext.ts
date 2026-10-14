import { createContext, useContext } from 'react';

/**
 * True when the collab server authenticated this board connection as `readonly`
 * (it drops every update) or a public link was shared as "viewer". Views hide
 * their editing affordances instead of letting edits vanish on reload.
 */
export const BoardReadOnlyContext = createContext(false);

export const useBoardReadOnly = () => useContext(BoardReadOnlyContext);
