/* Yönelim — sayı okuyucu.
 * Kapağa basılınca yüklenir; PDF'i sayfa sayfa çizer, dergi gibi çevirir.
 * Kütüphaneler temanın içinde (pdf.js Apache-2.0, StPageFlip MIT): okurdan üçüncü tarafa istek gitmez.
 * Çevirme sesi dosya değil, tarayıcıda üretilir. Hiçbir tercih saklanmaz (çerez/yerel depo yok);
 * kalınan sayfa yalnız adres çubuğunda durur (#sayi-5-s4), bağlantı paylaşılınca o sayfadan açılır. */
const CFG = window.YONELIM_OKUYUCU || {};
const B = CFG.base || '';
const V = CFG.ver ? '?v=' + CFG.ver : '';
const AZ_HAREKET = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

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
/* Kapağın üstüne gelinince kütüphaneleri önceden ısıt (açılış anında beklenmesin). */
export function hazirla() { css(); pdfjs(); flipLib(); }

/* ── Çevirme sesi: kâğıt hışırtısı + sonda hafif "pat" ── */
let sesBag = null, sesAcik = true, sonSes = 0;
function ses() {
  if (!sesAcik) return;
  const simdi = performance.now();
  if (simdi - sonSes < 180) return; /* üst üste iki ses çalmasın */
  sonSes = simdi;
  try {
    sesBag = sesBag || new (window.AudioContext || window.webkitAudioContext)();
    if (sesBag.state === 'suspended') sesBag.resume();
    const sr = sesBag.sampleRate, t = sesBag.currentTime, d = 0.46, n = Math.floor(sr * d);
    const buf = sesBag.createBuffer(1, n, sr), x = buf.getChannelData(0);
    let son = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const zarf = p < 0.1 ? p / 0.1 : Math.pow(1 - (p - 0.1) / 0.9, 2.2);
      const cit = Math.random() < 0.018 ? 2.4 : 1; /* kâğıt lifinin çıtırtısı */
      son = son * 0.5 + (Math.random() * 2 - 1) * 0.5;
      x[i] = son * zarf * cit * 0.9;
      if (p > 0.78) { const q = (p - 0.78) / 0.22; x[i] += Math.sin(2 * Math.PI * 95 * (i / sr)) * Math.exp(-q * 7) * 0.35 * (q < 0.05 ? q / 0.05 : 1); }
    }
    const src = sesBag.createBufferSource(); src.buffer = buf;
    const bp = sesBag.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.75;
    bp.frequency.setValueAtTime(650, t);
    bp.frequency.exponentialRampToValueAtTime(2800, t + d * 0.42);
    bp.frequency.exponentialRampToValueAtTime(900, t + d);
    const hp = sesBag.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const g = sesBag.createGain(); g.gain.value = 0.85;
    src.connect(bp).connect(hp).connect(g).connect(sesBag.destination);
    src.start(t);
  } catch (e) { /* ses yoksa okuma sürer */ }
}

