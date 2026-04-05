// ============================================================================
// HUNTS MODULE - Hunt Data Normalization & Filtering
// ============================================================================
// Handles hunt data classification, normalization, and filtering logic

/**
 * Normalize species label to standard format
 * @param {string} value - Raw species value
 * @returns {string}
 */
export function normalizeSpeciesLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text === 'mule deer' || text === 'deer') return 'Deer';
  if (text.includes('desert') && text.includes('bighorn')) return 'Desert Bighorn Sheep';
  if (text.includes('rocky') && text.includes('bighorn')) return 'Rocky Mountain Bighorn Sheep';
  if (text === 'bighorn sheep') {
    return 'Bighorn Sheep';
  }
  return titleCaseWords(text);
}

/**
 * Convert text to title case
 * @param {string} v - Text to convert
 * @returns {string}
 */
export function titleCaseWords(v) {
  return String(v || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Safe string conversion with nullish coalescing
 * @param {*} v - Value to convert
 * @returns {string}
 */
export function safe(v) {
  return String(v ?? '');
}

/**
 * Get first non-empty value from arguments
 * @param {...*} a - Values to check
 * @returns {string}
 */
export function firstNonEmpty(...a) {
  for (let x of a) {
    let t = safe(x).trim();
    if (t) return t;
  }
  return '';
}

/**
 * Get hunt code from record
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getHuntCode(h) {
  return firstNonEmpty(h.huntCode, h.hunt_code, h.HuntCode, h.code);
}

/**
 * Get hunt title from record
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getHuntTitle(h) {
  return firstNonEmpty(h.title, h.Title, h.huntTitle, getHuntCode(h));
}

/**
 * Get unit code from hunt record
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getUnitCode(h) {
  return firstNonEmpty(h.unitCode, h.unit_code, h.UnitCode);
}

/**
 * Get unit name from hunt record
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getUnitName(h) {
  return firstNonEmpty(h.unitName, h.unit_name, h.UnitName);
}

/**
 * Get boundary ID from hunt record
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getBoundaryId(h) {
  return firstNonEmpty(h.boundaryId, h.boundaryID, h.BoundaryID);
}

/**
 * Normalize hunt code to uppercase
 * @param {string} value - Hunt code
 * @returns {string}
 */
export function normalizeHuntCode(value) {
  return safe(value).trim().toUpperCase();
}

/**
 * Normalize boundary key (kebab-case, lowercase)
 * @param {string} value - Boundary name
 * @returns {string}
 */
export function normalizeBoundaryKey(value) {
  return safe(value)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Get weapon type from hunt record
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getWeapon(h) {
  return normalizeWeaponLabel(firstNonEmpty(h.weapon, h.Weapon));
}

/**
 * Normalize weapon label to standard format
 * @param {string} raw - Raw weapon value
 * @returns {string}
 */
export function normalizeWeaponLabel(raw) {
  const value = safe(raw).trim();
  const lower = value.toLowerCase();
  if (!value) return '';
  if (lower.includes('any legal weapon')) return 'Any Legal Weapon';
  if (lower.includes('extended archery')) return 'Extended Archery';
  if (lower.includes('restricted archery')) return 'Restricted Archery';
  if (lower.includes('restricted muzzleloader')) return 'Restricted Muzzleloader';
  if (lower.includes('restricted multiseason')) return 'Restricted Multiseason';
  if (lower.includes('restricted rifle')) return 'Restricted Rifle';
  if (lower.includes('muzzleloader')) return 'Muzzleloader';
  if (lower.includes('archery')) return 'Archery';
  if (lower.includes('dedicated hunter')) return 'Multiseason';
  if (lower.includes('hamss') || lower.includes('shotgun') || lower.includes('straight-walled')) return 'HAMSS';
  if (lower.includes('multiseason')) return 'Multiseason';
  return value;
}

/**
 * Get hunt type from record
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getHuntType(h) {
  if (h?.syntheticConservationPermit) return 'Conservation';
  const raw = firstNonEmpty(h.huntType, h.HuntType, h.type);
  return normalizeHuntTypeLabel(raw);
}

/**
 * Normalize hunt type label
 * @param {string} raw - Raw hunt type
 * @returns {string}
 */
export function normalizeHuntTypeLabel(raw) {
  const value = safe(raw).trim();
  const lower = value.toLowerCase();
  if (!value) return '';
  if (lower.includes('private land only')) return 'Private Land Only';
  if (lower.includes('premium')) return 'Premium Limited Entry';
  if (lower.includes('limited')) return 'Limited Entry';
  if (lower.includes('once-in-a-lifetime')) return 'Once-in-a-Lifetime';
  if (lower.includes('dedicated hunter')) return 'Dedicated Hunter';
  if (lower.includes('management')) return 'Management';
  if (lower.includes('youth')) return 'Youth';
  if (lower.includes('conservation')) return 'Conservation';
  if (lower.includes('cwmu')) return 'CWMU';
  if (lower.includes('antlerless')) return 'Antlerless';
  if (lower.includes('general')) return 'General Season';
  return value;
}

/**
 * Get species display list for hunt
 * @param {Object} h - Hunt record
 * @returns {Array}
 */
export function getSpeciesDisplayList(h) {
  const rawSpecies = safe(firstNonEmpty(h.species, h.Species));
  const normalized = rawSpecies.split(',').map(normalizeSpeciesLabel).filter(Boolean);
  return Array.from(new Set(normalized));
}

/**
 * Get primary species for hunt
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getSpeciesDisplay(h) {
  return getSpeciesDisplayList(h)[0] || '';
}

/**
 * Get normalized sex from hunt record
 * @param {Object} valueOrHunt - Hunt record or string value
 * @returns {string}
 */
export function getNormalizedSex(valueOrHunt) {
  const raw = typeof valueOrHunt === 'string' ? safe(valueOrHunt).trim() : firstNonEmpty(valueOrHunt.sex, valueOrHunt.Sex);
  const hunt = typeof valueOrHunt === 'string' ? null : valueOrHunt;
  const val = raw.toLowerCase();
  const species = hunt ? getSpeciesDisplay(hunt) : '';
  
  if (val.includes('choice')) return "Hunter's Choice";
  if (val.includes('either')) return 'Either Sex';
  if (val === 'ewe') return 'Ewe';
  if ((val === 'doe' || val === 'cow' || val.includes('antlerless')) && species === 'Rocky Mountain Bighorn Sheep') return 'Ewe';
  if ((val === 'doe' || val === 'cow' || val.includes('antlerless')) && species === 'Desert Bighorn Sheep') return 'Ram';
  if (val === 'doe' || val === 'cow' || val.includes('antlerless')) return 'Antlerless';
  if (val.includes('bearded')) return 'Bearded';
  if (val.includes('ram')) return 'Ram';
  if (val.includes('buck')) return 'Buck';
  if (val.includes('bull')) return 'Bull';
  if (val.includes('male only') && hunt) {
    if (species === 'Rocky Mountain Bighorn Sheep') return 'Ram';
    if (species === 'Desert Bighorn Sheep') return 'Ram';
  }
  return titleCaseWords(raw) || 'All';
}

/**
 * Get hunt record key for deduplication
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getHuntRecordKey(h) {
  return [
    normalizeHuntCode(getHuntCode(h)),
    safe(getBoundaryId(h)).trim(),
    safe(getWeapon(h)).trim().toLowerCase(),
    normalizeBoundaryKey(getUnitName(h) || getUnitCode(h))
  ].join('|');
}

/**
 * Get hunt dates/season label
 * @param {Object} h - Hunt record
 * @returns {string}
 */
export function getDates(h) {
  return firstNonEmpty(h.seasonLabel, h.seasonDates, h.dates);
}

/**
 * Sort array with preferred order
 * @param {Array} arr - Array to sort
 * @param {Array} pref - Preferred order
 * @returns {Array}
 */
export function sortWithPreferredOrder(arr, pref) {
  const map = new Map(pref.map((v, i) => [v, i]));
  return arr.sort((a, b) => (map.has(a) ? map.get(a) : 99) - (map.has(b) ? map.get(b) : 99));
}