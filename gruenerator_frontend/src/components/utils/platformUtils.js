export const formatPlatformContent = (content, platform) => {
  const displayName = platform === 'pressemitteilung' ? 'Pressemitteilung' :
                     platform === 'actionIdeas' ? 'Aktionsideen' :
                     platform === 'reelScript' ? 'Instagram Reel' :
                     platform.charAt(0).toUpperCase() + platform.slice(1);
  return {
    title: displayName,
    content
  };
};

export const formatPlatformValues = (platformValues) => {
  return Object.entries(platformValues).reduce((acc, [platform, content]) => {
    acc[platform] = formatPlatformContent(content, platform);
    return acc;
  }, {});
};

export const getPlatformContent = (generatedContent, platform) => {
  return generatedContent[platform]?.content || '';
};

export const combinePlatformContents = (platformValues, platforms) => {
  return platforms
    .map(platform => {
      const content = platformValues[platform] || '';
      const displayName = platform === 'pressemitteilung' ? 'Pressemitteilung' :
                         platform === 'actionIdeas' ? 'Aktionsideen' :
                         platform === 'reelScript' ? 'Instagram Reel' :
                         platform.charAt(0).toUpperCase() + platform.slice(1);
      return `# ${displayName}\n\n${content}`;
    })
    .join('\n\n---\n\n');
}; 