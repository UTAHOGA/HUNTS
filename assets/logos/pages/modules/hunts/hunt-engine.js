import {
  getHuntCode,
  getUnitName,
  getSpeciesDisplay,
  getWeapon,
  getHuntType,
  getDates,
  getHuntByCode,
  getHuntsByBoundary,
  getAllHunts
} from './hunt-data.js';

// -------------------------------
// INTERNAL STATE
// -------------------------------

let ALL_HUNTS = [];
const HUNT_INDEX = new Map();
const BOUNDARY_INDEX = new Map();

// -------------------------------
// HELPERS
// -------------------------------

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function normalizeBoundaryId(value) {
  return String(value ?? '').trim();
}

// -------------------------------
// INIT (RUN ONCE FROM app.js)
// -------------------------------

export function initHuntEngine(hunts = []) {
  ALL_HUNTS = Array.isArray(hunts) ? hunts.slice() : [];

  HUNT_INDEX.clear();
  BOUNDARY_INDEX.clear();

  ALL_HUNTS.forEach((hunt) => {
    const code = normalizeCode(getHuntCode(hunt));

    const boundaryId = normalizeBoundaryId(
      hunt?.boundary_id ?? hunt?.boundaryId ?? hunt?.boundaryID
    );

    // index by code
    if (code) {
      HUNT_INDEX.set(code, hunt);
    }

    // index by boundary
    if (boundaryId) {
      if (!BOUNDARY_INDEX.has(boundaryId)) {
        BOUNDARY_INDEX.set(boundaryId, []);
      }
      BOUNDARY_INDEX.get(boundaryId).push(hunt);
    }
  });

  console.log(
    `Hunt engine initialized: ${ALL_HUNTS.length} hunts | ${HUNT_INDEX.size} indexed | ${BOUNDARY_INDEX.size} boundaries`
  );
}

// -------------------------------
// CORE ACCESS
// -------------------------------

export function getAllHuntsSafe() {
  return ALL_HUNTS.length ? ALL_HUNTS : getAllHunts();
}

// -------------------------------
// NORMALIZED OBJECT (SINGLE FORMAT)
// -------------------------------

export function getHuntObject(raw) {
  if (!raw) return null;

  return {
    hunt_code: normalizeCode(getHuntCode(raw)),
    unit_name: getUnitName(raw),
    species: getSpeciesDisplay(raw),
    weapon: getWeapon(raw),
    hunt_type: getHuntType(raw),
    dates: getDates(raw),

    boundary_id: normalizeBoundaryId(
      raw?.boundary_id ?? raw?.boundaryId ?? raw?.boundaryID
    ) || null,

    raw
  };
}

// -------------------------------
// LOOKUPS (FAST)
// -------------------------------

export function getHuntByCodeSafe(code) {
  const key = normalizeCode(code);

  if (!key) return null;

  // try index first (fast)
  const raw = HUNT_INDEX.get(key) || getHuntByCode(key);

  return raw ? getHuntObject(raw) : null;
}

export function getHuntsByBoundarySafe(boundaryId) {
  const key = normalizeBoundaryId(boundaryId);

  if (!key) return [];

  // try index first
  const matches = BOUNDARY_INDEX.get(key) || getHuntsByBoundary(key);

  return (matches || []).map(getHuntObject);
}

// -------------------------------
// OPTIONAL UTILITY (DEBUG / FUTURE)
// -------------------------------

export function debugHuntEngine() {
  return {
    total_hunts: ALL_HUNTS.length,
    indexed_codes: HUNT_INDEX.size,
    indexed_boundaries: BOUNDARY_INDEX.size
  };
}