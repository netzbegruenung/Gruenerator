/**
 * Campaign Loader
 * Loads campaign configurations from individual JSON files
 */

let cachedManifest = null;
let cachedCampaigns = new Map();
let manifestLoadingPromise = null;

/**
 * Load campaign manifest from public/campaigns/manifest.json
 * @returns {Promise<Object>} Manifest object with list of campaign IDs
 */
async function loadManifest() {
  if (cachedManifest) {
    return cachedManifest;
  }

  if (manifestLoadingPromise) {
    return manifestLoadingPromise;
  }

  manifestLoadingPromise = fetch('/campaigns/manifest.json')
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to load campaign manifest: ${response.status}`);
      }
      return response.json();
    })
    .then(manifest => {
      cachedManifest = manifest;
      manifestLoadingPromise = null;
      return manifest;
    })
    .catch(error => {
      manifestLoadingPromise = null;
      console.error('[Campaign Loader] Failed to load manifest:', error);
      throw error;
    });

  return manifestLoadingPromise;
}

/**
 * Load a specific campaign configuration
 * @param {string} campaignId - Campaign identifier
 * @returns {Promise<Object|null>} Campaign object or null if not found
 */
async function loadCampaignConfig(campaignId) {
  if (cachedCampaigns.has(campaignId)) {
    return cachedCampaigns.get(campaignId);
  }

  try {
    const response = await fetch(`/campaigns/${campaignId}.json`);

    if (!response.ok) {
      console.warn(`[Campaign Loader] Campaign not found: ${campaignId}`);
      return null;
    }

    const campaign = await response.json();
    cachedCampaigns.set(campaignId, campaign);
    return campaign;
  } catch (error) {
    console.error(`[Campaign Loader] Failed to load campaign ${campaignId}:`, error);
    return null;
  }
}

/**
 * Get all active campaigns
 * @returns {Promise<Array>} Array of campaign objects
 */
export async function getActiveCampaigns() {
  const manifest = await loadManifest();
  const campaignIds = manifest.campaigns || [];

  const campaignPromises = campaignIds.map(id => loadCampaignConfig(id));
  const campaigns = await Promise.all(campaignPromises);

  return campaigns
    .filter(campaign => campaign && campaign.active)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Get a specific campaign by ID
 * @param {string} campaignId - Campaign identifier
 * @returns {Promise<Object|null>} Campaign object or null if not found
 */
export async function getCampaign(campaignId) {
  return await loadCampaignConfig(campaignId);
}

/**
 * Get all variants for a campaign
 * @param {string} campaignId - Campaign identifier
 * @returns {Promise<Array>} Array of variant objects
 */
export async function getCampaignVariants(campaignId) {
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return [];
  }
  return (campaign.variants || []).sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Get form configuration for a campaign
 * @param {string} campaignId - Campaign identifier
 * @returns {Promise<Object|null>} Form configuration object
 */
export async function getCampaignFormConfig(campaignId) {
  const campaign = await getCampaign(campaignId);
  return campaign?.form || null;
}

/**
 * Clear cached campaigns (useful for testing or forcing refresh)
 */
export function clearCampaignCache() {
  cachedManifest = null;
  cachedCampaigns.clear();
  manifestLoadingPromise = null;
}
