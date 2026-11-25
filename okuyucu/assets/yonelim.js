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
/* Sayı kapakları: PDF'i olan kapağa basınca okuyucu yüklenir ve açılır. Betik yüklenemezse PDF'in kendisi açılır. */
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[data-sayi-pdf]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  var cfg = window.YONELIM_OKUYUCU;
  if (!cfg) return;
  e.preventDefault();
  import(cfg.base + 'okuyucu.js?v=' + cfg.ver).then(function (m) {
    return m.ac(a.getAttribute('data-sayi-pdf'), a.getAttribute('data-sayi-ad'), a);
  }).catch(function () { location.href = a.href; });
});
