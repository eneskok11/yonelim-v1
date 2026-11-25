/* Yönelim — sayı okuyucu.
 * Kapağa basılınca yüklenir; PDF'i (pdf.js, Apache-2.0, temanın içinde) sayfa sayfa çizer.
 * Sayfa çevirme bu dosyada: sırttan dönen 3B yaprak, açıya göre değişen ışık ve düşen gölge, sürükleyerek çevirme.
 * Okurdan üçüncü tarafa istek gitmez; tercih saklanmaz. Kalınan sayfa yalnız adreste durur (#sayi-5-s4). */
const CFG = window.YONELIM_OKUYUCU || {};
const B = CFG.base || '';
const V = CFG.ver ? '?v=' + CFG.ver : '';
const AZ_HAREKET = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const SURE = AZ_HAREKET ? 160 : 760;

let pdfjsP;
const pdfjs = () => (pdfjsP = pdfjsP || import(B + 'pdf.min.js' + V).then((m) => {
  m.GlobalWorkerOptions.workerSrc = B + 'pdf.worker.min.js' + V;
  return m;
}));
function css() {
  if (document.getElementById('okuyucu-css')) return Promise.resolve();
  return new Promise((res) => {
    const l = document.createElement('link');
    l.id = 'okuyucu-css'; l.rel = 'stylesheet'; l.href = B + 'okuyucu.css' + V;
    l.onload = l.onerror = res;
    document.head.appendChild(l);
  });
}
export function hazirla() { css(); pdfjs(); }

