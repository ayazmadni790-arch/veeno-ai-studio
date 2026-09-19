const ORIGIN = 'https://openrouter.ai';
const API_BASE = `${ORIGIN}/api/v1`;

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function getAuth(req) {
  const byok = String(req.headers['x-openrouter-key'] || '').trim();
  if (byok) {
    if (!/^sk-or-v1-[A-Za-z0-9_-]+$/.test(byok)) {
      const err = new Error('The OpenRouter key format looks invalid.');
      err.status = 400;
      throw err;
    }
    return { key: byok, mode: 'byok' };
  }

  const accessCode = String(req.headers['x-app-access-code'] || '');
  const requiredCode = String(process.env.APP_ACCESS_CODE || '');
  if (requiredCode && accessCode !== requiredCode) {
    const err = new Error('Invalid app access code.');
    err.status = 401;
    throw err;
  }

  const key = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!key) {
    const err = new Error('Server OPENROUTER_API_KEY is not configured.');
    err.status = 500;
    throw err;
  }
  return { key, mode: 'owner' };
}

function headers(key, withJson = false) {
  const h = {
    Authorization: `Bearer ${key}`,
    'HTTP-Referer': process.env.APP_PUBLIC_URL || 'https://localhost',
    'X-Title': 'Veeno AI'
  };
  if (withJson) h['Content-Type'] = 'application/json';
  return h;
}

async function readJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; }
  catch { return { raw: text }; }
}

async function fetchJson(url, key) {
  const r = await fetch(url, { headers: headers(key) });
  const data = await readJson(r);
  if (!r.ok) {
    const err = new Error(data?.error?.message || data?.message || `OpenRouter request failed (${r.status})`);
    err.status = r.status;
    err.details = data;
    throw err;
  }
  return data;
}

