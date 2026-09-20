const { json } = require('./_shared');

function hfVideoModels() {
  if (!process.env.HF_TOKEN) return [];
  return [{
    kind:'video',
    id:'hf/lightricks-ltx-2-3',
    label:'Lightricks: LTX-2.3 Distilled',
    description:'Verified working free video generation through Hugging Face ZeroGPU. Generates video with native audio. Free usage is subject to Hugging Face daily ZeroGPU quota and capacity.',
    free:true,
    available:true,
    premium:false,
    qualityScore:90,
    qualityLabel:'High quality',
    supported_durations:[1,2,3,4,5,6,7,8,9,10],
    supported_resolutions:['Low / Fast'],
    supported_aspect_ratios:['16:9','9:16','1:1'],
    supports_audio:true,
    provider:'Hugging Face ZeroGPU'
  }];
}

function hfImageModels() {
  if (!process.env.HF_TOKEN) return [];
  return [{
    kind:'image',
    id:'hf/black-forest-labs-flux-1-schnell',
    label:'Black Forest Labs: FLUX.1 Schnell',
    description:'Verified working free image generation through Hugging Face ZeroGPU. Fast 4-step text-to-image generation.',
    free:true,
    available:true,
    premium:false,
    qualityScore:92,
    qualityLabel:'High quality',
    supported_aspect_ratios:['1:1','16:9','9:16','4:3','3:4'],
    supported_quality:['4-step Fast'],
    supported_background:['Auto'],
    supportsReferences:false,
    max_images:1,
    provider:'Hugging Face ZeroGPU'
  }];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res,405,{error:'Method not allowed'});

  const type=String(req.query.type||'all');
  const videoModels=hfVideoModels();
  const imageModels=hfImageModels();

  if (type==='video') return json(res,200,{mode:'free-only',type,videoModels,models:videoModels,checkedAt:new Date().toISOString()});
  if (type==='image') return json(res,200,{mode:'free-only',type,imageModels,models:imageModels,checkedAt:new Date().toISOString()});

  return json(res,200,{
    mode:'free-only',
    type:'all',
    videoModels,
    imageModels,
    checkedAt:new Date().toISOString()
  });
};
