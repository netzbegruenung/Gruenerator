/**
 * Campaign Loader
 * Loads campaign configurations from individual JSON files
 */

interface Manifest {
  campaigns: string[];
  [key: string]: unknown;
}

interface Campaign {
  id?: string;
  active?: boolean;
  order?: number;
  variants?: CampaignVariant[];
  form?: Record<string, unknown>;
  [key: string]: unknown;
}

interface CampaignVariant {
  order?: number;
  [key: string]: unknown;
}

let cachedManifest: Manifest | null = null;
let cachedCampaigns = new Map<string, Campaign | null>();
let manifestLoadingPromise: Promise<Manifest> | null = null;

/**
 * Load campaign manifest from public/campaigns/manifest.json
 * @returns Manifest object with list of campaign IDs
 */
async function loadManifest(): Promise<Manifest> {
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
 * @param campaignId - Campaign identifier
 * @returns Campaign object or null if not found
 */
async function loadCampaignConfig(campaignId: string): Promise<Campaign | null> {
  if (cachedCampaigns.has(campaignId)) {
    return cachedCampaigns.get(campaignId) ?? null;
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
 * @returns Array of campaign objects
 */
export async function getActiveCampaigns(): Promise<Campaign[]> {
  const manifest = await loadManifest();
  const campaignIds = manifest.campaigns || [];

  const campaignPromises = campaignIds.map(id => loadCampaignConfig(id));
  const campaigns = await Promise.all(campaignPromises);

  return campaigns
    .filter((campaign): campaign is Campaign => campaign !== null && campaign.active === true)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Get a specific campaign by ID
 * @param campaignId - Campaign identifier
 * @returns Campaign object or null if not found
 */
export async function getCampaign(campaignId: string): Promise<Campaign | null> {
  return await loadCampaignConfig(campaignId);
}

/**
 * Get all variants for a campaign
 * @param campaignId - Campaign identifier
 * @returns Array of variant objects
 */
export async function getCampaignVariants(campaignId: string): Promise<CampaignVariant[]> {
  const campaign = await getCampaign(campaignId);
  if (!campaign) {
    return [];
  }
  return (campaign.variants || []).sort((a, b) => (a.order || 0) - (b.order || 0));
}

/**
 * Get form configuration for a campaign
 * @param campaignId - Campaign identifier
 * @returns Form configuration object
 */
export async function getCampaignFormConfig(campaignId: string): Promise<Record<string, unknown> | null> {
  const campaign = await getCampaign(campaignId);
  return campaign?.form || null;
}

/**
 * Clear cached campaigns (useful for testing or forcing refresh)
 */
export function clearCampaignCache(): void {
  cachedManifest = null;
  cachedCampaigns.clear();
  manifestLoadingPromise = null;
}
