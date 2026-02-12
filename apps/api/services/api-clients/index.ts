export { default as NextcloudApiClient } from './nextcloudApiClient.js';
export type {
  ParsedShareLink,
  ConnectionTestResult,
  UploadFileResult,
  NextcloudFile,
  ShareInfo,
  DownloadFileResult,
} from './nextcloudApiClient.js';

export { default as oparlApiClient } from './oparlApiClient.js';
export type {
  OparlEndpoint,
  OparlSystem,
  OparlBody,
  OparlOrganization,
  OparlPaper,
  OparlPaperDetection,
  GetPapersOptions,
  GetGreenPapersResult,
  GetAllGreenPapersOptions,
  GetAllGreenPapersResult,
} from './oparlApiClient.js';
