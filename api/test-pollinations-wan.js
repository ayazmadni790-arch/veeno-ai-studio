function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok:false, error:'Method not allowed' });

  const key = String(process.env.POLLINATIONS_API_KEY || '').trim();
  if (!key) return json(res, 500, { ok:false, error:'POLLINATIONS_API_KEY is not configured.' });

  const prompt = 'A cinematic sunrise over green countryside, gentle camera movement, realistic light, high detail';
  const url = new URL('https://gen.pollinations.ai/video/' + encodeURIComponent(prompt));
  url.searchParams.set('model', 'wan-fast');
  url.searchParams.set('duration', '5');
  url.searchParams.set('aspectRatio', '16:9');

  try {
    const beforeRes = await fetch('https://gen.pollinations.ai/account/balance', {
      headers: { Authorization: `Bearer ${key}` }
    });
    const before = beforeRes.ok ? await beforeRes.json() : null;

    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` }
    });

    const contentType = r.headers.get('content-type') || '';
    if (!r.ok || !contentType.includes('video')) {
      const text = await r.text();
      let details;
      try { details = JSON.parse(text); } catch { details = { raw:text }; }
      return json(res, r.status || 500, {
        ok:false,
        testedModel:'wan-fast',
        duration:5,
        balanceBefore:before?.accountBalance || before || null,
        error:details
      });
    }

    const buffer = Buffer.from(await r.arrayBuffer());

    res.setHeader('Content-Type', contentType || 'video/mp4');
    res.setHeader('Content-Disposition', 'inline; filename="pollinations-wan-fast-test.mp4"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Veeno-Test-Model', 'wan-fast');
    res.setHeader('X-Veeno-Test-Duration', '5');
    return res.status(200).send(buffer);
  } catch (error) {
    return json(res, 500, {
      ok:false,
      testedModel:'wan-fast',
      duration:5,
      error:error?.message || String(error)
    });
  }
};