const I = (d) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
const IKON = {
  x: I('<path d="M6 6l12 12M18 6L6 18"/>'),
  sol: I('<path d="M15 5l-7 7 7 7"/>'),
  sag: I('<path d="M9 5l7 7-7 7"/>'),
  ses: I('<path d="M4 9v6h4l5 4V5L8 9H4z"/><path class="dalga" d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11"/><path class="kes" d="M16 9l6 6M22 9l-6 6"/>'),
  ara: I('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/><path class="arti" d="M11 8.5v5M8.5 11h5"/><path class="eksi" d="M8.5 11h5"/>'),
  izgara: I('<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>'),
  tam: I('<path class="ac" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/><path class="kapa" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
};

let acik = null;

/* opt: { url, ad, no, kapak, sayfa (1 tabanlı), son: {baslik, metin, url, dugme}, kaynak, adresteydi } */
export async function ac(urlOrOpt, ad, kaynak) {
  const o = typeof urlOrOpt === 'object' ? urlOrOpt : { url: urlOrOpt, ad, kaynak };
  if (acik) return;
  acik = true;
  await css();
  const el = document.createElement('div');
  el.className = 'okuyucu' + (AZ_HAREKET ? ' az-hareket' : '');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', (o.ad || 'Sayı') + ' — okuyucu');
  el.tabIndex = -1;
  const tamVar = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  el.innerHTML =
    '<div class="ok-bar">' +
      '<b class="ok-ad"></b>' +
      '<button type="button" class="ok-no" title="Bütün sayfalar (S)"><span class="ok-no-t">…</span>' + IKON.izgara + '</button>' +
      '<span class="ok-ara-cizgi" aria-hidden="true"></span>' +
      '<button type="button" class="ok-btn ok-yak" aria-pressed="false" title="Yakınlaştır (+ / çift tıklama)">' + IKON.ara + '<span class="sr">Yakınlaştır</span></button>' +
      '<button type="button" class="ok-btn ok-ses" aria-pressed="true" title="Çevirme sesi">' + IKON.ses + '<span class="sr">Çevirme sesi</span></button>' +
      (tamVar ? '<button type="button" class="ok-btn ok-tam" aria-pressed="false" title="Tam ekran (F)">' + IKON.tam + '<span class="sr">Tam ekran</span></button>' : '') +
      '<button type="button" class="ok-btn ok-x" title="Kapat (Esc)">' + IKON.x + '<span class="sr">Kapat</span></button>' +
    '</div>' +
    '<div class="ok-sahne">' +
      '<div class="ok-kitap"></div>' +
      '<div class="ok-durum" role="status"><div class="ok-yuk-kapak"></div><p class="ok-yuk-t">Sayı açılıyor…</p><div class="ok-cubuk"><i></i></div></div>' +
      '<button type="button" class="ok-git ok-onceki" title="Önceki sayfa (←)" hidden>' + IKON.sol + '<span class="sr">Önceki sayfa</span></button>' +
      '<button type="button" class="ok-git ok-sonraki" title="Sonraki sayfa (→)" hidden>' + IKON.sag + '<span class="sr">Sonraki sayfa</span></button>' +
      '<div class="ok-yakin" hidden tabindex="0" aria-label="Yakınlaştırılmış sayfa; kaydırarak gezinin, çıkmak için Esc"><div class="ok-yakin-ic"></div></div>' +
    '</div>' +
    '<div class="ok-kucuk" hidden><div class="ok-kucuk-bas"><b>Sayfalar</b><button type="button" class="ok-btn ok-kucuk-x" title="Kapat">' + IKON.x + '<span class="sr">Sayfaları kapat</span></button></div><div class="ok-kucuk-izgara" role="list"></div></div>' +
    '<p class="sr ok-duyuru" aria-live="polite"></p>';
  el.querySelector('.ok-ad').textContent = o.ad || '';
  document.body.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const kok = document.documentElement, eskiTasma = kok.style.overflow;
  kok.style.overflow = 'hidden';
  const durum = $('.ok-durum'), kitap = $('.ok-kitap'), sahne = $('.ok-sahne');
  const noT = $('.ok-no-t'), duyuru = $('.ok-duyuru'), cubuk = $('.ok-cubuk i');
  const yakin = $('.ok-yakin'), yakinIc = $('.ok-yakin-ic'), kucuk = $('.ok-kucuk'), izgara = $('.ok-kucuk-izgara');
  if (o.kapak) { const k = $('.ok-yuk-kapak'); k.style.backgroundImage = 'url("' + o.kapak.replace(/"/g, '%22') + '")'; k.classList.add('var'); }
  $('.ok-ses').setAttribute('aria-pressed', String(sesAcik));
  el.classList.toggle('sessiz', !sesAcik);

  let flip = null, doc = null, kapandi = false, n = 0, top = 0, sayfalar = [], kucukHazir = false;
  const ciz = new Map(); /* i → çizilen genişlik */
  let yakinlasFn = null, kucukAcFn = null, yakinSeviye = 0;
  let etraf = () => {};
  const ozet = { no: o.no || '' };

  /* ── Adres çubuğu: geri tuşu okuyucuyu kapatır, bağlantı o sayfadan açılır ── */
  const ADRES0 = location.pathname + location.search;
  const hashYap = (s) => (ozet.no ? '#sayi-' + ozet.no + (s > 1 ? '-s' + s : '') : '');
  let ittik = false;
  if (ozet.no) {
    if (o.adresteydi) history.replaceState({ okuyucu: 1 }, '', ADRES0 + hashYap(o.sayfa || 1));
    else { history.pushState({ okuyucu: 1 }, '', ADRES0 + hashYap(o.sayfa || 1)); ittik = true; }
  }
  function geriDinle() { if (!kapandi) kapat(true); }
  addEventListener('popstate', geriDinle);

  function kapat(geridenGeldi) {
    if (kapandi) return;
    if (!geridenGeldi && ittik) { history.back(); return; } /* popstate kapatacak */
    kapandi = true; acik = null;
    removeEventListener('keydown', tus, true);
    removeEventListener('resize', boyut);
    removeEventListener('popstate', geriDinle);
    document.removeEventListener('fullscreenchange', tamDegisti);
    if (document.fullscreenElement === el) { try { document.exitFullscreen(); } catch (e) { /* */ } }
    if (!ittik && ozet.no && /^#sayi-/.test(location.hash)) history.replaceState(null, '', ADRES0);
    try { flip && flip.destroy(); } catch (e) { /* */ }
    try { doc && doc.destroy(); } catch (e) { /* */ }
    el.remove();
    kok.style.overflow = eskiTasma;
    if (o.kaynak && o.kaynak.focus) o.kaynak.focus({ preventScroll: true });
  }

  /* ── Klavye ── */
  function tus(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (!kucuk.hidden) kucukKapat(); else if (!yakin.hidden) yakinKapat(); else kapat();
      return;
    }
    if (k === 'Tab') { odakTuzak(e); return; }
    if (!flip) return;
    if (!kucuk.hidden) return;
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && yakin.hidden)) { e.preventDefault(); ileri(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); geri(); }
    else if (k === 'Home') { e.preventDefault(); git(0); }
    else if (k === 'End') { e.preventDefault(); git(top - 1); }
    else if (k === '+' || k === '=') { e.preventDefault(); yakinlas(yakin.hidden ? 2 : Math.min(yakinSeviye + 1, 3)); }
    else if (k === '-' || k === '_') { e.preventDefault(); if (yakinSeviye > 2) yakinlas(yakinSeviye - 1); else yakinKapat(); }
    else if (k === 's' || k === 'S') { e.preventDefault(); kucukAc(); }
    else if ((k === 'f' || k === 'F') && tamVar) { e.preventDefault(); tamEkran(); }
  }
  function odakTuzak(e) {
    const f = [...el.querySelectorAll('button, [tabindex="0"]')].filter((b) => !b.hidden && b.offsetParent !== null && !b.closest('[hidden]'));
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
  addEventListener('keydown', tus, true);

  let rT = 0;
  function boyut() { clearTimeout(rT); rT = setTimeout(() => { if (!flip) return; ciz.clear(); etraf(); if (!yakin.hidden) yakinlas(yakinSeviye); }, 220); }
  addEventListener('resize', boyut);

  /* ── Tam ekran ── */
  function tamEkran() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) { /* */ }
  }
  function tamDegisti() { const b = $('.ok-tam'); if (b) { const on = document.fullscreenElement === el; b.setAttribute('aria-pressed', String(on)); el.classList.toggle('tam', on); } }
  document.addEventListener('fullscreenchange', tamDegisti);

  $('.ok-x').addEventListener('click', () => kapat());
  $('.ok-onceki').addEventListener('click', () => geri());
  $('.ok-sonraki').addEventListener('click', () => ileri());
  $('.ok-no').addEventListener('click', () => kucukAc());
  $('.ok-kucuk-x').addEventListener('click', () => kucukKapat());
  $('.ok-yak').addEventListener('click', () => (yakin.hidden ? yakinlas(2) : yakinKapat()));
  if (tamVar) $('.ok-tam').addEventListener('click', tamEkran);
  $('.ok-ses').addEventListener('click', () => {
    sesAcik = !sesAcik;
    $('.ok-ses').setAttribute('aria-pressed', String(sesAcik));
    el.classList.toggle('sessiz', !sesAcik);
  });
  el.focus({ preventScroll: true });

  const ileri = () => { if (!yakin.hidden) yakinKapat(); flip.flipNext('bottom'); };
  const geri = () => { if (!yakin.hidden) yakinKapat(); flip.flipPrev('bottom'); };
  function git(i) {
    i = Math.max(0, Math.min(top - 1, i));
    if (i === flip.getCurrentPageIndex()) return;
    ses();
    flip.turnToPage(i);
    etraf();
  }

  try {
    const yukleme = (await pdfjs()).getDocument({ url: o.url, isEvalSupported: false, disableAutoFetch: true, rangeChunkSize: 262144 });
    yukleme.onProgress = (p) => { if (p.total) cubuk.style.width = Math.min(100, Math.round(p.loaded / p.total * 100)) + '%'; };
    const [pf, d] = await Promise.all([flipLib(), yukleme.promise]);
    doc = d;
    if (kapandi) { doc.destroy(); return; }
    n = doc.numPages;
    const ilk = await doc.getPage(1);
    const vp = ilk.getViewport({ scale: 1 });
    const oran = vp.height / vp.width;
    const sonVar = !!(o.son && (o.son.baslik || o.son.metin));
    top = n + (sonVar ? 1 : 0);
    for (let i = 0; i < top; i++) {
      const s = document.createElement('div');
      s.className = 'ok-s';
      s.dataset.density = (i === 0 || i === top - 1) ? 'hard' : 'soft';
      if (sonVar && i === n) {
        s.classList.add('ok-son', 'hazir');
        s.innerHTML = '<div class="ok-son-ic"><span class="ok-son-cizgi"></span><b></b><p></p>' + (o.son.url ? '<a class="ok-son-btn"></a>' : '') + '</div>';
        s.querySelector('b').textContent = o.son.baslik || '';
        s.querySelector('p').textContent = o.son.metin || '';
        if (o.son.url) { const a = s.querySelector('a'); a.href = o.son.url; a.textContent = o.son.dugme || 'Abone olun'; }
      } else {
        s.innerHTML = '<canvas></canvas><span class="ok-yuk" aria-hidden="true">' + (i + 1) + '</span>';
        if (i === 0 && o.kapak) { s.style.backgroundImage = 'url("' + o.kapak.replace(/"/g, '%22') + '")'; s.classList.add('kapakli'); }
      }
      kitap.appendChild(s);
      sayfalar.push(s);
    }
    const bas = Math.max(0, Math.min(top - 1, (o.sayfa || 1) - 1));
    flip = new pf.PageFlip(kitap, {
      width: 560, height: Math.round(560 * oran),
      size: 'stretch', minWidth: 290, maxWidth: 1600, minHeight: 300, maxHeight: 2400,
      showCover: true, usePortrait: true, mobileScrollSupport: false, startPage: bas,
      maxShadowOpacity: 0.5, flippingTime: AZ_HAREKET ? 260 : 820, drawShadow: !AZ_HAREKET,
      showPageCorners: !AZ_HAREKET, disableFlipByClick: true, swipeDistance: 24, autoSize: true,
    });
    flip.loadFromHTML(sayfalar);
    durum.hidden = true;
    el.classList.add('hazir');
    $('.ok-onceki').hidden = false; $('.ok-sonraki').hidden = false;

    /* Tıklama: sol yarı geri, sağ yarı ileri; çift tıklama yakınlaştırır. Sürükleme kütüphanede. */
    let basla = null, tikT = 0;
    kitap.addEventListener('pointerdown', (e) => { basla = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    kitap.addEventListener('pointerup', (e) => {
      if (!basla) return;
      const hareket = Math.hypot(e.clientX - basla.x, e.clientY - basla.y), sure = performance.now() - basla.t;
      basla = null;
      if (hareket > 8 || sure > 450 || e.target.closest('a')) return;
      if (tikT) { clearTimeout(tikT); tikT = 0; yakinlas(2, e.clientX, e.clientY); return; }
      const x = e.clientX;
      tikT = setTimeout(() => {
        tikT = 0;
        const r = kitap.getBoundingClientRect();
        if (x < r.left + r.width / 2) geri(); else ileri();
      }, 240);
    });

    async function sayfaCiz(i, zorla) {
      if (i < 0 || i >= n) return;
      const r = flip.getBoundsRect();
      const w = Math.round((r ? r.pageWidth : 500) * Math.min(window.devicePixelRatio || 1, 2));
      if (!zorla && ciz.get(i) >= w) return;
      ciz.set(i, w);
      try {
        const p = await doc.getPage(i + 1);
        const v = p.getViewport({ scale: w / p.getViewport({ scale: 1 }).width });
        const tmp = document.createElement('canvas');
        tmp.width = Math.round(v.width); tmp.height = Math.round(v.height);
        await p.render({ canvasContext: tmp.getContext('2d', { alpha: false }), viewport: v }).promise;
        if (kapandi || ciz.get(i) !== w) return;
        const c = sayfalar[i].querySelector('canvas');
        c.width = tmp.width; c.height = tmp.height;
        c.getContext('2d', { alpha: false }).drawImage(tmp, 0, 0);
        sayfalar[i].classList.add('hazir');
        sayfalar[i].classList.remove('hata');
      } catch (e) {
        ciz.delete(i);
        sayfalar[i].classList.add('hata');
      }
    }
    function bosalt(k) { /* uzaktaki sayfaların belleğini bırak (telefonda önemli) */
      for (const [i] of ciz) {
        if (Math.abs(i - k) > 6) {
          const c = sayfalar[i].querySelector('canvas');
          if (c) { c.width = 0; c.height = 0; }
          sayfalar[i].classList.remove('hazir');
          ciz.delete(i);
        }
      }
    }
    function gorunen() {
      const k = flip.getCurrentPageIndex();
      const yatay = flip.getOrientation() === 'landscape';
      if (!yatay || k === 0) return [k];
      const sol = k % 2 === 1 ? k : k - 1; /* kapak tek: 1-2, 3-4 … çiftleri */
      return [sol, sol + 1].filter((x) => x < top);
    }
    function sayac() {
      const g = gorunen().filter((i) => i < n).map((i) => i + 1);
      const t = g.length ? (g.length > 1 ? g[0] + '–' + g[1] : String(g[0])) : '';
      noT.textContent = t ? t + ' / ' + n : 'Son · ' + n;
      duyuru.textContent = g.length ? 'Sayfa ' + t + ', toplam ' + n : 'Son sayfa';
      const k = flip.getCurrentPageIndex(), sonGor = gorunen();
      $('.ok-onceki').disabled = k <= 0;
      $('.ok-sonraki').disabled = sonGor[sonGor.length - 1] >= top - 1;
      if (ozet.no) history.replaceState(history.state, '', ADRES0 + hashYap(Math.min(sonGor[0] + 1, n)));
      if (kucukHazir) izgara.querySelectorAll('.ok-kucuk-s').forEach((b, i) => b.classList.toggle('su-an', sonGor.includes(i)));
    }
    etraf = function () {
      const g = gorunen();
      sayac();
      const once = [...g, g[g.length - 1] + 1, g[g.length - 1] + 2, g[0] - 1, g[0] - 2, g[g.length - 1] + 3];
      for (const i of once) sayfaCiz(i);
      bosalt(g[0]);
    };
    flip.on('flip', () => { if (!yakin.hidden) yakinKapat(); etraf(); });
    flip.on('changeOrientation', () => { ciz.clear(); etraf(); });
    flip.on('changeState', (e) => { if (e.data === 'flipping') ses(); });
    etraf();

    /* ── Yakınlaştırma: görünen sayfa(lar) keskin çizilir, kaydırarak / sürükleyerek gezilir ── */
    let yakinIs = 0;
    async function yakinlasImpl(seviye, cx, cy) {
      const is = ++yakinIs;
      yakinSeviye = seviye;
      const g = gorunen().filter((i) => i < n);
      if (!g.length) return;
      const sr = sahne.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sayfaG = Math.min((sr.width - 24) / g.length, (sr.height - 24) / oran) * seviye;
      const pikselG = Math.min(Math.round(sayfaG * dpr), 2600);
      const rb = flip.getBoundsRect();
      const oranX = cx != null && rb ? (cx - sr.left - (sahne.clientWidth - (g.length * rb.pageWidth)) / 2) / (g.length * rb.pageWidth) : 0.5;
      const oranY = cy != null && rb ? (cy - sr.top - (sahne.clientHeight - rb.height) / 2) / rb.height : 0.3;
      yakin.hidden = false;
      el.classList.add('yakinda');
      $('.ok-yak').setAttribute('aria-pressed', 'true');
      yakinIc.style.width = Math.round(sayfaG * g.length) + 'px';
      yakinIc.innerHTML = g.map(() => '<canvas></canvas>').join('');
      const canv = [...yakinIc.querySelectorAll('canvas')];
      canv.forEach((c) => { c.style.width = Math.round(sayfaG) + 'px'; c.style.height = Math.round(sayfaG * oran) + 'px'; });
      yakin.scrollLeft = Math.max(0, oranX * yakin.scrollWidth - yakin.clientWidth / 2);
      yakin.scrollTop = Math.max(0, oranY * yakin.scrollHeight - yakin.clientHeight / 2);
      yakin.focus({ preventScroll: true });
      for (let j = 0; j < g.length; j++) {
        const p = await doc.getPage(g[j] + 1);
        if (is !== yakinIs || kapandi) return;
        const v = p.getViewport({ scale: pikselG / p.getViewport({ scale: 1 }).width });
        canv[j].width = Math.round(v.width); canv[j].height = Math.round(v.height);
        await p.render({ canvasContext: canv[j].getContext('2d', { alpha: false }), viewport: v }).promise;
      }
    }
    yakinlasFn = yakinlasImpl;
    /* masaüstünde sürükleyerek gez, çift tıklayınca çık */
    let surukle = null;
    yakin.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { surukle = { x: e.clientX, y: e.clientY, l: yakin.scrollLeft, t: yakin.scrollTop }; yakin.classList.add('tutuyor'); } });
    addEventListener('pointermove', (e) => { if (surukle) { yakin.scrollLeft = surukle.l - (e.clientX - surukle.x); yakin.scrollTop = surukle.t - (e.clientY - surukle.y); } });
    addEventListener('pointerup', () => { surukle = null; yakin.classList.remove('tutuyor'); });
    yakin.addEventListener('dblclick', () => yakinKapat());

    /* ── Sayfalar (küçük resimler) ── */
    kucukAcFn = () => {
      if (!kucukHazir) {
        kucukHazir = true;
        for (let i = 0; i < top; i++) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'ok-kucuk-s'; b.setAttribute('role', 'listitem');
          const son = sonVar && i === n;
          b.innerHTML = (son ? '<span class="ok-kucuk-son">Son</span>' : '<canvas></canvas>') + '<span class="ok-kucuk-no">' + (son ? '' : i + 1) + '</span>';
          b.setAttribute('aria-label', son ? 'Son sayfa' : 'Sayfa ' + (i + 1));
          b.firstElementChild.style.aspectRatio = '1 / ' + oran.toFixed(3);
                    b.addEventListener('click', () => { kucukKapat(); git(i); });
          izgara.appendChild(b);
        }
        const io = new IntersectionObserver((ent) => {
          ent.forEach(async (en) => {
            if (!en.isIntersecting) return;
            io.unobserve(en.target);
            const c = en.target.querySelector('canvas'); if (!c) return;
            const i = [...izgara.children].indexOf(en.target);
            try {
              const p = await doc.getPage(i + 1);
              const w = Math.round(en.target.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
              const v = p.getViewport({ scale: w / p.getViewport({ scale: 1 }).width });
              const tmp = document.createElement('canvas');
              tmp.width = Math.round(v.width); tmp.height = Math.round(v.height);
              await p.render({ canvasContext: tmp.getContext('2d', { alpha: false }), viewport: v }).promise;
              if (kapandi) return;
              c.width = tmp.width; c.height = tmp.height;
              c.getContext('2d', { alpha: false }).drawImage(tmp, 0, 0);
              c.classList.add('cizildi');
            } catch (e) { /* */ }
          });
        }, { root: izgara, rootMargin: '200px' });
        [...izgara.children].forEach((c) => io.observe(c));
      }
      sayac();
      kucuk.hidden = false;
      el.classList.add('kucukte');
      const su = izgara.querySelector('.su-an') || izgara.firstElementChild;
      su.scrollIntoView({ block: 'center' });
      su.focus({ preventScroll: true });
    };
  } catch (e) {
    if (kapandi) return;
    durum.hidden = false;
    durum.innerHTML = '<p class="ok-yuk-t">Bu sayı şu an açılamadı.</p><p><a class="ok-son-btn" target="_blank" rel="noopener"></a></p>';
    const a = durum.querySelector('a'); a.href = o.url; a.textContent = 'PDF olarak açın';
  }

  function yakinlas(s, x, y) { if (yakinlasFn) yakinlasFn(s, x, y); }
  function yakinKapat() {
    yakin.hidden = true; yakinIc.innerHTML = ''; el.classList.remove('yakinda');
    $('.ok-yak').setAttribute('aria-pressed', 'false');
    el.focus({ preventScroll: true });
  }
  function kucukAc() { if (kucukAcFn) kucukAcFn(); }
  function kucukKapat() { kucuk.hidden = true; el.classList.remove('kucukte'); $('.ok-no').focus({ preventScroll: true }); }
}
