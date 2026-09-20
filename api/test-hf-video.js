module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed. Open this endpoint in the browser with GET.' });
  }

  const token = process.env.HF_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: 'HF_TOKEN is not configured in Vercel.' });
  }

  const prompt = String(
    req.query.prompt ||
    'A cinematic shot of a small paper boat floating on calm water at sunrise, gentle natural motion, realistic lighting'
  ).slice(0, 800);

  try {
    const { Client } = await import('@gradio/client');

    const app = await Client.connect('Lightricks/LTX-2-3', {
      hf_token: token
    });

    const apiInfo = await app.view_api();
    const named = Object.keys(apiInfo?.named_endpoints || {});
    const endpoint =
      named.find((name) => name === '/generate_video') ||
      named.find((name) => name.toLowerCase().includes('generate_video'));

    if (!endpoint) {
      return res.status(502).json({
        ok: false,
        error: 'The LTX-2.3 Space is reachable, but its generate_video API endpoint was not found.',
        availableEndpoints: named
      });
    }

    const result = await app.predict(endpoint, {
      input_image: null,
      prompt,
      duration: 1,
      enhance_prompt: false,
      seed: 42,
      randomize_seed: false,
      height: 512,
      width: 768
    });

    const output = result?.data?.[0] ?? null;
    const seed = result?.data?.[1] ?? 42;
    const videoUrl =
      (typeof output === 'string' ? output : null) ||
      output?.url ||
      output?.path ||
      null;

    return res.status(200).json({
      ok: true,
      provider: 'Hugging Face ZeroGPU',
      space: 'Lightricks/LTX-2-3',
      endpoint,
      testSettings: {
        duration: 1,
        width: 768,
        height: 512,
        enhancePrompt: false,
        seed
      },
      videoUrl,
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
