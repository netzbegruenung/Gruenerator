/**
 * Sites Routes - Main Entry Point
 *
 * Controllers:
 * - sitesController: API endpoints for site CRUD operations (/api/sites)
 * - publicController: Public HTML page rendering (subdomain routing)
 */

import sitesController from './sitesController.js';
import publicController from './publicController.js';

export { sitesController, publicController };

export type {
  SitesRequest,
  UserSite,
  SiteSection,
  ThemeColors,
  Theme,
  CreateSiteBody,
  UpdateSiteBody,
  PublishBody,
  CheckSubdomainQuery
} from './types.js';

export {
  RESERVED_SUBDOMAINS,
  THEME_STYLES,
  AVAILABLE_THEMES
} from './types.js';
