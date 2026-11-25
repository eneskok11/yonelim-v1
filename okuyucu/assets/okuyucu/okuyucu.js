/* Yönelim — sayı okuyucu. Kapağa basılınca yüklenir; PDF'i sayfa sayfa çizer, dergi gibi çevirir.
 * Kütüphaneler temanın içinde (pdf.js Apache-2.0, StPageFlip MIT): ziyaretçiden üçüncü tarafa istek gitmez.
 * Çevirme sesi dosya değil, tarayıcıda üretilir. Tercih saklanmaz (çerez/yerel depo yok). */
const CFG = window.YONELIM_OKUYUCU || {};
const B = CFG.base || '';
const V = CFG.ver ? '?v=' + CFG.ver : '';

let pdfjsP, flipP;
const pdfjs = () => (pdfjsP = pdfjsP || import(B + 'pdf.min.js' + V).then((m) => {
  m.GlobalWorkerOptions.workerSrc = B + 'pdf.worker.min.js' + V;
  return m;
}));
const flipLib = () => (flipP = flipP || import(B + 'page-flip.module.js' + V));
function css() {
  if (document.getElementById('okuyucu-css')) return Promise.resolve();
  return new Promise((res) => {
    const l = document.createElement('link');
    l.id = 'okuyucu-css'; l.rel = 'stylesheet'; l.href = B + 'okuyucu.css' + V;
    l.onload = l.onerror = res;
    document.head.appendChild(l);
  });
}

/* ── Çevirme sesi: kâğıt hışırtısı (filtrelenmiş gürültü) ── */
let sesBag = null, sesAcik = true;
function ses() {
  if (!sesAcik) return;
  try {
    sesBag = sesBag || new (window.AudioContext || window.webkitAudioContext)();
    if (sesBag.state === "suspended") sesBag.resume();
    const t = sesBag.currentTime, d = 0.42, n = Math.floor(sesBag.sampleRate * d);
    const buf = sesBag.createBuffer(1, n, sesBag.sampleRate), x = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const env = p < 0.12 ? p / 0.12 : Math.pow(1 - (p - 0.12) / 0.88, 2.4);
      const grain = Math.random() < 0.02 ? 2.2 : 1; /* kâğıdın çıtırtısı */
      last = last * 0.55 + (Math.random() * 2 - 1) * 0.45;
      x[i] = last * env * grain;
    }
    const src = sesBag.createBufferSource(); src.buffer = buf;
    const bp = sesBag.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + d * 0.45);
    bp.frequency.exponentialRampToValueAtTime(1100, t + d);
    const hp = sesBag.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
    const g = sesBag.createGain(); g.gain.value = 0.9;
    src.connect(bp).connect(hp).connect(g).connect(sesBag.destination);
    src.start(t);
  } catch (e) { /* ses yoksa okuma sürer */ }
}

const IKON = {
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  sol: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  sag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  ses: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="dalga" d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/><path class="kes" d="M16 9l6 6M22 9l-6 6"/></svg>',
};

let acik = null;

