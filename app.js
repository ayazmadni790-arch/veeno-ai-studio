const $ = id => document.getElementById(id);
const state = {
  videoModels: [], imageModels: [],
  selectedVideo: null, selectedImage: null,
  videoJob: null, pollTimer: null
};

function authHeaders() {
  const mode = sessionStorage.getItem('authMode') || 'owner';
  if (mode === 'byok') return { 'X-OpenRouter-Key': sessionStorage.getItem('byokKey') || '' };
  return { 'X-App-Access-Code': sessionStorage.getItem('accessCode') || '' };
}

async function api(path, options = {}) {
  const r = await fetch(path, { ...options, headers: { ...(options.headers || {}), ...authHeaders() } });
  const ct = r.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(body?.error || body?.message || body || `Request failed (${r.status})`);
  return body;
}

function setNotice(msg, type='') {
  const el = $('notice');
  el.textContent = msg;
  el.style.borderColor = type === 'bad' ? '#7f1d1d' : type === 'ok' ? '#14532d' : '';
}

function fillSelect(el, items, fallback='Auto') {
  el.innerHTML = '';
  if (!items || !items.length) {
    const o = document.createElement('option'); o.value=''; o.textContent=fallback; el.appendChild(o); return;
  }
  for (const v of items) {
    const o = document.createElement('option'); o.value = String(v); o.textContent = String(v); el.appendChild(o);
  }
}

function groupLabel(model) {
  return model.kind === 'video' ? 'Verified free video models' : 'Verified free image models';
}

function optionText(model) {
  return `${model.qualityLabel} · FREE · ${model.label}`;
}

function populateGroupedSelect(selectEl, models, selectedId, emptyText='No verified free model available') {
  selectEl.innerHTML = '';
  if (!models || !models.length) {
    const op = document.createElement('option');
    op.value = '';
    op.textContent = emptyText;
    op.selected = true;
    selectEl.appendChild(op);
    selectEl.disabled = true;
    return;
  }
  selectEl.disabled = false;
  const groups = new Map();
  for (const model of models) {
    const label = groupLabel(model);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(model);
  }
  for (const [label, items] of groups.entries()) {
    const og = document.createElement('optgroup');
    og.label = label;
    items.forEach(model => {
      const op = document.createElement('option');
      op.value = model.id;
      op.textContent = optionText(model);
      if (model.id === selectedId) op.selected = true;
      og.appendChild(op);
    });
    selectEl.appendChild(og);
  }
}

function modelInfoHTML(model) {
  if (!model) return '<div class="hint">No model selected.</div>';
  const priceState = 'FREE (verified zero-price in current catalog)';
  const capabilityBits = model.kind === 'video'
    ? [
        ['Quality', model.qualityLabel],
        ['Pricing', priceState],
        ['Durations', model.supported_durations?.join(', ') || 'Provider default'],
        ['Resolutions', model.supported_resolutions?.join(', ') || 'Provider default'],
        ['Aspect ratios', model.supported_aspect_ratios?.join(', ') || 'Provider default']
      ]
    : [
        ['Quality', model.qualityLabel],
        ['Pricing', priceState],
        ['Aspect ratios', model.supported_aspect_ratios?.join(', ') || 'auto'],
        ['Quality options', model.supported_quality?.join(', ') || 'auto'],
        ['Backgrounds', model.supported_background?.join(', ') || 'auto'],
        ['Reference image', model.supportsReferences ? 'Supported' : 'Not supported']
      ];
  return `
    <div class="line"><span>Model</span><span>${model.label}</span></div>
    ${capabilityBits.map(([k,v]) => `<div class="line"><span>${k}</span><span>${v}</span></div>`).join('')}
    <div class="line"><span>Status</span><span><span class="pill free">FREE</span></span></div>
    <div class="summary">${model.description || 'No description available.'}</div>
  `;
}

