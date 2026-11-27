// Every contract the lazy client in contractsClient.ts can serve. This module is
// only reached through `import('./contractsRegistry.js')`, so it and every
// contract that no boot-path module imports by name land in one lazy chunk.
// Do NOT replace it with `import('@gruenerator/contracts')`: the barrel is also
// imported statically, and a namespace import of it keeps every export, which
// pulled all contracts back into the entry closure (#5891). A missing entry
// fails tsc: contractsClient.ts types CONTRACTS as a Pick over NAMESPACES.
import {
  adminContentSyncContract,
  adminReportsContract,
  adminStatsContract,
  adminVorlagenContract,
  agentVisibilityContract,
  antragsgruenSitesContract,
  appReleaseContract,
  boardActivityContract,
  boardAgentContract,
  boardAttachmentsContract,
  boardCardDocumentsContract,
  boardCommentsContract,
  boardSchedulesContract,
  boardSubscriptionsContract,
  boardsContract,
  briefingContract,
  bundestagQaContract,
  canvasContract,
  chatThreadSharingContract,
  chatToolApprovalsContract,
  chunkInspectorContract,
  connectionsContract,
  connectorTestContract,
  contentContract,
  contentReportContract,
  docSnapshotsContract,
  docsContract,
  documentsContract,
  emailContract,
  entityCommentsContract,
  entityReactionsContract,
  explainablesContract,
  exportsContract,
  feedbackContract,
  newsletterContract,
  globalSearchContract,
  groupsContract,
  imageEditContract,
  imageModelPreferenceContract,
  imagePickerContract,
  instanceAdminOverviewContract,
  itemUsageContract,
  landesverbandAdminContract,
  letterheadsContract,
  lvAdminAssignmentContract,
  marketplaceContract,
  mcpServersContract,
  mediaImportContract,
  memoryContract,
  modelPreferencesContract,
  monitorContract,
  notebookCollectionsContract,
  notebookContract,
  notebookSharingContract,
  notebookWordpressContract,
  notificationsContract,
  nuudelPollsContract,
  parteitageAdminContract,
  parteitageContract,
  podcastsContract,
  presentationsContract,
  promptsContract,
  publicBoardsContract,
  publicExplainablesContract,
  recentActivityContract,
  recentValuesContract,
  recurringTasksContract,
  reisekostenContract,
  researchContract,
  sharedTemplateContract,
  sharepicCreatorContract,
  sharepicTextContract,
  sharepicVorlagenContract,
  sharesReadContract,
  sheetsContract,
  sitesContract,
  skillPromptContract,
  skillVisibilityContract,
  speechContract,
  studioAssetsContract,
  subtitlerContract,
  tableRepairContract,
  templateInteractionsContract,
  texteContract,
  threadsContract,
  translationContract,
  transparencyContract,
  trashContract,
  treesContract,
  userAgentsContract,
  userAgentsSharingContract,
  userLibraryContract,
  userProfileContract,
  userTemplatesContract,
  userTextFormsContract,
  userUsageContract,
  userWebsitesContract,
  videoAiContract,
  videoProjectsContract,
  wolkePendingContract,
} from '@gruenerator/contracts';

import type * as ContractsModule from '@gruenerator/contracts';

