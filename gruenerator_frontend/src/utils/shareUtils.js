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
