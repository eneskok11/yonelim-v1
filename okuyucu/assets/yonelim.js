(function () {
  var nav = document.getElementById('nav'), bar = document.getElementById('progress'), art = document.querySelector('.single .art-body');
  function f() {
    if (nav) nav.classList.toggle('stuck', nav.getBoundingClientRect().top <= 1 && window.scrollY > 150);
    if (art && bar) { var r = art.getBoundingClientRect(); bar.style.width = Math.min(1, Math.max(0, (-r.top + innerHeight * .3) / r.height)) * 100 + '%'; }
  }
  addEventListener('scroll', f, { passive: true }); f();
  var cp = document.getElementById('copyLink');
  if (cp) cp.addEventListener('click', function () {
    var n = document.getElementById('copyNote'), u = cp.getAttribute('data-url');
    try { navigator.clipboard.writeText(u).then(function () { n.textContent = 'Bağlantı kopyalandı.'; }, function () { n.textContent = u; }); } catch (e) { n.textContent = u; }
  });
})();
/* Sayı kapakları: PDF'i olan kapağa basınca okuyucu açılır (betik yüklenemezse PDF'in kendisi açılır).
 * Adres #sayi-5-s4 ise sayfa açılınca o sayı o sayfadan açılır; kapağın üstüne gelince okuyucu önceden yüklenir. */
(function () {
  var cfg = window.YONELIM_OKUYUCU;
  if (!cfg) return;
  var modP = null;
  function mod() { return modP || (modP = import(cfg.base + 'okuyucu.js?v=' + cfg.ver)); }
  function secenek(a, ek) {
    var img = a.querySelector('img'), o = {
      url: a.getAttribute('data-sayi-pdf'), ad: a.getAttribute('data-sayi-ad'), no: a.getAttribute('data-sayi-no') || '',
      kapak: img ? (img.currentSrc || img.src) : '', kaynak: a
    };
    if (a.hasAttribute('data-sayi-son-baslik')) {
      o.son = { baslik: a.getAttribute('data-sayi-son-baslik'), metin: a.getAttribute('data-sayi-son-metin') || '', url: a.getAttribute('data-sayi-son-url') || '', dugme: a.getAttribute('data-sayi-son-dugme') || '' };
    }
    for (var k in ek) o[k] = ek[k];
    return o;
  }
  function ac(a, ek) {
    return mod().then(function (m) { return m.ac(secenek(a, ek || {})); }).catch(function () { location.href = a.href; });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[data-sayi-pdf]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    ac(a);
  });
  function isit(e) {
    var a = e.target.closest && e.target.closest('a[data-sayi-pdf]');
    if (a) mod().then(function (m) { m.hazirla && m.hazirla(); }).catch(function () {});
  }
  document.addEventListener('pointerover', isit, { passive: true });
  document.addEventListener('focusin', isit);
  var h = /^#sayi-(\d+)(?:-s(\d+))?$/.exec(location.hash);
  if (h) {
    var a = document.querySelector('a[data-sayi-pdf][data-sayi-no="' + h[1] + '"]');
    if (a) ac(a, { sayfa: h[2] ? parseInt(h[2], 10) : 1, adresteydi: true });
  }
})();
