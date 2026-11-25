'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const categories = { character: 'Character motion', multi: 'Multi-object', perspective: 'Perspective' };
const methodNames = { sparse: 'Ours · Sparse', dense: 'Ours · Dense', multikey: 'Ours · Multi-key', 'full-keyframes': 'Full model', keyframes: 'Wan2.1', anime: 'AnimeInbet', fcvg: 'FCVG', film: 'FILM', framer: 'Framer', layer: 'LayerInbet', ski: 'SKI', toon: 'ToonCrafter', tps: 'TPS', endpoints: 'Without trajectory', no_bidir: 'Without bidirectional transport', noste: 'Without STE', linear: 'Linear trajectory', oracle: 'Tracking trajectory', gt: 'Ground truth' };
const ablationNotes = { endpoints: 'Without trajectory guidance: compare the motion and line structures with the full model.', no_bidir: 'Without bidirectional feature transport: compare how endpoint details persist through the sequence.', noste: 'Without the straight-through estimator (STE): inspect the effect of removing this training component.', linear: 'Linear trajectory: compare straight, constant-speed motion paths with learned motion correspondence.', oracle: 'Tracking trajectory: compare the supplied tracking-based trajectory variant with the learned trajectories.', gt: 'Ground truth: the supplied reference animation, aligned by normalized time.' };
const groups = new Set();
let manifest;
let inspector;
let galleryFilter = 'all';
let galleryLimit = 9;
let galleryObserver;
let scrub;
const automaticVideos = new Set();
const inViewVideos = new Set();
const mediaObserver = new IntersectionObserver(entries => {
  entries.forEach(({ target, isIntersecting }) => {
    if (isIntersecting) ensureSource(target);
  });
}, { rootMargin: '250px' });
const autoplayObserver = new IntersectionObserver(entries => {
  entries.forEach(({ target: video, isIntersecting, intersectionRatio }) => {
    if (isIntersecting && intersectionRatio > 0.15) {
      inViewVideos.add(video);
      ensureSource(video);
      if (!reducedMotion.matches && !document.hidden && !$('#case-dialog').open) video.play().catch(() => {});
    } else {
      inViewVideos.delete(video);
      video.pause();
    }
  });
}, { threshold: [0, 0.15, 0.4] });

function ensureSource(video) {
  if (video.dataset.src && !video.getAttribute('src')) {
    video.src = video.dataset.src;
    video.load();
  }
}
function setAutoplay(video) {
  automaticVideos.add(video);
  autoplayObserver.observe(video);
}
function videoNode(data, poster, label) {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = 'metadata';
  video.dataset.src = data.src;
  video.poster = poster;
  video.setAttribute('aria-label', label);
  video.addEventListener('error', () => video.parentElement?.classList.add('video-failed'));
  mediaObserver.observe(video);
  return video;
}
function panel(data, poster, name, ours = false) {
  const figure = document.createElement('figure');
  figure.className = `video-panel${ours ? ' ours' : ''}`;
  figure.append(videoNode(data, poster, name));
  const caption = document.createElement('figcaption');
  const title = document.createElement('span');
  title.textContent = name;
  const info = document.createElement('span');
  info.className = 'mono';
  info.textContent = `${data.frames} FRAMES`;
  caption.append(title, info);
  figure.append(caption);
  return figure;
}
function discardVideos(root) {
  $$('video', root).forEach(video => {
    video.pause();
    autoplayObserver.unobserve(video);
    mediaObserver.unobserve(video);
    automaticVideos.delete(video);
    inViewVideos.delete(video);
    video.removeAttribute('src');
    video.load();
  });
}
function option(select, value, text) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = text;
  select.append(opt);
}
function inputImages(container, scene) {
  container.replaceChildren();
  ['first', 'last'].forEach(key => {
    const image = new Image();
    image.src = scene[key];
    image.alt = `${key === 'first' ? 'First' : 'Last'} input sketch`;
    const label = document.createElement('span');
    label.textContent = `${key === 'first' ? 'First' : 'Last'} sketch`;
    container.append(image, label);
  });
}

