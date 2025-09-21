import apiClient from '../../../../components/utils/apiClient';
import { DEFAULT_COLORS } from '../../../../components/utils/constants';
import { prepareDataForCanvas } from '../../dreizeilen/utils/dataPreparation';

const CANVAS_ENDPOINTS = {
  dreizeilen: '/dreizeilen_canvas',
  headline: '/headline_canvas',
  info: '/info_canvas',
  quote: '/zitat_canvas',
  quote_pure: '/zitat_pure_canvas'
};

const postCanvas = async (endpoint, formData) => {
  const response = await apiClient.post(endpoint, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response?.data?.image || response?.image || null;
};

const generateDreizeilenImage = async ({
  line1 = '',
  line2 = '',
  line3 = '',
  uploadedImage = null,
  colorScheme = DEFAULT_COLORS,
  fontSize = 85,
  balkenOffset = [50, -100, 50],
  balkenGruppenOffset = [0, 0],
  sunflowerOffset = [0, 0],
  sunflowerPosition = 'bottomRight'
}) => {
  const formData = prepareDataForCanvas(
    {
      line1,
      line2,
      line3,
      uploadedImage
    },
    {
      colorScheme,
      fontSize,
      balkenOffset,
      balkenGruppenOffset,
      sunflowerOffset,
      sunflowerPosition
    },
    'dreizeilen'
  );

  return await postCanvas(CANVAS_ENDPOINTS.dreizeilen, formData);
};

const generateHeadlineImage = async ({
  line1 = '',
  line2 = '',
  line3 = ''
}) => {
  const formData = new FormData();
  formData.append('line1', line1 || '');
  formData.append('line2', line2 || '');
  formData.append('line3', line3 || '');

  return await postCanvas(CANVAS_ENDPOINTS.headline, formData);
};

const generateInfoImage = async ({
  header = '',
  subheader = '',
  body = ''
}) => {
  if (!header && !subheader && !body) {
    throw new Error('Header oder Body fehlen für Info-Sharepic');
  }

  const formData = new FormData();
  formData.append('header', header);

  const combinedBody = subheader && body ? `${subheader}. ${body}` : subheader || body || '';
  formData.append('body', combinedBody);

  return await postCanvas(CANVAS_ENDPOINTS.info, formData);
};

const generateQuoteImage = async ({
  quote = '',
  name = '',
  uploadedImage = null,
  colorScheme = DEFAULT_COLORS,
  fontSize = 85
}) => {
  if (!quote) {
    throw new Error('Zitat fehlt für Quote-Sharepic');
  }
  if (!name) {
    throw new Error('Name fehlt für Quote-Sharepic');
  }

  const formData = prepareDataForCanvas(
    {
      quote,
      name,
      uploadedImage
    },
    {
      colorScheme,
      fontSize
    },
    'quote'
  );

  return await postCanvas(CANVAS_ENDPOINTS.quote, formData);
};

const generateQuotePureImage = async ({
  quote = '',
  name = ''
}) => {
  if (!quote) {
    throw new Error('Zitat fehlt für Quote-Pure-Sharepic');
  }
  if (!name) {
    throw new Error('Name fehlt für Quote-Pure-Sharepic');
  }

  const formData = new FormData();
  formData.append('quote', quote);
  formData.append('name', name);

  return await postCanvas(CANVAS_ENDPOINTS.quote_pure, formData);
};

export const generateSharepicImage = async (type, payload = {}) => {
  switch (type) {
    case 'dreizeilen':
      return await generateDreizeilenImage(payload);
    case 'headline':
      return await generateHeadlineImage(payload);
    case 'info':
      return await generateInfoImage(payload);
    case 'quote':
      return await generateQuoteImage(payload);
    case 'quote_pure':
      return await generateQuotePureImage(payload);
    default:
      throw new Error(`Unsupported sharepic type: ${type}`);
  }
};

export default generateSharepicImage;