export async function ac(url, ad, kaynak) {
  if (acik) return;
  await css();
  const el = document.createElement('div');
  el.className = 'okuyucu';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', ad || 'Sayı');
  el.innerHTML =
    '<div class="ok-bar"><b class="ok-ad"></b><span class="ok-no" aria-live="polite"></span>' +
    '<button type="button" class="ok-ses" aria-pressed="true" title="Çevirme sesi">' + IKON.ses + '<span class="sr">Çevirme sesi</span></button>' +
    '<button type="button" class="ok-x" title="Kapat (Esc)">' + IKON.x + '<span class="sr">Kapat</span></button></div>' +
    '<div class="ok-sahne"><div class="ok-kitap"></div><p class="ok-durum">Sayı yükleniyor…</p>' +
    '<button type="button" class="ok-git ok-onceki" title="Önceki sayfa">' + IKON.sol + '<span class="sr">Önceki sayfa</span></button>' +
    '<button type="button" class="ok-git ok-sonraki" title="Sonraki sayfa">' + IKON.sag + '<span class="sr">Sonraki sayfa</span></button></div>';
  el.querySelector('.ok-ad').textContent = ad || '';
  document.body.appendChild(el);
  const kok = document.documentElement, eskiTasma = kok.style.overflow;
  kok.style.overflow = 'hidden';
  const durum = el.querySelector('.ok-durum'), no = el.querySelector('.ok-no'), kitap = el.querySelector('.ok-kitap');
  const sesBtn = el.querySelector('.ok-ses');
  sesBtn.setAttribute('aria-pressed', String(sesAcik));
  el.classList.toggle('sessiz', !sesAcik);
  let flip = null, doc = null, kapandi = false;
  const ciz = new Map();

  function kapat() {
    if (kapandi) return; kapandi = true; acik = null;
    removeEventListener('keydown', tus);
    removeEventListener('resize', boyut);
    try { flip && flip.destroy(); } catch (e) { /* */ }
    try { doc && doc.destroy(); } catch (e) { /* */ }
    el.remove();
    kok.style.overflow = eskiTasma;
    if (kaynak && kaynak.focus) kaynak.focus();
  }
  function tus(e) {
    if (e.key === 'Escape') { e.preventDefault(); kapat(); }
    else if (flip && e.key === 'ArrowRight') { e.preventDefault(); flip.flipNext(); }
    else if (flip && e.key === 'ArrowLeft') { e.preventDefault(); flip.flipPrev(); }
    else if (e.key === 'Tab') { /* odak pencerede kalsın */
      const f = [...el.querySelectorAll('button:not([hidden])')];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  let rT = 0;
  function boyut() { clearTimeout(rT); rT = setTimeout(() => { ciz.clear(); etraf(); }, 250); }
  addEventListener('keydown', tus);
  addEventListener('resize', boyut);
  el.querySelector('.ok-x').addEventListener('click', kapat);
  el.querySelector('.ok-onceki').addEventListener('click', () => flip && flip.flipPrev());
  el.querySelector('.ok-sonraki').addEventListener('click', () => flip && flip.flipNext());
  sesBtn.addEventListener('click', () => {
    sesAcik = !sesAcik;
    sesBtn.setAttribute('aria-pressed', String(sesAcik));
    el.classList.toggle('sessiz', !sesAcik);
  });
  el.tabIndex = -1; el.focus();
  acik = el;

  try {
    const [pj, pf] = await Promise.all([pdfjs(), flipLib()]);
    if (kapandi) return;
    doc = await pj.getDocument({ url, isEvalSupported: false }).promise;
    if (kapandi) return;
    const ilk = await doc.getPage(1);
    const vp = ilk.getViewport({ scale: 1 });
    const n = doc.numPages;
    const sayfalar = [];
    for (let i = 1; i <= n; i++) {
      const s = document.createElement('div');
      s.className = 'ok-s';
      s.dataset.density = (i === 1 || i === n) ? 'hard' : 'soft';
      s.innerHTML = '<canvas></canvas><span class="ok-yuk">' + i + '</span>';
      kitap.appendChild(s);
      sayfalar.push(s);
    }
    flip = new pf.PageFlip(kitap, {
      width: 560, height: Math.round(560 * vp.height / vp.width),
      size: 'stretch', minWidth: 300, maxWidth: 1400, minHeight: 300, maxHeight: 2000,
      showCover: true, usePortrait: true, mobileScrollSupport: false,
      maxShadowOpacity: 0.45, flippingTime: 750, drawShadow: true, autoSize: true,
    });
    flip.loadFromHTML(sayfalar);
    durum.hidden = true;

    async function sayfaCiz(i) { /* i: 0 tabanlı */
      if (i < 0 || i >= n || ciz.has(i)) return;
      const r = flip.getBoundsRect();
      const w = Math.round((r ? r.pageWidth : 500) * Math.min(window.devicePixelRatio || 1, 2));
      ciz.set(i, true);
      try {
        const p = await doc.getPage(i + 1);
        const v = p.getViewport({ scale: w / p.getViewport({ scale: 1 }).width });
        const c = sayfalar[i].querySelector('canvas');
        const tmp = document.createElement('canvas');
        tmp.width = Math.round(v.width); tmp.height = Math.round(v.height);
        await p.render({ canvasContext: tmp.getContext('2d'), viewport: v }).promise;
        if (kapandi) return;
        c.width = tmp.width; c.height = tmp.height;
        c.getContext('2d').drawImage(tmp, 0, 0);
        sayfalar[i].classList.add('hazir');
      } catch (e) {
        ciz.delete(i);
        sayfalar[i].classList.add('hata');
      }
    }
    function etraf() {
      const k = flip.getCurrentPageIndex();
      sayac();
      for (const d of [0, 1, -1, 2, 3, -2]) sayfaCiz(k + d);
    }
    function sayac() {
      const k = flip.getCurrentPageIndex() + 1;
      const yatay = flip.getOrientation() === 'landscape';
      const cift = yatay && k > 1 && k < n;
      no.textContent = (cift ? k + '–' + Math.min(k + 1, n) : k) + ' / ' + n;
      el.querySelector('.ok-onceki').hidden = k <= 1;
      el.querySelector('.ok-sonraki').hidden = (yatay && k >= n - 1 && n % 2 === 1) || k >= n;
    }
    flip.on('flip', etraf);
    flip.on('changeOrientation', () => { ciz.clear(); etraf(); });
    flip.on('changeState', (e) => { if (e.data === 'flipping') ses(); });
    etraf();
  } catch (e) {
    if (kapandi) return;
    durum.hidden = false;
    durum.innerHTML = 'Bu sayı şu an açılamadı. <a></a>';
    const a = durum.querySelector('a');
    a.href = url; a.textContent = 'PDF olarak aç'; a.target = '_blank'; a.rel = 'noopener';
  }
}
