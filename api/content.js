const { API_BASE, getAuth, headers, sanitizeJobId } = require('./_shared');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method not allowed');
  try {
    const { key } = getAuth(req);
    const id = sanitizeJobId(req.query.id);
    const index = Math.max(0, Math.min(9, Number(req.query.index || 0) || 0));
    const r = await fetch(`${API_BASE}/videos/${encodeURIComponent(id)}/content?index=${index}`, { headers: headers(key) });
    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).end(text || 'Video download failed');
    }
    res.status(200);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', `inline; filename="video-${id}.mp4"`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    const ab = await r.arrayBuffer();
    return res.end(Buffer.from(ab));
  } catch (e) {
    return res.status(e.status || 500).end(e.message || 'Download failed');
  }
};
