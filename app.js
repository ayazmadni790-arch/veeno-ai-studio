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
  fillSelect($('videoResolution'), state.selectedVideo?.supported_resolutions, 'Provider default');
  fillSelect($('videoAspect'), state.selectedVideo?.supported_aspect_ratios, 'Provider default');
  $('generateVideo').disabled = !state.selectedVideo || !state.selectedVideo.free;
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
  $('generateImage').disabled = !state.selectedImage || !state.selectedImage.free;
}

async function loadModels() {
  setNotice('Loading live model catalogs from OpenRouter…');
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

    const freeVideos = state.videoModels.filter(m => m.free).length;
    const freeImages = state.imageModels.filter(m => m.free).length;
    if (freeVideos === 0 && freeImages === 0) {
      setNotice('No verified free OpenRouter video or image generation model is available right now. Paid models are hidden completely.', 'bad');
    } else {
      setNotice(`Verified free models available now: ${freeVideos} video / ${freeImages} image. Paid models are hidden completely.`, 'ok');
    }
  } catch (e) {
    setNotice(e.message, 'bad');
  }
}

async function generateVideo() {
  if (!state.selectedVideo) return;
  if (!state.selectedVideo.free) return alert('This selected video model is premium/paid. This build currently allows free models only.');
  const prompt = $('videoPrompt').value.trim();
  if (prompt.length < 3) return alert('Please enter a prompt.');

  $('generateVideo').disabled = true;
  $('generateVideo').textContent = 'Submitting…';
  try {
    const body = {
      model: state.selectedVideo.id,
      prompt,
      duration: $('videoDuration').value ? Number($('videoDuration').value) : undefined,
      resolution: $('videoResolution').value || undefined,
      aspect_ratio: $('videoAspect').value || undefined,
      generate_audio: $('videoAudio').value === 'true',
      first_frame_url: $('videoFirstFrame').value.trim() || undefined,
      reference_image_url: $('videoReferenceImage').value.trim() || undefined
    };
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
    const job = await api('/api/generate-video', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    state.videoJob = job;
    localStorage.setItem('veenoLastVideoJob', JSON.stringify({ id: job.id, model: state.selectedVideo.id, at: Date.now() }));
    showVideoJob(job);
    startPolling();
  } catch (e) {
    alert(e.message);
  } finally {
    $('generateVideo').disabled = !state.selectedVideo?.free;
    $('generateVideo').textContent = 'Generate video';
  }
}

function showVideoJob(job) {
  $('videoJobEmpty').classList.add('hidden');
  $('videoJobBox').classList.remove('hidden');
  $('videoJobStatus').textContent = job.status || 'pending';
  $('videoJobId').textContent = job.id || '';
  $('videoJobMessage').textContent = 'Video jobs can take from around 30 seconds to several minutes.';
  $('checkVideoNow').classList.remove('hidden');
  updateVideoProgress(job.status);
}

function updateVideoProgress(status) {
  const width = { pending:'18%', in_progress:'58%', completed:'100%', failed:'100%', cancelled:'100%', expired:'100%' }[status] || '10%';
  $('videoProgressBar').style.width = width;
}

async function checkVideoJob() {
  if (!state.videoJob?.id) return;
  try {
    const job = await api('/api/status?id=' + encodeURIComponent(state.videoJob.id));
    state.videoJob = job;
    $('videoJobStatus').textContent = job.status;
    updateVideoProgress(job.status);
    if (job.status === 'completed') {
      clearInterval(state.pollTimer); state.pollTimer = null;
      const src = '/api/content?id=' + encodeURIComponent(job.id) + '&index=0';
      $('videoPreview').src = src;
      $('videoPreview').classList.remove('hidden');
      $('videoDownload').href = src;
      $('videoDownload').classList.remove('hidden');
      $('checkVideoNow').classList.add('hidden');
      $('videoJobMessage').textContent = `Completed${job.usage?.cost != null ? ` · reported cost: $${job.usage.cost}` : ''}`;
    } else if (['failed','cancelled','expired'].includes(job.status)) {
      clearInterval(state.pollTimer); state.pollTimer = null;
      $('videoJobMessage').textContent = job.error || `Job ${job.status}.`;
    }
  } catch (e) {
    $('videoJobMessage').textContent = 'Status check: ' + e.message;
  }
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  checkVideoJob();
  state.pollTimer = setInterval(checkVideoJob, 30000);
}

function dataUrlFromImage(item) {
  const media = item?.media_type || 'image/png';
  return `data:${media};base64,${item?.b64_json || ''}`;
}

async function generateImage() {
  if (!state.selectedImage) return;
  if (!state.selectedImage.free) return alert('This selected image model is premium/paid. This build currently allows free models only.');
  const prompt = $('imagePrompt').value.trim();
  if (prompt.length < 3) return alert('Please enter a prompt.');

  $('generateImage').disabled = true;
  $('generateImage').textContent = 'Generating…';
  $('imageJobStatus').textContent = 'running';
  $('imageMessage').textContent = '';

  try {
    const body = {
      model: state.selectedImage.id,
      prompt,
      aspect_ratio: $('imageAspect').value || undefined,
      quality: $('imageQuality').value || undefined,
      background: $('imageBackground').value || undefined,
      n: $('imageCount').value ? Number($('imageCount').value) : 1,
      reference_image_url: $('imageReferenceUrl').value.trim() || undefined
    };
    Object.keys(body).forEach(k => body[k] === undefined && delete body[k]);
    const resp = await api('/api/generate-image', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    renderImageResults(resp.data || []);
    $('imageJobStatus').textContent = 'completed';
    $('imageMessage').textContent = `Generated ${resp.data?.length || 0} image(s)${resp.usage?.cost != null ? ` · reported cost: $${resp.usage.cost}` : ''}.`;
  } catch (e) {
    $('imageJobStatus').textContent = 'failed';
    $('imageMessage').textContent = e.message;
    alert(e.message);
  } finally {
    $('generateImage').disabled = !state.selectedImage?.free;
    $('generateImage').textContent = 'Generate image';
  }
}

function renderImageResults(items) {
  $('imageJobEmpty').classList.add('hidden');
  const box = $('imageResults');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<div class="empty">No image data returned.</div>';
  } else {
    items.forEach((item, idx) => {
      const url = dataUrlFromImage(item);
      const ext = (item.media_type || 'image/png').includes('svg') ? 'svg' : (item.media_type || 'image/png').split('/')[1] || 'png';
      const card = document.createElement('div');
      card.className = 'image-card';
      card.innerHTML = `
        <img src="${url}" alt="Generated image ${idx + 1}" />
        <div class="image-meta">
          <span>Image ${idx + 1}</span>
          <a class="button small" href="${url}" download="veeno-image-${idx + 1}.${ext}">Download</a>
        </div>
      `;
      box.appendChild(card);
    });
  }
  box.classList.remove('hidden');
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
  const last = localStorage.getItem('veenoLastVideoJob');
  if (last) {
    try {
      const j = JSON.parse(last);
      state.videoJob = { id: j.id, status: 'pending' };
      showVideoJob(state.videoJob);
    } catch {}
  }
  loadModels();
})();
