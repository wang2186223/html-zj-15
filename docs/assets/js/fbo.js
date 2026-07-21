(function () {
  'use strict';

  var _u = 'https://czqmqnvqkugzpgwfmyth.supabase.co';
  var _k = 'sb_publishable_FF8-Z6gbAyjvHK77w4QfGw_02nCOhaw';

  function parsePageIds() {
    var parts = window.location.pathname.split('/');
    var novelId = parts[2] || '';
    var chapterRaw = (parts[3] || '').replace('.html', '').replace(/^chapter-/, '');
    var chapterId = parseInt(chapterRaw, 10);
    if (!novelId || isNaN(chapterId)) return null;
    return { novelId: novelId, chapterId: chapterId };
  }

  function isFBTraffic() {
    var hasFbUser = localStorage.getItem('\x66\x62\x5f\x75\x73\x65\x72') === '\x31';
    if (!hasFbUser) return false;
    var p = new URLSearchParams(window.location.search);
    if (p.has('fbclid') || p.get('utm_source') === 'facebook') return true;
    try {
      var s = JSON.parse(localStorage.getItem('trackingParams') || '{}');
      if (s.fbclid || s.utm_source === 'facebook') return true;
    } catch (e) {}
    return false;
  }

  function fetchChapter(nId, cId) {
    var url = _u + '/rest/v1/novel_chapters'
      + '?novel_id=eq.'   + encodeURIComponent(nId)
      + '&chapter_id=eq.' + cId
      + '&select=title,content&limit=1';
    return fetch(url, { headers: { 'apikey': _k, 'Authorization': 'Bearer ' + _k } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        if (!d || !d[0] || !d[0].content) return null;
        return d[0].content.split('\n\n')
          .map(function (s) { return s.trim(); })
          .filter(function (s) { return s.length > 0; });
      });
  }

  function applyOverlay(paras) {
    var blocks  = Array.from(document.querySelectorAll('.text-block'));
    var NUM     = 7;
    var groups  = [];

    if (paras.length >= NUM) {
      var base = Math.floor(paras.length / NUM);
      var remainder = paras.length % NUM;
      var s = 0;
      for (var g = 0; g < NUM; g++) {
        var size = base + (g < remainder ? 1 : 0);
        groups.push(paras.slice(s, s + size));
        s += size;
      }
    } else {
      var allWords = [];
      paras.forEach(function (p) {
        p.trim().split(/\s+/).forEach(function (w) { if (w) allWords.push(w); });
      });
      while (allWords.length < NUM) allWords.push(' ');
      var wPerGrp = Math.ceil(allWords.length / NUM);
      for (var g = 0; g < NUM; g++) {
        var s = g * wPerGrp, e = Math.min(s + wPerGrp, allWords.length);
        groups.push([ s < allWords.length ? allWords.slice(s, e).join(' ') : ' ' ]);
      }
    }

    var container = document.createElement('div');
    container.id  = 'fb-overlay-container';
    container.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:50'
    ].join(';');
    document.body.appendChild(container);

    blocks.forEach(function (block, i) {
      var group = groups[i];
      if (!group || !group.length) return;

      var rect    = block.getBoundingClientRect();
      var docTop  = rect.top  + window.scrollY;
      var docLeft = rect.left + window.scrollX;
      var maxW    = rect.width;

      var canvas = document.createElement('canvas');
      canvas.className = 'fb-ov';
      canvas.style.cssText = [
        'position:absolute', 'pointer-events:none', 'display:block',
        'top:'  + docTop  + 'px',
        'left:' + docLeft + 'px',
        'width:' + maxW + 'px'
      ].join(';');
      container.appendChild(canvas);

      var isDark  = document.body.classList.contains('dark-mode');
      var bgColor = isDark ? '#1C1C1E' : '#FFFFFF';
      var txColor = isDark ? '#E5E5EA' : '#333333';
      var st      = window.getComputedStyle(block);
      var fs      = parseFloat(st.fontSize);
      var lhRaw   = st.lineHeight;
      var lineH   = (lhRaw === 'normal') ? fs * 1.6 : parseFloat(lhRaw);
      var pGap    = 20;
      var curDpr  = window.devicePixelRatio || 1;
      var font    = 'normal ' + fs + 'px ' + st.fontFamily;

      var mCtx = document.createElement('canvas').getContext('2d');
      mCtx.font = font;

      var lines = [];
      group.forEach(function (para, pi) {
        var words = para.trim().split(' '), cur = '', ls = [];
        words.forEach(function (w) {
          if (!w) return;
          var test = cur ? cur + ' ' + w : w;
          if (cur && mCtx.measureText(test).width > maxW) { ls.push(cur); cur = w; }
          else { cur = test; }
        });
        if (cur) ls.push(cur);
        ls.forEach(function (ln, li) {
          var last = li === ls.length - 1;
          lines.push({ text: ln, lastInPara: last, gap: last && pi < group.length - 1 });
        });
      });

      var textH   = lines.reduce(function (h, l) { return h + lineH + (l.gap ? pGap : 0); }, 0);
      var canvasH = Math.ceil(textH + lineH + pGap);

      block.style.height = canvasH + 'px';
      var sb = block.querySelector('.text-scrollbar');
      if (sb) sb.style.display = 'none';

      canvas.width        = Math.ceil(maxW     * curDpr);
      canvas.height       = Math.ceil(canvasH  * curDpr);
      canvas.style.height = canvasH + 'px';

      var ctx = canvas.getContext('2d');
      ctx.setTransform(curDpr, 0, 0, curDpr, 0, 0);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, maxW, canvasH);
      ctx.font = font; ctx.fillStyle = txColor; ctx.textBaseline = 'top';

      var y = 1;
      lines.forEach(function (l) {
        var ws = l.text.split(' ');
        if (!l.lastInPara && ws.length > 1) {
          var wW = ws.reduce(function (a, w) { return a + ctx.measureText(w).width; }, 0);
          var gap = (maxW - wW) / (ws.length - 1), x = 0;
          ws.forEach(function (w) { ctx.fillText(w, x, y); x += ctx.measureText(w).width + gap; });
        } else { ctx.fillText(l.text, 0, y); }
        y += lineH;
        if (l.gap) y += pGap;
      });
    });

    function syncCanvasPositions() {
      var canvases = container.querySelectorAll('canvas.fb-ov');
      blocks.forEach(function (block, i) {
        var cv = canvases[i]; if (!cv) return;
        var r = block.getBoundingClientRect();
        cv.style.top  = (r.top  + window.scrollY) + 'px';
        cv.style.left = (r.left + window.scrollX) + 'px';
      });
    }

    var contentEl = document.querySelector('.content');
    if (contentEl) {
      new ResizeObserver(syncCanvasPositions).observe(contentEl);
    }
    setInterval(syncCanvasPositions, 5000);
  }

  function restoreText() {
    document.documentElement.classList.remove('fb-hide-text');
    document.querySelectorAll('.text-inner').forEach(function (el) {
      el.style.color = '';
    });
  }

  function loadAds() {
    (window.adsbygoogle = window.adsbygoogle || []).pauseAdRequests = 0;
    var ads = document.querySelectorAll('ins.adsbygoogle');
    ads.forEach(function (ad) {
      if (!ad.hasAttribute('data-adsbygoogle-status')) {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      }
    });
  }

  setTimeout(function () {
    var _ua = navigator.userAgent.toLowerCase();
    var _mobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile|opera mini|webos/.test(_ua);
    var _touch  = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    var _small  = window.screen.width < 1024;
    if (!_mobile && !_touch && !_small) { restoreText(); setTimeout(loadAds, 1000); return; }

    if (!isFBTraffic()) { restoreText(); setTimeout(loadAds, 1000); return; }

    var ids = parsePageIds();
    if (!ids) { restoreText(); setTimeout(loadAds, 1000); return; }

    fetchChapter(ids.novelId, ids.chapterId)
      .then(function (paras) {
        if (!paras) { restoreText(); setTimeout(loadAds, 1000); return; }
        applyOverlay(paras);
        restoreText(); setTimeout(loadAds, 1000);
      })
      .catch(function () { restoreText(); setTimeout(loadAds, 1000); });
  }, 2000);

})();
