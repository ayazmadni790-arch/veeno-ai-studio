const $ = id => document.getElementById(id);

const state = {
  videoModels: [],
  imageModels: [],
  selectedImage: null,
  videoMode: 'text-to-video',
  videoUrl: '',
  imageUrl: ''
};

function authHeaders() {
  return { 'X-App-Access-Code': sessionStorage.getItem('accessCode') || '' };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() }
  });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || body?.message || body || `Request failed (${response.status})`);
  return body;
}

function setNotice(message, type='') {
  const el = $('notice');
  el.textContent = message;
  el.style.borderColor = type === 'bad' ? 'rgba(255,93,122,.38)' : type === 'ok' ? 'rgba(54,228,155,.3)' : '';
}

function fillSelect(el, values, fallback='Auto') {
  el.innerHTML = '';
  const list = values?.length ? values : [fallback];
  for (const value of list) {
    const op = document.createElement('option');
    op.value = String(value);
    op.textContent = String(value);
    el.appendChild(op);
  }
}

async function loadModels() {
  try {
    const data = await api('/api/models?type=all');
    state.videoModels = data.videoModels || [];
    state.imageModels = data.imageModels || [];

    if (state.imageModels.length) {
      $('imageModel').innerHTML = '';
      state.imageModels.forEach(model => {
        const op = document.createElement('option');
        op.value = model.id;
        op.textContent = `${model.label} · FREE`;
        $('imageModel').appendChild(op);
      });
      state.selectedImage = state.imageModels[0];
      fillSelect($('imageAspect'), state.selectedImage.supported_aspect_ratios, '1:1');
      fillSelect($('imageQuality'), state.selectedImage.supported_quality, '4-step Fast');
      $('generateImage').disabled = false;
    } else {
      $('imageModel').innerHTML = '<option>No free image model available</option>';
      $('generateImage').disabled = true;
    }

    setNotice(
      state.videoModels.length && state.imageModels.length
        ? 'Video + Image generation are online and ready.'
        : 'One or more free engines are currently unavailable.',
      state.videoModels.length && state.imageModels.length ? 'ok' : 'bad'
    );
  } catch (error) {
    setNotice(error.message, 'bad');
  }
}

function setVideoMode(mode) {
  state.videoMode = mode;
  const imageMode = mode === 'image-to-video';
  $('textToVideoBtn').classList.toggle('active', !imageMode);
  $('imageToVideoBtn').classList.toggle('active', imageMode);
  $('imageUploadBlock').classList.toggle('hidden', !imageMode);
}

function fileToDataUrl(file) {
  return new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

$('videoInputImage').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('Please choose an image file.');
  if (file.size > 3 * 1024 * 1024) return alert('Please choose an image under 3 MB.');
  const url = URL.createObjectURL(file);
  $('inputImagePreview').src = url;
  $('inputImagePreview').classList.remove('hidden');
  $('uploadIdle').classList.add('hidden');
});

async function generateVideo() {
  const prompt = $('videoPrompt').value.trim();
  if (prompt.length < 3) return alert('Please enter a video prompt.');

  let imageData = null;
  if (state.videoMode === 'image-to-video') {
    const file = $('videoInputImage').files?.[0];
    if (!file) return alert('Please upload an image for Image to Video.');
    imageData = await fileToDataUrl(file);
  }

  $('generateVideo').disabled = true;
  $('generateVideo').textContent = 'Generating…';
  $('videoJobEmpty').classList.add('hidden');
  $('videoJobBox').classList.remove('hidden');
  $('videoJobStatus').textContent = 'generating';
  $('videoProgressBar').style.width = '62%';
  $('videoJobId').textContent = 'Hugging Face ZeroGPU · LTX-2.3';
  $('videoJobMessage').textContent = 'Creating your video. Free GPU queues can take a little longer at busy times.';
  $('videoPreview').classList.add('hidden');
  $('videoDownload').classList.add('hidden');

  try {
    const result = await api('/api/generate-video', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        prompt,
        preset:$('videoPreset').value,
        mode:state.videoMode,
        duration:Number($('videoDuration').value),
        aspect_ratio:$('videoAspect').value,
        image_data:imageData
      })
    });

    state.videoUrl = result.videoUrl;
    $('videoJobStatus').textContent = 'completed';
    $('videoProgressBar').style.width = '100%';
    $('videoJobId').textContent = `${result.mode === 'image-to-video' ? 'Image to Video' : 'Text to Video'} · ${result.duration}s · seed ${result.seed}`;
    $('videoJobMessage').textContent = `${result.width}×${result.height} · native audio · preset ${result.preset}`;
    $('videoPreview').src = result.videoUrl;
    $('videoPreview').classList.remove('hidden');
    $('videoPreview').load();
    $('videoDownload').classList.remove('hidden');
  } catch (error) {
    $('videoJobStatus').textContent = 'failed';
    $('videoProgressBar').style.width = '100%';
    $('videoJobMessage').textContent = error.message;
    alert(error.message);
  } finally {
    $('generateVideo').disabled = false;
    $('generateVideo').textContent = 'Generate Video';
  }
}

