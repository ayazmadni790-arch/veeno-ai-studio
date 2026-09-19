const { API_BASE, json, getAuth, headers, readJson, sanitizeJobId } = require('./_shared');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { key } = getAuth(req);
    const id = sanitizeJobId(req.query.id);
    const r = await fetch(`${API_BASE}/videos/${encodeURIComponent(id)}`, { headers: headers(key) });
    const data = await readJson(r);
    if (!r.ok) return json(res, r.status, { error: data?.error?.message || data?.message || `Status request failed (${r.status})`, details: data });
    return json(res, 200, data);
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
};
