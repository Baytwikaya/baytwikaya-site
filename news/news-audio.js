/* Bayt wikaya article audio reader ("استمع" / Listen / Écouter).
   Browser text-to-speech (SpeechSynthesis API) — free, no server,
   no audio files, no network calls, no API key.
   Loaded by every article page (news/, en/news/, fr/news/).
   - Builds a player bar before .article-body, in the page language.
   - Splits the article body into sentence chunks, speaks them in order,
     highlights the sentence being read, shows progress + estimated time.
   - Controls: play / pause / resume / stop, speed 1x / 1.25x / 1.5x / 2x,
     click the progress bar to jump to that part of the article.
   - No speechSynthesis support -> no player (graceful degradation).
   - No voice for the article language -> friendly note, no crash.
   - Never auto-plays; reading starts only on the visitor's tap.
   - Total duration is an ESTIMATE from word count (shown with ≈). */
(function () {
  'use strict';

  /* ---------- sentence splitting / time helpers (pure, no DOM) ---------- */
  function splitSentences(text) {
    var out = [];
    var re = /[^.!?؟]+[.!?؟]+["'»”)]*/g;
    var m, last = 0;
    while ((m = re.exec(text)) !== null) {
      var s = m[0].trim();
      if (s) out.push(s);
      last = m.index + m[0].length;
    }
    var rest = text.slice(last).trim();
    if (rest) out.push(rest);
    /* Merge fragments ending in an abbreviation ("د." / "Dr.") into the next sentence. */
    var merged = [];
    for (var i = 0; i < out.length; i++) {
      if (/(^|\s)[A-Za-z\u0600-\u06FF]{1,2}\.$/.test(out[i]) && i + 1 < out.length) {
        out[i + 1] = out[i] + ' ' + out[i + 1];
      } else {
        merged.push(out[i]);
      }
    }
    return merged;
  }

  function wordCount(s) {
    var w = s.trim().split(/\s+/);
    return (w.length === 1 && w[0] === '') ? 0 : w.length;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* Expose pure helpers for Node tests (browser: module is undefined). */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { splitSentences: splitSentences, wordCount: wordCount, formatTime: formatTime };
  }

  if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
  var body = document.querySelector('.article-body');
  if (!body) return;

  var lang = (document.documentElement.getAttribute('lang') || 'ar').slice(0, 2);
  if (['ar', 'en', 'fr'].indexOf(lang) < 0) lang = 'ar';

  var L = {
    ar: {
      listen: 'استمع', listening: 'جارٍ الاستماع…', paused: 'متوقف مؤقتاً',
      play: 'تشغيل', pause: 'إيقاف مؤقت', stop: 'إيقاف',
      note: 'هذا الصوت آلي، وقد تحدث أخطاء غير مقصودة في النطق.',
      noVoice: 'لا تتوفر قراءة صوتية بهذه اللغة على هذا الجهاز.',
      speed: 'السرعة', totalTitle: 'المدة الكلية تقديرية',
      dir: 'rtl', speechLang: 'ar-SA', wpm: 130
    },
    en: {
      listen: 'Listen', listening: 'Listening…', paused: 'Paused',
      play: 'Play', pause: 'Pause', stop: 'Stop',
      note: 'This is an automatic voice; pronunciation errors may occur.',
      noVoice: 'No voice is available for this language on this device.',
      speed: 'Speed', totalTitle: 'Total duration is an estimate',
      dir: 'ltr', speechLang: 'en-US', wpm: 150
    },
    fr: {
      listen: 'Écouter', listening: 'Lecture en cours…', paused: 'En pause',
      play: 'Lecture', pause: 'Pause', stop: 'Arrêter',
      note: 'Cette voix est automatique ; des erreurs de prononciation peuvent survenir.',
      noVoice: 'Aucune voix n’est disponible pour cette langue sur cet appareil.',
      speed: 'Vitesse', totalTitle: 'La durée totale est une estimation',
      dir: 'ltr', speechLang: 'fr-FR', wpm: 145
    }
  }[lang];

  /* ---------- collect + wrap sentences ---------- */
  /* Precise match for the sources heading only (content headings also
     contain words like "link" / "sources", so a loose match would skip
     real sections). AR: روابط الأبحاث العلمية · EN: Scientific research
     links / Scientific sources · FR: Liens vers les recherches
     scientifiques / Sources scientifiques. */
  var SOURCE_RE = /روابط الأبحاث|Scientific research links|Scientific sources|Liens vers les recherches scientifiques|Sources scientifiques/i;
  var sentences = []; /* {el, text, words, heading} */

  function wrapBlock(el, heading) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var parts = heading ? [node.nodeValue.trim()].filter(Boolean) : splitSentences(node.nodeValue);
      if (!parts.length) return;
      var frag = document.createDocumentFragment();
      parts.forEach(function (part, idx) {
        if (idx > 0) frag.appendChild(document.createTextNode(' '));
        var span = document.createElement('span');
        span.className = 'bayt-audio-sent';
        span.textContent = part;
        frag.appendChild(span);
        sentences.push({ el: span, text: part, words: wordCount(part), heading: !!heading });
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

  function processElement(el) {
    if (!el || el.nodeType !== 1) return;
    var tag = el.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      Array.prototype.forEach.call(el.children, function (li) { processElement(li); });
      return;
    }
    if (tag === 'div') {
      Array.prototype.forEach.call(el.children, function (c) { processElement(c); });
      return;
    }
    if (tag === 'p' || tag === 'li' || tag === 'h2' || tag === 'h3') {
      if (el.className && /(^|\s)text-gray-500(\s|$)/.test(el.className)) return; /* bottom disclaimer */
      wrapBlock(el, tag === 'h2' || tag === 'h3');
    }
  }

  var kids = Array.prototype.slice.call(body.children);
  for (var k = 0; k < kids.length; k++) {
    var child = kids[k];
    if (child.tagName && child.tagName.toLowerCase() === 'h2' && SOURCE_RE.test(child.textContent)) {
      k++; /* skip the sources list right after the sources heading */
      continue;
    }
    processElement(child);
  }
  if (!sentences.length) return;

  /* ---------- chunks: 1-2 sentences, ~28 words max; headings alone ---------- */
  var chunks = [];
  var cur = null;
  function flush() { if (cur && cur.spans.length) chunks.push(cur); cur = null; }
  sentences.forEach(function (s) {
    if (s.heading) {
      flush();
      chunks.push({ spans: [s.el], text: s.text, words: s.words });
      return;
    }
    if (!cur) cur = { spans: [], text: '', words: 0, count: 0 };
    if ((cur.words + s.words > 28 || cur.count >= 2) && cur.spans.length) flush();
    if (!cur) cur = { spans: [], text: '', words: 0, count: 0 };
    cur.spans.push(s.el);
    cur.text += (cur.text ? ' ' : '') + s.text;
    cur.words += s.words;
    cur.count++;
  });
  flush();
  if (!chunks.length) return;

  var totalWords = chunks.reduce(function (a, c) { return a + c.words; }, 0);
  function totalSeconds(rate) { return totalWords / L.wpm * 60 / rate; }

  /* ---------- voices ---------- */
  var voice = null;
  function pickVoice() {
    var vs = window.speechSynthesis.getVoices() || [];
    var match = vs.filter(function (v) { return (v.lang || '').toLowerCase().indexOf(lang) === 0; });
    if (!match.length) { voice = null; return false; }
    var google = match.filter(function (v) { return /google/i.test(v.name); });
    var ms = match.filter(function (v) { return /microsoft|natural/i.test(v.name); });
    voice = (google[0] || ms[0] || match[0]);
    return true;
  }
  pickVoice();
  if (window.speechSynthesis.addEventListener) {
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }

  /* ---------- player UI ---------- */
  var css = [
    '.bayt-audio{margin:0 0 1.5rem;background:#f0fdfa;border:1px solid #99f6e4;border-radius:1rem;padding:12px 14px;}',
    '.bayt-audio-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}',
    '.bayt-audio-play{flex:0 0 auto;width:46px;height:46px;border-radius:999px;border:0;cursor:pointer;background:#0f766e;color:#fff;display:flex;align-items:center;justify-content:center;}',
    '.bayt-audio-play svg{width:20px;height:20px;fill:#fff;}',
    '.bayt-audio-stop{flex:0 0 auto;width:34px;height:34px;border-radius:999px;border:1px solid #99f6e4;background:#fff;color:#0f766e;cursor:pointer;font-size:13px;line-height:1;}',
    '.bayt-audio-mid{flex:1 1 220px;min-width:180px;}',
    '.bayt-audio-top{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}',
    '.bayt-audio-title{font-weight:800;color:#134e4a;font-size:15px;}',
    '.bayt-audio-status{font-size:12.5px;color:#0f766e;}',
    '.bayt-audio-time{font-size:12.5px;color:#475569;margin-inline-start:auto;font-variant-numeric:tabular-nums;}',
    '.bayt-audio-track{height:8px;border-radius:999px;background:#ccfbf1;cursor:pointer;margin-top:8px;overflow:hidden;}',
    '.bayt-audio-fill{height:100%;width:0%;background:#c9a227;border-radius:999px;}',
    '.bayt-audio-speed{display:flex;gap:4px;}',
    '.bayt-audio-speed button{border:1px solid #99f6e4;background:#fff;color:#0f766e;border-radius:999px;padding:4px 9px;font-size:12.5px;font-weight:700;cursor:pointer;}',
    '.bayt-audio-speed button[aria-pressed="true"]{background:#0f766e;color:#fff;border-color:#0f766e;}',
    '.bayt-audio-note{margin:8px 0 0;font-size:12px;color:#64748b;}',
    '.bayt-audio-sent.bayt-audio-active{background:#fef3c7;border-radius:4px;box-decoration-break:clone;-webkit-box-decoration-break:clone;}'
  ].join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

  var player = document.createElement('div');
  player.className = 'bayt-audio';
  player.id = 'bayt-audio-player';
  player.setAttribute('dir', L.dir);
  player.innerHTML =
    '<div class="bayt-audio-row">' +
      '<button type="button" class="bayt-audio-play" aria-label="' + L.play + '">' + ICON_PLAY + '</button>' +
      '<div class="bayt-audio-mid">' +
        '<div class="bayt-audio-top">' +
          '<span class="bayt-audio-title">' + L.listen + '</span>' +
          '<span class="bayt-audio-status"></span>' +
          '<span class="bayt-audio-time" title="' + L.totalTitle + '">0:00 / ≈' + formatTime(totalSeconds(1)) + '</span>' +
        '</div>' +
        '<div class="bayt-audio-track" role="slider" aria-label="' + L.listen + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0">' +
          '<div class="bayt-audio-fill"></div>' +
        '</div>' +
      '</div>' +
      '<div class="bayt-audio-speed" role="group" aria-label="' + L.speed + '">' +
        '<button type="button" data-rate="1" aria-pressed="true">1x</button>' +
        '<button type="button" data-rate="1.25" aria-pressed="false">1.25x</button>' +
        '<button type="button" data-rate="1.5" aria-pressed="false">1.5x</button>' +
        '<button type="button" data-rate="2" aria-pressed="false">2x</button>' +
      '</div>' +
      '<button type="button" class="bayt-audio-stop" aria-label="' + L.stop + '">■</button>' +
    '</div>' +
    '<p class="bayt-audio-note">' + L.note + '</p>';
  body.parentNode.insertBefore(player, body);

  var playBtn = player.querySelector('.bayt-audio-play');
  var stopBtn = player.querySelector('.bayt-audio-stop');
  var statusEl = player.querySelector('.bayt-audio-status');
  var timeEl = player.querySelector('.bayt-audio-time');
  var trackEl = player.querySelector('.bayt-audio-track');
  var fillEl = player.querySelector('.bayt-audio-fill');
  var speedBtns = Array.prototype.slice.call(player.querySelectorAll('.bayt-audio-speed button'));

  /* ---------- playback state ---------- */
  var status = 'idle'; /* idle | playing | paused | done */
  var index = 0;
  var rate = 1;
  var wordsDone = 0; /* words in fully spoken chunks */
  var chunkStartAt = 0; /* performance.now() when the current chunk started */
  var gen = 0; /* utterance generation: stale callbacks are ignored */
  var timer = null;

  function chunkEstSeconds(c) { return c.words / L.wpm * 60 / rate; }

  function wordsSpokenNow() {
    if (status !== 'playing' || index >= chunks.length) return wordsDone;
    var c = chunks[index];
    var frac = Math.min(1, (performance.now() - chunkStartAt) / 1000 / Math.max(0.5, chunkEstSeconds(c)));
    return wordsDone + c.words * frac;
  }

  function render() {
    var spoken = (status === 'done') ? totalWords : wordsSpokenNow();
    var frac = totalWords ? Math.min(1, spoken / totalWords) : 0;
    fillEl.style.width = (frac * 100).toFixed(1) + '%';
    trackEl.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    var elapsed = frac * totalSeconds(rate);
    timeEl.textContent = formatTime(elapsed) + ' / ≈' + formatTime(totalSeconds(rate));
    statusEl.textContent = status === 'playing' ? L.listening : (status === 'paused' ? L.paused : '');
    playBtn.innerHTML = status === 'playing' ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute('aria-label', status === 'playing' ? L.pause : L.play);
  }

  function highlight(i, on) {
    if (!chunks[i]) return;
    chunks[i].spans.forEach(function (s) {
      if (on) s.classList.add('bayt-audio-active'); else s.classList.remove('bayt-audio-active');
    });
  }

  function scrollToChunk(i) {
    var s = chunks[i] && chunks[i].spans[0];
    if (!s) return;
    var r = s.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 70) {
      if (typeof s.scrollIntoView === 'function') s.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function clearTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function startTimer() {
    clearTimer();
    timer = setInterval(render, 300);
  }

  function speakChunk(i) {
    if (i >= chunks.length) { finish(); return; }
    var myGen = ++gen;
    var u = new SpeechSynthesisUtterance(chunks[i].text);
    u.lang = voice ? voice.lang : L.speechLang;
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onstart = function () {
      if (myGen !== gen) return;
      highlight(i, true);
      scrollToChunk(i);
      chunkStartAt = performance.now();
    };
    u.onend = function () {
      if (myGen !== gen) return;
      highlight(i, false);
      wordsDone += chunks[i].words;
      index = i + 1;
      if (status === 'playing') speakChunk(index);
    };
    u.onerror = function (ev) {
      if (myGen !== gen) return;
      if (ev && (ev.error === 'canceled' || ev.error === 'interrupted')) return; /* our own stop/pause/seek */
      stopAll();
      statusEl.textContent = L.noVoice;
    };
    window.speechSynthesis.speak(u);
  }

  function startFrom(i) {
    if (!pickVoice()) {
      statusEl.textContent = L.noVoice;
      return;
    }
    index = i;
    wordsDone = 0;
    for (var j = 0; j < i; j++) wordsDone += chunks[j].words;
    status = 'playing';
    startTimer();
    render();
    speakChunk(index);
  }

  function finish() {
    status = 'done';
    index = 0;
    wordsDone = totalWords;
    clearTimer();
    render();
  }

  function stopAll() {
    gen++; /* invalidate any in-flight utterance callbacks */
    window.speechSynthesis.cancel();
    if (index < chunks.length) highlight(index, false);
    index = 0;
    wordsDone = 0;
    status = 'idle';
    clearTimer();
    render();
  }

  playBtn.addEventListener('click', function () {
    if (status === 'playing') {
      /* Pause = cancel + remember the chunk (deterministic; avoids the
         Chrome pause/resume bug on long utterances). Resume re-reads
         the current chunk from its start. */
      gen++;
      window.speechSynthesis.cancel();
      highlight(index, false);
      status = 'paused';
      clearTimer();
      render();
    } else if (status === 'paused') {
      status = 'playing';
      startTimer();
      render();
      speakChunk(index);
    } else {
      startFrom(status === 'done' ? 0 : index);
    }
  });

  stopBtn.addEventListener('click', stopAll);

  speedBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      rate = parseFloat(b.getAttribute('data-rate')) || 1;
      speedBtns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      timeEl.textContent = formatTime((status === 'done' ? totalWords : wordsSpokenNow()) / totalWords * totalSeconds(rate)) + ' / ≈' + formatTime(totalSeconds(rate));
      if (status === 'playing') {
        gen++;
        window.speechSynthesis.cancel();
        highlight(index, false);
        speakChunk(index); /* restart the current chunk at the new speed */
      }
    });
  });

  function seekFromEvent(ev) {
    var rect = trackEl.getBoundingClientRect();
    var x = (ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0] ? ev.touches[0].clientX : rect.left));
    var frac = Math.min(1, Math.max(0, (x - rect.left) / rect.width));
    var targetWord = frac * totalWords;
    var acc = 0, target = 0;
    for (var i = 0; i < chunks.length; i++) {
      if (acc + chunks[i].words >= targetWord) { target = i; break; }
      acc += chunks[i].words;
      target = i;
    }
    gen++;
    window.speechSynthesis.cancel();
    highlight(index, false);
    if (status === 'playing' || status === 'paused') {
      index = target;
      wordsDone = 0;
      for (var j = 0; j < target; j++) wordsDone += chunks[j].words;
      status = 'playing';
      startTimer();
      render();
      speakChunk(index);
    } else {
      index = target;
      wordsDone = 0;
      for (var j2 = 0; j2 < target; j2++) wordsDone += chunks[j2].words;
      render();
    }
  }
  trackEl.addEventListener('click', seekFromEvent);
  trackEl.addEventListener('keydown', function (ev) {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    ev.preventDefault();
    var dir = (L.dir === 'rtl' ? -1 : 1) * (ev.key === 'ArrowRight' ? 1 : -1);
    var target = Math.min(chunks.length - 1, Math.max(0, index + dir));
    gen++;
    window.speechSynthesis.cancel();
    highlight(index, false);
    index = target;
    wordsDone = 0;
    for (var j = 0; j < target; j++) wordsDone += chunks[j].words;
    if (status === 'playing') { startTimer(); render(); speakChunk(index); }
    else render();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && status === 'playing') playBtn.click(); /* pause when the tab hides */
  });
  window.addEventListener('pagehide', stopAll);
})();