async function generateImage() {
  if (!state.selectedImage) return;
  const prompt = $('imagePrompt').value.trim();
  if (prompt.length < 3) return alert('Please enter an image prompt.');

  $('generateImage').disabled = true;
  $('generateImage').textContent = 'Generating…';
  $('imageJobEmpty').classList.add('hidden');
  $('imageResults').classList.remove('hidden');
  $('imageResults').innerHTML = '<div class="empty-state"><div class="orb-icon">✦</div><p>Generating image…</p></div>';
  $('imageJobStatus').textContent = 'generating';
  $('imageMessage').textContent = 'FLUX.1 Schnell is creating your image on free ZeroGPU.';

  try {
    const result = await api('/api/generate-image', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        prompt,
        aspect_ratio:$('imageAspect').value || '1:1'
      })
    });

    state.imageUrl = result.imageUrl;
    $('imageResults').innerHTML = `
      <div class="image-card">
        <img src="${result.imageUrl}" alt="Generated image">
        <div class="image-meta">
          <span>${result.width}×${result.height} · seed ${result.seed}</span>
          <button id="imageDownloadBtn" class="btn btn-download" type="button">Download Image</button>
        </div>
      </div>
    `;
    $('imageJobStatus').textContent = 'completed';
    $('imageMessage').textContent = 'FLUX.1 Schnell · 4-step generation · FREE ZeroGPU';
    $('imageDownloadBtn').addEventListener('click', () => downloadFile(state.imageUrl, 'veeno-ai-image.webp'));
  } catch (error) {
    $('imageJobStatus').textContent = 'failed';
    $('imageResults').innerHTML = '';
    $('imageMessage').textContent = error.message;
    alert(error.message);
  } finally {
    $('generateImage').disabled = false;
    $('generateImage').textContent = 'Generate Image';
  }
}

async function downloadFile(sourceUrl, filename) {
  if (!sourceUrl) return;
  const url = `/api/download?url=${encodeURIComponent(sourceUrl)}&filename=${encodeURIComponent(filename)}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tabpanel').forEach(x => x.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');
    });
  });
}

$('textToVideoBtn').addEventListener('click', () => setVideoMode('text-to-video'));
$('imageToVideoBtn').addEventListener('click', () => setVideoMode('image-to-video'));
$('generateVideo').addEventListener('click', generateVideo);
$('generateImage').addEventListener('click', generateImage);
$('videoDownload').addEventListener('click', () => downloadFile(state.videoUrl, 'veeno-ai-video.mp4'));
$('refreshAll').addEventListener('click', loadModels);
$('settingsBtn').addEventListener('click', () => $('settingsDialog').showModal());
$('saveSettings').addEventListener('click', e => {
  e.preventDefault();
  sessionStorage.setItem('accessCode', $('accessCode').value);
  $('settingsDialog').close();
  loadModels();
});

(function init(){
  $('accessCode').value = sessionStorage.getItem('accessCode') || '';
  initTabs();
  setVideoMode('text-to-video');
  loadModels();
})();
