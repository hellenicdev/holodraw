export const HEX_COLOR = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

export function safeHexColor(value, fallback = '#666666') {
  return isHexColor(value) ? value : fallback;
}
