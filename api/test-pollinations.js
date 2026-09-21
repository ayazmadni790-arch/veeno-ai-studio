function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function fetchJson(url, key) {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` }
  });
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

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeVideoModel(m) {
  const pricePerSecond = firstNumber(
    m?.completionVideoPrice,
    m?.completion_video_price,
    m?.pricing?.completionVideoPrice,
    m?.pricing?.completion_video_price,
    m?.pricing?.video,
    m?.price_per_second,
    m?.video_price
  );

  return {
    id: m?.id || m?.model || m?.name || m?.alias || null,
    name: m?.name || m?.label || m?.id || m?.model || null,
    provider: m?.provider?.name || m?.provider || null,
    paidOnly: m?.paid_only ?? m?.paidOnly ?? null,
    pricePerSecond,
    cost4s: pricePerSecond == null ? null : Number((pricePerSecond * 4).toFixed(6)),
    cost5s: pricePerSecond == null ? null : Number((pricePerSecond * 5).toFixed(6)),
    cost8s: pricePerSecond == null ? null : Number((pricePerSecond * 8).toFixed(6)),
    cost10s: pricePerSecond == null ? null : Number((pricePerSecond * 10).toFixed(6)),
    videoCapabilities: m?.video_capabilities || m?.videoCapabilities || null,
    health: m?.health || null
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok:false, error:'Method not allowed' });

  const key = String(process.env.POLLINATIONS_API_KEY || '').trim();
  if (!key) {
    return send(res, 500, {
      ok:false,
      error:'POLLINATIONS_API_KEY is not configured in Vercel.'
    });
  }

  try {
    const [keyInfo, balance, rawModels] = await Promise.all([
      fetchJson('https://gen.pollinations.ai/account/key', key),
      fetchJson('https://gen.pollinations.ai/account/balance', key),
      fetchJson('https://gen.pollinations.ai/video/models?source=official&community=0', key)
    ]);

    const models = (Array.isArray(rawModels) ? rawModels : rawModels?.data || [])
      .map(normalizeVideoModel)
      .sort((a,b) => {
        if (a.pricePerSecond == null && b.pricePerSecond == null) return String(a.name).localeCompare(String(b.name));
        if (a.pricePerSecond == null) return 1;
        if (b.pricePerSecond == null) return -1;
        return a.pricePerSecond - b.pricePerSecond;
      });

    const quest = Number(balance?.accountBalance?.tier || 0);
    const affordable = models.filter(m =>
      m.pricePerSecond != null &&
      m.paidOnly !== true &&
      m.cost4s <= quest
    );

    return send(res, 200, {
      ok:true,
      provider:'Pollinations',
      key:{
        valid:keyInfo?.valid ?? null,
        type:keyInfo?.type ?? null,
        name:keyInfo?.name ?? null,
        expiresAt:keyInfo?.expiresAt ?? null,
        pollenBudget:keyInfo?.pollenBudget ?? null,
        permissions:keyInfo?.permissions ?? null
      },
      balance:{
        visible:balance?.balance ?? null,
        total:balance?.accountBalance?.total ?? null,
        quest:balance?.accountBalance?.tier ?? null,
        paid:balance?.accountBalance?.paid ?? null
      },
      videoCatalog:{
        count:models.length,
        affordableWithQuestPollen4s:affordable,
        allOfficialModels:models
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
