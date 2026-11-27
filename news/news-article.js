/* Bayt wikaya article page behaviour: reading time, share/save bars, related articles.
   Loaded by every article page (news/, en/news/, fr/news/).
   - Reading time is computed from the article body text (ad placeholder boxes excluded).
   - Shared links use the page canonical URL (the live site URL), never the preview URL.
   - Saved articles live in localStorage under BAYT_SAVED_KEY; the news hub reads the
     same key to render the saved-articles section. */
(function () {
  'use strict';

  var KEY = 'baytwikaya-saved-articles';
  var lang = (document.documentElement.getAttribute('lang') || 'ar').slice(0, 2);
  if (['ar', 'en', 'fr'].indexOf(lang) < 0) lang = 'ar';

  var L = {
    ar: {
      minutes: function (n) {
        if (n === 1) return 'دقيقة قراءة';
        if (n === 2) return 'دقيقتان قراءة';
        if (n >= 3 && n <= 10) return n + ' دقائق قراءة';
        return n + ' دقيقة قراءة';
      },
      save: 'حفظ', saved: 'محفوظ', copied: 'تم النسخ ✓'
    },
    en: {
      minutes: function (n) { return n === 1 ? '1 min read' : n + ' min read'; },
      save: 'Save', saved: 'Saved', copied: 'Copied ✓'
    },
    fr: {
      minutes: function (n) { return n === 1 ? '1 min de lecture' : n + ' min de lecture'; },
      save: 'Enregistrer', saved: 'Enregistré', copied: 'Copié ✓'
    }
  }[lang];

  function canonicalUrl() {
    var link = document.querySelector('link[rel="canonical"]');
    return (link && link.href) || window.location.href;
  }

  function articleTitle() {
    var h1 = document.querySelector('h1');
    return h1 ? h1.textContent.trim() : document.title;
  }

  function articleSlug() {
    var url = canonicalUrl().replace(/\/$/, '');
    return url.split('/').pop();
  }

  function articleDate() {
    var p = document.querySelector('p.text-gray-400');
    if (!p) return '';
    return p.textContent.split('·')[0].trim();
  }

  /* ---- reading time ---- */
  function readingTime() {
    var body = document.querySelector('.article-body');
    if (!body) return;
    var clone = body.cloneNode(true);
    var ads = clone.querySelectorAll('div[style*="dashed"]');
    for (var i = 0; i < ads.length; i++) ads[i].remove();
    var words = clone.textContent.trim().split(/\s+/).filter(Boolean).length;
    var mins = Math.max(1, Math.ceil(words / 200));
    var spots = document.querySelectorAll('.reading-time');
    for (var j = 0; j < spots.length; j++) spots[j].textContent = L.minutes(mins);
  }

  /* ---- saved articles (localStorage) ---- */
  function loadSaved() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || '[]'); }
    catch (e) { return []; }
  }

  function storeSaved(items) {
    try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* storage unavailable */ }
  }

  function isSaved(slug) {
    return loadSaved().some(function (it) { return it.slug === slug; });
  }

  function refreshSaveButtons() {
    var saved = isSaved(articleSlug());
    var btns = document.querySelectorAll('[data-share="save"]');
    for (var i = 0; i < btns.length; i++) {
      var label = btns[i].querySelector('.save-label') || btns[i];
      label.textContent = saved ? L.saved : L.save;
      btns[i].classList.toggle('is-saved', saved);
      btns[i].setAttribute('aria-pressed', saved ? 'true' : 'false');
      btns[i].style.background = saved ? '#0f766e' : '#c9a227';
    }
  }

  function toggleSave() {
    var slug = articleSlug();
    var items = loadSaved();
    var at = -1;
    for (var i = 0; i < items.length; i++) {
      if (items[i].slug === slug) { at = i; break; }
    }
    if (at >= 0) {
      items.splice(at, 1);
    } else {
      items.unshift({
        slug: slug,
        lang: lang,
        title: articleTitle(),
        date: articleDate(),
        url: canonicalUrl()
      });
    }
    storeSaved(items);
    refreshSaveButtons();
  }

  /* ---- reading history (for the hub's "For you" tab) ---- */
  function trackRead() {
    var consent = null;
    try { consent = window.localStorage.getItem('bayt-cookie-consent'); } catch (e) { /* ignore */ }
    if (consent !== 'accepted') return;
    var slug = articleSlug();
    if (!slug) return;
    var KEY = 'bayt-read-history';
    var items = [];
    try { items = JSON.parse(window.localStorage.getItem(KEY) || '[]'); } catch (e) { items = []; }
    if (!Array.isArray(items)) items = [];
    items = items.filter(function (s) { return s !== slug; });
    items.unshift(slug);
    items = items.slice(0, 20);
    try { window.localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* storage unavailable */ }
  }

  /* ---- share buttons ---- */
  function shareUrl(kind) {
    var url = canonicalUrl();
    var title = articleTitle();
    switch (kind) {
      case 'whatsapp': return 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + url);
      case 'facebook': return 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
      case 'x': return 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(title) + '&url=' + encodeURIComponent(url);
      case 'telegram': return 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title);
      default: return '';
    }
  }

  function copyLink(btn) {
    var url = canonicalUrl();
    var done = function () {
      var label = btn.querySelector('.copy-label') || btn;
      var original = label.textContent;
      label.textContent = L.copied;
      setTimeout(function () { label.textContent = original; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); done(); });
    } else {
      fallbackCopy(url);
      done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* clipboard unavailable */ }
    document.body.removeChild(ta);
  }

  function wireShare() {
    var nativeSupported = !!(navigator.share);
    var btns = document.querySelectorAll('[data-share]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var kind = btn.getAttribute('data-share');
        if (kind === 'native' && !nativeSupported) {
          btn.style.display = 'none';
          return;
        }
        btn.addEventListener('click', function () {
          if (kind === 'copy') { copyLink(btn); return; }
          if (kind === 'save') { toggleSave(); return; }
          if (kind === 'native') {
            if (navigator.share) {
              navigator.share({ title: articleTitle(), url: canonicalUrl() }).catch(function () { /* dismissed */ });
            }
            return;
          }
          var href = shareUrl(kind);
          if (href) window.open(href, '_blank', 'noopener');
        });
      })(btns[i]);
    }
    refreshSaveButtons();
  }

  /* ---- related articles (from the shared news index) ---- */
  function imgPrefix() {
    var path = window.location.pathname || '';
    if (path.indexOf('/en/news/') >= 0 || path.indexOf('/fr/news/') >= 0) return '../../news/';
    return '';
  }

  function buildRelated() {
    var section = document.getElementById('related-articles');
    var grid = document.getElementById('related-grid');
    var list = window.BAYT_NEWS || [];
    if (!section || !grid || !list.length) return;
    var slug = articleSlug();
    var picks = [];
    for (var i = 0; i < list.length && picks.length < 3; i++) {
      var a = list[i];
      if (a.slug !== slug && a.langs && a.langs.indexOf(lang) >= 0 && a[lang]) picks.push(a);
    }
    if (!picks.length) return;
    var prefix = imgPrefix();
    picks.forEach(function (a, idx) {
      var border = idx % 2 === 0 ? 'border-teal-700' : 'border-[#c9a227]';
      var card = document.createElement('article');
      card.className = 'bg-white rounded-3xl shadow-xl overflow-hidden border-t-8 ' + border + ' flex flex-col';
      var link = document.createElement('a');
      link.href = a.slug;
      link.className = 'flex flex-col flex-grow';
      var img = document.createElement('img');
      img.src = prefix + a.img;
      img.alt = '';
      img.className = 'w-full object-cover';
      img.setAttribute('style', 'aspect-ratio:16/10');
      var body = document.createElement('div');
      body.className = 'p-4 flex flex-col flex-grow';
      var h3 = document.createElement('h3');
      h3.className = 'text-lg font-bold text-teal-900 leading-snug';
      h3.textContent = a[lang];
      body.appendChild(h3);
      link.appendChild(img);
      link.appendChild(body);
      card.appendChild(link);
      grid.appendChild(card);
    });
    section.style.display = '';
  }

  readingTime();
  wireShare();
  buildRelated();
  trackRead();
})();
