function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function fetchJson(url, key) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!r.ok) {
    const err = new Error(body?.error?.message || body?.error || body?.message || `Pollinations request failed (${r.status})`);
    err.status = r.status;
    err.details = body;
    throw err;
  }
  return body;
}

function asArray(x) {
  if (Array.isArray(x)) return x;
  if (Array.isArray(x?.data)) return x.data;
  if (Array.isArray(x?.models)) return x.models;
  return [];
}

function idOf(m) {
  return String(m?.id || m?.model || m?.name || m?.alias || '');
}

function looksLikeVideo(m) {
  const s = JSON.stringify(m).toLowerCase();
  return /(veo|seedance|wan-|grok-imagine-video|nova-reel|happyhorse|minimax-h3|p-video|video_capabilities|video\/)/.test(s);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok:false, error:'Method not allowed' });

  const key = String(process.env.POLLINATIONS_API_KEY || '').trim();
  if (!key) return send(res, 500, { ok:false, error:'POLLINATIONS_API_KEY is not configured in Vercel.' });

  try {
    const [keyInfo, balance, videoModelsRaw, imageModelsRaw, allModelsRaw] = await Promise.all([
      fetchJson('https://gen.pollinations.ai/account/key', key),
      fetchJson('https://gen.pollinations.ai/account/balance', key),
      fetchJson('https://gen.pollinations.ai/video/models?source=official', key),
      fetchJson('https://gen.pollinations.ai/image/models?source=official', key),
      fetchJson('https://gen.pollinations.ai/models?source=official', key)
    ]);

    const videoModels = asArray(videoModelsRaw);
    const imageModels = asArray(imageModelsRaw);
    const allModels = asArray(allModelsRaw);

    const candidatesMap = new Map();
    for (const source of [videoModels, imageModels, allModels]) {
      for (const model of source) {
        if (!looksLikeVideo(model)) continue;
        const id = idOf(model);
        if (!id) continue;
        if (!candidatesMap.has(id)) candidatesMap.set(id, model);
      }
    }

    const candidates = [...candidatesMap.values()].sort((a,b) => idOf(a).localeCompare(idOf(b)));

    return send(res, 200, {
      ok:true,
      provider:'Pollinations',
      key:{
        valid:keyInfo?.valid ?? null,
        type:keyInfo?.type ?? null,
        name:keyInfo?.name ?? null,
        expiresAt:keyInfo?.expiresAt ?? null,
        permissions:keyInfo?.permissions ?? null
      },
      balance:{
        visible:balance?.balance ?? null,
        total:balance?.accountBalance?.total ?? null,
        quest:balance?.accountBalance?.tier ?? null,
        paid:balance?.accountBalance?.paid ?? null
      },
      catalogDiagnostics:{
        videoEndpointCount:videoModels.length,
        imageEndpointCount:imageModels.length,
        allEndpointCount:allModels.length,
        candidateCount:candidates.length,
        candidates
      }
    });
  } catch (error) {
    return send(res, error?.status || 500, {
      ok:false,
      error:error?.message || String(error),
      details:error?.details || null
    });
  }
};
