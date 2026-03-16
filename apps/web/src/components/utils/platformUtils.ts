interface PlatformContent {
  title: string;
  content: string;
}

export const formatPlatformContent = (content: string, platform: string): PlatformContent => {
  const displayName =
    platform === 'pressemitteilung'
      ? 'Pressemitteilung'
      : platform === 'actionIdeas'
        ? 'Aktionsideen'
        : platform === 'reelScript'
          ? 'Skript für Reels & Tiktoks'
          : platform.charAt(0).toUpperCase() + platform.slice(1);
  return {
    title: displayName,
    content,
  };
};

export const formatPlatformValues = (
  platformValues: Record<string, string>
): Record<string, PlatformContent> => {
  return Object.entries(platformValues).reduce(
    (acc, [platform, content]) => {
      acc[platform] = formatPlatformContent(content, platform);
      return acc;
    },
    {} as Record<string, PlatformContent>
  );
};

export const getPlatformContent = (
  generatedContent: Record<string, PlatformContent>,
  platform: string
): string => {
  return generatedContent[platform]?.content || '';
};

export const combinePlatformContents = (
  platformValues: Record<string, string>,
  platforms: string[]
): string => {
  return platforms
    .map((platform) => {
      const content = platformValues[platform] || '';
      const displayName =
        platform === 'pressemitteilung'
          ? 'Pressemitteilung'
          : platform === 'actionIdeas'
            ? 'Aktionsideen'
            : platform === 'reelScript'
              ? 'Skript für Reels & Tiktoks'
              : platform.charAt(0).toUpperCase() + platform.slice(1);
      return `# ${displayName}\n\n${content}`;
    })
    .join('\n\n---\n\n');
};
