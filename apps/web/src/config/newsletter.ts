/**
 * Re-exported here so `toolRegistry.ts` and `workplaceToolsConfig.ts` keep
 * importing it from a file of their own (a value import between the two would
 * be a cycle); the URL itself is shared with mobile.
 */
export { NEWSLETTER_SIGNUP_URL } from '@gruenerator/shared/links';