// Explicit type: the inferred object type is too large for declaration emit.
export type ContractRegistryName =
  | 'adminContentSyncContract'
  | 'adminReportsContract'
  | 'adminStatsContract'
  | 'adminVorlagenContract'
  | 'agentVisibilityContract'
  | 'antragsgruenSitesContract'
  | 'appReleaseContract'
  | 'boardActivityContract'
  | 'boardAgentContract'
  | 'boardAttachmentsContract'
  | 'boardCardDocumentsContract'
  | 'boardCommentsContract'
  | 'boardSchedulesContract'
  | 'boardSubscriptionsContract'
  | 'boardsContract'
  | 'briefingContract'
  | 'bundestagQaContract'
  | 'canvasContract'
  | 'chatThreadSharingContract'
  | 'chatToolApprovalsContract'
  | 'chunkInspectorContract'
  | 'connectionsContract'
  | 'connectorTestContract'
  | 'contentContract'
  | 'contentReportContract'
  | 'docSnapshotsContract'
  | 'docsContract'
  | 'documentsContract'
  | 'emailContract'
  | 'entityCommentsContract'
  | 'entityReactionsContract'
  | 'explainablesContract'
  | 'exportsContract'
  | 'feedbackContract'
  | 'newsletterContract'
  | 'globalSearchContract'
  | 'groupsContract'
  | 'imageEditContract'
  | 'imageModelPreferenceContract'
  | 'imagePickerContract'
  | 'instanceAdminOverviewContract'
  | 'itemUsageContract'
  | 'landesverbandAdminContract'
  | 'letterheadsContract'
  | 'lvAdminAssignmentContract'
  | 'marketplaceContract'
  | 'mcpServersContract'
  | 'mediaImportContract'
  | 'memoryContract'
  | 'modelPreferencesContract'
  | 'monitorContract'
  | 'notebookCollectionsContract'
  | 'notebookContract'
  | 'notebookSharingContract'
  | 'notebookWordpressContract'
  | 'notificationsContract'
  | 'nuudelPollsContract'
  | 'parteitageAdminContract'
  | 'parteitageContract'
  | 'podcastsContract'
  | 'presentationsContract'
  | 'promptsContract'
  | 'publicBoardsContract'
  | 'publicExplainablesContract'
  | 'recentActivityContract'
  | 'recentValuesContract'
  | 'recurringTasksContract'
  | 'reisekostenContract'
  | 'researchContract'
  | 'sharedTemplateContract'
  | 'sharepicCreatorContract'
  | 'sharepicTextContract'
  | 'sharepicVorlagenContract'
  | 'sharesReadContract'
  | 'sheetsContract'
  | 'sitesContract'
  | 'skillPromptContract'
  | 'skillVisibilityContract'
  | 'speechContract'
  | 'studioAssetsContract'
  | 'subtitlerContract'
  | 'tableRepairContract'
  | 'templateInteractionsContract'
  | 'texteContract'
  | 'threadsContract'
  | 'translationContract'
  | 'transparencyContract'
  | 'trashContract'
  | 'treesContract'
  | 'userAgentsContract'
  | 'userAgentsSharingContract'
  | 'userLibraryContract'
  | 'userProfileContract'
  | 'userTemplatesContract'
  | 'userTextFormsContract'
  | 'userUsageContract'
  | 'userWebsitesContract'
  | 'videoAiContract'
  | 'videoProjectsContract'
  | 'wolkePendingContract';

export const CONTRACTS: Pick<typeof ContractsModule, ContractRegistryName> = {
  adminContentSyncContract,
  adminReportsContract,
  adminStatsContract,
  adminVorlagenContract,
  agentVisibilityContract,
  antragsgruenSitesContract,
  appReleaseContract,
  boardActivityContract,
  boardAgentContract,
  boardAttachmentsContract,
  boardCardDocumentsContract,
  boardCommentsContract,
  boardSchedulesContract,
  boardSubscriptionsContract,
  boardsContract,
  briefingContract,
  bundestagQaContract,
  canvasContract,
  chatThreadSharingContract,
  chatToolApprovalsContract,
  chunkInspectorContract,
  connectionsContract,
  connectorTestContract,
  contentContract,
  contentReportContract,
  docSnapshotsContract,
  docsContract,
  documentsContract,
  emailContract,
  entityCommentsContract,
  entityReactionsContract,
  explainablesContract,
  exportsContract,
  feedbackContract,
  newsletterContract,
  globalSearchContract,
  groupsContract,
  imageEditContract,
  imageModelPreferenceContract,
  imagePickerContract,
  instanceAdminOverviewContract,
  itemUsageContract,
  landesverbandAdminContract,
  letterheadsContract,
  lvAdminAssignmentContract,
  marketplaceContract,
  mcpServersContract,
  mediaImportContract,
  memoryContract,
  modelPreferencesContract,
  monitorContract,
  notebookCollectionsContract,
  notebookContract,
  notebookSharingContract,
  notebookWordpressContract,
  notificationsContract,
  nuudelPollsContract,
  parteitageAdminContract,
  parteitageContract,
  podcastsContract,
  presentationsContract,
  promptsContract,
  publicBoardsContract,
  publicExplainablesContract,
  recentActivityContract,
  recentValuesContract,
  recurringTasksContract,
  reisekostenContract,
  researchContract,
  sharedTemplateContract,
  sharepicCreatorContract,
  sharepicTextContract,
  sharepicVorlagenContract,
  sharesReadContract,
  sheetsContract,
  sitesContract,
  skillPromptContract,
  skillVisibilityContract,
  speechContract,
  studioAssetsContract,
  subtitlerContract,
  tableRepairContract,
  templateInteractionsContract,
  texteContract,
  threadsContract,
  translationContract,
  transparencyContract,
  trashContract,
  treesContract,
  userAgentsContract,
  userAgentsSharingContract,
  userLibraryContract,
  userProfileContract,
  userTemplatesContract,
  userTextFormsContract,
  userUsageContract,
  userWebsitesContract,
  videoAiContract,
  videoProjectsContract,
  wolkePendingContract,
};
