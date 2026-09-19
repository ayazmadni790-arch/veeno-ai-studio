const { API_BASE, json, getAuth, headers, readJson, getVideoCatalog, ensureHttpUrl } = require('./_shared');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { key, mode } = getAuth(req);
    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const model = String(body.model || '').trim();
    const prompt = String(body.prompt || '').trim();

    if (!model) return json(res, 400, { error: 'Model is required.' });
    if (prompt.length < 3 || prompt.length > 5000) return json(res, 400, { error: 'Prompt must be between 3 and 5000 characters.' });

    const catalog = await getVideoCatalog(key);
    const live = catalog.find(m => m.id === model);
    if (!live) return json(res, 404, { error: 'Selected video model is not currently advertised by OpenRouter.' });
    if (!live.free) {
      return json(res, 409, { error: 'This build is currently free-first. The selected video model is premium/paid and was blocked.', model });
    }

    const payload = { model, prompt };

    const duration = Number(body.duration);
    if (Number.isInteger(duration) && duration > 0) {
      if (live.supported_durations.length && !live.supported_durations.includes(duration)) return json(res, 400, { error: `Duration ${duration}s is not supported.`, allowed: live.supported_durations });
      payload.duration = duration;
    }

    const resolution = String(body.resolution || '').trim();
    if (resolution) {
      if (live.supported_resolutions.length && !live.supported_resolutions.includes(resolution)) return json(res, 400, { error: `Resolution ${resolution} is not supported.`, allowed: live.supported_resolutions });
      payload.resolution = resolution;
    }

    const aspectRatio = String(body.aspect_ratio || '').trim();
    if (aspectRatio) {
      if (live.supported_aspect_ratios.length && !live.supported_aspect_ratios.includes(aspectRatio)) return json(res, 400, { error: `Aspect ratio ${aspectRatio} is not supported.`, allowed: live.supported_aspect_ratios });
      payload.aspect_ratio = aspectRatio;
    }

    if (typeof body.generate_audio === 'boolean') payload.generate_audio = body.generate_audio;

    const firstFrameUrl = ensureHttpUrl(body.first_frame_url, 'First-frame');
    if (firstFrameUrl) payload.frame_images = [{ type: 'image_url', image_url: { url: firstFrameUrl }, frame_type: 'first_frame' }];

    const referenceUrl = ensureHttpUrl(body.reference_image_url, 'Reference-image');
    if (referenceUrl && !firstFrameUrl) payload.input_references = [{ type: 'image_url', image_url: { url: referenceUrl } }];

    const r = await fetch(`${API_BASE}/videos`, { method: 'POST', headers: headers(key, true), body: JSON.stringify(payload) });
    const data = await readJson(r);
    if (!r.ok) return json(res, r.status, { error: data?.error?.message || data?.message || `Generation request failed (${r.status})`, details: data });
    return json(res, 202, { ...data, authMode: mode });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message, details: e.details || undefined });
  }
};
