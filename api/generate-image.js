function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function checkAccess(req) {
  const required = String(process.env.APP_ACCESS_CODE || '');
  if (!required) return;
  const supplied = String(req.headers['x-app-access-code'] || '');
  if (supplied !== required) {
    const err = new Error('Invalid app access code.');
    err.status = 401;
    throw err;
  }
}

const DIMENSIONS = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1024, height: 576 },
  '9:16': { width: 576, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '3:4': { width: 768, height: 1024 }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok:false, error:'Method not allowed' });

  try {
    checkAccess(req);

    const token = String(process.env.HF_TOKEN || '').trim();
    if (!token) return send(res, 500, { ok:false, error:'HF_TOKEN is not configured in Vercel.' });

    const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const prompt = String(body.prompt || '').trim();
    if (prompt.length < 3 || prompt.length > 1800) {
      return send(res, 400, { ok:false, error:'Prompt must be between 3 and 1800 characters.' });
    }

    const aspect = Object.prototype.hasOwnProperty.call(DIMENSIONS, String(body.aspect_ratio))
      ? String(body.aspect_ratio)
      : '1:1';
    const { width, height } = DIMENSIONS[aspect];

    const seed = Number.isInteger(Number(body.seed))
      ? Math.max(0, Math.min(2147483647, Number(body.seed)))
      : Math.floor(Math.random() * 2147483647);

    const { Client } = await import('@gradio/client');
    const app = await Client.connect('black-forest-labs/FLUX.1-schnell', { hf_token: token });

    const result = await app.predict('/infer', {
      prompt,
      seed,
      randomize_seed: false,
      width,
      height,
      num_inference_steps: 4
    });

    const output = result?.data?.[0] ?? null;
    const usedSeed = result?.data?.[1] ?? seed;
    const imageUrl =
      (typeof output === 'string' ? output : null) ||
      output?.url ||
      output?.path ||
      null;

    if (!imageUrl) {
      return send(res, 502, {
        ok:false,
        error:'FLUX.1-schnell finished without returning an image URL.',
        details:output
      });
    }

    return send(res, 200, {
      ok:true,
      status:'completed',
      provider:'Hugging Face ZeroGPU',
      model:'black-forest-labs/FLUX.1-schnell',
      prompt,
      aspect_ratio:aspect,
      width,
      height,
      steps:4,
      seed:usedSeed,
      imageUrl
    });
  } catch (error) {
    return send(res, error?.status || 500, {
      ok:false,
      error:error?.message || String(error),
      hint:'Free ZeroGPU can be busy or your Hugging Face daily quota can be exhausted. Retry later if the error mentions queue, quota, capacity, or timeout.'
    });
  }
};
