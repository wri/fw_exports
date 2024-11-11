/**
 * Check if the text contains only Burmese characters
 * @param {String} text The text to check
 * @returns {Boolean} True if the text contains only Burmese characters, false otherwise
 */
export function isBurmese(text) {
  return /^[\u1000-\u109F]$/.test(text);
}
