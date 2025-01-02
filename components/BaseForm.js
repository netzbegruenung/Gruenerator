// Komplexe Render-Logik mit Platform-Unterstützung
const renderContent = () => {
  if (isMultiPlatform && generatedContent) {
    return platforms.map(platform => (
      <PlatformContainer 
        key={platform}
        platform={platform}
        icon={platformIcons[platform]}
      >
        {typeof generatedContent === 'function' 
          ? generatedContent(platform) 
          : generatedContent}
      </PlatformContainer>
    ));
  }
  
  // Fallback für nicht-Platform-spezifischen Content
  return value ? <Editor value={value} /> : generatedContent;
};

// Verwendung im JSX
<div className="display-content">
  {renderContent()}
</div>