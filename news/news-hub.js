/* Bayt wikaya news hub: dynamic tabs, site search (with voice), saved
   articles, pagination.
   Loaded by the news hub pages (news.html, en/news.html, fr/news.html).
   Data: window.BAYT_NEWS (news-data.js, newest first). Everything is
   computed live from that data — the Latest badge counts today's articles,
   the tabs re-render the grid, the search matches our own articles only.
   - Tabs: Top stories / Latest (+ red 24h badge) / For you (personalized
     from reading history in localStorage, only when cookie consent is
     'accepted'; history is recorded by news-article.js).
   - Search: client-side, free, site-only. Live as you type, Arabic-aware
     matching (alef/hamza variants unified). Voice input via the Web Speech
     API; the mic button is hidden when the browser does not support it.
   - Saved articles live in localStorage ('baytwikaya-saved-articles').
   - Pagination: 9 per page over the current list. */
(function () {
  'use strict';

  /* ---------- language & strings ---------- */
  var lang = (document.documentElement.getAttribute('lang') || 'ar').slice(0, 2);
  if (['ar', 'en', 'fr'].indexOf(lang) < 0) lang = 'ar';

  var L = {
    ar: {
      newsLabel: 'أخبار في عالم الصحة',
      newer: '‹ المقالات الأحدث', older: 'مقالات قديمة ›',
      searchPlaceholder: 'اسأل عن أي خبر...',
      searchHint: 'نبحث فقط في مقالات موقعنا',
      suggestions: 'اقتراحات:',
      noResults: 'لا توجد نتائج مطابقة في موقعنا. جرّب كلمة أخرى.',
      foryouEmpty: 'اقرأ بعض المقالات وسنخصص لك الأخبار هنا.',
      foryouConsent: 'تخصيص الأخبار يحتاج قبول ملفات تعريف الارتباط. اقبل الكوكيز من اللافتة أسفل الصفحة وستظهر لك مقالات على ذوقك.',
      listening: 'جارٍ الاستماع... تحدث الآن',
      micError: 'تعذّر الوصول إلى الميكروفون. تأكد من السماح به في المتصفح.',
      micNoSpeech: 'لم نسمع شيئاً. حاول مرة أخرى.',
      close: 'إغلاق',
      results: 'نتائج البحث'
    },
    en: {
      newsLabel: 'Health world news',
      newer: '‹ Newer articles', older: 'Older articles ›',
      searchPlaceholder: 'Ask about any news...',
      searchHint: 'We only search our own site’s articles',
      suggestions: 'Suggestions:',
      noResults: 'No matching results on our site. Try another word.',
      foryouEmpty: 'Read a few articles and we will personalize the news for you here.',
      foryouConsent: 'Personalizing the news needs cookie acceptance. Accept cookies from the banner at the bottom of the page and you will see articles to your taste.',
      listening: 'Listening... speak now',
      micError: 'Could not access the microphone. Make sure it is allowed in the browser.',
      micNoSpeech: 'We didn’t hear anything. Try again.',
      close: 'Close',
      results: 'Search results'
    },
    fr: {
      newsLabel: 'Actualités du monde de la santé',
      newer: '‹ Articles plus récents', older: 'Articles plus anciens ›',
      searchPlaceholder: 'Demandez n’importe quelle actualité...',
      searchHint: 'Nous cherchons uniquement dans les articles de notre site',
      suggestions: 'Suggestions :',
      noResults: 'Aucun résultat sur notre site. Essayez un autre mot.',
      foryouEmpty: 'Lisez quelques articles et nous personnaliserons les actualités pour vous ici.',
      foryouConsent: 'La personnalisation nécessite l’acceptation des cookies. Acceptez les cookies depuis la bannière en bas de page et vous verrez des articles selon vos goûts.',
      listening: 'Écoute... parlez maintenant',
      micError: 'Impossible d’accéder au microphone. Vérifiez qu’il est autorisé dans le navigateur.',
      micNoSpeech: 'Nous n’avons rien entendu. Réessayez.',
      close: 'Fermer',
      results: 'Résultats de recherche'
    }
  }[lang];

  var SPEECH_LANG = { ar: 'ar-MA', en: 'en-US', fr: 'fr-FR' }[lang];
  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  var EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var FR_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var STOP = ('من في على إلى عن ما هل كيف لماذا هذا هذه التي الذي أن إن كان كانت بعد قبل بين مع دون عند لدى قد لم لن لا نعم أو و ثم كما لكن غير كل بعض أي إذا عندما حيث هو هي هم نحن أنت أنا ذلك تلك هناك هنا the a an and or of to in on for with is are was were be by at from as it its this that these those can could will would how why what when your you we our their his her not no do does did have has had may might should than then so but if about into over after before between through during under more most other some any only own same too very just le la les de des du un une et ou à dans sur pour avec est sont il elle nous vous ils elles ce cette ces qui que quoi comment pourquoi quand ne pas plus moins très aussi comme mais donc car si au aux en par être avoir faire peut peuvent faut y se sa son ses leur leurs notre votre mon ma mes ton ta tes sans sous entre après avant pendant chez tout tous toute toutes chaque aucun aucune même autre autres nouveau nouvelle sante sante sante health news actualites monde').split(' ');

  /* ---------- data ---------- */
  var DATA = (window.BAYT_NEWS || []).filter(function (a) {
    return a && a.slug && a[lang] && (!a.langs || a.langs.indexOf(lang) >= 0);
  });
  var bySlug = {};
  DATA.forEach(function (a) { bySlug[a.slug] = a; });

  var grid = document.getElementById('news-grid');
  var nav = document.getElementById('news-pagination');
  var tabsEl = document.getElementById('news-tabs');
  var noteEl = document.getElementById('news-tab-note');
  if (!grid) return;

  /* If news-data.js failed to load, leave the static grid untouched and
     hide the dynamic feature (degraded but usable, no empty grid). */
  if (!DATA.length) {
    if (tabsEl) tabsEl.style.display = 'none';
    var sr = document.getElementById('bayt-search');
    if (sr) sr.style.display = 'none';
    return;
  }

  var inSub = /^(\/en\/|\/fr\/)/.test(window.location.pathname || '');
  var imgPrefix = inSub ? '../news/' : 'news/';

  /* ---------- news ticker: built from the same data, both sets identical ----------
     The two ticker sets are generated from DATA (newest first) so they can never
     drift apart. A new article appears in the ticker automatically as soon as its
     entry is added to news-data.js — never hand-edit ticker items in the hubs.
     Set 2 is aria-hidden (a visual duplicate for the seamless -50% loop), so its
     links stay out of keyboard tab order (tabindex="-1"), exactly as the static
     markup did. Items already in the sets (dashboard/CMS articles appended
     before this script ran) are kept after the data items, in both sets. */
  (function renderTicker() {
    var t1 = document.getElementById('ticker-set-1');
    var t2 = document.getElementById('ticker-set-2');
    if (!t1 || !t2) return;
    function makeItem(a, tabIndex) {
      var link = document.createElement('a');
      link.className = 'news-ticker-item';
      link.href = 'news/' + a.slug;
      if (tabIndex) link.setAttribute('tabindex', '-1');
      var img = document.createElement('img');
      img.src = imgPrefix + a.img;
      img.alt = '';
      var span = document.createElement('span');
      span.textContent = a[lang];
      link.appendChild(img);
      link.appendChild(span);
      return link;
    }
    var frag1 = document.createDocumentFragment();
    var frag2 = document.createDocumentFragment();
    DATA.forEach(function (a) {
      frag1.appendChild(makeItem(a, false));
      frag2.appendChild(makeItem(a, true));
    });
    /* Data items first, then any items already present (dashboard articles),
       so both sets keep the same order. */
    t1.insertBefore(frag1, t1.firstChild);
    t2.insertBefore(frag2, t2.firstChild);
  })();

  /* ---------- helpers ---------- */
  function todayCasablanca() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
    } catch (e) {
      var d = new Date();
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }
  }
  function formatDate(iso) {
    if (!iso) return '';
    var p = iso.split('-');
    if (p.length !== 3) return iso;
    var months = lang === 'ar' ? AR_MONTHS : (lang === 'fr' ? FR_MONTHS : EN_MONTHS);
    var m = months[parseInt(p[1], 10) - 1] || '';
    if (lang === 'en') return parseInt(p[2], 10) + ' ' + m + ' ' + p[0];
    return parseInt(p[2], 10) + ' ' + m + ' ' + p[0];
  }
  function catOf(a) {
    if (a.cat) return a.cat[lang] || a.cat.ar || '';
    return '';
  }

  /* ---------- hero (breaking-news) + editors' pick #1: AUTOMATIC ----------
     The hero always shows the LATEST WARNING article from news-data.js
     (title contains تحذير / warning / avertissement, or a warning
     category). A new warning article becomes the hero automatically as
     soon as its entry is added to news-data.js — never hand-edit the
     hero in the hubs, and never pin it to one article. The same article
     is used for editors' pick #1 so hero and pick #1 never show two
     different articles.
     OWNER RULE (28 Nov 2026): warnings about the three core services —
     hijama / cupping, acupuncture, bone alignment — are NEVER shown
     automatically. He must review any such warning first. If the latest
     warning is about one of those, it is skipped and the latest warning
     about another topic is shown. If no warning exists, fall back to
     the latest article that is not a service warning.
     Ties on the same date: prefer the article whose Arabic title
     contains تحذير (primary language, strongest warning signal). */
  var WARN_RE = /تحذير|warning|avertissement/i;
  var SERVICE_WARN_RE = /hijama|حجامة|cupping|acupuncture|acuponcture|الوخز بالإبر|تقويم العظام|bone alignment|alignement des os|osteopath/i;
  function isWarning(a) {
    var t = (a.ar || '') + ' ' + (a.en || '') + ' ' + (a.fr || '');
    var c = a.cat ? (a.cat.ar || '') + ' ' + (a.cat.en || '') + ' ' + (a.cat.fr || '') : '';
    return WARN_RE.test(t) || WARN_RE.test(c);
  }
  function isServiceWarning(a) {
    var hay = [a.slug, a.ar, a.en, a.fr, a.cat && a.cat.ar, a.cat && a.cat.en, a.cat && a.cat.fr].join(' ');
    return SERVICE_WARN_RE.test(hay);
  }
  function pickHeroArticle() {
    var warns = DATA.filter(function (a) { return isWarning(a) && !isServiceWarning(a); });
    if (!warns.length) {
      var ok = DATA.filter(function (a) { return !isServiceWarning(a); });
      return ok[0] || DATA[0] || null;
    }
    var maxDate = warns[0].date;
    var top = warns.filter(function (a) { return a.date === maxDate; });
    for (var i = 0; i < top.length; i++) {
      if (/تحذير/.test(top[i].ar || '')) return top[i];
    }
    return top[0];
  }
  (function renderHero() {
    var article = pickHeroArticle();
    if (!article) return;
    var title = article[lang] || article.ar || '';
    var href = 'news/' + article.slug;
    var cat = catOf(article);
    var desc = cat ? cat + ' · ' + formatDate(article.date) : formatDate(article.date);
    var hero = document.getElementById('breaking-news');
    if (hero) {
      hero.setAttribute('href', href);
      var titleEl = hero.querySelector('div.bg-red-600 span.font-bold');
      if (titleEl) titleEl.textContent = title;
      var descEl = hero.querySelector('div.bg-red-50 span.text-red-900');
      if (descEl) descEl.textContent = desc;
    }
    var picks = document.getElementById('editors-picks');
    if (picks) {
      var first = picks.querySelector('ol li');
      if (first) {
        var link = first.querySelector('a');
        if (link) { link.setAttribute('href', href); link.textContent = title; }
        var dateEl = first.querySelector('p');
        if (dateEl) dateEl.textContent = formatDate(article.date);
      }
    }
  })();

  function norm(s) {
    s = (s || '').toLowerCase();
    s = s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
    s = s.replace(/[ً-ٰٟـ]/g, '');
    s = s.replace(/[^\u0600-\u06FFa-z0-9\s]/g, ' ');
    return s;
  }
  function wordsOf(s) {
    return norm(s).split(/\s+/).filter(function (w) {
      return w.length > 1 && STOP.indexOf(w) < 0;
    });
  }
  function loadJSON(key) {
    try { return JSON.parse(window.localStorage.getItem(key) || '[]'); }
    catch (e) { return []; }
  }

  /* ---------- card borders: keep each article's colour from the static grid ---------- */
  var borderMap = {};
  Array.prototype.slice.call(grid.querySelectorAll('article')).forEach(function (card) {
    var a = card.querySelector('a[href]');
    var m = a && a.getAttribute('href').match(/news\/([^\/]+)$/);
    if (m) {
      borderMap[m[1]] = card.className.indexOf('border-teal-700') >= 0 ? 'border-teal-700' : 'border-[#c9a227]';
    }
  });
  function borderFor(slug) { return borderMap[slug] || 'border-[#c9a227]'; }

  function buildCard(a) {
    var art = document.createElement('article');
    art.className = 'bg-white rounded-3xl shadow-xl overflow-hidden border-t-8 ' + borderFor(a.slug) + ' flex flex-col';
    var link = document.createElement('a');
    link.href = 'news/' + a.slug;
    link.className = 'flex flex-col flex-grow';
    var img = document.createElement('img');
    img.src = imgPrefix + a.img;
    img.alt = '';
    img.className = 'w-full object-cover';
    img.setAttribute('style', 'aspect-ratio:16/10');
    img.loading = 'lazy';
    var body = document.createElement('div');
    body.className = 'p-5 flex flex-col flex-grow';
    var meta = document.createElement('p');
    meta.className = 'text-gray-400 text-sm mb-2';
    var cat = catOf(a);
    meta.textContent = formatDate(a.date) + (cat ? ' · ' + cat : '') + ' · ' + L.newsLabel;
    var h = document.createElement('h2');
    h.className = 'text-lg font-bold text-teal-900 leading-snug';
    h.textContent = a[lang];
    body.appendChild(meta);
    body.appendChild(h);
    link.appendChild(img);
    link.appendChild(body);
    art.appendChild(link);
    return art;
  }

  /* ---------- lists ---------- */
  var TOP_SLUG = 'weight-loss-drugs-blindness-warning';
  function latestList() { return DATA.slice(); }
  function topList() {
    var picks = [];
    if (bySlug[TOP_SLUG]) picks.push(bySlug[TOP_SLUG]);
    for (var i = 0; i < DATA.length && picks.length < 5; i++) {
      if (DATA[i].slug !== TOP_SLUG) picks.push(DATA[i]);
    }
    return picks;
  }
  function readHistory() {
    var h = loadJSON('bayt-read-history');
    return Array.isArray(h) ? h.filter(function (s) { return typeof s === 'string'; }) : [];
  }
  function keywordsOf(a) {
    return wordsOf((a[lang] || '') + ' ' + catOf(a));
  }
  function forYouList() {
    var history = readHistory();
    if (!history.length) return null;
    var readSet = {};
    history.forEach(function (s) { readSet[s] = true; });
    var readKeys = {};
    history.forEach(function (slug) {
      var a = bySlug[slug];
      if (a) keywordsOf(a).forEach(function (w) { readKeys[w] = (readKeys[w] || 0) + 1; });
    });
    var scored = [];
    DATA.forEach(function (a) {
      if (readSet[a.slug]) return;
      var score = 0;
      keywordsOf(a).forEach(function (w) { if (readKeys[w]) score += readKeys[w]; });
      if (score > 0) scored.push({ a: a, score: score });
    });
    scored.sort(function (x, y) {
      return (y.score - x.score) || ((y.a.date || '').localeCompare(x.a.date || ''));
    });
    return scored.map(function (s) { return s.a; });
  }

  /* ---------- tabs + pagination ---------- */
  var PER_PAGE = 9;
  var currentTab = 'latest';
  var currentList = latestList();
  var currentPage = 1;

  function showNote(text) {
    if (!noteEl) return;
    if (text) { noteEl.textContent = text; noteEl.classList.remove('hidden'); }
    else { noteEl.textContent = ''; noteEl.classList.add('hidden'); }
  }
  function setTab(tab) {
    currentTab = tab;
    currentPage = 1;
    if (tab === 'top') { currentList = topList(); showNote(''); }
    else if (tab === 'latest') { currentList = latestList(); showNote(''); }
    else {
      var consent = null;
      try { consent = window.localStorage.getItem('bayt-cookie-consent'); } catch (e) { /* ignore */ }
      if (consent !== 'accepted') {
        showNote(L.foryouConsent);
        currentList = latestList();
      } else {
        var list = forYouList();
        if (!list || !list.length) {
          showNote(L.foryouEmpty);
          currentList = latestList();
        } else {
          showNote('');
          currentList = list;
        }
      }
    }
    if (tabsEl) {
      Array.prototype.slice.call(tabsEl.querySelectorAll('[data-tab]')).forEach(function (b) {
        var active = b.getAttribute('data-tab') === tab;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
        b.style.background = active ? '#2563eb' : '#ffffff';
        b.style.color = active ? '#ffffff' : '#134e4a';
        b.style.borderColor = active ? '#2563eb' : '#99f6e4';
      });
    }
    renderGrid();
  }
  function updateBadge() {
    var badge = document.getElementById('news-latest-badge');
    if (!badge) return;
    var today = todayCasablanca();
    var n = 0;
    DATA.forEach(function (a) { if (a.date === today) n++; });
    if (n > 0) { badge.textContent = n; badge.style.display = ''; }
    else { badge.style.display = 'none'; }
  }
  function pageButton(label, page, disabled, active, gold, small) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.className = (small ? 'px-3 py-1 text-sm ' : 'px-4 py-2 ') + 'rounded-full font-bold transition ' + (active ? 'primary-bg text-white shadow-md' : (gold && !disabled ? 'bg-[#c9a227] hover:bg-[#b08d1e] text-white shadow-md' : 'bg-white text-teal-900 border border-teal-200 shadow hover:bg-amber-50'));
    if (disabled) { b.disabled = true; b.className += ' opacity-50 cursor-not-allowed'; }
    b.addEventListener('click', function () { goPage(page); });
    return b;
  }
  function renderGrid() {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    var pages = Math.max(1, Math.ceil(currentList.length / PER_PAGE));
    if (currentPage > pages) currentPage = pages;
    var start = (currentPage - 1) * PER_PAGE;
    currentList.slice(start, start + PER_PAGE).forEach(function (a) {
      grid.appendChild(buildCard(a));
    });
    if (!nav) return;
    nav.innerHTML = '';
    if (pages <= 1) { nav.style.display = 'none'; return; }
    nav.style.display = '';
    var rowNums = document.createElement('div');
    rowNums.className = 'flex flex-wrap items-center justify-center gap-2';
    for (var p = 1; p <= pages; p++) rowNums.appendChild(pageButton(String(p), p, false, p === currentPage));
    var rowNav = document.createElement('div');
    rowNav.className = 'flex flex-wrap items-center justify-center gap-2 mt-3';
    rowNav.appendChild(pageButton(L.newer, currentPage - 1, currentPage === 1, false, false, true));
    rowNav.appendChild(pageButton(L.older, currentPage + 1, currentPage === pages, false, true, true));
    nav.appendChild(rowNums);
    nav.appendChild(rowNav);
  }
  function goPage(p) {
    var pages = Math.max(1, Math.ceil(currentList.length / PER_PAGE));
    if (p < 1 || p > pages) return;
    currentPage = p;
    renderGrid();
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (tabsEl) {
    Array.prototype.slice.call(tabsEl.querySelectorAll('[data-tab]')).forEach(function (b) {
      b.addEventListener('click', function () { setTab(b.getAttribute('data-tab')); });
    });
  }
  updateBadge();
  setTab('latest');

  /* ---------- search (floating bottom bar, site-only, free) ---------- */
  var searchRoot = document.getElementById('bayt-search');
  var searchBar = document.getElementById('bayt-search-bar');
  var searchPanel = document.getElementById('bayt-search-panel');
  var searchInput = document.getElementById('bayt-search-input');
  var searchResults = document.getElementById('bayt-search-results');
  var searchSuggest = document.getElementById('bayt-search-suggest');
  var searchStatus = document.getElementById('bayt-search-status');
  var searchClose = document.getElementById('bayt-search-close');
  var micBtns = [
    document.getElementById('bayt-search-mic'),
    document.getElementById('bayt-search-bar-mic')
  ];

  function setStatus(text) {
    if (searchStatus) searchStatus.textContent = text || '';
  }
  function matchQuery(a, q) {
    var qwords = norm(q).split(/\s+/).filter(Boolean);
    if (!qwords.length) return false;
    var hay = norm([a.ar, a.en, a.fr, a.slug,
      a.cat && a.cat.ar, a.cat && a.cat.en, a.cat && a.cat.fr].join(' '));
    return qwords.every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function topKeywords(n) {
    var freq = {};
    DATA.forEach(function (a) {
      var seen = {};
      wordsOf(a[lang] || '').forEach(function (w) {
        if (!seen[w]) { seen[w] = 1; freq[w] = (freq[w] || 0) + 1; }
      });
    });
    var arr = Object.keys(freq).map(function (w) { return { w: w, n: freq[w] }; });
    arr.sort(function (x, y) { return (y.n - x.n) || (x.w < y.w ? -1 : 1); });
    return arr.slice(0, n).map(function (o) { return o.w; });
  }
  function renderSuggestions() {
    if (!searchSuggest) return;
    searchSuggest.innerHTML = '';
    var label = document.createElement('span');
    label.className = 'text-gray-500 text-sm font-bold';
    label.textContent = L.suggestions;
    searchSuggest.appendChild(label);
    topKeywords(6).forEach(function (kw) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'px-3 py-1 rounded-full bg-teal-50 text-teal-900 border border-teal-200 text-sm font-bold hover:bg-amber-50';
      chip.textContent = kw;
      chip.addEventListener('click', function () {
        if (searchInput) { searchInput.value = kw; runSearch(kw); searchInput.focus(); }
      });
      searchSuggest.appendChild(chip);
    });
  }
  function renderResults(list, query) {
    if (!searchResults) return;
    searchResults.innerHTML = '';
    if (!query) { renderSuggestions(); return; }
    if (searchSuggest) searchSuggest.innerHTML = '';
    if (!list.length) {
      var p = document.createElement('p');
      p.className = 'text-gray-600 text-sm py-2';
      p.textContent = L.noResults;
      searchResults.appendChild(p);
      return;
    }
    var head = document.createElement('p');
    head.className = 'text-gray-500 text-sm font-bold mb-2';
    head.textContent = L.results + ' (' + list.length + ')';
    searchResults.appendChild(head);
    list.slice(0, 8).forEach(function (a) {
      var row = document.createElement('a');
      row.href = 'news/' + a.slug;
      row.className = 'flex items-start justify-between gap-3 py-2 border-b border-gray-100 last:border-0';
      var t = document.createElement('span');
      t.className = 'font-bold text-teal-900 leading-snug text-sm md:text-base';
      t.textContent = a[lang];
      var d = document.createElement('span');
      d.className = 'text-gray-400 text-xs whitespace-nowrap mt-1';
      d.textContent = formatDate(a.date);
      row.appendChild(t);
      row.appendChild(d);
      searchResults.appendChild(row);
    });
  }
  function runSearch(q) {
    q = (q || '').trim();
    if (!q) { renderResults([], ''); setStatus(''); return; }
    var hits = DATA.filter(function (a) { return matchQuery(a, q); });
    renderResults(hits, q);
    setStatus('');
  }
  function openSearch() {
    if (!searchPanel || !searchBar) return;
    searchPanel.classList.remove('hidden');
    searchBar.setAttribute('aria-expanded', 'true');
    renderSuggestions();
    if (searchInput) searchInput.focus();
  }
  function closeSearch() {
    if (!searchPanel || !searchBar) return;
    searchPanel.classList.add('hidden');
    searchBar.setAttribute('aria-expanded', 'false');
    setStatus('');
  }
  function placeSearchBar() {
    if (!searchRoot) return;
    var banner = document.getElementById('bayt-cookie-banner');
    var bottom = 16;
    if (banner && banner.style.display !== 'none' && banner.offsetHeight) {
      bottom = banner.offsetHeight + 12;
    }
    searchRoot.style.bottom = bottom + 'px';
  }

  if (searchRoot && searchBar && searchPanel && searchInput) {
    searchBar.addEventListener('click', function (ev) {
      var mic = ev.target.closest ? ev.target.closest('#bayt-search-bar-mic') : null;
      if (mic) return; // mic has its own handler
      openSearch();
    });
    if (searchClose) searchClose.addEventListener('click', closeSearch);
    searchInput.addEventListener('input', function () { runSearch(searchInput.value); });
    searchInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeSearch();
    });
    document.addEventListener('click', function (ev) {
      if (!searchPanel.classList.contains('hidden') &&
          !searchRoot.contains(ev.target)) closeSearch();
    });
    renderSuggestions();

    /* voice input (Web Speech API) — hidden when unsupported */
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      micBtns.forEach(function (b) { if (b) b.style.display = 'none'; });
    } else {
      var listening = false;
      var rec = null;
      function setListening(on) {
        listening = on;
        micBtns.forEach(function (b) {
          if (!b) return;
          b.style.background = on ? '#dc2626' : '';
          b.style.color = on ? '#ffffff' : '';
          b.classList.toggle('animate-pulse', on);
        });
        setStatus(on ? L.listening : '');
      }
      function startVoice() {
        if (listening) { try { rec.stop(); } catch (e) { /* ignore */ } return; }
        openSearch();
        try {
          rec = new SR();
          rec.lang = SPEECH_LANG;
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          rec.onresult = function (ev) {
            var t = ev.results && ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
            if (t) { searchInput.value = t; runSearch(t); }
            setListening(false);
          };
          rec.onerror = function (ev) {
            setListening(false);
            if (ev.error === 'no-speech') setStatus(L.micNoSpeech);
            else if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') setStatus(L.micError);
            else if (ev.error !== 'aborted') setStatus(L.micError);
          };
          rec.onend = function () { setListening(false); };
          rec.start();
          setListening(true);
        } catch (e) {
          setListening(false);
          setStatus(L.micError);
        }
      }
      micBtns.forEach(function (b) {
        if (!b) return;
        b.addEventListener('click', function (ev) {
          ev.stopPropagation();
          startVoice();
        });
      });
    }

    /* keep the bar clear of the cookie banner */
    placeSearchBar();
    window.addEventListener('resize', placeSearchBar);
    document.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-cookie-choice]') : null;
      if (b) setTimeout(placeSearchBar, 100);
    });
  }

  /* ---------- saved articles (existing behaviour) ---------- */
  (function savedSection() {
    var KEY = 'baytwikaya-saved-articles';
    var section = document.getElementById('saved-section');
    var list = document.getElementById('saved-list');
    if (!section || !list) return;
    var items = loadJSON(KEY);
    if (!items.length) return;
    items.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'flex items-start justify-between gap-4';
      var a = document.createElement('a');
      a.href = it.url || '#';
      a.className = 'font-bold text-teal-900 hover:underline text-lg leading-snug';
      a.textContent = it.title || it.slug || '';
      var date = document.createElement('span');
      date.className = 'text-gray-400 text-sm whitespace-nowrap';
      date.textContent = it.date || '';
      li.appendChild(a);
      li.appendChild(date);
      list.appendChild(li);
    });
    section.style.display = '';
  })();
})();
