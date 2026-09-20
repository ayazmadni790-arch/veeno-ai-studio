const ALLOWED_HOSTS = new Set([
  'lightricks-ltx-2-3.hf.space',
  'black-forest-labs-flux-1-schnell.hf.space'
]);

function safeName(name, fallback) {
  const cleaned = String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned || fallback;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method not allowed' });

  try {
    const raw = String(req.query.url || '');
    if (!raw) return res.status(400).json({ ok:false, error:'Missing file URL' });

    const url = new URL(raw);
    if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
      return res.status(400).json({ ok:false, error:'Download host is not allowed' });
    }

    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      return res.status(502).json({ ok:false, error:`Could not fetch generated file (${upstream.status})` });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    const fallback = contentType.includes('video') ? 'veeno-ai-video.mp4' : 'veeno-ai-image.webp';
    const filename = safeName(req.query.filename, fallback);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ ok:false, error:error?.message || String(error) });
  }
};
