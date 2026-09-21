function send(res, status, body) {
  res.status(status).setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

async function getJson(url, key) {
  const r = await fetch(url, { headers:{ Authorization:`Bearer ${key}` } });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw:text }; }
  if (!r.ok) {
    const e = new Error(body?.error?.message || body?.error || body?.message || `HTTP ${r.status}`);
    e.status = r.status; e.details = body; throw e;
  }
  return body;
}

module.exports = async function handler(req,res) {
  if (req.method !== 'GET') return send(res,405,{ok:false,error:'Method not allowed'});
  const key = String(process.env.POLLINATIONS_API_KEY || '').trim();
  if (!key) return send(res,500,{ok:false,error:'POLLINATIONS_API_KEY is not configured.'});

  try {
    const [balance, quests] = await Promise.all([
      getJson('https://gen.pollinations.ai/account/balance', key),
      getJson('https://gen.pollinations.ai/account/quests', key)
    ]);

    const questBalance = Number(balance?.accountBalance?.tier || 0);
    return send(res,200,{
      ok:true,
      questPollen:questBalance,
      paidPollen:Number(balance?.accountBalance?.paid || 0),
      targetForNovaReel6s:0.48,
      additionalQuestPollenNeeded:Math.max(0, Number((0.48-questBalance).toFixed(4))),
      quests
    });
  } catch (e) {
    return send(res,e.status||500,{ok:false,error:e.message,details:e.details||null});
  }
};