/* ── Çevirme sesi: kâğıt hışırtısı + sayfa yerine oturunca hafif "pat" ── */
let sesBag = null, sesAcik = true, sonSes = 0;
function ses() {
  if (!sesAcik) return;
  const simdi = performance.now();
  if (simdi - sonSes < 160) return;
  sonSes = simdi;
  try {
    sesBag = sesBag || new (window.AudioContext || window.webkitAudioContext)();
    if (sesBag.state === 'suspended') sesBag.resume();
    const sr = sesBag.sampleRate, t = sesBag.currentTime, d = 0.5, n = Math.floor(sr * d);
    const buf = sesBag.createBuffer(1, n, sr), x = buf.getChannelData(0);
    let son = 0;
    for (let i = 0; i < n; i++) {
      const p = i / n;
      const zarf = p < 0.12 ? p / 0.12 : Math.pow(1 - (p - 0.12) / 0.88, 2.1);
      const cit = Math.random() < 0.016 ? 2.3 : 1;
      son = son * 0.5 + (Math.random() * 2 - 1) * 0.5;
      x[i] = son * zarf * cit * 0.85;
      if (p > 0.8) { const q = (p - 0.8) / 0.2; x[i] += Math.sin(2 * Math.PI * 90 * (i / sr)) * Math.exp(-q * 7) * 0.3 * Math.min(1, q / 0.05); }
    }
    const src = sesBag.createBufferSource(); src.buffer = buf;
    const bp = sesBag.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(600, t);
    bp.frequency.exponentialRampToValueAtTime(2700, t + d * 0.45);
    bp.frequency.exponentialRampToValueAtTime(850, t + d);
    const hp = sesBag.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const g = sesBag.createGain(); g.gain.value = 0.8;
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
const yumusak = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

let acik = null;

/* o: { url, ad, no, kapak, sayfa (1 tabanlı), son: {baslik, metin, url, dugme}, kaynak, adresteydi } */
export async function ac(o) {
  if (typeof o !== 'object') o = { url: o };
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
      '<button type="button" class="ok-btn ok-yak" aria-pressed="false" title="Yakınlaştır (+)">' + IKON.ara + '<span class="sr">Yakınlaştır</span></button>' +
      '<button type="button" class="ok-btn ok-ses" aria-pressed="true" title="Çevirme sesi">' + IKON.ses + '<span class="sr">Çevirme sesi</span></button>' +
      (tamVar ? '<button type="button" class="ok-btn ok-tam" aria-pressed="false" title="Tam ekran (F)">' + IKON.tam + '<span class="sr">Tam ekran</span></button>' : '') +
      '<button type="button" class="ok-btn ok-x" title="Kapat (Esc)">' + IKON.x + '<span class="sr">Kapat</span></button>' +
    '</div>' +
    '<div class="ok-sahne">' +
      '<div class="ok-kitap" hidden><div class="ok-govde"><div class="ok-yuva ok-sol"></div><div class="ok-yuva ok-sag"></div></div></div>' +
      '<div class="ok-durum" role="status"><div class="ok-yuk-kapak"></div><div class="ok-cubuk"><i></i></div></div>' +
      '<button type="button" class="ok-git ok-onceki" title="Önceki sayfa (←)" hidden>' + IKON.sol + '<span class="sr">Önceki sayfa</span></button>' +
      '<button type="button" class="ok-git ok-sonraki" title="Sonraki sayfa (→)" hidden>' + IKON.sag + '<span class="sr">Sonraki sayfa</span></button>' +
      '<div class="ok-yakin" hidden tabindex="0" aria-label="Yakınlaştırılmış sayfa"><div class="ok-yakin-ic"></div></div>' +
    '</div>' +
    '<div class="ok-kucuk" hidden><div class="ok-kucuk-bas"><b>Sayfalar</b><button type="button" class="ok-btn ok-kucuk-x" title="Kapat">' + IKON.x + '<span class="sr">Sayfaları kapat</span></button></div><div class="ok-kucuk-izgara" role="list"></div></div>' +
    '<p class="sr ok-duyuru" aria-live="polite"></p>';
  el.querySelector('.ok-ad').textContent = o.ad || '';
  document.body.appendChild(el);

  const $ = (s) => el.querySelector(s);
  const kok = document.documentElement, eskiTasma = kok.style.overflow;
  kok.style.overflow = 'hidden';
  const durum = $('.ok-durum'), kitap = $('.ok-kitap'), govde = $('.ok-govde'), sahne = $('.ok-sahne');
  const solY = $('.ok-sol'), sagY = $('.ok-sag');
  const noT = $('.ok-no-t'), duyuru = $('.ok-duyuru'), cubuk = $('.ok-cubuk i');
  const yakin = $('.ok-yakin'), yakinIc = $('.ok-yakin-ic'), kucuk = $('.ok-kucuk'), izgara = $('.ok-kucuk-izgara');
  if (o.kapak) { const kp = $('.ok-yuk-kapak'); kp.style.backgroundImage = 'url("' + o.kapak.replace(/"/g, '%22') + '")'; kp.classList.add('var'); }
  $('.ok-ses').setAttribute('aria-pressed', String(sesAcik));
  el.classList.toggle('sessiz', !sesAcik);

  let doc = null, kapandi = false, n = 0, top = 0, oran = 1.414, sonVar = false;
  let yatay = true, pw = 400, ph = 566;
  let k = 0; /* yatayda açık çiftin ilk sayfası (0 ya da tek sayı); dikeyde açık sayfa */
  let mesgul = null, bekleyen = 0, yakinSeviye = 0, kucukHazir = false, hazirOldu = false;
  const resim = new Map(); /* i → {url, w} */
  const cizimde = new Map();

  /* ── Adres çubuğu ── */
  const ADRES0 = location.pathname + location.search;
  const hashYap = (s) => (o.no ? '#sayi-' + o.no + (s > 1 ? '-s' + s : '') : '');
  let ittik = false;
  if (o.no) {
    if (o.adresteydi) history.replaceState({ okuyucu: 1 }, '', ADRES0 + hashYap(o.sayfa || 1));
    else { history.pushState({ okuyucu: 1 }, '', ADRES0 + hashYap(o.sayfa || 1)); ittik = true; }
  }
  const geriDinle = () => { if (!kapandi) kapat(true); };
  addEventListener('popstate', geriDinle);

  function kapat(geridenGeldi) {
    if (kapandi) return;
    if (!geridenGeldi && ittik) { history.back(); return; }
    kapandi = true; acik = null;
    removeEventListener('keydown', tus, true);
    removeEventListener('resize', boyut);
    removeEventListener('popstate', geriDinle);
    document.removeEventListener('fullscreenchange', tamDegisti);
    if (document.fullscreenElement === el) { try { document.exitFullscreen(); } catch (e) { /* */ } }
    if (!ittik && o.no && /^#sayi-/.test(location.hash)) history.replaceState(null, '', ADRES0);
    for (const r of resim.values()) URL.revokeObjectURL(r.url);
    try { doc && doc.destroy(); } catch (e) { /* */ }
    el.remove();
    kok.style.overflow = eskiTasma;
    if (o.kaynak && o.kaynak.focus) o.kaynak.focus({ preventScroll: true });
  }

  /* ── Sayfa düzeni ── */
  function olc() {
    const cs = getComputedStyle(sahne);
    const W = sahne.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = sahne.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const ciftG = Math.min(W / 2, H / oran);
    yatay = W >= 600 && ciftG >= 200;
    pw = Math.floor(yatay ? ciftG : Math.min(W, H / oran));
    ph = Math.floor(pw * oran);
    el.classList.toggle('yatay', yatay);
    el.classList.toggle('dikey', !yatay);
    kitap.style.setProperty('--pw', pw + 'px');
    kitap.style.setProperty('--ph', ph + 'px');
    kitap.style.width = (yatay ? 2 * pw : pw) + 'px';
    kitap.style.height = ph + 'px';
  }
  const ciftBasi = (i) => (yatay ? (i <= 0 ? 0 : (i % 2 === 1 ? i : i - 1)) : i);
  const sol = (kk) => (yatay ? (kk === 0 ? -1 : kk) : -1);
  const sag = (kk) => (yatay ? (kk === 0 ? 0 : (kk + 1 < top ? kk + 1 : -1)) : kk);
  const sonraki = (kk) => (yatay ? (kk === 0 ? 1 : kk + 2) : kk + 1);
  const onceki = (kk) => (yatay ? (kk <= 1 ? 0 : kk - 2) : kk - 1);
  const varMi = (kk) => kk >= 0 && kk < top;
  const gorunen = () => (yatay ? [sol(k), sag(k)].filter((i) => i >= 0) : [k]);
  function kayma(kk) { /* kapak ya da arka kapak tek açıkken kitap ortada dursun */
    if (!yatay) return 0;
    if (sol(kk) < 0) return -pw / 2;
    if (sag(kk) < 0) return pw / 2;
    return 0;
  }

  /* Bir sayfanın içeriği: çizilmiş görüntü, yüklenirken yer tutucu ya da son (abonelik) sayfası */
  function dugum(i) {
    const d = document.createElement('div');
    d.className = 'ok-sf';
    if (i < 0) { d.classList.add('bos'); return d; }
    d.dataset.sf = i;
    if (sonVar && i === n) {
      d.classList.add('ok-son');
      d.innerHTML = '<div class="ok-son-ic"><span class="ok-son-cizgi"></span><b></b>' + (o.son.metin ? '<p></p>' : '') + (o.son.url ? '<a class="ok-son-btn"></a>' : '') + '</div>';
      d.querySelector('b').textContent = o.son.baslik || '';
      if (o.son.metin) d.querySelector('p').textContent = o.son.metin;
      if (o.son.url) { const a = d.querySelector('a'); a.href = o.son.url; a.textContent = o.son.dugme || 'Abone olun'; }
      return d;
    }
    const r = resim.get(i);
    if (r) { const im = new Image(); im.alt = ''; im.decoding = 'async'; im.draggable = false; im.src = r.url; d.appendChild(im); }
    else {
      d.classList.add('yukleniyor');
      if (i === 0 && o.kapak) d.style.backgroundImage = 'url("' + o.kapak.replace(/"/g, '%22') + '")';
    }
    return d;
  }
  const golgeKatmani = () => { const g = document.createElement('i'); g.className = 'ok-dusen'; return g; };
  function yuvaKoy(yuva, i) {
    yuva.replaceChildren(dugum(i), golgeKatmani());
    yuva.classList.toggle('bos', i < 0);
  }
  function yerlestir() {
    govde.style.transform = 'translateX(' + kayma(k) + 'px)';
    solY.classList.remove('altta'); sagY.classList.remove('altta');
    if (yatay) { yuvaKoy(solY, sol(k)); yuvaKoy(sagY, sag(k)); solY.hidden = false; }
    else { yuvaKoy(sagY, k); solY.hidden = true; }
    kalinlik();
    sonra();
  }
  function kalinlik() { /* sayfa destesinin kenarı: okunan/kalan sayfa sayısıyla incelir */
    const g = gorunen();
    const solK = Math.min(6, Math.round(Math.min(...g) / 2));
    const sagK = Math.min(6, Math.round((top - 1 - Math.max(...g)) / 2));
    kitap.style.setProperty('--kal-sol', solK + 'px');
    kitap.style.setProperty('--kal-sag', sagK + 'px');
  }

  /* ── Çizim: görünen ve komşu sayfalar; uzaktakiler bellekten çıkar ── */
  async function ciz(i) {
    if (i < 0 || i >= n || kapandi) return;
    const w = Math.round(pw * Math.min(window.devicePixelRatio || 1, 2));
    const var0 = resim.get(i);
    if ((var0 && var0.w >= w) || cizimde.get(i) >= w) return;
    cizimde.set(i, w);
    try {
      const p = await doc.getPage(i + 1);
      const v = p.getViewport({ scale: w / p.getViewport({ scale: 1 }).width });
      const c = document.createElement('canvas');
      c.width = Math.round(v.width); c.height = Math.round(v.height);
      await p.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: v }).promise;
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
      c.width = 0; c.height = 0;
      if (kapandi || !blob) return;
      const url = URL.createObjectURL(blob);
      const eski = resim.get(i);
      resim.set(i, { url, w });
      el.querySelectorAll('.ok-sf[data-sf="' + i + '"]').forEach((d) => {
        d.classList.remove('yukleniyor'); d.style.backgroundImage = '';
        let im = d.querySelector('img');
        if (!im) { im = new Image(); im.alt = ''; im.draggable = false; d.appendChild(im); }
        im.src = url;
      });
      if (eski) setTimeout(() => URL.revokeObjectURL(eski.url), 2000);
      if (!hazirOldu && gorunen().includes(i)) ilkGoster();
    } catch (e) { /* çizilemeyen sayfada yer tutucu kalır */ }
    finally { if (cizimde.get(i) === w) cizimde.delete(i); }
  }
  function onden() {
    const g = gorunen();
    const a = Math.min(...g), z = Math.max(...g);
    [...g, z + 1, z + 2, a - 1, a - 2, z + 3, z + 4].forEach(ciz);
    for (const [i, r] of resim) {
      if (Math.abs(i - a) > 8 && !el.querySelector('.ok-sf[data-sf="' + i + '"]')) { URL.revokeObjectURL(r.url); resim.delete(i); }
    }
  }
  function ilkGoster() {
    if (hazirOldu || kapandi) return;
    hazirOldu = true;
    durum.hidden = true;
    kitap.hidden = false;
    el.classList.add('hazir');
    $('.ok-onceki').hidden = false; $('.ok-sonraki').hidden = false;
  }

  function sonra() {
    const g = gorunen().filter((i) => i < n).map((i) => i + 1);
    const t = g.length ? (g.length > 1 ? g[0] + '–' + g[1] : String(g[0])) : '';
    noT.textContent = t ? t + ' / ' + n : 'Son · ' + n;
    duyuru.textContent = t ? 'Sayfa ' + t + ', toplam ' + n : 'Son sayfa';
    $('.ok-onceki').disabled = k === 0;
    $('.ok-sonraki').disabled = !varMi(sonraki(k));
    if (o.no) history.replaceState(history.state, '', ADRES0 + hashYap(Math.min(Math.min(...gorunen()) + 1, n)));
    if (kucukHazir) izgara.querySelectorAll('.ok-kucuk-s').forEach((b, i) => b.classList.toggle('su-an', gorunen().includes(i)));
    onden();
  }

  /* ── Yaprak: sırttan dönen sayfa ──
   * ileri (yatay): sağdaki sayfa sırttan sola döner; önü şimdiki sağ sayfa, arkası gelecek sol sayfa.
   * geri (yatay): soldaki sayfa sırttan sağa döner. Dikeyde tek sayfa sol kenarından döner. */
  function yaprakKur(yon) {
    const hedef = yon > 0 ? sonraki(k) : onceki(k);
    if (!varMi(hedef) || (yon < 0 && k === 0)) return null;
    const ya = document.createElement('div');
    ya.className = 'ok-yaprak ' + (yon > 0 ? 'ileri' : 'geri');
    const on = document.createElement('div'); on.className = 'ok-yuz on';
    const ar = document.createElement('div'); ar.className = 'ok-yuz arka';
    let altYuva = null, ustYuva = null;
    if (yatay) {
      if (yon > 0) { on.append(dugum(sag(k))); ar.append(dugum(sol(hedef))); altYuva = sagY; ustYuva = solY; yuvaKoy(sagY, sag(hedef)); }
      else { on.append(dugum(sol(k))); ar.append(dugum(sag(hedef))); altYuva = solY; ustYuva = sagY; yuvaKoy(solY, sol(hedef)); }
    } else if (yon > 0) { on.append(dugum(k)); ar.append(dugum(-1)); ar.classList.add('kagit'); altYuva = sagY; yuvaKoy(sagY, hedef); }
    else { on.append(dugum(hedef)); ar.append(dugum(-1)); ar.classList.add('kagit'); altYuva = sagY; }
    const isikOn = Object.assign(document.createElement('i'), { className: 'ok-isik' });
    const isikAr = Object.assign(document.createElement('i'), { className: 'ok-isik' });
    on.append(isikOn); ar.append(isikAr);
    ya.append(on, ar);
    if (yatay) ya.style.left = (yon > 0 ? pw : 0) + 'px';
    govde.appendChild(ya);
    const altG = altYuva ? altYuva.querySelector('.ok-dusen') : null;
    const ustG = ustYuva ? ustYuva.querySelector('.ok-dusen') : null;
    if (ustYuva) ustYuva.classList.add('altta');
    const x0 = kayma(k), x1 = kayma(hedef);
    const ctx = {
      yon,
      ciz(p) { /* p: çevirmenin ilerlemesi 0 → 1 */
        const g = (!yatay && yon < 0) ? 1 - p : p; /* yaprağın sırttan açılma oranı */
        const a = 180 * g;
        const kalk = Math.sin(Math.PI * g);
        const rot = (yatay && yon < 0) ? a : -a;
        ya.style.transform = 'translateZ(' + (kalk * pw * 0.018).toFixed(1) + 'px) rotateY(' + rot.toFixed(2) + 'deg)';
        /* Işık: yaprak kalktıkça önü kararır, arkası iner indikçe aydınlanır; ortada kâğıt kıvrımı parlar */
        isikOn.style.opacity = Math.min(1, g * 1.8).toFixed(3);
        isikAr.style.opacity = Math.min(1, (1 - g) * 1.8).toFixed(3);
        ya.style.setProperty('--kivrim', (0.18 * kalk).toFixed(3));
        const kenar = Math.abs(Math.cos(Math.PI * g)); /* yaprak kenarının sırttan izdüşüm uzaklığı */
        if (altG) { altG.style.opacity = (0.6 * (1 - g) * (g > 0.02 ? 1 : g * 50)).toFixed(3); altG.style.setProperty('--g', (kenar * 100).toFixed(1) + '%'); }
        if (ustG) { ustG.style.opacity = (g > 0.5 ? 0.55 * Math.sin(Math.PI * g) : 0).toFixed(3); ustG.style.setProperty('--g', (kenar * 100).toFixed(1) + '%'); }
        if (!yatay) ya.style.opacity = g > 0.86 ? Math.max(0, (1 - g) / 0.14).toFixed(3) : '1';
        govde.style.transform = 'translateX(' + (x0 + (x1 - x0) * yumusak(p)).toFixed(1) + 'px)';
      },
      bitir(tamam) {
        ya.remove();
        if (tamam) k = hedef;
        yerlestir();
      },
    };
    ctx.ciz(0);
    return ctx;
  }
  function oynat(ctx, p0, p1, sure) {
    return new Promise((res) => {
      if (sure <= 0) { ctx.ciz(p1); res(); return; }
      const t0 = performance.now();
      const adim = (t) => {
        if (kapandi) { res(); return; }
        const u = Math.min(1, (t - t0) / sure);
        ctx.ciz(p0 + (p1 - p0) * yumusak(u));
        if (u < 1) requestAnimationFrame(adim); else res();
      };
      requestAnimationFrame(adim);
    });
  }
  async function cevir(yon) {
    if (!hazirOldu) return;
    if (!yakin.hidden) yakinKapat();
    if (mesgul) { bekleyen = yon; return; }
    const ctx = yaprakKur(yon);
    if (!ctx) return;
    mesgul = ctx;
    ses();
    await oynat(ctx, 0, 1, bekleyen ? SURE * 0.6 : SURE);
    ctx.bitir(true);
    mesgul = null;
    if (bekleyen) { const b = bekleyen; bekleyen = 0; cevir(b); }
  }
  const ileri = () => cevir(1);
  const geri = () => cevir(-1);
  function git(i) {
    if (mesgul) return;
    const kk = ciftBasi(Math.max(0, Math.min(top - 1, i)));
    if (kk === k) return;
    ses();
    k = kk;
    yerlestir();
  }

  /* ── Dokunma / fare: sürükleyerek çevir, dokununca yarıya göre çevir, çift dokununca yakınlaş ── */
  let tut = null, tikT = 0;
  kitap.addEventListener('pointerdown', (e) => {
    if (e.button || mesgul || e.target.closest('a')) return;
    tut = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, ctx: null, son: [], p: 0 };
  });
  kitap.addEventListener('pointermove', (e) => {
    if (!tut || e.pointerId !== tut.id) return;
    const dx = e.clientX - tut.x, dy = e.clientY - tut.y;
    if (!tut.ctx) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy)) return;
      if (!yakin.hidden) return;
      tut.ctx = yaprakKur(dx < 0 ? 1 : -1);
      if (!tut.ctx) { tut = null; return; }
      mesgul = tut.ctx;
      try { kitap.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    }
    const p = Math.max(0, Math.min(1, (tut.ctx.yon > 0 ? -dx : dx) / (pw * (yatay ? 1.5 : 1.05))));
    tut.p = p;
    tut.son.push({ p, t: performance.now() }); if (tut.son.length > 5) tut.son.shift();
    tut.ctx.ciz(p);
  });
  const birak = async (e) => {
    if (!tut || e.pointerId !== tut.id) return;
    const t = tut; tut = null;
    if (t.ctx) {
      const s = t.son, hiz = s.length > 1 ? (s[s.length - 1].p - s[0].p) / Math.max(1, s[s.length - 1].t - s[0].t) : 0;
      const tamam = t.p > 0.3 || hiz > 0.0012;
      if (tamam) ses();
      await oynat(t.ctx, t.p, tamam ? 1 : 0, Math.max(160, SURE * (tamam ? 1 - t.p : t.p)));
      t.ctx.bitir(tamam);
      mesgul = null;
      return;
    }
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 8 || performance.now() - t.t > 450) return;
    if (tikT) { clearTimeout(tikT); tikT = 0; yakinlas(2, e.clientX, e.clientY); return; }
    const x = e.clientX;
    tikT = setTimeout(() => {
      tikT = 0;
      const r = kitap.getBoundingClientRect();
      const orta = r.left + r.width / 2 + (yatay ? kayma(k) : 0);
      if (x < orta) geri(); else ileri();
    }, 230);
  };
  kitap.addEventListener('pointerup', birak);
  kitap.addEventListener('pointercancel', () => {
    if (tut && tut.ctx) { const t = tut; tut = null; oynat(t.ctx, t.p, 0, 200).then(() => { t.ctx.bitir(false); mesgul = null; }); }
    else tut = null;
  });

  /* ── Klavye ── */
  function tus(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.key;
    if (t === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (!kucuk.hidden) kucukKapat(); else if (!yakin.hidden) yakinKapat(); else kapat();
      return;
    }
    if (t === 'Tab') { odakTuzak(e); return; }
    if (!hazirOldu || !kucuk.hidden) return;
    if (t === 'ArrowRight' || t === 'PageDown' || (t === ' ' && yakin.hidden)) { e.preventDefault(); ileri(); }
    else if (t === 'ArrowLeft' || t === 'PageUp') { e.preventDefault(); geri(); }
    else if (t === 'Home') { e.preventDefault(); git(0); }
    else if (t === 'End') { e.preventDefault(); git(top - 1); }
    else if (t === '+' || t === '=') { e.preventDefault(); yakinlas(yakin.hidden ? 2 : Math.min(yakinSeviye + 1, 3)); }
    else if (t === '-' || t === '_') { e.preventDefault(); if (yakinSeviye > 2) yakinlas(yakinSeviye - 1); else yakinKapat(); }
    else if (t === 's' || t === 'S') { e.preventDefault(); kucukAc(); }
    else if ((t === 'f' || t === 'F') && tamVar) { e.preventDefault(); tamEkran(); }
  }
  function odakTuzak(e) {
    const f = [...el.querySelectorAll('button, a[href], [tabindex="0"]')].filter((b) => !b.disabled && b.offsetParent !== null && !b.closest('[hidden]') && !b.closest('.ok-yaprak'));
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
  addEventListener('keydown', tus, true);

  let rT = 0;
  function boyut() {
    clearTimeout(rT);
    rT = setTimeout(() => {
      if (!doc || mesgul) return;
      olc();
      k = ciftBasi(yatay ? k : Math.max(0, k));
      yerlestir();
      if (!yakin.hidden) yakinlas(yakinSeviye);
    }, 200);
  }
  addEventListener('resize', boyut);

  function tamEkran() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    } catch (e) { /* */ }
  }
  function tamDegisti() { const b = $('.ok-tam'); if (b) { const on = document.fullscreenElement === el; b.setAttribute('aria-pressed', String(on)); el.classList.toggle('tam', on); } }
  document.addEventListener('fullscreenchange', tamDegisti);

  $('.ok-x').addEventListener('click', () => kapat());
  $('.ok-onceki').addEventListener('click', geri);
  $('.ok-sonraki').addEventListener('click', ileri);
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

  /* ── Yakınlaştırma: görünen sayfa(lar) keskin çizilir; kaydırarak / sürükleyerek gezilir ── */
  let yakinIs = 0;
  async function yakinlas(seviye, cx, cy) {
    if (!hazirOldu || mesgul) return;
    const is = ++yakinIs;
    yakinSeviye = seviye;
    const g = gorunen().filter((i) => i < n);
    if (!g.length) return;
    const sr = sahne.getBoundingClientRect(), kr = govde.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sayfaG = Math.min((sr.width - 24) / g.length, (sr.height - 24) / oran) * seviye;
    const pikselG = Math.min(Math.round(sayfaG * dpr), 2600);
    const genis = g.length * pw;
    const solKenar = kr.left + (yatay && sol(k) < 0 ? pw : 0);
    const ox = cx != null ? Math.max(0, Math.min(1, (cx - solKenar) / genis)) : 0.5;
    const oy = cy != null ? Math.max(0, Math.min(1, (cy - kr.top) / kr.height)) : 0.2;
    yakin.hidden = false;
    el.classList.add('yakinda');
    $('.ok-yak').setAttribute('aria-pressed', 'true');
    yakinIc.style.width = Math.round(sayfaG * g.length) + 'px';
    yakinIc.innerHTML = g.map(() => '<canvas></canvas>').join('');
    const canv = [...yakinIc.querySelectorAll('canvas')];
    canv.forEach((c) => { c.style.width = Math.round(sayfaG) + 'px'; c.style.height = Math.round(sayfaG * oran) + 'px'; });
    yakin.scrollLeft = Math.max(0, ox * yakin.scrollWidth - yakin.clientWidth / 2);
    yakin.scrollTop = Math.max(0, oy * yakin.scrollHeight - yakin.clientHeight / 2);
    yakin.focus({ preventScroll: true });
    for (let j = 0; j < g.length; j++) {
      const p = await doc.getPage(g[j] + 1);
      if (is !== yakinIs || kapandi) return;
      const v = p.getViewport({ scale: pikselG / p.getViewport({ scale: 1 }).width });
      canv[j].width = Math.round(v.width); canv[j].height = Math.round(v.height);
      await p.render({ canvasContext: canv[j].getContext('2d', { alpha: false }), viewport: v }).promise;
    }
  }
  function yakinKapat() {
    yakinIs++;
    yakin.hidden = true; yakinIc.innerHTML = ''; el.classList.remove('yakinda');
    $('.ok-yak').setAttribute('aria-pressed', 'false');
    el.focus({ preventScroll: true });
  }
  let surukle = null;
  yakin.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { surukle = { x: e.clientX, y: e.clientY, l: yakin.scrollLeft, t: yakin.scrollTop }; yakin.classList.add('tutuyor'); } });
  yakin.addEventListener('pointermove', (e) => { if (surukle) { yakin.scrollLeft = surukle.l - (e.clientX - surukle.x); yakin.scrollTop = surukle.t - (e.clientY - surukle.y); } });
  yakin.addEventListener('pointerup', () => { surukle = null; yakin.classList.remove('tutuyor'); });
  yakin.addEventListener('dblclick', yakinKapat);

  /* ── Sayfalar (küçük resimler) ── */
  function kucukAc() {
    if (!hazirOldu) return;
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
    izgara.querySelectorAll('.ok-kucuk-s').forEach((b, i) => b.classList.toggle('su-an', gorunen().includes(i)));
    kucuk.hidden = false;
    el.classList.add('kucukte');
    const su = izgara.querySelector('.su-an') || izgara.firstElementChild;
    su.scrollIntoView({ block: 'center' });
    su.focus({ preventScroll: true });
  }
  function kucukKapat() { kucuk.hidden = true; el.classList.remove('kucukte'); $('.ok-no').focus({ preventScroll: true }); }

  /* ── Yükle ── */
  try {
    const yukleme = (await pdfjs()).getDocument({ url: o.url, isEvalSupported: false, disableAutoFetch: true, rangeChunkSize: 262144 });
    yukleme.onProgress = (p) => { if (p.total) cubuk.style.width = Math.min(100, Math.round(p.loaded / p.total * 100)) + '%'; };
    doc = await yukleme.promise;
    if (kapandi) { doc.destroy(); return; }
    n = doc.numPages;
    const vp = (await doc.getPage(1)).getViewport({ scale: 1 });
    oran = vp.height / vp.width;
    sonVar = !!(o.son && o.son.baslik);
    top = n + (sonVar ? 1 : 0);
    kitap.hidden = false; olc(); kitap.hidden = true;
    k = ciftBasi(Math.max(0, Math.min(top - 1, (o.sayfa || 1) - 1)));
    yerlestir();
    if (gorunen().every((i) => i >= n)) ilkGoster();
    setTimeout(ilkGoster, 2500); /* görüntü gecikse bile yer tutucuyla aç */
  } catch (e) {
    if (kapandi) return;
    durum.hidden = false;
    durum.innerHTML = '<p class="ok-yuk-t">Bu sayı şu an açılamadı.</p><p><a class="ok-son-btn" target="_blank" rel="noopener"></a></p>';
    const a = durum.querySelector('a'); a.href = o.url; a.textContent = 'PDF olarak açın';
  }
}
