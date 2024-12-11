/**
 * Check if the text contains atleast one Burmese character
 * @param {String} text The text to check
 * @returns {Boolean} True if the text contains atleast one Burmese character, false otherwise
 */
export function hasBurmese(text) {
  return /[\u1000-\u109F]/.test(text);
}
