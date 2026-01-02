import type { FormData, ContentType } from './types.js';

export function detectContentType(routePath: string, formData: FormData = {}): ContentType {
  if (routePath.includes('antrag') || routePath.includes('antraege')) {
    const requestType = formData.requestType || 'antrag';
    if (requestType === 'kleine_anfrage') return 'kleine_anfrage';
    if (requestType === 'grosse_anfrage') return 'grosse_anfrage';
    return 'antrag';
  }

  if (routePath.includes('claude_social')) {
    const platforms = formData.platforms || [];
    const socialPlatforms = platforms.filter((p: string) =>
      ['instagram', 'facebook', 'twitter', 'linkedin', 'actionIdeas', 'reelScript'].includes(p)
    );
    const hasPress = platforms.includes('pressemitteilung');

    if (hasPress && socialPlatforms.length > 0) {
      return 'press';
    }

    if (hasPress && socialPlatforms.length === 0) {
      return 'pressemitteilung';
    }

    if (socialPlatforms.length > 1) {
      return 'social';
    }

    if (socialPlatforms.length === 1) {
      return socialPlatforms[0];
    }

    return platforms[0] || 'social';
  }

  if (routePath.includes('gruene_jugend')) {
    const platforms = formData.platforms || [];
    if (platforms.includes('instagram')) return 'gruene_jugend_instagram';
    if (platforms.includes('twitter')) return 'gruene_jugend_twitter';
    if (platforms.includes('tiktok')) return 'gruene_jugend_tiktok';
    if (platforms.includes('messenger')) return 'gruene_jugend_messenger';
    if (platforms.includes('reelScript')) return 'gruene_jugend_reelScript';
    if (platforms.includes('actionIdeas')) return 'gruene_jugend_actionIdeas';
    return platforms[0] ? `gruene_jugend_${platforms[0]}` : 'gruene_jugend_instagram';
  }

  if (routePath.includes('claude_universal')) {
    const textForm = formData.textForm;
    if (textForm && typeof textForm === 'string') {
      const cleanTextForm = textForm.toLowerCase().trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      if (cleanTextForm.includes('antrag')) return 'antrag';
      if (cleanTextForm.includes('pressemitteilung')) return 'pressemitteilung';
      if (cleanTextForm.includes('rede')) return 'rede';
      if (cleanTextForm.includes('wahlprogramm')) return 'wahlprogramm';
      if (cleanTextForm.includes('instagram')) return 'instagram';
      if (cleanTextForm.includes('facebook')) return 'facebook';
      if (cleanTextForm.includes('twitter')) return 'twitter';

      return cleanTextForm;
    }
    return 'universal';
  }

  if (routePath.includes('claude_rede')) {
    return 'rede';
  }

  if (routePath.includes('claude_wahlprogramm')) {
    return 'wahlprogramm';
  }

  return 'universal';
}
