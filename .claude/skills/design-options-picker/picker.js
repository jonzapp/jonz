/* Design picker engine, v2. Reads window.PICKER (shape in SKILL.md) and draws the page into #picker.
   Theme: C.theme dresses the picker in the product's own house style.
   Items: one page can hold several separate things to decide (C.items); each has its own question and options.
   Flows: an option's screen can be a list of steps ([{label, html}, ...]) instead of one picture.
   Live preview: opens one option full size and clickable; [data-go] links move between its steps. */
(function () {
  'use strict';
  var C = window.PICKER;
  var root = document.getElementById('picker');
  if (!C || !root) return;

  // ---- theme: the picker wears the product's own house style when C.theme is set ----
  (function applyTheme(T) {
    if (!T) return;
    var map = { bg: 'bg', surface: 'surface', sunk: 'sunk', fg: 'fg', muted: 'muted', line: 'line', accent: 'accent', onAccent: 'on-accent', bezel: 'bezel', rec: 'rec', onRec: 'on-rec' };
    function vars(o) { return Object.keys(o || {}).filter(function (k) { return map[k]; }).map(function (k) { return '--pk-' + map[k] + ':' + o[k]; }).join(';'); }
    var base = [];
    if (T.font) base.push('--pk-font:' + T.font);
    if (T.display) base.push('--pk-display:' + T.display);
    if (T.titleCase) base.push('--pk-title-case:' + T.titleCase);
    if (T.titleWeight) base.push('--pk-title-weight:' + T.titleWeight);
    var css = ':root{' + base.concat(vars(T.light)).join(';') + '}';
    if (T.dark) css += '@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){' + vars(T.dark) + ';color-scheme:dark}}:root[data-theme="dark"]{' + vars(T.dark) + ';color-scheme:dark}';
    var st = document.createElement('style');
    st.textContent = css;
    (document.body || document.head).appendChild(st); // after picker.css, so it wins
  })(C.theme);

  var PRESETS = {
    phone: { id: 'phone', label: 'Phone', width: 390, height: 844 },
    tablet: { id: 'tablet', label: 'Tablet', width: 820, height: 1180 },
    laptop: { id: 'laptop', label: 'Laptop', width: 1440, height: 900 },
    wide: { id: 'wide', label: 'Big screen', width: 1920, height: 1080, frame: 'laptop' }
  };
  var VIEW_LABELS = { stage: 'One at a time', side: 'Side by side', scroll: 'Scroll all' };
  function mkScreens(list) {
    return (list || ['phone', 'laptop']).map(function (s) {
      return typeof s === 'string' ? PRESETS[s] : Object.assign({}, PRESETS[s.id] || {}, s);
    });
  }
  var looks = C.looks || ['day', 'night'];
  var lookLabels = Object.assign({ day: 'Day', night: 'Night', light: 'Light', dark: 'Dark' }, C.lookLabels || {});
  var views = C.views || ['stage', 'side', 'scroll'];

  var items = (C.items || [C]).map(function (it, i) {
    var n = 0;
    var opts = it.options.map(function (o) {
      return Object.assign({ letter: o.letter || (o.now ? 'Now' : String.fromCharCode(65 + n++)) }, o);
    });
    return Object.assign({}, it, {
      id: it.id || 'item' + (i + 1),
      name: it.name || it.title || C.title,
      opts: opts,
      screens: mkScreens(it.screens || C.screens),
      css: (C.css || '') + '\n' + (it === C ? '' : (it.css || ''))
    });
  });

  function themeIsDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t) return t === 'dark';
    try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { return false; }
  }
  var S = {
    item: items[0].id,
    pick: {},
    step: 0,
    screen: items[0].screens[0].id,
    look: looks.length > 1 && themeIsDark() ? looks[1] : looks[0],
    view: C.view || 'stage',
    actual: false
  };
  items.forEach(function (it) { S.pick[it.id] = (it.opts.filter(function (o) { return o.id === it.recommended; })[0] || it.opts[0]).id; });
  if (innerWidth >= 900 && items[0].screens.some(function (s) { return s.id === 'laptop'; })) S.screen = 'laptop';

  function item() { return items.filter(function (i) { return i.id === S.item; })[0]; }
  function opt(id) { var want = id || S.pick[S.item]; return item().opts.filter(function (o) { return o.id === want; })[0]; }
  function screenOf(id) { return item().screens.filter(function (s) { return s.id === id; })[0] || item().screens[0]; }

  // Hash: #item--b-phone-night-side
  function readHash() {
    var h = (location.hash || '').replace('#', ''), parts = h.split('--');
    if (parts.length > 1 && items.some(function (i) { return i.id === parts[0]; })) { S.item = parts[0]; h = parts[1]; }
    h.split('-').forEach(function (b) {
      if (item().opts.some(function (o) { return o.id === b; })) S.pick[S.item] = b;
      else if (item().screens.some(function (s) { return s.id === b; })) S.screen = b;
      else if (looks.indexOf(b) > -1) S.look = b;
      else if (views.indexOf(b) > -1) S.view = b;
    });
  }
  function writeHash() {
    var h = '#' + (items.length > 1 ? S.item + '--' : '') + [S.pick[S.item], screenOf(S.screen).id, S.look, S.view].join('-');
    if (location.hash !== h) try { history.replaceState(null, '', h); } catch (e) {}
  }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    });
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function recBadge(it, o) { return o.id === it.recommended ? ' <span class="pk-rec">Recommended</span>' : ''; }

  // ---- what an option shows on a screen: always a list of steps ----
  function steps(o, scr, look) {
    var c = o.screens && o.screens[scr.id];
    if (typeof c === 'function') c = c(look, scr);
    if (c == null) return [];
    var list = Array.isArray(c) ? c : [c];
    return list.map(function (s, i) {
      if (typeof s === 'function') s = s(look, scr);
      if (typeof s === 'string') s = { html: s };
      return Object.assign({ label: list.length > 1 ? 'Step ' + (i + 1) : '' }, s);
    });
  }

  // ---- devices: the screen is drawn at its real size, then scaled to fit ----
  var devices = [];
  function paint(screen, o, st, look, scr, live, go) {
    screen.innerHTML = '';
    if (!st) { screen.appendChild(el('div', { class: 'pk-empty' }, 'No ' + esc(scr.label.toLowerCase()) + ' picture for this option')); return; }
    if (st.img) {
      var src = typeof st.img === 'string' ? st.img : (st.img[look] || st.img[looks[0]]);
      screen.appendChild(el('img', { src: src, alt: o.name + (st.label ? ', ' + st.label : '') + ', ' + scr.label }));
      return;
    }
    var host = el('div', { class: look, role: live ? 'region' : 'img', 'aria-label': o.name + (st.label ? ', ' + st.label : '') + ' on a ' + scr.label.toLowerCase() });
    host.style.cssText = 'display:block;width:100%;height:100%' + (live ? '' : ';pointer-events:none');
    var sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = '<style>:host{all:initial;display:block;width:100%;height:100%;overflow:hidden}*{box-sizing:border-box}' + item().css + '</style>' + st.html;
    screen.appendChild(host);
    if (live) {
      sh.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-go]');
        if (t) { e.preventDefault(); go(t.getAttribute('data-go')); }
      });
      var setup = st.setup || o.setup || item().setup || C.setup;
      if (typeof setup === 'function') try { setup(sh, { look: look, screen: scr, option: o, go: go }); } catch (err) { console.error(err); }
    }
  }
  function device(o, scr, look, st, caption, extra) {
    extra = extra || {};
    var frame = scr.frame || scr.id;
    var wrap = el('div', { class: 'pk-dev pk-dev-' + (frame === 'wide' ? 'laptop' : frame) });
    if (caption) wrap.appendChild(el('div', { class: 'pk-cap', text: caption }));
    var fit = el('div', { class: 'pk-fit' });
    var body = el('div', { class: 'pk-body' });
    if (frame === 'laptop' || frame === 'wide') body.appendChild(el('div', { class: 'pk-chrome' }, '<i></i><i></i><i></i>'));
    var clip = el('div', { class: 'pk-screen-clip' });
    var screen = el('div', { class: 'pk-screen' });
    screen.style.width = scr.width + 'px';
    screen.style.height = scr.height + 'px';
    paint(screen, o, st, look, scr, extra.live, extra.go);
    clip.appendChild(screen); body.appendChild(clip); fit.appendChild(body); wrap.appendChild(fit);
    devices.push({ fit: fit, body: body, clip: clip, screen: screen, scr: scr, maxH: extra.maxH, actual: extra.actual });
    return wrap;
  }
  function fitAll() {
    devices = devices.filter(function (d) { return d.fit.isConnected; });
    devices.forEach(function (d) {
      var padX = (parseFloat(getComputedStyle(d.body).paddingLeft) || 0) * 2;
      var avail = d.fit.clientWidth - padX;
      var k = d.actual ? 1 : Math.min(1, avail / d.scr.width);
      if (!d.actual && d.maxH && d.scr.height * k > d.maxH) k = d.maxH / d.scr.height;
      d.screen.style.transform = 'scale(' + k + ')';
      d.clip.style.width = Math.round(d.scr.width * k) + 'px';
      d.clip.style.height = Math.round(d.scr.height * k) + 'px';
    });
  }

  // ---- live preview: one option full size, clickable ----
  var live = null;
  function openLive(o, scr) {
    closeLive();
    var list = steps(o, scr, S.look), at = 0;
    if (!list.length) return;
    var ov = el('div', { class: 'pk-live', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Live preview of ' + o.name });
    var top = el('div', { class: 'pk-live-bar' });
    var title = el('div', { class: 'pk-live-title' }, '<b>' + esc(o.letter + '. ' + o.name) + '</b> <span class="pk-muted">' + esc(scr.label + ', ' + (lookLabels[S.look] || S.look)) + '</span>');
    var stepNote = el('div', { class: 'pk-muted pk-live-step' });
    title.appendChild(stepNote);
    top.appendChild(title);
    var acts = el('div', { class: 'pk-row' });
    var url = o.liveUrl && (typeof o.liveUrl === 'string' ? o.liveUrl : o.liveUrl[scr.id]);
    if (url) acts.appendChild(el('a', { class: 'pk-btn ghost', href: url, target: '_blank', rel: 'noopener' }, 'Open the real app ↗'));
    var restart = el('button', { type: 'button', class: 'pk-btn ghost', text: 'Start again' });
    var close = el('button', { type: 'button', class: 'pk-btn', text: 'Close' });
    if (list.length > 1) acts.appendChild(restart);
    acts.appendChild(close);
    top.appendChild(acts);
    ov.appendChild(top);
    var stage = el('div', { class: 'pk-live-stage' });
    ov.appendChild(stage);
    ov.appendChild(el('p', { class: 'pk-muted pk-live-hint' }, list.length > 1 ? 'Tap through it like the real thing. Buttons that lead somewhere take you to the next screen.' : 'Tap around. This is the mockup at full size.'));
    function go(to) {
      if (to === 'next') at = Math.min(at + 1, list.length - 1);
      else if (to === 'back') at = Math.max(at - 1, 0);
      else if (to === 'start') at = 0;
      else { var n = parseInt(to, 10); if (!isNaN(n)) at = Math.max(0, Math.min(list.length - 1, n - 1)); else list.forEach(function (s, i) { if (s.id === to || s.label === to) at = i; }); }
      draw();
    }
    function draw() {
      stage.innerHTML = '';
      var d = device(o, scr, S.look, list[at], null, { live: true, go: go });
      d.style.width = scr.width > 600 ? '100%' : (scr.width + 18) + 'px';
      stage.appendChild(d);
      var rec = devices[devices.length - 1], pad = scr.width > 600 ? 26 : 18;
      rec.maxH = Math.max(280, innerHeight - stage.getBoundingClientRect().top - pad - 56);
      stepNote.textContent = list.length > 1 ? 'Screen ' + (at + 1) + ' of ' + list.length + (list[at].label ? ': ' + list[at].label : '') : '';
      fitAll();
    }
    restart.addEventListener('click', function () { go('start'); });
    close.addEventListener('click', closeLive);
    ov.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLive(); });
    document.body.appendChild(ov);
    document.documentElement.classList.add('pk-locked');
    live = { ov: ov, from: document.activeElement };
    draw();
    close.focus();
  }
  function closeLive() {
    if (!live) return;
    live.ov.remove();
    document.documentElement.classList.remove('pk-locked');
    if (live.from && live.from.focus) live.from.focus();
    live = null;
  }
  function liveBtn(o, scr, small, label) {
    var b = el('button', { type: 'button', class: 'pk-btn' + (small ? ' ghost small' : ''), text: label || '▶ Live preview' });
    b.addEventListener('click', function (e) { e.stopPropagation(); openLive(o, scr); });
    return b;
  }

  // ---- chrome ----
  function seg(label, key, values, labels) {
    var span = el('span', { class: 'pk-segwrap' });
    span.appendChild(el('span', { class: 'pk-label', text: label }));
    var g = el('span', { class: 'pk-seg', role: 'group', 'aria-label': label });
    values.forEach(function (v) { g.appendChild(el('button', { type: 'button', 'data-k': key, 'data-v': v, 'aria-pressed': 'false', text: labels[v] || v })); });
    span.appendChild(g);
    span.hidden = values.length < 2;
    return span;
  }
  function picksText() {
    if (items.length === 1) { var o = opt(); return 'Pick ' + o.letter + ': ' + o.name; }
    return 'Picks: ' + items.map(function (it) {
      var o = it.opts.filter(function (x) { return x.id === S.pick[it.id]; })[0];
      return it.name + ' ' + o.letter + ' (' + o.name + ')';
    }).join('; ');
  }

  var els = {};
  function build() {
    root.innerHTML = '';
    root.className = 'pk';
    var head = el('header', { class: 'pk-head' });
    if (C.project) head.appendChild(el('div', { class: 'pk-eyebrow', text: C.project }));
    head.appendChild(el('h1', { text: C.title }));
    if (C.intro) head.appendChild(el('p', { class: 'pk-muted' }, C.intro));
    root.appendChild(head);

    var bar = el('div', { class: 'pk-bar', role: 'toolbar', 'aria-label': 'What to show' });
    if (items.length > 1) {
      var tabs = el('nav', { class: 'pk-items', 'aria-label': 'What we are deciding' });
      items.forEach(function (it, i) {
        tabs.appendChild(el('button', { type: 'button', class: 'pk-item', 'data-item': it.id, 'aria-pressed': 'false' },
          '<span class="pk-item-n">' + (i + 1) + '</span><span class="pk-item-text"><b>' + esc(it.name) + '</b><span class="pk-item-pick"></span></span>'));
      });
      bar.appendChild(tabs);
    }
    els.opts = el('div', { class: 'pk-opts', role: 'group', 'aria-label': 'Options' });
    bar.appendChild(els.opts);
    var row2 = el('div', { class: 'pk-row pk-switches' });
    els.screenSeg = el('span');
    row2.appendChild(els.screenSeg);
    row2.appendChild(seg('Look', 'look', looks, lookLabels));
    row2.appendChild(seg('Show', 'view', views, VIEW_LABELS));
    bar.appendChild(row2);

    root.appendChild(bar);
    els.ask = el('section', { class: 'pk-ask', 'aria-label': 'The question' });
    root.appendChild(els.ask);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.item) {
        S.item = b.dataset.item; S.step = 0; S.actual = false;
        if (!item().screens.some(function (s) { return s.id === S.screen; })) S.screen = item().screens[0].id;
        render(true); window.scrollTo(0, Math.min(scrollY, root.querySelector('.pk-bar').offsetTop)); return;
      }
      if (b.dataset.opt) {
        S.pick[S.item] = b.dataset.opt;
        if (S.view === 'scroll') { render(); var s = document.getElementById('pk-sec-' + b.dataset.opt); if (s) s.scrollIntoView({ behavior: 'smooth' }); return; }
      } else if (b.dataset.k) { S[b.dataset.k] = b.dataset.v; S.actual = false; S.step = 0; }
      render();
    });
    els.main = el('main');
    root.appendChild(els.main);
    if (C.footer) root.appendChild(el('footer', { class: 'pk-muted' }, C.footer));
  }

  function renderAsk() {
    var it = item(), rec = it.opts.filter(function (o) { return o.id === it.recommended; })[0];
    els.ask.innerHTML = '';
    var t = el('div');
    t.appendChild(el('p', null, '<b>' + esc(it.question || 'Which one?') + '</b>'));
    if (C.items && it.intro) t.appendChild(el('p', { class: 'pk-muted' }, it.intro));
    if (rec) t.appendChild(el('p', { class: 'pk-muted' }, 'I recommend <b>' + esc(rec.letter + ', ' + rec.name) + '</b>' + (it.why ? '. ' + it.why : '.')));
    els.ask.appendChild(t);
    var btns = el('div', { class: 'pk-row' });
    var copy = el('button', { type: 'button', class: 'pk-btn', text: items.length > 1 ? 'Copy my picks' : 'Copy "' + picksText() + '"' });
    var note = el('span', { class: 'pk-copied', 'aria-live': 'polite' });
    copy.addEventListener('click', function () {
      var txt = picksText();
      try { navigator.clipboard.writeText(txt).then(function () { note.textContent = 'Copied "' + txt + '". Paste it in the chat.'; }, function () { note.textContent = 'Say "' + txt + '" in the chat.'; }); }
      catch (e) { note.textContent = 'Say "' + txt + '" in the chat.'; }
    });
    btns.appendChild(copy); btns.appendChild(note);
    els.ask.appendChild(btns);
  }

  function notes(o, scr) {
    var it = item();
    var n = el('aside', { class: 'pk-notes', 'aria-label': 'About this option' });
    n.appendChild(el('h2', null, esc(o.letter + '. ' + o.name) + recBadge(it, o)));
    if (o.summary) n.appendChild(el('p', null, o.summary));
    if (o.good && o.good.length) { n.appendChild(el('h3', { text: 'Good' })); n.appendChild(el('ul', null, o.good.map(function (g) { return '<li>' + g + '</li>'; }).join(''))); }
    if (o.watch && o.watch.length) { n.appendChild(el('h3', { text: 'Watch out' })); n.appendChild(el('ul', null, o.watch.map(function (g) { return '<li>' + g + '</li>'; }).join(''))); }
    n.appendChild(liveBtn(o, scr));
    var nav = el('div', { class: 'pk-nav' });
    var i = it.opts.indexOf(o);
    var prev = el('button', { type: 'button', class: 'pk-btn ghost', text: '‹ Previous' });
    var next = el('button', { type: 'button', class: 'pk-btn ghost', text: 'Next ›' });
    prev.disabled = i === 0; next.disabled = i === it.opts.length - 1;
    prev.addEventListener('click', function () { stepOpt(-1); });
    next.addEventListener('click', function () { stepOpt(1); });
    nav.appendChild(prev); nav.appendChild(next);
    n.appendChild(nav);
    return n;
  }
  function stepOpt(d) {
    var it = item(), i = it.opts.indexOf(opt()) + d;
    if (i < 0 || i >= it.opts.length) return;
    S.pick[S.item] = it.opts[i].id; render();
  }

  function renderStage() {
    var o = opt(), scr = screenOf(S.screen), list = steps(o, scr, S.look);
    var big = scr.width > 600;
    var wrap = el('div', { class: 'pk-stage' });
    var col = el('div', { class: 'pk-col' });
    if (list.length > 1) col.appendChild(el('p', { class: 'pk-muted pk-flow-note', text: list.length + ' screens' + (big ? ', one under another.' : '. Swipe sideways to see them all.') }));
    var canvas = el('div', { class: 'pk-canvas ' + (big ? 'big' : 'flow') + (S.actual ? ' pk-actual' : '') });
    if (!list.length) list = [null];
    list.forEach(function (st, i) {
      var c = st && list.length > 1 ? (i + 1) + '. ' + (st.label || 'Step ' + (i + 1)) : scr.label + ', ' + (lookLabels[S.look] || S.look);
      if (big) c += S.actual ? '. Actual size, tap to fit' : '. Tap to see actual size';
      var d = device(o, scr, S.look, st, c, { actual: S.actual });
      if (big) { d.classList.add('zoom'); d.addEventListener('click', function () { S.actual = !S.actual; render(); }); }
      else d.style.width = (scr.width + 18) + 'px';
      canvas.appendChild(d);
    });
    col.appendChild(canvas);
    wrap.appendChild(col);
    wrap.appendChild(notes(o, scr));
    els.main.appendChild(wrap);
  }
  function renderSide() {
    var it = item(), scr = screenOf(S.screen);
    var lists = it.opts.map(function (o) { return steps(o, scr, S.look); });
    var most = Math.max.apply(null, lists.map(function (l) { return l.length; }));
    if (most > 1) {
      var longest = lists.filter(function (l) { return l.length === most; })[0];
      var row = el('div', { class: 'pk-row pk-steps' });
      row.appendChild(el('span', { class: 'pk-label', text: 'Screen of the flow' }));
      var g = el('span', { class: 'pk-seg', role: 'group', 'aria-label': 'Which screen of the flow' });
      longest.forEach(function (s, i) {
        var b = el('button', { type: 'button', 'aria-pressed': String(S.step === i), text: (i + 1) + '. ' + (s.label || 'Step ' + (i + 1)) });
        b.addEventListener('click', function () { S.step = i; render(); });
        g.appendChild(b);
      });
      row.appendChild(g);
      els.main.appendChild(row);
    }
    var grid = el('div', { class: 'pk-grid' });
    grid.style.setProperty('--pk-cols', String(scr.width > 1000 ? Math.min(it.opts.length, 2) : Math.min(it.opts.length, 4)));
    it.opts.forEach(function (o, idx) {
      var on = o.id === S.pick[S.item];
      var cell = el('div', { class: 'pk-cell' + (on ? ' on' : '') + (o.id === it.recommended ? ' rec' : '') });
      var headBtn = el('button', { type: 'button', class: 'pk-cell-head', 'aria-pressed': String(on) }, esc(o.letter + '. ' + o.name) + recBadge(it, o));
      headBtn.addEventListener('click', function () { S.pick[S.item] = o.id; render(); });
      cell.appendChild(headBtn);
      var l = lists[idx];
      cell.appendChild(device(o, scr, S.look, l[Math.min(S.step, l.length - 1)] || null));
      if (o.summary) cell.appendChild(el('p', { class: 'pk-muted' }, o.summary));
      cell.appendChild(liveBtn(o, scr, true));
      grid.appendChild(cell);
    });
    els.main.appendChild(grid);
  }
  function renderScroll() {
    var it = item();
    var story = el('div', { class: 'pk-story' });
    it.opts.forEach(function (o) {
      var sec = el('section', { class: 'pk-sec', id: 'pk-sec-' + o.id });
      var h = el('div', { class: 'pk-sec-head' });
      h.appendChild(el('h2', null, esc(o.letter + '. ' + o.name) + recBadge(it, o)));
      if (o.summary) h.appendChild(el('p', null, o.summary));
      sec.appendChild(h);
      if ((o.good && o.good.length) || (o.watch && o.watch.length)) {
        var cards = el('div', { class: 'pk-cards' });
        if (o.good && o.good.length) cards.appendChild(el('div', null, '<b>Good</b>' + o.good.join(' ')));
        if (o.watch && o.watch.length) cards.appendChild(el('div', null, '<b>Watch out</b>' + o.watch.join(' ')));
        sec.appendChild(cards);
      }
      it.screens.forEach(function (scr) {
        var list = steps(o, scr, S.look);
        var big = scr.width > 600;
        var row = el('div', { class: 'pk-canvas ' + (big ? 'big' : 'flow') });
        list.forEach(function (st, i) {
          var d = device(o, scr, S.look, st, scr.label + (list.length > 1 ? ', ' + (i + 1) + '. ' + (st.label || 'Step ' + (i + 1)) : ''));
          if (!big) d.style.width = Math.min(scr.width + 18, 320) + 'px';
          row.appendChild(d);
        });
        sec.appendChild(row);
      });
      var lb = el('div', { class: 'pk-row' });
      it.screens.forEach(function (scr) { lb.appendChild(liveBtn(o, scr, true, '▶ Live preview, ' + scr.label.toLowerCase())); });
      sec.appendChild(lb);
      story.appendChild(sec);
    });
    els.main.appendChild(story);
  }

  function render(keepScroll) {
    var it = item(), o = opt();
    root.querySelectorAll('.pk-item').forEach(function (b) {
      var x = items.filter(function (i) { return i.id === b.dataset.item; })[0];
      var p = x.opts.filter(function (q) { return q.id === S.pick[x.id]; })[0];
      b.setAttribute('aria-pressed', String(b.dataset.item === S.item));
      b.querySelector('.pk-item-pick').textContent = 'Looking at ' + p.letter + ', ' + p.name;
    });
    els.opts.innerHTML = '';
    it.opts.forEach(function (x) {
      els.opts.appendChild(el('button', { type: 'button', class: 'pk-opt', 'data-opt': x.id, 'aria-pressed': String(x.id === o.id) },
        '<span class="pk-letter">' + esc(x.now ? 'N' : x.letter) + '</span>' + esc(x.now ? 'Now' : x.name) + recBadge(it, x)));
    });
    var ss = seg('Screen', 'screen', it.screens.map(function (s) { return s.id; }), it.screens.reduce(function (m, s) { m[s.id] = s.label; return m; }, {}));
    if (S.view === 'scroll') ss.hidden = true;
    els.screenSeg.replaceWith(ss); els.screenSeg = ss;
    root.querySelectorAll('.pk-switches .pk-seg button').forEach(function (b) {
      var cur = b.dataset.k === 'screen' ? screenOf(S.screen).id : S[b.dataset.k];
      b.setAttribute('aria-pressed', String(cur === b.dataset.v));
    });
    renderAsk();
    var y = scrollY;
    els.main.innerHTML = '';
    if (S.view === 'side') renderSide(); else if (S.view === 'scroll') renderScroll(); else renderStage();
    fitAll();
    if (!keepScroll) window.scrollTo(0, y);
    writeHash();
  }

  readHash();
  build();
  render(true);
  addEventListener('resize', fitAll);
  addEventListener('hashchange', function () { readHash(); render(); });
  addEventListener('keydown', function (e) {
    if (live) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') stepOpt(1); else if (e.key === 'ArrowLeft') stepOpt(-1);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);
})();