const cache = global.__VEENO_CACHE || (global.__VEENO_CACHE = new Map());
function getCached(name) {
  const item = cache.get(name);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(name);
    return null;
  }
  return item.value;
}
function setCached(name, value, ttlMs = 3 * 60 * 1000) {
  cache.set(name, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function hasNonZeroPricingObject(pricing) {
  if (!pricing || typeof pricing !== 'object') return false;
  return Object.values(pricing).some(v => {
    if (Array.isArray(v)) {
      return v.some(item => Number(item?.cost_usd) > 0);
    }
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  });
}

function allZeroPricingObject(pricing) {
  if (!pricing || typeof pricing !== 'object') return false;
  const values = Object.values(pricing).flatMap(v => Array.isArray(v) ? v.map(x => x?.cost_usd) : [v]);
  if (!values.length) return false;
  return values.every(v => {
    const n = Number(v);
    return Number.isFinite(n) && n === 0;
  });
}

function labelFromModel(model) {
  return model?.name || model?.id || 'Unknown model';
}

function qualityScore(id = '', name = '', description = '') {
  const s = `${id} ${name} ${description}`.toLowerCase();
  let score = 60;
  const bumps = [
    ['sunburst', 18], ['precision', 12], ['pro', 10], ['opus', 12], ['veo', 12], ['sora', 12], ['hailuo', 10],
    ['seedream', 10], ['recraft', 10], ['mai-image', 10], ['muse', 7], ['fable', 8], ['quality', 5], ['high', 4]
  ];
  const drops = [['lite', -8], ['flash', -6], ['flare', -4], ['fast', -5], ['speed', -4], [':free', -1]];
  for (const [k,v] of bumps) if (s.includes(k)) score += v;
  for (const [k,v] of drops) if (s.includes(k)) score += v;
  return Math.max(1, Math.min(100, score));
}

function qualityBucket(score) {
  if (score >= 86) return 'Top quality';
  if (score >= 76) return 'High quality';
  if (score >= 66) return 'Balanced';
  return 'Fast / basic';
}

function imagePricingToFree(pricing) {
  if (!pricing || typeof pricing !== 'object') return false;
  return Object.values(pricing).every(v => {
    const n = Number(v);
    return Number.isFinite(n) && n === 0;
  });
}

function normalizeVideoModel(m) {
  const score = qualityScore(m.id, m.name, m.description);
  const free = String(m.id || '').endsWith(':free') || allZeroPricingObject(m.pricing_skus);
  const available = true;
  return {
    kind: 'video',
    id: m.id,
    label: labelFromModel(m),
    description: m.description || '',
    free,
    available,
    premium: !free,
    qualityScore: score,
    qualityLabel: qualityBucket(score),
    supported_durations: m.supported_durations || [],
    supported_resolutions: m.supported_resolutions || [],
    supported_aspect_ratios: m.supported_aspect_ratios || [],
    supported_sizes: m.supported_sizes || [],
    allowed_passthrough_parameters: m.allowed_passthrough_parameters || [],
    pricing: m.pricing_skus || {},
    sortGroup: free ? 0 : 2
  };
}

function normalizeImageModel(m) {
  const pricing = m.pricing || {};
  const score = qualityScore(m.id, m.name, m.description);
  const free = imagePricingToFree(pricing) || String(m.id || '').endsWith(':free');
  const openai = String(m.id || '').startsWith('openai/');
  const params = m.supported_parameters || {};
  const aspect = params.aspect_ratio?.values || ['auto'];
  const quality = params.quality?.values || ['auto'];
  const background = params.background?.values || ['auto'];
  const nMax = params.n?.max || 1;
  const supportsRefs = Boolean(params.input_references);
  let sortGroup = 1;
  if (free) sortGroup = 0;
  else if (openai) sortGroup = 2;
  return {
    kind: 'image',
    id: m.id,
    label: labelFromModel(m),
    description: m.description || '',
    free,
    available: true,
    premium: !free,
    openai,
    qualityScore: score,
    qualityLabel: qualityBucket(score),
    supported_aspect_ratios: aspect,
    supported_quality: quality,
    supported_background: background,
    max_images: nMax,
    supportsReferences: supportsRefs,
    pricing,
    sortGroup
  };
}

function sortModels(a, b) {
  return (a.sortGroup - b.sortGroup) || (b.qualityScore - a.qualityScore) || a.label.localeCompare(b.label);
}

async function getVideoCatalog(key) {
  const cacheKey = `video:${key.slice(0,14)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const data = await fetchJson(`${API_BASE}/videos/models`, key);
  const list = Array.isArray(data?.data) ? data.data.map(normalizeVideoModel).sort(sortModels) : [];
  return setCached(cacheKey, list);
}

async function getImageCatalog(key) {
  const cacheKey = `image:${key.slice(0,14)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const [modelsResp, imagesResp] = await Promise.all([
    fetchJson(`${API_BASE}/models?output_modalities=image`, key),
    fetchJson(`${API_BASE}/images/models`, key)
  ]);
  const byId = new Map((Array.isArray(imagesResp?.data) ? imagesResp.data : []).map(m => [m.id, m]));
  const merged = (Array.isArray(modelsResp?.data) ? modelsResp.data : []).map(m => ({ ...m, supported_parameters: byId.get(m.id)?.supported_parameters || {} }));
  const list = merged.map(normalizeImageModel).sort(sortModels);
  return setCached(cacheKey, list);
}

function sanitizeJobId(value) {
  const id = String(value || '').trim();
  if (!/^[A-Za-z0-9._:-]{3,200}$/.test(id)) {
    const err = new Error('Invalid job id.');
    err.status = 400;
    throw err;
  }
  return id;
}

function ensureHttpUrl(value, label) {
  const s = String(value || '').trim();
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch {
    const err = new Error(`${label} URL is invalid.`);
    err.status = 400;
    throw err;
  }
  if (!['http:', 'https:'].includes(u.protocol)) {
    const err = new Error(`${label} URL must use http or https.`);
    err.status = 400;
    throw err;
  }
  return s;
}

module.exports = {
  ORIGIN,
  API_BASE,
  json,
  getAuth,
  headers,
  readJson,
  fetchJson,
  hasNonZeroPricingObject,
  allZeroPricingObject,
  qualityScore,
  qualityBucket,
  getVideoCatalog,
  getImageCatalog,
  sanitizeJobId,
  ensureHttpUrl
};