function updateVideoSelection() {
  const id = $('videoModel').value;
  state.selectedVideo = state.videoModels.find(m => m.id === id) || null;
  $('videoModelInfo').innerHTML = modelInfoHTML(state.selectedVideo);
  fillSelect($('videoDuration'), state.selectedVideo?.supported_durations, 'Provider default');
  fillSelect($('videoResolution'), state.selectedVideo?.supported_resolutions, 'Low / Fast');
  fillSelect($('videoAspect'), state.selectedVideo?.supported_aspect_ratios, 'Provider default');
  $('generateVideo').disabled = !state.selectedVideo;
}

function updateImageSelection() {
  const id = $('imageModel').value;
  state.selectedImage = state.imageModels.find(m => m.id === id) || null;
  $('imageModelInfo').innerHTML = modelInfoHTML(state.selectedImage);
  fillSelect($('imageAspect'), state.selectedImage?.supported_aspect_ratios, 'auto');
  fillSelect($('imageQuality'), state.selectedImage?.supported_quality, 'auto');
  fillSelect($('imageBackground'), state.selectedImage?.supported_background, 'auto');
  const counts = Array.from({ length: Math.max(1, state.selectedImage?.max_images || 1) }, (_, i) => i + 1);
  fillSelect($('imageCount'), counts, '1');
  $('generateImage').disabled = !state.selectedImage;
}

async function loadModels() {
  setNotice('Checking free video access on Hugging Face ZeroGPU…');
  try {
    const data = await api('/api/models?type=all');
    state.videoModels = (data.videoModels || []).filter(m => m.free);
    state.imageModels = (data.imageModels || []).filter(m => m.free);

    const preferredVideo = state.videoModels[0] || null;
    const preferredImage = state.imageModels[0] || null;

    populateGroupedSelect($('videoModel'), state.videoModels, preferredVideo?.id, 'No verified free video model available');
    populateGroupedSelect($('imageModel'), state.imageModels, preferredImage?.id, 'No verified free image model available');
    updateVideoSelection();
    updateImageSelection();

    const freeVideos = state.videoModels.length;
    const freeImages = state.imageModels.length;
    if (freeVideos > 0 || freeImages > 0) {
      setNotice(`Free AI is LIVE: ${freeVideos} video model / ${freeImages} image model available through Hugging Face ZeroGPU.`, 'ok');
    } else {
      setNotice('Hugging Face models are not available because HF_TOKEN is missing or the provider is unavailable.', 'bad');
    }
  } catch (e) {
    setNotice(e.message, 'bad');
  }
}

async function generateVideo() {
  if (!state.selectedVideo) return;
  const prompt = $('videoPrompt').value.trim();
  if (prompt.length < 3) return alert('Please enter a prompt.');

  $('generateVideo').disabled = true;
  $('generateVideo').textContent = 'Generating on free GPU…';
  $('videoJobEmpty').classList.add('hidden');
  $('videoJobBox').classList.remove('hidden');
  $('videoJobStatus').textContent = 'generating';
  $('videoJobId').textContent = 'Hugging Face ZeroGPU · LTX-2.3';
  $('videoJobMessage').textContent = 'Generating your video. Free ZeroGPU may queue during busy periods…';
  $('videoProgressBar').style.width = '58%';
  $('videoPreview').classList.add('hidden');
  $('videoDownload').classList.add('hidden');
  $('checkVideoNow').classList.add('hidden');

  try {
    const body = {
      model: state.selectedVideo.id,
      prompt,
      duration: Number($('videoDuration').value || 1),
      resolution: $('videoResolution').value || 'Low / Fast',
      aspect_ratio: $('videoAspect').value || '16:9'
    };

    const job = await api('/api/generate-video', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });

    state.videoJob = job;
    $('videoJobStatus').textContent = 'completed';
    $('videoJobId').textContent = `${job.model || 'LTX-2.3'} · seed ${job.seed ?? '-'}`;
    $('videoProgressBar').style.width = '100%';
    $('videoJobMessage').textContent = `${job.duration}s · ${job.aspect_ratio} · ${job.width}×${job.height} · native audio`;

    $('videoPreview').src = job.videoUrl;
    $('videoPreview').classList.remove('hidden');
    $('videoPreview').load();
    $('videoDownload').href = job.videoUrl;
    $('videoDownload').target = '_blank';
    $('videoDownload').classList.remove('hidden');
  } catch (e) {
    $('videoJobStatus').textContent = 'failed';
    $('videoProgressBar').style.width = '100%';
    $('videoJobMessage').textContent = e.message;
    alert(e.message);
  } finally {
    $('generateVideo').disabled = !state.selectedVideo;
    $('generateVideo').textContent = 'Generate free video';
  }
}