// One normalized clock drives every comparison, including clips of different lengths.
class SynchronizedPlayer {
  constructor(videos, button, range, time, speed = 1) {
    this.videos = videos;
    this.button = button;
    this.range = range;
    this.time = time;
    this.speed = speed;
    this.progress = 0;
    this.playing = false;
    this.cycle = Math.max(...videos.map(v => Number(v.dataset.duration) || 4));
    this.cleanups = [];
    this.listen(button, 'click', () => this.playing ? this.pause() : this.play());
    this.listen(range, 'input', () => { this.pause(); this.seek(Number(range.value) / 1000); });
    const root = button.closest('section') || $('#case-dialog');
    this.observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) this.pause();
    });
    this.observer.observe(root);
    videos.forEach(video => {
      this.listen(video, 'loadedmetadata', () => this.seekVideo(video));
      this.listen(video, 'error', () => this.pause());
    });
    groups.add(this);
    this.updateUI();
  }
  listen(target, event, callback) {
    target.addEventListener(event, callback);
    this.cleanups.push(() => target.removeEventListener(event, callback));
  }
  seekVideo(video) {
    if (Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = Math.min(this.progress * video.duration, Math.max(0, video.duration - 0.001));
    }
  }
  seek(progress) {
    this.progress = Math.max(0, Math.min(1, progress));
    this.videos.forEach(video => { ensureSource(video); this.seekVideo(video); });
    this.updateUI();
  }
  updateUI() {
    this.button.textContent = this.playing ? 'Pause together' : 'Play together';
    this.button.setAttribute('aria-pressed', String(this.playing));
    this.range.value = Math.round(this.progress * 1000);
    this.time.textContent = `${Math.round(this.progress * 100)}%`;
  }
  async play() {
    if (this.playing) return;
    if (this.progress >= 0.999) this.progress = 0;
    this.playing = true;
    const generation = this.generation = (this.generation || 0) + 1;
    this.updateUI();
    const ready = this.videos.map(video => {
      ensureSource(video);
      if (video.readyState >= 2 || video.error) return Promise.resolve();
      return new Promise(resolve => {
        const finish = () => { video.removeEventListener('loadeddata', finish); video.removeEventListener('error', finish); resolve(); };
        video.addEventListener('loadeddata', finish, { once: true });
        video.addEventListener('error', finish, { once: true });
      });
    });
    await Promise.all(ready);
    if (!this.playing || generation !== this.generation) return;
    this.videos.forEach(video => {
      if (!video.error && Number.isFinite(video.duration)) {
        this.seekVideo(video);
        video.playbackRate = Math.max(0.0625, Math.min(16, video.duration / this.cycle * this.speed));
        video.play().catch(() => this.pause());
      }
    });
    this.startedAt = performance.now() - this.progress * this.cycle * 1000 / this.speed;
    this.lastSync = 0;
    const tick = now => {
      if (!this.playing) return;
      this.progress = ((now - this.startedAt) * this.speed / (this.cycle * 1000)) % 1;
      // Correct browser drift while leaving native decoders free to play smoothly.
      if (now - this.lastSync > 300) {
        this.videos.forEach(video => {
          if (Number.isFinite(video.duration) && Math.abs(video.currentTime - this.progress * video.duration) > 0.14) this.seekVideo(video);
        });
        this.lastSync = now;
      }
      this.updateUI();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  pause() {
    this.playing = false;
    this.generation = (this.generation || 0) + 1;
    cancelAnimationFrame(this.raf);
    this.videos.forEach(video => video.pause());
    this.updateUI();
  }
  setSpeed(speed) {
    const wasPlaying = this.playing;
    this.pause();
    this.speed = speed;
    if (wasPlaying) this.play();
  }
  destroy() {
    this.pause();
    this.cleanups.forEach(fn => fn());
    this.observer.disconnect();
    groups.delete(this);
  }
}
function createPlayer(root, scene, keys, prefix) {
  root.replaceChildren();
  keys.forEach(key => root.append(panel(scene.videos[key], scene.first, methodNames[key] || key, ['sparse', 'dense', 'full-keyframes'].includes(key))));
  const videos = $$('video', root);
  videos.forEach((v, i) => v.dataset.duration = scene.videos[keys[i]].duration);
  return new SynchronizedPlayer(videos, $(`#${prefix}-play`), $(`#${prefix}-range`), $(`#${prefix}-time`), prefix === 'comparison' ? Number($('#comparison-speed').value) : 1);
}

function initScrub() {
  const scenes = ['case18', 'case12', 'multi_object6'].map(id => manifest.show.find(item => item.id === id));
  const canvas = $('#scrub-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const range = $('#scrub-range');
  const caches = new Map();
  let active;
  let images = [];
  let frame = 0;
  let playing = false;
  let playRAF;
  let lastDraw = -1;
  function stop() {
    playing = false;
    cancelAnimationFrame(playRAF);
    $('#scrub-play').textContent = 'Play sequence';
    $('#scrub-play').setAttribute('aria-pressed', 'false');
  }
  function draw(index) {
    frame = Math.max(0, Math.min(images.length - 1, index));
    let drawable = images[frame];
    if (!drawable?.complete || !drawable.naturalWidth) drawable = images.find(im => im.complete && im.naturalWidth);
    if (drawable && (lastDraw !== frame || drawable !== images[frame])) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / drawable.naturalWidth, canvas.height / drawable.naturalHeight);
      const w = drawable.naturalWidth * scale, h = drawable.naturalHeight * scale;
      ctx.drawImage(drawable, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      lastDraw = drawable === images[frame] ? frame : -1;
    }
    range.value = frame;
    $('#frame-counter').textContent = `FRAME ${String(frame + 1).padStart(2, '0')} / ${images.length}`;
    $('.timeline-fill').style.width = `${100 * frame / Math.max(1, images.length - 1)}%`;
  }
  function change(scene) {
    stop(); active = scene; lastDraw = -1;
    $('#scrub-first').src = scene.first;
    $('#scrub-last').src = scene.last;
    const loader = $('#scrub-loading');
    loader.hidden = false;
    loader.textContent = 'Loading frames…';
    $$('#scroll-cases button').forEach(b => {
      b.classList.toggle('active', b.dataset.scene === scene.id);
      b.setAttribute('aria-pressed', String(b.dataset.scene === scene.id));
    });
    if (!caches.has(scene.id)) {
      const loaded = scene.scrollFrames.map(src => {
        const image = new Image();
        image.onload = () => {
          if (active.id === scene.id) { loader.hidden = true; lastDraw = -1; draw(frame); }
        };
        image.onerror = () => {
          if (active.id === scene.id && !images.some(im => im.complete && im.naturalWidth)) loader.textContent = 'Frames unavailable. Try another scene.';
        };
        image.src = src;
        return image;
      });
      caches.set(scene.id, loaded);
    }
    images = caches.get(scene.id);
    range.max = images.length - 1;
    if (images.some(im => im.complete && im.naturalWidth)) loader.hidden = true;
    draw(0);
  }
  const labels = ['Expression', 'Gesture', 'Together'];
  scenes.forEach((scene, i) => {
    const button = document.createElement('button');
    button.textContent = labels[i]; button.dataset.scene = scene.id;
    button.addEventListener('click', () => change(scene));
    $('#scroll-cases').append(button);
  });
  range.addEventListener('input', () => { stop(); draw(Number(range.value)); });
  $('#scrub-play').addEventListener('click', () => {
    if (playing) return stop();
    playing = true;
    $('#scrub-play').textContent = 'Pause sequence';
    $('#scrub-play').setAttribute('aria-pressed', 'true');
    const start = performance.now() - frame / 12 * 1000;
    const tick = now => {
      if (!playing) return;
      draw(Math.floor((now - start) / 1000 * 12) % images.length);
      playRAF = requestAnimationFrame(tick);
    };
    playRAF = requestAnimationFrame(tick);
  });
  const experienceObserver = new IntersectionObserver(entries => { if (!entries[0].isIntersecting) stop(); });
  experienceObserver.observe($('#experience'));
  scrub = {
    update() {
      if (reducedMotion.matches) return;
      const rect = $('#experience').getBoundingClientRect();
      const header = $('.site-header').offsetHeight;
      const travel = rect.height - (window.innerHeight - header);
      const progress = Math.max(0, Math.min(1, (header - rect.top) / travel));
      if (rect.top < window.innerHeight && rect.bottom > header) { stop(); draw(Math.round(progress * (images.length - 1))); }
    }, stop
  };
  change(scenes[0]);
}

function renderGallery() {
  const root = $('#gallery-grid');
  discardVideos(root);
  const priority = ['case18', 'case12', 'multi_object6', '3d_case3', 'case8', 'multi_object8', 'case19', '3d_case2', 'multi_obejct4'];
  const sorted = [...manifest.show].sort((a, b) => {
    const ai = priority.indexOf(a.id), bi = priority.indexOf(b.id);
    return (ai < 0 ? 100 : ai) - (bi < 0 ? 100 : bi);
  });
  const items = sorted.filter(item => galleryFilter === 'all' || item.category === galleryFilter);
  root.replaceChildren();
  items.slice(0, galleryLimit).forEach(scene => {
    const card = document.createElement('button');
    card.className = 'case-card';
    card.setAttribute('aria-label', `Inspect ${scene.title}`);
    const media = document.createElement('span');
    media.className = 'case-media';
    const video = videoNode(scene.videos[scene.primary], scene.poster, scene.title);
    setAutoplay(video);
    const badge = document.createElement('span');
    badge.className = 'case-badge'; badge.textContent = categories[scene.category];
    const open = document.createElement('span'); open.className = 'case-open'; open.textContent = '+'; open.setAttribute('aria-hidden', 'true');
    media.append(video, badge, open);
    const caption = document.createElement('span'); caption.className = 'case-caption';
    const name = document.createElement('h3'); name.textContent = scene.title;
    const info = document.createElement('span'); info.className = 'mono'; info.textContent = `${scene.videos[scene.primary].frames} FRAMES`;
    caption.append(name, info); card.append(media, caption);
    card.addEventListener('click', () => showCase(scene));
    root.append(card);
  });
  $('#all-count').textContent = manifest.show.length;
  $('#gallery-count').textContent = `${Math.min(items.length, galleryLimit)} / ${items.length} CASES`;
  const remain = Math.max(0, items.length - galleryLimit);
  $('#remaining-count').textContent = `+${remain}`;
  $('#load-more').hidden = remain === 0;
  $('#load-more').style.display = remain ? '' : 'none';
  $$('#gallery-filters button').forEach(button => {
    button.classList.toggle('active', button.dataset.filter === galleryFilter);
    button.setAttribute('aria-pressed', String(button.dataset.filter === galleryFilter));
  });
}

function pauseBackground() {
  automaticVideos.forEach(v => v.pause());
  groups.forEach(g => g.pause());
  scrub?.stop();
}
function openDialog() {
  pauseBackground();
  $('#case-dialog').showModal();
  document.body.classList.add('dialog-open');
}
function showCase(scene) {
  const root = $('#dialog-content');
  root.replaceChildren();
  const title = document.createElement('h2'); title.className = 'dialog-title'; title.textContent = scene.title;
  const subtitle = document.createElement('p'); subtitle.className = 'dialog-subtitle'; subtitle.textContent = `${categories[scene.category]} · ${scene.id} · Playback aligned by normalized time`;
  const inputs = document.createElement('div'); inputs.className = 'inspector-inputs';
  ['first', 'last'].forEach(key => {
    const figure = document.createElement('figure'); const image = new Image(); image.src = scene[key]; image.alt = `${key} input sketch`;
    const caption = document.createElement('figcaption'); caption.textContent = `${key === 'first' ? 'First' : 'Last'} sketch · Input`;
    figure.append(image, caption); inputs.append(figure);
  });
  const variants = Object.keys(scene.videos).filter(k => k !== scene.gt);
  let variant = scene.primary;
  const grid = document.createElement('div'); grid.className = 'inspector-grid';
  const transport = document.createElement('div'); transport.className = 'transport';
  transport.innerHTML = '<button class="pill light">Play together</button><input type="range" min="0" max="1000" value="0" aria-label="Inspector timeline"><span class="mono">0%</span>';
  function render() {
    inspector?.destroy(); discardVideos(grid); grid.replaceChildren();
    const keys = [variant, ...(scene.gt ? [scene.gt] : [])];
    keys.forEach(key => grid.append(panel(scene.videos[key], scene.first, key === scene.gt ? 'Ground truth' : 'Ours · Generated result', key !== scene.gt)));
    const videos = $$('video', grid);
    videos.forEach((v, i) => { v.dataset.duration = scene.videos[keys[i]].duration; ensureSource(v); });
    inspector = new SynchronizedPlayer(videos, $('button', transport), $('input', transport), $('span', transport));
  }
  root.append(title, subtitle, inputs);
  if (variants.length > 1) {
    const label = document.createElement('label'); label.className = 'inspector-variants'; label.append('Result variant');
    const select = document.createElement('select'); select.setAttribute('aria-label', 'Result variant');
    variants.forEach(key => option(select, key, /multikey/.test(key) ? 'Multi-key' : /dense/.test(key) ? 'Dense' : /sparse/.test(key) ? 'Sparse' : key));
    select.value = variant; select.addEventListener('change', () => { variant = select.value; render(); });
    label.append(select); root.append(label);
  }
  root.append(grid, transport);
  const note = document.createElement('p'); note.className = 'experiment-note'; note.textContent = 'Ground truth is the reference clip supplied with this case. The generated sequence may contain a different number of frames.'; root.append(note);
  openDialog(); render();
}
function initDialog() {
  const dialog = $('#case-dialog');
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    inspector?.destroy(); inspector = null;
    discardVideos($('#dialog-content'));
    document.body.classList.remove('dialog-open');
    if (!reducedMotion.matches && !document.hidden) inViewVideos.forEach(v => v.play().catch(() => {}));
  });
  $('#open-diagram').addEventListener('click', () => {
    const root = $('#dialog-content'); root.replaceChildren();
    const image = new Image(); image.src = 'assets/fig_framework.webp'; image.alt = 'Full method architecture'; image.className = 'dialog-diagram';
    root.append(image); openDialog();
  });
}
function initComparison() {
  const select = $('#comparison-scene');
  manifest.comparison.forEach((scene, index) => option(select, scene.id, `Scene ${String(index + 1).padStart(2, '0')} · ${scene.id.split('-')[1].replaceAll('_', ' ')}`));
  let player;
  function render() {
    player?.destroy(); discardVideos($('#compare-grid'));
    const scene = manifest.comparison.find(s => s.id === select.value);
    inputImages($('#comparison-inputs'), scene);
    const keys = ['sparse', 'dense', 'anime', 'fcvg', 'film', 'framer', 'layer', 'ski', 'toon', 'tps', 'keyframes'].filter(key => scene.videos[key]);
    player = createPlayer($('#compare-grid'), scene, keys, 'comparison');
  }
  select.addEventListener('change', render);
  $('#comparison-speed').addEventListener('change', () => player.setSpeed(Number($('#comparison-speed').value)));
  $('#comparison-reset').addEventListener('click', () => { player.pause(); player.seek(0); });
  render();
}
function initAblation() {
  const select = $('#ablation-scene'), variant = $('#ablation-variant');
  const scenes = [...manifest.ablation].sort((a, b) => b.id.startsWith('ablation') - a.id.startsWith('ablation') || a.id.localeCompare(b.id, undefined, { numeric: true }));
  scenes.forEach((scene, index) => option(select, scene.id, `Scene ${String(index + 1).padStart(2, '0')} · ${scene.id.replaceAll('_', ' ')}`));
  let player;
  function render(rebuildVariants = true) {
    player?.destroy(); discardVideos($('#ablation-grid'));
    const scene = scenes.find(s => s.id === select.value);
    const full = scene.videos['full-keyframes'] ? 'full-keyframes' : 'dense';
    if (rebuildVariants) {
      const previous = variant.value; variant.replaceChildren();
      ['linear', 'endpoints', 'no_bidir', 'noste', 'oracle', 'gt'].filter(k => scene.videos[k]).forEach(k => option(variant, k, methodNames[k]));
      if (scene.videos[previous] && previous !== full) variant.value = previous;
    }
    player = createPlayer($('#ablation-grid'), scene, [variant.value, full], 'ablation');
    const caption = $('#ablation-grid .ours figcaption>span'); if (caption) caption.textContent = 'Ours · Full model';
    $('#ablation-explanation').textContent = ablationNotes[variant.value] || '';
  }
  select.addEventListener('change', () => render()); variant.addEventListener('change', () => render(false));
  $('#ablation-reset').addEventListener('click', () => { player.pause(); player.seek(0); });
  render();
}

