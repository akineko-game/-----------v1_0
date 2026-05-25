/**
 * PhotoSlider — photo-slider.js
 * 画像・説明文ともに canvas モザイクで切替。説明文は画像に重ねて表示。
 */
(function (global) {
  'use strict';

  /* ================================================================
     共通定数
     ================================================================ */
  var MORPH_MS  = 1600;
  var PIXEL_MAX = 200;
  var MOVE_X    = 1.20;
  var MOVE_Y    = 0.90;

  /* ================================================================
     drawPixelated — canvas にモザイク描画
     ================================================================ */
  function drawPixelated(ctx, src, pixelSize, ox, oy, alpha) {
    var cw = ctx.canvas.width, ch = ctx.canvas.height;
    ctx.clearRect(0, 0, cw, ch);
    if (!src) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (pixelSize <= 1) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(src, ox, oy, cw, ch);
    } else {
      var sw = Math.max(1, Math.ceil(cw / pixelSize));
      var sh = Math.max(1, Math.ceil(ch / pixelSize));
      var tmp = document.createElement('canvas');
      tmp.width = sw; tmp.height = sh;
      var tCtx = tmp.getContext('2d');
      tCtx.imageSmoothingEnabled = true;
      tCtx.drawImage(src, 0, 0, sw, sh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sw, sh, ox, oy, cw, ch);
    }
    ctx.restore();
  }

  /* ================================================================
     loadBoth — 2枚の画像を並行ロード
     ================================================================ */
  function loadBoth(srcA, srcB, cb) {
    var res = [null, null], n = 0;
    function one(src, idx) {
      if (!src) { n++; if (n === 2) cb(res[0], res[1]); return; }
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = function () { res[idx] = img; if (++n === 2) cb(res[0], res[1]); };
      img.onerror = function () {                  if (++n === 2) cb(res[0], res[1]); };
      img.src = src;
    }
    one(srcA, 0);
    one(srcB, 1);
  }

  /* ================================================================
     makeCanvas — position:absolute の canvas を stageEl に追加
     ================================================================ */
  function makeCanvas(stageEl, z, extraCss) {
    var c = document.createElement('canvas');
    c.style.cssText = 'position:absolute;left:0;width:100%;z-index:' + z
      + ';display:none;pointer-events:none;' + (extraCss || '');
    stageEl.appendChild(c);
    return c;
  }

  /* ================================================================
     textToCanvas — 説明文テキストを canvas に描画して返す
     wに収まるよう折り返し、背景付き。
     ================================================================ */
  function textToCanvas(text, w) {
    var PAD   = 18;
    var FONT  = '15px Georgia, serif';
    var LINE_H = 26;

    /* まず仮 canvas で折り返し計算 */
    var tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = 1;
    var tCtx = tmp.getContext('2d');
    tCtx.font = FONT;
    var maxW = w - PAD * 2;
    var chars = text.split(''), line = '', lines = [];
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (tCtx.measureText(test).width > maxW && line !== '') {
        lines.push(line); line = chars[i];
      } else { line = test; }
    }
    if (line) lines.push(line);

    var h = PAD * 2 + lines.length * LINE_H;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font      = FONT;
    ctx.textBaseline = 'top';
    lines.forEach(function (l, i) {
      ctx.fillText(l, PAD, PAD + i * LINE_H);
    });
    return c;
  }

  /* ================================================================
     MosaicSwitcher — 現在/次コンテンツを canvas A/B でモザイク切替
     ================================================================ */
  function MosaicSwitcher(stageEl, zA, zB, extraCss) {
    var _cA = makeCanvas(stageEl, zA, extraCss);
    var _cB = makeCanvas(stageEl, zB, extraCss);
    var _ctxA = _cA.getContext('2d');
    var _ctxB = _cB.getContext('2d');
    var _state = 'Idle';

    function _resize(w, h) {
      _cA.width = w; _cA.height = h;
      _cB.width = w; _cB.height = h;
    }

    return {
      getState: function () { return _state; },

      /* 静的表示（アニメーションなし）: src を canvas A に描画して表示 */
      show: function (src, w, h) {
        _resize(w, h);
        _cA.style.bottom = '0';
        _cA.style.top    = '';
        drawPixelated(_ctxA, src, 1, 0, 0, 1.0);
        _cA.style.display = 'block';
        _cB.style.display = 'none';
      },

      /* モザイクアニメーション切替
         dir: 'next' = 現在→右下退避・次→左下登場
              'prev' = 現在→左下退避・次→右下登場（方向反転） */
      animate: function (srcA, srcB, w, h, dir, onDone) {
        if (_state !== 'Idle') return;
        _state = 'Animating';
        _resize(w, h);

        var signA = (dir === 'prev') ? -1 : 1;  /* A退避方向: next=右, prev=左 */
        var signB = (dir === 'prev') ? 1 : -1;  /* B登場方向: next=左から, prev=右から */

        _cA.style.bottom = '0'; _cA.style.top = '';
        _cB.style.bottom = '0'; _cB.style.top = '';

        drawPixelated(_ctxA, srcA, 1,        0, 0, 1.0);
        drawPixelated(_ctxB, srcB, PIXEL_MAX, 0, 0, 0.0);
        _cA.style.display = 'block';
        _cB.style.display = 'block';

        var startTs = null;
        function _frame(ts) {
          if (_state !== 'Animating') return;
          if (!startTs) startTs = ts;
          var t       = Math.min((ts - startTs) / MORPH_MS, 1.0);
          var easeOut = 1 - Math.pow(1 - t, 2.5);
          var easeIn  = Math.pow(t, 1.6);
          var W = _cA.width, H = _cA.height;

          /* A: 退避（next=右下, prev=左下）・モザイク増加・フェードアウト */
          drawPixelated(_ctxA, srcA,
            Math.round(1 + (PIXEL_MAX - 1) * easeIn),
            signA * W * MOVE_X * easeOut,
            H * MOVE_Y * easeOut,
            1.0 - easeOut);

          /* B: 登場（next=左下から, prev=右下から）・モザイク減少・フェードイン */
          drawPixelated(_ctxB, srcB,
            Math.max(1, Math.round(PIXEL_MAX * (1 - easeOut))),
            signB * W * MOVE_X * (1 - easeOut),
            H * MOVE_Y * (1 - easeOut),
            easeIn);

          if (t < 1.0) {
            requestAnimationFrame(_frame);
          } else {
            drawPixelated(_ctxA, srcB, 1, 0, 0, 1.0);
            _cB.style.display = 'none';
            _state = 'Idle';
            onDone();
          }
        }
        requestAnimationFrame(_frame);
      },

      hide: function () {
        _cA.style.display = 'none';
        _cB.style.display = 'none';
        _state = 'Idle';
      }
    };
  }

  /* ================================================================
     M5 — SlideCollection
     ================================================================ */
  function createSlideCollection(slides) {
    if (!Array.isArray(slides)) throw new Error('[SlideCollection] slides は配列でなければなりません。');
    slides.forEach(function (s, i) {
      if (!s.imageSrc || s.imageSrc === '') throw new Error('[SlideCollection] slides[' + i + '].imageSrc が空文字列です。');
    });
    var _slides = slides.map(function (s, i) {
      return { index: i, imageSrc: s.imageSrc, caption: s.caption || '' };
    });
    return {
      getCount: function () { return _slides.length; },
      getSlide: function (idx) {
        if (idx < 0 || idx >= _slides.length) throw new Error('[SlideCollection] index ' + idx + ' は範囲外。');
        return _slides[idx];
      }
    };
  }

  /* ================================================================
     M2 — AutoPlayTimer
     ================================================================ */
  function createAutoPlayTimer(opts) {
    var interval = opts.interval, enabled = opts.enabled, onFire = opts.onFire;
    if (typeof interval !== 'number' || interval <= 0) throw new Error('[AutoPlayTimer] interval > 0 が必要。');
    var state = 'Stopped', timerId = null;
    function _tick() { state = 'Fired'; onFire(); state = 'Running'; }
    return {
      getState: function () { return state; },
      start: function () {
        if (!enabled || state !== 'Stopped') return;
        timerId = setInterval(_tick, interval); state = 'Running';
      },
      reset: function () {
        clearInterval(timerId); timerId = null;
        if (!enabled) return;
        timerId = setInterval(_tick, interval); state = 'Running';
      },
      stop: function () { clearInterval(timerId); timerId = null; state = 'Stopped'; }
    };
  }

  /* ================================================================
     PhotoSlider.init
     ================================================================ */
  function init(opts) {
    var mountElement = opts.mountElement;
    var slides       = opts.slides;
    var autoPlay     = opts.autoPlay || {};
    var dotsEnabled  = (opts.dots !== false);  /* デフォルト true */

    var root = (typeof mountElement === 'string')
      ? document.querySelector(mountElement) : mountElement;
    if (!root) throw new Error('[PhotoSlider] mountElement が見つかりません: ' + mountElement);

    var collection = createSlideCollection(slides);
    if (collection.getCount() === 0) {
      return { destroy: function(){}, next: function(){}, prev: function(){} };
    }

    /* DOM構築 */
    root.innerHTML = [
      '<div class="ps-root">',
      '  <div class="ps-stage">',
      '    <img class="ps-image-slot ps-image-slot--current" src="" alt="" style="opacity:1">',
      '    <img class="ps-image-slot ps-image-slot--next"    src="" alt="" style="opacity:0;pointer-events:none">',
      '  </div>',
      '  <div class="ps-dots-wrap" style="display:none"></div>',
      '</div>'
    ].join('\n');

    var psRoot  = root.querySelector('.ps-root');
    var stageEl = psRoot.querySelector('.ps-stage');
    var curImg  = psRoot.querySelector('.ps-image-slot--current');
    var nxtImg  = psRoot.querySelector('.ps-image-slot--next');

    /* 画像用 MosaicSwitcher (z=5,6) */
    var imgSwitcher = MosaicSwitcher(stageEl, 5, 6, 'top:0;height:100%;');

    /* 説明文用 MosaicSwitcher (z=7,8) — bottom:0 に配置するため top は animate/show 内で設定 */
    var capSwitcher = MosaicSwitcher(stageEl, 7, 8, '');

    var curIndex = 0;
    var state    = 'Idle';

    function _stageW() { return stageEl.offsetWidth  || 800; }
    function _stageH() { return stageEl.offsetHeight || 480; }

    /* 説明文 canvas のサイズ */
    function _capCanvas(text) {
      return textToCanvas(text, _stageW());
    }

    /* 現在の説明文 canvas を保持（切替時に srcA として渡す） */
    var _curCapCanvas = null;

    /* ドットナビゲーション */
    var dotsWrap = psRoot.querySelector('.ps-dots-wrap');
    var _dotEls  = [];

    function _initDots() {
      if (!dotsEnabled) return;
      var count = collection.getCount();
      dotsWrap.innerHTML = '';
      _dotEls = [];
      for (var i = 0; i < count; i++) {
        var d = document.createElement('button');
        d.className   = 'ps-dot';
        d.setAttribute('aria-label', (i + 1) + '枚目');
        d.setAttribute('type', 'button');
        (function (idx) {
          d.addEventListener('click', function () { _switchTo(idx); });
        })(i);
        dotsWrap.appendChild(d);
        _dotEls.push(d);
      }
      dotsWrap.style.display = 'flex';
      _updateDots(0);
    }

    function _updateDots(idx) {
      _dotEls.forEach(function (d, i) {
        d.className = 'ps-dot' + (i === idx ? ' ps-dot--active' : '');
      });
      /* アクティブなドットが見切れている場合、スクロールして表示する */
      var activeDot = _dotEls[idx];
      if (activeDot && dotsWrap.scrollWidth > dotsWrap.clientWidth) {
        var dotLeft   = activeDot.offsetLeft;
        var dotWidth  = activeDot.offsetWidth;
        var wrapWidth = dotsWrap.clientWidth;
        var target    = dotLeft - (wrapWidth / 2) + (dotWidth / 2);
        dotsWrap.scrollTo({ left: target, behavior: 'smooth' });
      }
    }

    /* インデックス直接指定で切替 */
    function _switchTo(idx) {
      if (state !== 'Idle') return;
      if (idx === curIndex) return;
      var dir = (idx > curIndex) ? 'next' : 'prev';
      /* curIndex を一時的に書き換えて _switch の方向計算を流用 */
      var savedCur = curIndex;
      curIndex = idx - (dir === 'next' ? 1 : -1);
      if (curIndex < 0) curIndex = collection.getCount() - 1;
      if (curIndex >= collection.getCount()) curIndex = 0;
      /* nextIndex が idx になるよう curIndex を調整済み */
      curIndex = savedCur;
      _switchByIndex(idx, dir);
    }

    function _switchByIndex(nextIndex, dir) {
      if (state !== 'Idle') return;
      var count = collection.getCount();
      var cs = collection.getSlide(curIndex);
      var ns = collection.getSlide(nextIndex);
      state = 'Switching';

      var imgDone = false, capDone = false;
      function _tryComplete() {
        if (!imgDone || !capDone) return;
        curIndex = nextIndex;
        _updateDots(curIndex);
        state = 'Idle';
        timer.reset();
        _log('[M1] 完了。curIndex=' + curIndex);
      }

      var nxtCapCanvas = _capCanvas(ns.caption);
      var capH = Math.max(_curCapCanvas ? _curCapCanvas.height : 0, nxtCapCanvas.height);

      curImg.style.opacity = '0';
      nxtImg.style.opacity = '0';
      loadBoth(cs.imageSrc, ns.imageSrc, function (imgCur, imgNxt) {
        imgSwitcher.animate(imgCur, imgNxt, _stageW(), _stageH(), dir, function () {
          curImg.src           = ns.imageSrc;
          curImg.style.opacity = '1';
          nxtImg.style.opacity = '0';
          imgDone = true;
          _tryComplete();
        });
        capSwitcher.animate(_curCapCanvas, nxtCapCanvas, _stageW(), capH, dir, function () {
          _curCapCanvas = nxtCapCanvas;
          capDone = true;
          _tryComplete();
        });
      });
    }

    /* 初期表示 */
    function _showFirst() {
      var slide = collection.getSlide(0);
      curIndex  = 0;

      /* 画像 */
      curImg.src           = slide.imageSrc;
      curImg.style.opacity = '1';

      /* 説明文 canvas を静的表示 */
      _curCapCanvas = _capCanvas(slide.caption);
      capSwitcher.show(_curCapCanvas, _stageW(), _curCapCanvas.height);

      /* ドット生成 */
      _initDots();
    }

    /* 切替 */
    function _switch(dir) {
      if (state !== 'Idle') { _log('[M1] 棄却: state=' + state); return; }
      var count = collection.getCount();
      if (count < 2) { _log('[M1] 棄却: slideCount<2'); return; }

      var nextIndex = (dir === 'next')
        ? (curIndex + 1) % count
        : (curIndex - 1 + count) % count;

      var cs = collection.getSlide(curIndex);
      var ns = collection.getSlide(nextIndex);
      state = 'Switching';

      var imgDone = false, capDone = false;
      function _tryComplete() {
        if (!imgDone || !capDone) return;
        curIndex = nextIndex;
        _updateDots(curIndex);
        state    = 'Idle';
        timer.reset();
        _log('[M1] 完了。curIndex=' + curIndex);
      }

      /* 説明文 canvas を先に作る（同期処理なのですぐ完了） */
      var nxtCapCanvas = _capCanvas(ns.caption);
      var capH = Math.max(_curCapCanvas ? _curCapCanvas.height : 0, nxtCapCanvas.height);

      /* 画像を先読みし、完了後に画像・説明文を同時開始（タイミングずれを防止） */
      curImg.style.opacity = '0';
      nxtImg.style.opacity = '0';
      loadBoth(cs.imageSrc, ns.imageSrc, function (imgCur, imgNxt) {
        /* 画像・説明文を同じフレームで同時開始 */
        imgSwitcher.animate(imgCur, imgNxt, _stageW(), _stageH(), dir, function () {
          curImg.src           = ns.imageSrc;
          curImg.style.opacity = '1';
          nxtImg.style.opacity = '0';
          imgDone = true;
          _tryComplete();
        });

        capSwitcher.animate(_curCapCanvas, nxtCapCanvas, _stageW(), capH, dir, function () {
          _curCapCanvas = nxtCapCanvas;
          capDone = true;
          _tryComplete();
        });
      });
    }

    _showFirst();

    var timer = createAutoPlayTimer({
      interval: (autoPlay.interval != null ? autoPlay.interval : 5000),
      enabled:  (autoPlay.enabled  != null ? autoPlay.enabled  : false),
      onFire:   function () { _switch('next'); }
    });
    timer.start();
    _log('Global: Running');

    var _playing = (autoPlay.enabled != null ? autoPlay.enabled : false);

    return {
      /** 次のスライドへ */
      next: function () { _switch('next'); },

      /** 前のスライドへ */
      prev: function () { _switch('prev'); },

      /** 自動再生を停止する */
      stop: function () {
        timer.stop();
        _playing = false;
        _log('AutoPlay: stopped');
      },

      /** 自動再生を再開する */
      play: function () {
        _playing = true;
        timer.reset();
        _log('AutoPlay: started');
      },

      /** 自動再生中かどうかを返す */
      isPlaying: function () { return _playing; },

      /** 完全破棄（ページ離脱時などに呼ぶ） */
      destroy: function () { timer.stop(); _playing = false; _log('Global: Terminated'); },

      _getState: function () { return state; }
    };
  }

  function _log(msg) {
    if (typeof console !== 'undefined') console.log('[PhotoSlider] ' + msg);
  }

  global.PhotoSlider = { init: init };

})(window);
