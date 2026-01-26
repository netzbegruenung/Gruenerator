import { DIMENSION_TAG_MAP } from '../TemplateModal';

function getDimensionTag(width, height) {
  const w = parseInt(width);
  const h = parseInt(height);
  if (!w || !h) return null;

  const key = `${w}x${h}`;
  if (DIMENSION_TAG_MAP[key]) return DIMENSION_TAG_MAP[key];

  const ratio = w / h;

  if (Math.abs(ratio - 9 / 16) < 0.05) return 'story';
  if (Math.abs(ratio - 1) < 0.1 && w < 600) return 'logo';
  if (Math.abs(ratio - 1) < 0.1) return 'quadrat';
  if (Math.abs(ratio - 16 / 9) < 0.05) return 'banner';
  if (ratio > 2.5) return 'header';
  if (ratio < 0.7) return 'hochformat';
  if (ratio > 1.3) return 'querformat';

  return null;
}

export function suggestTagsFromTemplate(previewData, templateType) {
  const tags = [];

  if (templateType === 'canva') {
    tags.push('canva');
  } else if (templateType) {
    tags.push('extern');
  }

  if (previewData?.dimensions) {
    const { width, height } = previewData.dimensions;
    const dimensionTag = getDimensionTag(width, height);
    if (dimensionTag) {
      tags.push(dimensionTag);
    }
  }

  return tags.length > 0 ? tags.map((t) => `#${t}`).join(' ') : '';
}
