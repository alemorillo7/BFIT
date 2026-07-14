const URL_PATTERN = /(https?:\/\/[^\s]+)/i;

export const normalizePhoneNumber = (value) => {
  if (!value) {
    return '';
  }

  const trimmed = String(value).trim();
  const digitsOnly = trimmed.replace(/[^\d+]/g, '');

  if (!digitsOnly) {
    return '';
  }

  return digitsOnly.startsWith('+') ? digitsOnly : `+${digitsOnly.replace(/^\+/, '')}`;
};

export const sanitizeTagName = (value) => String(value ?? '').trim();

export const normalizeTagKey = (value) => sanitizeTagName(value).toLowerCase();

export const detectMessageType = ({ message = '', mimeType = '' }) => {
  if (mimeType.startsWith('image/')) {
    return 'image';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  if (mimeType) {
    return 'file';
  }

  if (URL_PATTERN.test(message)) {
    return 'link';
  }

  return 'text';
};

export const buildMessagePreview = ({ message = '', messageType = 'text', fileName = '' }) => {
  if (messageType === 'image') {
    return fileName ? `Imagen: ${fileName}` : 'Imagen adjunta';
  }

  if (messageType === 'audio') {
    return fileName ? `Audio: ${fileName}` : 'Audio adjunto';
  }

  if (messageType === 'file') {
    return fileName ? `Archivo: ${fileName}` : 'Archivo adjunto';
  }

  const safeMessage = String(message ?? '').trim();
  return safeMessage.slice(0, 120) || 'Sin contenido';
};

export const randomTagColor = (seed = '') => {
  const palette = ['#2264f5', '#8d33ff', '#12b886', '#f08c00', '#e03131', '#0f766e', '#c2255c'];
  const index = Array.from(String(seed)).reduce((acc, char) => acc + char.charCodeAt(0), 0) % palette.length;
  return palette[index];
};
