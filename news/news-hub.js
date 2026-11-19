/* Bayt wikaya news hub: renders the saved-articles section from localStorage.
   Loaded by the news hub pages (news.html, en/news.html, fr/news.html).
   Reads the same key the article pages write ('baytwikaya-saved-articles');
   the section stays hidden when nothing is saved. */
(function () {
  'use strict';

  var KEY = 'baytwikaya-saved-articles';

  function loadSaved() {
    try { return JSON.parse(window.localStorage.getItem(KEY) || '[]'); }
    catch (e) { return []; }
  }

  var section = document.getElementById('saved-section');
  var list = document.getElementById('saved-list');
  if (!section || !list) return;

  var items = loadSaved();
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
