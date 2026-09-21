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
    const [keyInfo, balance] = await Promise.all([
      fetchJson('https://gen.pollinations.ai/account/key', key),
      fetchJson('https://gen.pollinations.ai/account/balance', key)
    ]);

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
