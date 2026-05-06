const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..');
const manifestPath = path.join(repo, 'processed_data', 'boundary-manifest-2026.json');
const canonicalPath = path.join(repo, 'data', 'hunt-master-canonical-2026-source-of-truth.json');
const dwrGeoPath = path.join(repo, 'data', 'hunt_boundaries.geojson');
const outGeoDir = path.join(repo, 'processed_data', 'boundaries');
const outJson = path.join(repo, 'processed_data', 'display-boundary-index-2026.json');
const outCsv = path.join(repo, 'processed_data', 'display-boundary-index-2026.csv');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normBoundaryId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^-?\d+(\.\d+)?$/.test(raw)) return String(Math.trunc(Number(raw)));
  return raw;
}

function isNumericBoundaryId(value) {
  return /^\d+$/.test(String(value || '').trim());
}

function parseIdList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
  }
  const text = String(value || '').trim();
  if (!text) return [];
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      return parseIdList(JSON.parse(text));
    } catch (_) {}
  }
  if (/[,|;/]/.test(text)) {
    return [...new Set(text.split(/[,|;/]/).map((entry) => String(entry || '').trim()).filter(Boolean))];
  }
  return [text];
}

function loadRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    return payload.rows || payload.records || payload.items || [];
  }
  return [];
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function main() {
  fs.mkdirSync(outGeoDir, { recursive: true });

  const manifestRows = loadRows(readJson(manifestPath));
  const canonicalRows = loadRows(readJson(canonicalPath));
  const dwrGeo = readJson(dwrGeoPath);
  const dwrFeatures = Array.isArray(dwrGeo.features) ? dwrGeo.features : [];

  const featuresByBoundaryId = new Map();
  dwrFeatures.forEach((feature) => {
    const props = feature && feature.properties ? feature.properties : {};
    const rawId = props.BoundaryID ?? props.BOUNDARYID ?? props.Boundary_Id ?? props.boundary_id;
    const boundaryId = normBoundaryId(rawId);
    if (!boundaryId || !isNumericBoundaryId(boundaryId)) return;
    if (!featuresByBoundaryId.has(boundaryId)) featuresByBoundaryId.set(boundaryId, []);
    featuresByBoundaryId.get(boundaryId).push(feature);
  });

  const manifestByCode = new Map();
  manifestRows.forEach((row) => {
    const code = normCode(row.hunt_code || row.huntCode || row.HUNT_CODE);
    if (code) manifestByCode.set(code, row);
  });

  const canonicalByCode = new Map();
  canonicalRows.forEach((row) => {
    const code = normCode(row.hunt_code || row.huntCode || row.code || row.HuntCode);
    if (code && !canonicalByCode.has(code)) canonicalByCode.set(code, row);
  });

  const allCodes = [...new Set([...canonicalByCode.keys(), ...manifestByCode.keys()])].sort();
  const records = [];
  let noGeometry = 0;

  allCodes.forEach((code) => {
    const manifestRow = manifestByCode.get(code) || null;
    const canonicalRow = canonicalByCode.get(code) || null;

    const manifestBoundaryId = normBoundaryId(manifestRow?.boundary_id ?? manifestRow?.boundaryId ?? manifestRow?.BoundaryID);
    const canonicalBoundaryId = normBoundaryId(canonicalRow?.boundary_id ?? canonicalRow?.boundaryId ?? canonicalRow?.BoundaryID ?? canonicalRow?.boundaryIdNumeric);
    const candidateBoundaryId = manifestBoundaryId || canonicalBoundaryId;
    const dwrBoundaryId = isNumericBoundaryId(candidateBoundaryId) ? candidateBoundaryId : '';

    const mergedBoundaryId = String(manifestRow?.merged_boundary_id || manifestRow?.mergedBoundaryId || '').trim();
    const memberBoundaryIds = parseIdList(
      manifestRow?.member_boundary_ids || manifestRow?.memberBoundaryIds || manifestRow?.dwr_member_boundary_ids || []
    ).map(normBoundaryId).filter((id) => isNumericBoundaryId(id));

    const isComposite = Boolean(
      mergedBoundaryId
      || memberBoundaryIds.length > 1
      || String(manifestRow?.boundary_geometry_type || '').toLowerCase().includes('merged')
    );

    const displayBoundaryId = isComposite
      ? `UOGA_${code}_2026`
      : (dwrBoundaryId ? `DWR_${dwrBoundaryId}` : `UOGA_${code}_2026`);

    let features = [];
    const manifestGeoPath = String(manifestRow?.boundary_geojson_path || '').trim();
    if (manifestGeoPath) {
      const absoluteManifestGeoPath = path.join(repo, manifestGeoPath);
      if (fs.existsSync(absoluteManifestGeoPath)) {
        try {
          const payload = readJson(absoluteManifestGeoPath);
          features = Array.isArray(payload.features) ? payload.features : [];
        } catch (_) {}
      }
    }

    if (!features.length) {
      const geometryIds = isComposite ? memberBoundaryIds : (dwrBoundaryId ? [dwrBoundaryId] : memberBoundaryIds);
      const seen = new Set();
      geometryIds.forEach((id) => {
        (featuresByBoundaryId.get(id) || []).forEach((feature) => {
          const key = JSON.stringify(feature.properties || {});
          if (seen.has(key)) return;
          seen.add(key);
          features.push(feature);
        });
      });
    }

    const boundaryGeojsonPath = `processed_data/boundaries/${code}.geojson`;
    fs.writeFileSync(
      path.join(outGeoDir, `${code}.geojson`),
      JSON.stringify({
        type: 'FeatureCollection',
        metadata: {
          hunt_code: code,
          display_boundary_id: displayBoundaryId,
          dwr_boundary_id: isComposite ? null : (dwrBoundaryId || null),
          dwr_member_boundary_ids: isComposite ? memberBoundaryIds : [],
          merged_boundary_id: mergedBoundaryId || null,
          boundary_geometry_type: isComposite ? 'merged_kmz' : 'single_kmz',
          generated_from: 'display-boundary-index-2026-builder',
        },
        features,
      })
    );

    if (!features.length) noGeometry += 1;

    records.push({
      hunt_code: code,
      display_boundary_id: displayBoundaryId,
      dwr_boundary_id: isComposite ? null : (dwrBoundaryId || null),
      dwr_member_boundary_ids: isComposite ? memberBoundaryIds : [],
      merged_boundary_id: mergedBoundaryId || null,
      boundary_geometry_type: isComposite ? 'merged_kmz' : 'single_kmz',
      geometry_status: features.length ? 'mapped' : 'unavailable',
      boundary_geojson_path: boundaryGeojsonPath,
      boundary_kmz_path: manifestRow?.boundary_kmz_path || null,
      boundary_kml_path: manifestRow?.boundary_kml_path || null,
      dwr_boundary_link: manifestRow?.dwr_boundary_link || null,
      member_boundary_count: isComposite ? memberBoundaryIds.length : 0,
    });
  });

  const jsonDoc = {
    generated_at: new Date().toISOString().slice(0, 10),
    source: 'canonical + boundary-manifest + dwr-boundary-geojson',
    count: records.length,
    records,
  };
  fs.writeFileSync(outJson, JSON.stringify(jsonDoc, null, 2));

  const headers = [
    'hunt_code',
    'display_boundary_id',
    'dwr_boundary_id',
    'dwr_member_boundary_ids',
    'merged_boundary_id',
    'boundary_geometry_type',
    'geometry_status',
    'boundary_geojson_path',
    'boundary_kmz_path',
    'boundary_kml_path',
    'dwr_boundary_link',
    'member_boundary_count',
  ];
  const lines = [headers.join(',')];
  records.forEach((row) => {
    const cols = headers.map((key) => {
      const value = key === 'dwr_member_boundary_ids'
        ? (Array.isArray(row[key]) ? row[key].join(';') : '')
        : row[key];
      return csvCell(value);
    });
    lines.push(cols.join(','));
  });
  fs.writeFileSync(outCsv, lines.join('\n'));

  console.log(JSON.stringify({
    records: records.length,
    noGeometry,
    outJson,
    outCsv,
  }, null, 2));
}

main();
