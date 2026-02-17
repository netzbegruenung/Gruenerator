/**
 * Share API barrel export
 */

export {
  SHARE_ENDPOINTS,
  createVideoShare,
  createVideoShareFromToken,
  createImageShare,
  updateImageShare,
  getUserShares,
  getShareInfo,
  deleteShare,
  shareApi,
  getUserDevices,
  pushToPhone,
} from './shareApi.js';

export type { UserDevice, PushToPhoneResponse, DevicesResponse } from './shareApi.js';
