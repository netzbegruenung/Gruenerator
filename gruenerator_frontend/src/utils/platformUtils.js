export const formatPlatformContent = (content, platform) => {
  return {
    title: platform.charAt(0).toUpperCase() + platform.slice(1),
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
      return `# ${platform.charAt(0).toUpperCase() + platform.slice(1)}\n\n${content}`;
    })
    .join('\n\n---\n\n');
}; 