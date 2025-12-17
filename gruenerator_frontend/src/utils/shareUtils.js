export const canShare = () => {
  return typeof navigator !== 'undefined' && navigator.share !== undefined;
};

export const shareContent = async ({ title, text, url }) => {
  if (!canShare()) {
    throw new Error('Web Share API not supported');
  }

  try {
    await navigator.share({
      title,
      text,
      url,
    });
    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      return false;
    }
    throw error;
  }
};

export const copyToClipboard = async (text) => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  document.body.appendChild(textArea);
  textArea.select();

  try {
    document.execCommand('copy');
    return true;
  } finally {
    document.body.removeChild(textArea);
  }
};

export const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const hasTouchAndSmallScreen = navigator.maxTouchPoints > 0 && window.innerWidth <= 768;

  return isMobileUA || hasTouchAndSmallScreen;
};

export const canShareFiles = async () => {
  if (!canShare() || !navigator.canShare) return false;

  try {
    const testBlob = new Blob(['test'], { type: 'image/png' });
    const testFile = new File([testBlob], 'test.png', { type: 'image/png' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
};

export const shareImageFile = async (base64Image, title = 'Sharepic') => {
  const canShare = await canShareFiles();
  if (!canShare) {
    throw new Error('File sharing not supported on this device');
  }

  try {
    const response = await fetch(base64Image);
    const blob = await response.blob();
    const mimeType = blob.type || 'image/png';
    const extension = mimeType.split('/')[1] || 'png';
    const file = new File([blob], `gruenerator-sharepic.${extension}`, { type: mimeType });

    await navigator.share({
      files: [file],
      title: title,
    });
    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      return false;
    }
    throw error;
  }
};

export const copyImageToClipboard = async (base64Image) => {
  if (!navigator.clipboard || !navigator.clipboard.write) {
    throw new Error('Clipboard API not supported');
  }

  try {
    const response = await fetch(base64Image);
    const blob = await response.blob();

    const pngBlob = blob.type === 'image/png'
      ? blob
      : await convertToPng(blob);

    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ]);
    return true;
  } catch (error) {
    throw new Error('Failed to copy image to clipboard: ' + error.message);
  }
};

const convertToPng = async (blob) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(resolve, 'image/png');
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
};

const PLATFORM_MAPPINGS = {
  'instagram': ['instagram', 'insta'],
  'facebook': ['facebook', 'fb'],
  'twitter': ['twitter', 'x', 'mastodon', 'bsky', 'bluesky'],
  'linkedin': ['linkedin'],
  'pressemitteilung': ['pressemitteilung', 'presse', 'press release']
};

const normalizePlatformId = (platformName) => {
  const name = platformName.toLowerCase().trim();

  for (const [id, aliases] of Object.entries(PLATFORM_MAPPINGS)) {
    if (aliases.some(alias => name.includes(alias))) {
      return id;
    }
  }
  return name;
};

export const parsePlatformSections = (content, allowedPlatforms = []) => {
  if (!content || typeof content !== 'string') return {};

  const sections = {};
  const platformRegex = /##\s*(Instagram|Facebook|Twitter|LinkedIn|Pressemitteilung|X,?\s*Mastodon|Bsky|Bluesky)[^\n]*\n([\s\S]*?)(?=##\s|$)/gi;

  let match;
  while ((match = platformRegex.exec(content)) !== null) {
    const platformName = match[1];
    const text = match[2].trim();
    const normalizedId = normalizePlatformId(platformName);

    if (allowedPlatforms.length === 0 || allowedPlatforms.includes(normalizedId)) {
      sections[normalizedId] = text;
    }
  }

  if (Object.keys(sections).length === 0 && content.trim()) {
    const firstPlatform = allowedPlatforms[0] || 'instagram';
    sections[firstPlatform] = content.trim();
  }

  return sections;
};

export const getPlatformDisplayName = (platformId) => {
  const names = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    twitter: 'Twitter/X',
    linkedin: 'LinkedIn',
    pressemitteilung: 'Pressemitteilung'
  };
  return names[platformId] || platformId;
};

export const PLATFORM_SHARE_URLS = {
  twitter: (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
  facebook: (text) => `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`,
  linkedin: (text) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&summary=${encodeURIComponent(text)}`,
};

export const openPlatformShare = (platformId, text) => {
  const urlGenerator = PLATFORM_SHARE_URLS[platformId];
  if (urlGenerator) {
    window.open(urlGenerator(text), '_blank', 'width=600,height=400,noopener,noreferrer');
    return true;
  }
  return false;
};

export const hasPlatformShareUrl = (platformId) => !!PLATFORM_SHARE_URLS[platformId];
