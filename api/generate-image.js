const { API_BASE, json, getAuth, headers, readJson, getImageCatalog, ensureHttpUrl } = require('./_shared');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { key, mode } = getAuth(req);
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const model = String(body.model || '').trim();
    const prompt = String(body.prompt || '').trim();

    if (!model) return json(res, 400, { error: 'Model is required.' });
    if (prompt.length < 3 || prompt.length > 5000) return json(res, 400, { error: 'Prompt must be between 3 and 5000 characters.' });

    const catalog = await getImageCatalog(key);
    const live = catalog.find(m => m.id === model);
    if (!live) return json(res, 404, { error: 'Selected image model is not currently advertised by OpenRouter.' });
    if (!live.free) {
      return json(res, 409, { error: 'This build is currently free-first. The selected image model is premium/paid and was blocked.', model });
    }

    const payload = { model, prompt };

    const aspectRatio = String(body.aspect_ratio || '').trim();
    if (aspectRatio && live.supported_aspect_ratios.includes(aspectRatio)) payload.aspect_ratio = aspectRatio;

    const quality = String(body.quality || '').trim();
    if (quality && live.supported_quality.includes(quality)) payload.quality = quality;

    const background = String(body.background || '').trim();
    if (background && live.supported_background.includes(background)) payload.background = background;

    const n = Number(body.n);
    if (Number.isInteger(n) && n >= 1 && n <= live.max_images) payload.n = n;

    const referenceUrl = ensureHttpUrl(body.reference_image_url, 'Reference-image');
    if (referenceUrl && live.supportsReferences) {
      payload.input_references = [{ type: 'image_url', image_url: { url: referenceUrl } }];
    }

    const r = await fetch(`${API_BASE}/images`, { method: 'POST', headers: headers(key, true), body: JSON.stringify(payload) });
    const data = await readJson(r);
    if (!r.ok) return json(res, r.status, { error: data?.error?.message || data?.message || `Image generation failed (${r.status})`, details: data });
    return json(res, 200, { ...data, authMode: mode });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message, details: e.details || undefined });
  }
};