function showVideoJob(job) {
  $('videoJobEmpty').classList.add('hidden');
  $('videoJobBox').classList.remove('hidden');
  $('videoJobStatus').textContent = job.status || 'idle';
}

function updateVideoProgress() {}
async function checkVideoJob() {}
function startPolling() {}

async function generateImage() {
  if (!state.selectedImage) return;
  const prompt = $('imagePrompt').value.trim();
  if (prompt.length < 3) return alert('Please enter a prompt.');

  $('generateImage').disabled = true;
  $('generateImage').textContent = 'Generating on free GPU…';
  $('imageJobEmpty').classList.add('hidden');
  $('imageResults').classList.remove('hidden');
  $('imageResults').innerHTML = '<div class="empty">Generating image on Hugging Face ZeroGPU…</div>';
  $('imageJobStatus').textContent = 'generating';
  $('imageMessage').textContent = 'FLUX.1 Schnell is generating your image. Free ZeroGPU may queue during busy periods…';

  try {
    const body = {
      model: state.selectedImage.id,
      prompt,
      aspect_ratio: $('imageAspect').value || '1:1'
    };

    const resp = await api('/api/generate-image', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });

    $('imageResults').innerHTML = '';
    const card = document.createElement('div');
    card.className = 'image-card';
    card.innerHTML = `
      <img src="${resp.imageUrl}" alt="Generated image" />
      <div class="image-meta">
        <span>${resp.width}×${resp.height} · seed ${resp.seed ?? '-'}</span>
        <a class="button small" href="${resp.imageUrl}" target="_blank" rel="noopener">Open / Download</a>
      </div>
    `;
    $('imageResults').appendChild(card);
    $('imageJobStatus').textContent = 'completed';
    $('imageMessage').textContent = `FLUX.1 Schnell · ${resp.aspect_ratio} · 4 steps · FREE ZeroGPU`;
  } catch (e) {
    $('imageJobStatus').textContent = 'failed';
    $('imageResults').innerHTML = '<div class="empty">Image generation failed.</div>';
    $('imageMessage').textContent = e.message;
    alert(e.message);
  } finally {
    $('generateImage').disabled = !state.selectedImage;
    $('generateImage').textContent = 'Generate free image';
  }
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tabpanel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
    });
  });
}

$('videoModel').addEventListener('change', updateVideoSelection);
$('imageModel').addEventListener('change', updateImageSelection);
$('generateVideo').addEventListener('click', generateVideo);
$('generateImage').addEventListener('click', generateImage);
$('checkVideoNow').addEventListener('click', checkVideoJob);
$('refreshAll').addEventListener('click', loadModels);
$('settingsBtn').addEventListener('click', () => $('settingsDialog').showModal());
$('authMode').addEventListener('change', () => {
  const byok = $('authMode').value === 'byok';
  $('byokFields').classList.toggle('hidden', !byok);
  $('ownerFields').classList.toggle('hidden', byok);
});
$('saveSettings').addEventListener('click', (e) => {
  e.preventDefault();
  sessionStorage.setItem('authMode', $('authMode').value);
  sessionStorage.setItem('accessCode', $('accessCode').value);
  sessionStorage.setItem('byokKey', $('byokKey').value);
  $('settingsDialog').close();
  loadModels();
});

(function init(){
  const mode = sessionStorage.getItem('authMode') || 'owner';
  $('authMode').value = mode;
  $('accessCode').value = sessionStorage.getItem('accessCode') || '';
  $('byokKey').value = sessionStorage.getItem('byokKey') || '';
  $('authMode').dispatchEvent(new Event('change'));
  initTabs();
  localStorage.removeItem('veenoLastVideoJob');
  loadModels();
})();
