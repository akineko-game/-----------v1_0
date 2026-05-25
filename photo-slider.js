/**
 * PhotoSlider — photo-slider.js
 * 画像・説明文ともに canvas モザイクで切替。説明文は画像に重ねて表示。
 */
(function (global) {
  'use strict';

  /* ================================================================
     共通モザイクアニメーション定数
     ================================================================ */
  var MORPH_MS  = 1600;  /* アニメーション総時間(ms) */
  var PIXEL_MAX = 200;   /* モザイク最大ピクセルサイズ */
  var MOVE_X    = 1.20;  /* 水平移動量（幅の比率） */
  var MOVE_Y    = 0.90;  /* 垂直移動量（高さの比率） */

  /* ================================================================
     共通: canvas にモザイク描画
       ctx      : 描画先 CanvasRenderingContext2D
       src      : Image オブジェクト（null なら何もしない）
       pixelSize: ブロックサイズ（1=クリア）
       ox, oy   : 描画オフセット（移動表現）
       alpha    : 0〜1 の不透明度
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
     共通: 2ソースを並行ロードし両方揃ったら cb(a, b)
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
     共通: canvas を stage に追加して返す
     ================================================================ */
  function makeCanvas(stageEl, z) {
    var c = document.createElement('canvas');
    c.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'z-index:' + z, 'display:none', 'pointer-events:none'
    ].join(';');
    stageEl.appendChild(c);
    return c;
  }

  /* ================================================================
     共通: ステージサイズに canvas を合わせる
     ================================================================ */
  function resizeCanvas(c, stageEl) {
    c.width  = stageEl.offsetWidth  || 800;
    c.height = stageEl.offsetHeight || 480;
  }

  /* ================================================================
     共通モザイクアニメーター
     現在コンテンツ: 右下へ移動・モザイク増加・フェードアウト（Canvas A）
     次コンテンツ  : 左下から移動・モザイク減少・フェードイン  （Canvas B）
     onCompleted() を呼んでから state='Idle' に戻る。
     ================================================================ */
  function createMosaicAnimator(stageEl, zA, zB) {
    var _cA, _ctxA, _cB, _ctxB;
    var _srcA = null, _srcB = null;
    var state = 'Idle';

    _cA = makeCanvas(stageEl, zA); _ctxA = _cA.getContext('2d');
    _cB = makeCanvas(stageEl, zB); _ctxB = _cB.getContext('2d');

    function _resize() {
      resizeCanvas(_cA, stageEl);
      resizeCanvas(_cB, stageEl);
    }

    function _drawFrame(t) {
      var easeOut = 1 - Math.pow(1 - t, 2.5);
      var easeIn  = Math.pow(t, 1.6);
      var W = _cA.width, H = _cA.height;

      /* Canvas A: 現在 → 右下へ退避・モザイク増加・フェードアウト */
      drawPixelated(_ctxA, _srcA,
        Math.round(1 + (PIXEL_MAX - 1) * easeIn),
        W * MOVE_X * easeOut,
        H * MOVE_Y * easeOut,
        1.0 - easeOut);

      /* Canvas B: 次 → 左下から登場・モザイク減少・フェードイン */
      drawPixelated(_ctxB, _srcB,
        Math.max(1, Math.round(PIXEL_MAX * (1 - easeOut))),
        -W * MOVE_X * (1 - easeOut),
         H * MOVE_Y * (1 - easeOut),
        easeIn);
    }

    return {
      getState: function () { return state; },

      /* srcA: 現在コンテンツの Image/canvas
         srcB: 次コンテンツの Image/canvas
         両方 null 可（テキストcanvasなど）
         onCompleted: 完了時コールバック */
      start: function (srcA, srcB, onCompleted) {
        if (state !== 'Idle') return;
        state = 'Animating';
        _srcA = srcA;
        _srcB = srcB;
        _resize();

        /* 初期フレーム */
        drawPixelated(_ctxA, _srcA, 1,        0, 0, 1.0);
        drawPixelated(_ctxB, _srcB, PIXEL_MAX, 0, 0, 0.0);
        _cA.style.display = 'block';
        _cB.style.display = 'block';

        var startTs = null;
        function _frame(ts) {
          if (state !== 'Animating') return;
          if (!startTs) startTs = ts;
          var t = Math.min((ts - startTs) / MORPH_MS, 1.0);
          _drawFrame(t);

          if (t < 1.0) {
            requestAnimationFrame(_frame);
          } else {
            /* 完了: img/canvas を先に表示してから canvas を消す（点滅防止） */
            onCompleted();
            requestAnimationFrame(function () {
              _cA.style.display = 'none';
              _cB.style.display = 'none';
              state = 'Idle';
            });
          }
        }
        requestAnimationFrame(_frame);
      },

      hide: function () {
        _cA.style.display = 'none';
        _cB.style.display = 'none';
        state = 'Idle';
      }
    };
  }

  /* ================================================================
     共通: テキストを canvas に描画して返す
     caption-overlay 要素のサイズを基準に描画する。
     ================================================================ */
  function renderTextToCanvas(text, overlayEl) {
    var w = overlayEl.offsetWidth  || 800;
    var h = overlayEl.offsetHeight || 80;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');

    /* 背景 */
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, w, h);

    /* テキスト */
    ctx.fillStyle   = '#ffffff';
    ctx.font        = '15px Georgia, serif';
    ctx.textBaseline = 'top';
    var pad = Math.round(w * 0.018);
    var maxW = w - pad * 2;

    /* 折り返し処理 */
    var words = text.split('');
    var line = '', lines = [], lineH = 24;
    for (var i = 0; i < words.length; i++) {
      var test = line + words[i];
      if (ctx.measureText(test).width > maxW && line !== '') {
        lines.push(line); line = words[i];
      } else { line = test; }
    }
    if (line) lines.push(line);

    /* canvas 高さを行数に合わせて再設定 */
    var totalH = pad * 2 + lines.length * lineH;
    c.height = Math.max(h, totalH);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, w, c.height);
    ctx.fillStyle    = '#ffffff';
    ctx.font         = '15px Georgia, serif';
    ctx.textBaseline = 'top';
    lines.forEach(function (l, i) {
      ctx.fillText(l, pad, pad + i * lineH);
    });

    return c;
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
     M3 — ImageAnimator（画像モザイク）
     ================================================================ */
  function createImageAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var stageEl     = opts.stageEl;
    var onCompleted = opts.onCompleted;

    var _anim = createMosaicAnimator(stageEl, 5, 6);

    return {
      getState: function () { return _anim.getState(); },
      startAnimation: function (payload) {
        if (_anim.getState() !== 'Idle') return;

        /* img を非表示（canvas が前面に出る） */
        currentEl.style.opacity = '0';
        nextEl.src              = payload.nextImageSrc;
        nextEl.style.opacity    = '0';

        loadBoth(payload.currentImageSrc, payload.nextImageSrc, function (imgCur, imgNxt) {
          _anim.start(imgCur, imgNxt, function () {
            /* 完了: img を差し替えて表示 */
            currentEl.src           = nextEl.src;
            currentEl.style.opacity = '1';
            nextEl.style.opacity    = '0';
            onCompleted();
          });
        });
      }
    };
  }

  /* ================================================================
     M4 — CaptionAnimator（説明文モザイク）
     説明文テキストを canvas に描画し、画像と同じモーフィングで切替。
     ================================================================ */
  function createCaptionAnimator(opts) {
    var overlayEl   = opts.overlayEl;   /* .ps-caption-overlay 要素 */
    var stageEl     = opts.stageEl;
    var onCompleted = opts.onCompleted;

    /* 現在表示中のテキストcanvasを保持 */
    var _curCanvas  = null;
    var _anim       = createMosaicAnimator(stageEl, 7, 8);

    return {
      getState: function () { return _anim.getState(); },

      /* 初期表示（アニメーションなし） */
      initCaption: function (caption) {
        _curCanvas = renderTextToCanvas(caption, overlayEl);
        overlayEl.style.height = _curCanvas.height + 'px';
      },

      startAnimation: function (payload) {
        if (_anim.getState() !== 'Idle') return;

        var nxtCanvas = renderTextToCanvas(payload.nextCaption, overlayEl);

        _anim.start(_curCanvas, nxtCanvas, function () {
          /* 完了: overlay を次テキストcanvasの内容で静的表示 */
          overlayEl.style.height = nxtCanvas.height + 'px';
          /* overlay 自体の表示は canvas が担うためここでは何もしない */
          _curCanvas = nxtCanvas;
          onCompleted();
        });
      }
    };
  }

  /* ================================================================
     M1 — SliderController
     ================================================================ */
  function createSliderController(opts) {
    var collection      = opts.collection;
    var imageAnimator   = opts.imageAnimator;
    var captionAnimator = opts.captionAnimator;
    var timer           = opts.timer;

    var state           = 'Idle';
    var currentIndex    = 0;
    var nextIndex       = null;
    var slideCount      = collection.getCount();
    var _currentCaption = '';
    var _nextCaption    = '';

    function dispatch(event) {
      _log('[M1] dispatch: ' + event + ' (state=' + state + ')');
      switch (event) {

        case 'RequestNext':
        case 'RequestPrev':
          if (state !== 'Idle')  { _log('[M1] 棄却: ' + event); return; }
          if (slideCount < 2)    { _log('[M1] 棄却: slideCount=' + slideCount); return; }
          nextIndex = (event === 'RequestNext')
            ? (currentIndex + 1) % slideCount
            : (currentIndex - 1 + slideCount) % slideCount;
          var cs = collection.getSlide(currentIndex);
          var ns = collection.getSlide(nextIndex);
          _currentCaption = cs.caption;
          _nextCaption    = ns.caption;
          state = 'SwitchingImage';
          /* 画像と説明文を同時に開始 */
          imageAnimator.startAnimation({ currentImageSrc: cs.imageSrc, nextImageSrc: ns.imageSrc });
          captionAnimator.startAnimation({ currentCaption: cs.caption, nextCaption: ns.caption });
          break;

        case 'ImageSwitchCompleted':
          if (state !== 'SwitchingImage') { _log('[M1] 棄却: ImageSwitchCompleted'); return; }
          state = 'SwitchingCaption';
          break;

        case 'CaptionSwitchCompleted':
          /* 画像・説明文どちらが先に完了しても待ち合わせる */
          if (state === 'SwitchingImage') {
            /* 説明文が先に終わった場合: 画像完了を待つ */
            state = 'WaitingImage';
          } else if (state === 'SwitchingCaption' || state === 'WaitingCaption') {
            _complete();
          }
          break;

        case 'BothCompleted':
          _complete();
          break;

        default:
          _log('[M1] 未知: ' + event);
      }
    }

    function _complete() {
      currentIndex = nextIndex;
      state = 'Idle';
      timer.reset();
      _log('[M1] 完了。currentIndex=' + currentIndex);
    }

    return {
      dispatch:        dispatch,
      getCurrentIndex: function () { return currentIndex; },
      getState:        function () { return state; },
      getSlideCount:   function () { return slideCount; }
    };
  }

  /* ================================================================
     ユーティリティ
     ================================================================ */
  function _log(msg) {
    if (typeof console !== 'undefined') console.log('[PhotoSlider] ' + msg);
  }
  function _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _buildDOM(firstSlide) {
    return [
      '<div class="ps-root">',
      '  <div class="ps-stage">',
      '    <img class="ps-image-slot ps-image-slot--current"',
      '         src="'+_esc(firstSlide.imageSrc)+'" alt="'+_esc(firstSlide.caption)+'">',
      '    <img class="ps-image-slot ps-image-slot--next" src="" alt=""',
      '         style="opacity:0;pointer-events:none">',
      '    <div class="ps-caption-overlay"></div>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ================================================================
     PhotoSlider.init
     ================================================================ */
  function init(opts) {
    var mountElement = opts.mountElement;
    var slides       = opts.slides;
    var autoPlay     = opts.autoPlay || {};

    var root = (typeof mountElement === 'string')
      ? document.querySelector(mountElement) : mountElement;
    if (!root) throw new Error('[PhotoSlider] mountElement が見つかりません: ' + mountElement);

    _log('Global: Initializing');

    var collection = createSlideCollection(slides);
    if (collection.getCount() === 0) {
      return { destroy: function(){}, next: function(){}, prev: function(){} };
    }

    var firstSlide = collection.getSlide(0);
    root.innerHTML = _buildDOM(firstSlide);
    var psRoot     = root.querySelector('.ps-root');
    var stageEl    = psRoot.querySelector('.ps-stage');
    var overlayEl  = psRoot.querySelector('.ps-caption-overlay');

    var controller;
    var imgDone = false, capDone = false;

    function _onImageDone() {
      imgDone = true;
      controller.dispatch('ImageSwitchCompleted');
      if (capDone) { imgDone = false; capDone = false; }
    }
    function _onCaptionDone() {
      capDone = true;
      controller.dispatch('CaptionSwitchCompleted');
      if (imgDone) { imgDone = false; capDone = false; }
    }

    var imageAnimator = createImageAnimator({
      currentEl:   psRoot.querySelector('.ps-image-slot--current'),
      nextEl:      psRoot.querySelector('.ps-image-slot--next'),
      stageEl:     stageEl,
      onCompleted: _onImageDone
    });

    var captionAnimator = createCaptionAnimator({
      overlayEl:   overlayEl,
      stageEl:     stageEl,
      onCompleted: _onCaptionDone
    });

    /* 説明文の初期表示 */
    captionAnimator.initCaption(firstSlide.caption);

    var timer = createAutoPlayTimer({
      interval: (autoPlay.interval != null ? autoPlay.interval : 5000),
      enabled:  (autoPlay.enabled  != null ? autoPlay.enabled  : false),
      onFire:   function () { controller.dispatch('RequestNext'); }
    });

    /* M1 の待ち合わせロジックを簡略化:
       画像・説明文を同時開始し、両方完了したら Idle へ */
    controller = {
      dispatch: function (event) {
        _log('[M1] dispatch: ' + event);
        if (event === 'RequestNext' || event === 'RequestPrev') {
          if (controller._state !== 'Idle') { _log('[M1] 棄却: ' + event); return; }
          if (collection.getCount() < 2)    { _log('[M1] 棄却: slideCount<2'); return; }
          controller._state = 'Switching';
          controller._nextIdx = (event === 'RequestNext')
            ? (controller._curIdx + 1) % collection.getCount()
            : (controller._curIdx - 1 + collection.getCount()) % collection.getCount();
          var cs = collection.getSlide(controller._curIdx);
          var ns = collection.getSlide(controller._nextIdx);
          imgDone = false; capDone = false;
          imageAnimator.startAnimation({ currentImageSrc: cs.imageSrc, nextImageSrc: ns.imageSrc });
          captionAnimator.startAnimation({ currentCaption: cs.caption, nextCaption: ns.caption });
        } else if (event === 'ImageSwitchCompleted') {
          imgDone = true;
          if (imgDone && capDone) controller._finish();
        } else if (event === 'CaptionSwitchCompleted') {
          capDone = true;
          if (imgDone && capDone) controller._finish();
        }
      },
      _finish: function () {
        imgDone = false; capDone = false;
        controller._curIdx  = controller._nextIdx;
        controller._state   = 'Idle';
        timer.reset();
        _log('[M1] 完了。currentIndex=' + controller._curIdx);
      },
      _state:   'Idle',
      _curIdx:  0,
      _nextIdx: 0,
      getState: function () { return controller._state; }
    };

    timer.start();
    _log('Global: Running');

    return {
      next:      function () { controller.dispatch('RequestNext'); },
      prev:      function () { controller.dispatch('RequestPrev'); },
      destroy:   function () { timer.stop(); _log('Global: Terminated'); },
      _getState: function () { return controller.getState(); }
    };
  }

  global.PhotoSlider = { init: init };

})(window);
