/**
 * PhotoSlider — photo-slider.js
 * 既存ホームページ組み込み型Webコンポーネント（IIFE形式）
 */
(function (global) {
  'use strict';

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
        timerId = setInterval(_tick, interval);
        state = 'Running';
      },
      reset: function () {
        clearInterval(timerId); timerId = null;
        if (!enabled) return;
        timerId = setInterval(_tick, interval);
        state = 'Running';
      },
      stop: function () { clearInterval(timerId); timerId = null; state = 'Stopped'; }
    };
  }

  /* ================================================================
     M3 — ImageAnimator
     Canvas A（現在画像）: 右下へ移動しながらモザイク化 + フェードアウト
     Canvas B（次画像）  : 左下から移動しながらモザイクが取れてフェードイン
     2枚を同時進行。img 要素は使わず canvas のみで描画する。
     ================================================================ */
  function createImageAnimator(opts) {
    var currentEl   = opts.currentEl;   // img（表示制御のみ、描画は canvas）
    var nextEl      = opts.nextEl;      // img（src セット用）
    var stageEl     = opts.stageEl;
    var onCompleted = opts.onCompleted;

    var state  = 'Idle';
    var _rafId = null;

    /* 定数 */
    var MORPH_MS    = 1200;  // アニメーション総時間(ms)
    var PIXEL_MAX   = 60;    // モザイク最大ピクセルサイズ
    var MOVE_X      = 0.22;  // 水平移動量（ステージ幅の比率）
    var MOVE_Y      = 0.15;  // 垂直移動量（ステージ高さの比率）

    /* Canvas A: 現在画像退避用 */
    var _cA, _ctxA;
    /* Canvas B: 次画像登場用 */
    var _cB, _ctxB;
    /* オフスクリーン（ピクセル化縮小用） */
    var _sA, _sCtxA, _sB, _sCtxB;
    /* 画像 */
    var _imgCur = null, _imgNxt = null;

    function _mkCanvas(z) {
      var c = document.createElement('canvas');
      c.style.cssText = [
        'position:absolute', 'top:0', 'left:0',
        'width:100%', 'height:100%',
        'z-index:' + z, 'display:none',
        'pointer-events:none'
      ].join(';');
      stageEl.appendChild(c);
      return c;
    }

    function _resize() {
      var w = stageEl.offsetWidth  || 800;
      var h = stageEl.offsetHeight || 480;
      _cA.width = w; _cA.height = h;
      _cB.width = w; _cB.height = h;
      _sA.width = w; _sA.height = h;
      _sB.width = w; _sB.height = h;
    }

    /* img を pixelSize でモザイク化して ctx に描画
       ox, oy: canvas 上のオフセット（移動表現）
       alpha : 0〜1 の不透明度 */
    function _drawPixel(ctx, sCtx, sCanvas, img, pixelSize, ox, oy, alpha) {
      var w = ctx.canvas.width;
      var h = ctx.canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!img) return;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.translate(ox, oy);

      if (pixelSize <= 1) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        /* 縮小 → 拡大でブロックモザイク */
        var sw = Math.max(1, Math.ceil(w / pixelSize));
        var sh = Math.max(1, Math.ceil(h / pixelSize));
        sCtx.clearRect(0, 0, w, h);
        sCtx.imageSmoothingEnabled = true;
        sCtx.drawImage(img, 0, 0, sw, sh);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sCanvas, 0, 0, sw, sh, 0, 0, w, h);
      }
      ctx.restore();
    }

    function _animate(startTs) {
      function _frame(ts) {
        if (state !== 'Animating') return;

        var t = Math.min((ts - startTs) / MORPH_MS, 1.0);

        /* イーズ関数 */
        var easeOut = 1 - Math.pow(1 - t, 2.5);  // 0→1 減速
        var easeIn  = Math.pow(t, 1.6);           // 0→1 加速

        var W = _cA.width, H = _cA.height;

        /* === Canvas A: 現在画像 ===
           右下へ移動、モザイク増加（1→PIXEL_MAX）、フェードアウト（1→0） */
        var pxA   = Math.round(1 + (PIXEL_MAX - 1) * easeIn);
        var alpA  = 1.0 - easeOut;
        var oxA   =  W * MOVE_X * easeOut;   // 右へ
        var oyA   =  H * MOVE_Y * easeOut;   // 下へ
        _drawPixel(_ctxA, _sCtxA, _sA, _imgCur, pxA, oxA, oyA, alpA);

        /* === Canvas B: 次画像 ===
           左下から中央へ移動、モザイク減少（PIXEL_MAX→1）、フェードイン（0→1） */
        var pxB   = Math.max(1, Math.round(PIXEL_MAX - (PIXEL_MAX - 1) * easeOut));
        var alpB  = easeIn;
        var oxB   = -W * MOVE_X * (1 - easeOut);  // 左外→中央
        var oyB   =  H * MOVE_Y * (1 - easeOut);  // 下→中央
        _drawPixel(_ctxB, _sCtxB, _sB, _imgNxt, pxB, oxB, oyB, alpB);

        if (t < 1.0) {
          _rafId = requestAnimationFrame(_frame);
        } else {
          /* 完了 */
          _cA.style.display = 'none';
          _cB.style.display = 'none';
          state = 'Done';
          _finish();
        }
      }
      _rafId = requestAnimationFrame(_frame);
    }

    function _finish() {
      /* currentEl を次画像に差し替えて表示 */
      currentEl.src           = nextEl.src;
      currentEl.style.opacity = '1';

      /* nextEl を非表示に戻す */
      nextEl.style.opacity = '0';

      state = 'Idle';
      onCompleted();
    }

    /* 画像を並行読み込みし、両方揃ったらコールバック */
    function _loadBoth(srcA, srcB, cb) {
      var results = [null, null], done = 0;
      function _load(src, idx) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = function () { results[idx] = img; done++; if (done === 2) cb(results[0], results[1]); };
        img.onerror = function () {                      done++; if (done === 2) cb(results[0], results[1]); };
        img.src = src;
      }
      _load(srcA, 0);
      _load(srcB, 1);
    }

    /* 初期化 */
    _cA = _mkCanvas(5); _ctxA = _cA.getContext('2d');
    _cB = _mkCanvas(6); _ctxB = _cB.getContext('2d');
    _sA = document.createElement('canvas'); _sCtxA = _sA.getContext('2d');
    _sB = document.createElement('canvas'); _sCtxB = _sB.getContext('2d');

    return {
      getState: function () { return state; },

      startAnimation: function (payload) {
        if (state !== 'Idle') return;
        state = 'Loading';

        /* img を即時非表示（canvas が前面に出る） */
        currentEl.style.opacity = '0';
        nextEl.src              = payload.nextImageSrc;
        nextEl.style.opacity    = '0';

        _loadBoth(payload.currentImageSrc, payload.nextImageSrc, function (imgCur, imgNxt) {
          if (state !== 'Loading') return;

          _imgCur = imgCur;
          _imgNxt = imgNxt;

          _resize();

          /* 初期フレーム描画（現在画像=クリア、次画像=最大モザイク） */
          _drawPixel(_ctxA, _sCtxA, _sA, _imgCur, 1,        0, 0, 1.0);
          _drawPixel(_ctxB, _sCtxB, _sB, _imgNxt, PIXEL_MAX, 0, 0, 0.0);
          _cA.style.display = 'block';
          _cB.style.display = 'block';

          state = 'Animating';
          requestAnimationFrame(function (ts) { _animate(ts); });
        });
      }
    };
  }

  /* ================================================================
     M4 — CaptionAnimator
     点滅根絶策：transitionend を使わず setTimeout で完了を管理する。
     duration と同じ時間後に1回だけ確実に完了処理が走る。
     ================================================================ */
  function createCaptionAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var onCompleted = opts.onCompleted;

    var CAPTION_DURATION_MS = 550; // CSSの --ps-anim-duration-caption と合わせる

    var state        = 'Idle';
    var outCompleted = false;
    var _outTimerId  = null;
    var _delayTimerId = null;
    var _inTimerId   = null;

    function _resetNextEl() {
      // ps-animating-in を外すだけ。
      // opacity/transform/transition は CSS (.ps-caption--next) が transition:none で固定管理。
      // inline style を触ると CSS が上書きされ点滅するため、一切触らない。
      nextEl.classList.remove('ps-animating-in');
    }

    function _onInCompleted() {
      // アニメーション完了（setTimeout で1回だけ呼ばれる）
      state = 'Done';

      // currentEl にテキストをスワップ（transition なしで瞬時に opacity:1）
      currentEl.textContent      = nextEl.textContent;
      currentEl.style.transition = 'none';
      currentEl.style.opacity    = '1';
      currentEl.classList.remove('ps-animating-out');
      void currentEl.offsetWidth;
      currentEl.style.transition = '';

      // nextEl をリセット（クラスを外すだけ。inline style は触らない）
      _resetNextEl();

      outCompleted = false;
      state = 'Idle';
      onCompleted();
    }

    function _onDelayElapsed() {
      if (state !== 'DelayWaiting') return;
      state = 'AnimatingIn';

      // 確実に待機状態からスタートさせる
      _resetNextEl();

      // 1フレーム後にクラス付与（reflow が確実に終わってから）
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          nextEl.classList.add('ps-animating-in');
          // transitionend は使わず、duration と同じ時間後に完了処理
          _inTimerId = setTimeout(_onInCompleted, CAPTION_DURATION_MS + 50); // +50ms マージン
        });
      });
    }

    return {
      getState: function () { return state; },
      startAnimation: function (payload) {
        if (state !== 'Idle') return;

        nextEl.textContent = payload.nextCaption;

        // 現在説明文フェードアウト（CSS transition に任せる）
        currentEl.classList.add('ps-animating-out');
        // setTimeout でoutCompleted管理（transitionendは使わない）
        _outTimerId = setTimeout(function () { outCompleted = true; }, 350);

        _delayTimerId = setTimeout(_onDelayElapsed, payload.delayMs);
        state        = 'DelayWaiting';
        outCompleted = false;
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

    var state        = 'Idle';
    var currentIndex = 0;
    var nextIndex    = null;
    var slideCount   = collection.getCount();
    var _currentCaption = '';
    var _nextCaption    = '';
    var DELAY_MS = 350;

    function dispatch(event) {
      _log('[M1] dispatch: ' + event + ' (state=' + state + ')');
      switch (event) {

        case 'RequestNext':
        case 'RequestPrev':
          if (state !== 'Idle')   { _log('[M1] 棄却: ' + event); return; }
          if (slideCount < 2)     { _log('[M1] 棄却: slideCount=' + slideCount); return; }
          nextIndex = (event === 'RequestNext')
            ? (currentIndex + 1) % slideCount
            : (currentIndex - 1 + slideCount) % slideCount;
          var cs = collection.getSlide(currentIndex);
          var ns = collection.getSlide(nextIndex);
          _currentCaption = cs.caption;
          _nextCaption    = ns.caption;
          state = 'SwitchingImage';
          imageAnimator.startAnimation({ currentImageSrc: cs.imageSrc, nextImageSrc: ns.imageSrc });
          break;

        case 'ImageSwitchCompleted':
          if (state !== 'SwitchingImage') { _log('[M1] 棄却: ImageSwitchCompleted'); return; }
          state = 'SwitchingCaption';
          captionAnimator.startAnimation({
            currentCaption: _currentCaption,
            nextCaption:    _nextCaption,
            delayMs:        DELAY_MS
          });
          break;

        case 'CaptionSwitchCompleted':
          if (state !== 'SwitchingCaption') { _log('[M1] 棄却: CaptionSwitchCompleted'); return; }
          state        = 'Completing';
          currentIndex = nextIndex;
          state        = 'Idle';
          timer.reset();
          _log('[M1] 完了。currentIndex=' + currentIndex);
          break;

        default:
          _log('[M1] 未知: ' + event);
      }
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
      '    <img class="ps-image-slot ps-image-slot--current" src="'+_esc(firstSlide.imageSrc)+'" alt="'+_esc(firstSlide.caption)+'">',
      '    <img class="ps-image-slot ps-image-slot--next" src="" alt="" style="opacity:0;pointer-events:none">',
      '  </div>',
      '  <div class="ps-caption-area">',
      '    <p class="ps-caption ps-caption--current">'+_esc(firstSlide.caption)+'</p>',
      '    <p class="ps-caption ps-caption--next"></p>',
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
    var psRoot  = root.querySelector('.ps-root');
    var stageEl = psRoot.querySelector('.ps-stage');

    var controller;

    var imageAnimator = createImageAnimator({
      currentEl:   psRoot.querySelector('.ps-image-slot--current'),
      nextEl:      psRoot.querySelector('.ps-image-slot--next'),
      stageEl:     stageEl,
      onCompleted: function () { controller.dispatch('ImageSwitchCompleted'); }
    });

    var captionAnimator = createCaptionAnimator({
      currentEl:   psRoot.querySelector('.ps-caption--current'),
      nextEl:      psRoot.querySelector('.ps-caption--next'),
      onCompleted: function () { controller.dispatch('CaptionSwitchCompleted'); }
    });

    var timer = createAutoPlayTimer({
      interval: (autoPlay.interval != null ? autoPlay.interval : 5000),
      enabled:  (autoPlay.enabled  != null ? autoPlay.enabled  : false),
      onFire:   function () { controller.dispatch('RequestNext'); }
    });

    controller = createSliderController({
      collection:      collection,
      imageAnimator:   imageAnimator,
      captionAnimator: captionAnimator,
      timer:           timer
    });

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
