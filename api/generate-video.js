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
  '16:9': { width: 768, height: 512 },
  '9:16': { width: 512, height: 768 },
  '1:1': { width: 768, height: 768 }
};

const PRESET_PROMPTS = {
  'veo-31': 'cinematic realism, natural physically believable motion, rich dynamic range, polished commercial composition',
  'seedance-25': 'expressive camera movement, strong subject motion, energetic cinematic pacing, polished storytelling',
  'wan-20': 'smooth fluid animation, coherent motion, atmospheric lighting, detailed cinematic environment',
  'ltx-native': 'clean cinematic motion, coherent scene continuity, natural lighting'
};

function decodeDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 3_000_000) {
    const err = new Error('Reference image is too large. Please use an image under 3 MB after compression.');
    err.status = 413;
    throw err;
  }
  return { mime: match[1], buffer };
}

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

    const duration = Number(body.duration || 5);
    if (![5,8,10].includes(duration)) {
      return send(res, 400, { ok:false, error:'Choose a 5, 8, or 10 second duration.' });
    }

    const aspect = ['16:9','9:16','1:1'].includes(String(body.aspect_ratio)) ? String(body.aspect_ratio) : '16:9';
    const { width, height } = DIMENSIONS[aspect];
    const mode = body.mode === 'image-to-video' ? 'image-to-video' : 'text-to-video';
    const preset = Object.prototype.hasOwnProperty.call(PRESET_PROMPTS, String(body.preset)) ? String(body.preset) : 'ltx-native';

    const seed = Number.isInteger(Number(body.seed))
      ? Math.max(0, Math.min(2147483647, Number(body.seed)))
      : Math.floor(Math.random() * 2147483647);

    const enhancedPrompt = `${prompt}. Visual direction: ${PRESET_PROMPTS[preset]}.`;

    const gradio = await import('@gradio/client');
    const app = await gradio.Client.connect('Lightricks/LTX-2-3', { hf_token: token });

    let inputImage = null;
    if (mode === 'image-to-video') {
      const decoded = decodeDataUrl(body.image_data);
      if (!decoded) {
        return send(res, 400, { ok:false, error:'Please upload an image for Image to Video mode.' });
      }
      inputImage = gradio.handle_file(decoded.buffer);
    }

    const result = await app.predict('/generate_video', {
      input_image: inputImage,
      prompt: enhancedPrompt,
      duration,
      enhance_prompt: false,
      seed,
      randomize_seed: false,
      height,
      width
    });

    const output = result?.data?.[0] ?? null;
    const usedSeed = result?.data?.[1] ?? seed;
    const videoUrl =
      (typeof output === 'string' ? output : null) ||
      output?.url ||
      output?.path ||
      null;

    if (!videoUrl) {
      return send(res, 502, {
        ok:false,
        error:'LTX-2.3 finished without returning a playable video URL.',
        details: output
      });
    }

    return send(res, 200, {
      ok:true,
      id:`hf-${Date.now()}`,
      status:'completed',
      provider:'Hugging Face ZeroGPU',
      engine:'Lightricks/LTX-2-3',
      preset,
      mode,
      prompt,
      duration,
      aspect_ratio:aspect,
      width,
      height,
      seed:usedSeed,
      audio:true,
      videoUrl
    });
  } catch (error) {
    return send(res, error?.status || 500, {
      ok:false,
      error:error?.message || String(error),
      hint:'Free ZeroGPU can be busy or the Hugging Face daily quota can be exhausted. Retry later if the error mentions queue, quota, capacity, or timeout.'
    });
  }
};