let scrollQueued = false;
function updateScroll() {
  scrollQueued = false;
  const max = document.documentElement.scrollHeight - innerHeight;
  $('.reading-progress i').style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  scrub?.update();
}
window.addEventListener('scroll', () => {
  if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(updateScroll); }
}, { passive: true });
window.addEventListener('resize', updateScroll);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseBackground();
  else if (!reducedMotion.matches && !$('#case-dialog').open) inViewVideos.forEach(v => v.play().catch(() => {}));
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) automaticVideos.forEach(v => v.pause());
  else inViewVideos.forEach(v => v.play().catch(() => {}));
});
async function init() {
  try {
    const response = await fetch('assets/manifest.json');
    if (!response.ok) throw new Error(`Manifest: ${response.status}`);
    manifest = await response.json();
    const heroScene = manifest.show.find(scene => scene.id === 'case18');
    const hero = $('#hero-video'); hero.dataset.src = heroScene.videos[heroScene.primary].src; setAutoplay(hero);
    initScrub(); initDialog(); renderGallery(); initComparison(); initAblation();
    $('#gallery-filters').addEventListener('click', event => {
      const button = event.target.closest('button[data-filter]');
      if (!button) return;
      galleryFilter = button.dataset.filter; galleryLimit = 9; renderGallery();
    });
    $('#load-more').addEventListener('click', () => {
      const previousCount = $$('.case-card').length;
      galleryLimit += 9; renderGallery();
      $$('.case-card')[previousCount]?.focus({ preventScroll: true });
    });
    const navObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) $$('nav a').forEach(a => a.classList.toggle('active', a.hash === `#${entry.target.id}`)); });
    }, { rootMargin: '-15% 0px -60% 0px' });
    ['experience', 'gallery', 'method', 'comparison'].forEach(id => navObserver.observe($(`#${id}`)));
    updateScroll();
    document.documentElement.dataset.ready = 'true';
  } catch (error) {
    console.error(error);
    $('#load-error').hidden = false;
  }
}
init();
