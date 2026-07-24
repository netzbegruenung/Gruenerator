import { type StartPage } from '@gruenerator/contracts';

/**
 * Maps a user's default-start-page preference to the route the sidebar "start"
 * icon and the root/login redirect should open. Falls back to the Chat tab
 * (the historical Workplace default) for anything unset or unrecognised.
 */
export const startPagePath = (preference?: StartPage | null): string =>
  preference === 'arbeiten' ? '/workplace/arbeiten' : '/workplace';
