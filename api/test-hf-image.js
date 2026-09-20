module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Open this endpoint in the browser with GET.' });
  }

  const token = String(process.env.HF_TOKEN || '').trim();
  if (!token) {
    return res.status(500).json({ ok: false, error: 'HF_TOKEN is not configured in Vercel.' });
  }

  const prompt = String(
    req.query.prompt ||
    'A cinematic futuristic glass greenhouse in a lush green valley at sunrise, soft golden light, highly detailed, photorealistic'
  ).slice(0, 1000);

  try {
    const { Client } = await import('@gradio/client');

    const app = await Client.connect('black-forest-labs/FLUX.1-schnell', {
      hf_token: token
    });

    const apiInfo = await app.view_api();
    const named = Object.keys(apiInfo?.named_endpoints || {});
    const endpoint =
      named.find((name) => name === '/infer') ||
      named.find((name) => name.toLowerCase().includes('infer'));

    if (!endpoint) {
      return res.status(502).json({
        ok: false,
        error: 'FLUX.1-schnell is reachable, but its image generation endpoint was not found.',
        availableEndpoints: named
      });
    }

    const seed = 42;
    const result = await app.predict(endpoint, {
      prompt,
      seed,
      randomize_seed: false,
      width: 1024,
      height: 1024,
      num_inference_steps: 4
    });

    const output = result?.data?.[0] ?? null;
    const usedSeed = result?.data?.[1] ?? seed;

    const imageUrl =
      (typeof output === 'string' ? output : null) ||
      output?.url ||
      output?.path ||
      null;

    return res.status(200).json({
      ok: true,
      provider: 'Hugging Face ZeroGPU',
      space: 'black-forest-labs/FLUX.1-schnell',
      endpoint,
      model: 'FLUX.1-schnell',
      testSettings: {
        width: 1024,
        height: 1024,
        steps: 4,
        seed: usedSeed
      },
      imageUrl,
      output
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error),
      hint: 'If this mentions quota, queue, timeout, or ZeroGPU capacity, the token may still be valid but the free GPU pool may be busy or the daily quota may be exhausted.'
    });
  }
};
