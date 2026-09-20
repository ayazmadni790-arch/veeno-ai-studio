const { json, getAuth, getImageCatalog } = require('./_shared');

function hfVideoModels() {
  if (!process.env.HF_TOKEN) return [];
  return [{
    kind: 'video',
    id: 'hf/lightricks-ltx-2-3',
    label: 'Lightricks: LTX-2.3 Distilled',
    description: 'Verified working free video generation through Hugging Face ZeroGPU. Generates video with native audio. Free usage is subject to the Hugging Face daily ZeroGPU quota and capacity.',
    free: true,
    available: true,
    premium: false,
    qualityScore: 90,
    qualityLabel: 'High quality',
    supported_durations: [1,2,3,4],
    supported_resolutions: ['Low / Fast'],
    supported_aspect_ratios: ['16:9','9:16','1:1'],
    supports_audio: true,
    provider: 'Hugging Face ZeroGPU'
  }];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error:'Method not allowed' });

  const type = String(req.query.type || 'all');
  const videoModels = hfVideoModels();

  if (type === 'video') {
    return json(res, 200, {
      mode:'free-only',
      type,
      videoModels,
      models:videoModels,
      checkedAt:new Date().toISOString()
    });
  }

  let imageModels = [];
  let imageCatalogError = null;
  try {
    const { key } = getAuth(req);
    imageModels = (await getImageCatalog(key)).filter(m => m.free);
  } catch (e) {
    imageCatalogError = e.message;
  }

  if (type === 'image') {
    return json(res, 200, {
      mode:'free-only',
      type,
      models:imageModels,
      imageModels,
      imageCatalogError,
      checkedAt:new Date().toISOString()
    });
  }

  return json(res, 200, {
    mode:'free-only',
    type:'all',
    videoModels,
    imageModels,
    imageCatalogError,
    checkedAt:new Date().toISOString()
  });
};
