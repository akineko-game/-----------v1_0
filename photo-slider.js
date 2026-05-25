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
     モザイク → クリア のモーフィング（canvas ピクセル化）

     ピクセル化の正しい手順：
       1. オフスクリーン canvas（small）に画像を縮小描画
       2. メイン canvas に small を拡大描画（imageSmoothingEnabled=false）
       → これで確実にブロック状のモザイクになる
     ================================================================ */
  function createImageAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var stageEl     = opts.stageEl;
    var onCompleted = opts.onCompleted;

    var state   = 'Idle';
    var _canvas = null;   // 表示用メインcanvas
    var _small  = null;   // ピクセル化用オフスクリーンcanvas
    var _ctx    = null;
    var _sCtx   = null;
    var _rafId  = null;
    var _offImg = null;

    /* [Undefined] morphStrength: 以下の値で調整 */
    var MORPH_MS    = 1100; // アニメーション総時間(ms)
    var PIXEL_START = 80;   // 初期ピクセルサイズ（大きいほど荒い）
    var PIXEL_END   = 1;

    function _createCanvas() {
      var c = document.createElement('canvas');
      c.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;display:none';
      stageEl.appendChild(c);
      return c;
    }

    function _resizeCanvas() {
      var w = stageEl.offsetWidth  || 800;
      var h = stageEl.offsetHeight || 480;
      _canvas.width = w;
      _canvas.height = h;
      _small.width  = w;
      _small.height = h;
    }

    /* 正しいピクセル化描画 */
    function _drawMosaic(pixelSize) {
      var w = _canvas.width, h = _canvas.height;

      if (pixelSize <= 1) {
        // ピクセルサイズ1 = そのまま描画
        _ctx.clearRect(0, 0, w, h);
        _ctx.imageSmoothingEnabled = true;
        _ctx.drawImage(_offImg, 0, 0, w, h);
        return;
      }

      // step1: small canvas に縮小描画
      var sw = Math.max(1, Math.floor(w / pixelSize));
      var sh = Math.max(1, Math.floor(h / pixelSize));
      _sCtx.clearRect(0, 0, w, h);
      _sCtx.imageSmoothingEnabled = true;
      _sCtx.drawImage(_offImg, 0, 0, sw, sh);

      // step2: main canvas に拡大描画（スムージングOFF → ブロック状になる）
      _ctx.clearRect(0, 0, w, h);
      _ctx.imageSmoothingEnabled = false;
      _ctx.drawImage(_small, 0, 0, sw, sh, 0, 0, w, h);
    }

    function _animate(startTs) {
      function _frame(ts) {
        if (state !== 'AnimatingIn') return;
        var t = Math.min((ts - startTs) / MORPH_MS, 1);
        // イーズアウト（ゆっくり解像度が上がる）
        var eased     = 1 - Math.pow(1 - t, 2.5);
        var pixelSize = Math.max(PIXEL_END, Math.round(PIXEL_START - (PIXEL_START - PIXEL_END) * eased));
        _drawMosaic(pixelSize);

        if (t < 1) {
          _rafId = requestAnimationFrame(_frame);
        } else {
          // 完了
          _canvas.style.display = 'none';
          state = 'Done';
          _finish();
        }
      }
      _rafId = requestAnimationFrame(_frame);
    }

    function _finish() {
      // currentEl を次画像にスワップ（transition なしで即時）
      currentEl.src              = nextEl.src;
      currentEl.style.transition = 'none';
      currentEl.style.opacity    = '1';
      currentEl.classList.remove('ps-animating-out');
      void currentEl.offsetWidth;
      currentEl.style.transition = '';

      // nextEl を即時非表示にリセット
      nextEl.style.transition = 'none';
      nextEl.style.opacity    = '0';
      void nextEl.offsetWidth;
      nextEl.style.transition = '';

      state = 'Idle';
      onCompleted();
    }

    // 初期化
    _canvas = _createCanvas();
    _small  = document.createElement('canvas');
    _ctx    = _canvas.getContext('2d');
    _sCtx   = _small.getContext('2d');

    return {
      getState: function () { return state; },
      startAnimation: function (payload) {
        if (state !== 'Idle') return;
        state = 'AnimatingOut';

        // 現在画像をフェードアウト
        currentEl.classList.add('ps-animating-out');

        _offImg = new Image();
        _offImg.crossOrigin = 'anonymous';

        _offImg.onload = function () {
          if (state !== 'AnimatingOut') return;

          // 現在画像を即時非表示（canvasが前面に出る）
          currentEl.classList.remove('ps-animating-out');
          currentEl.style.transition = 'none';
          currentEl.style.opacity    = '0';
          void currentEl.offsetWidth;
          currentEl.style.transition = '';

          nextEl.src             = payload.nextImageSrc;
          nextEl.style.opacity   = '0'; // img は非表示のままcanvasで表示

          _resizeCanvas();
          _drawMosaic(PIXEL_START); // 最初のフレームを即描画
          _canvas.style.display = 'block';

          state = 'AnimatingIn';
          requestAnimationFrame(function (ts) { _animate(ts); });
        };

        _offImg.onerror = function () {
          _log('[ImageAnimator] 画像読み込み失敗: ' + payload.nextImageSrc);
          nextEl.src = payload.nextImageSrc;
          state = 'AnimatingIn';
          _finish();
        };

        _offImg.src = payload.nextImageSrc;
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
      // nextEl を完全に非表示の待機状態へ（transition なし・点滅なし）
      nextEl.style.transition = 'none';
      nextEl.style.opacity    = '0';
      nextEl.style.transform  = 'translateX(-40px)';
      nextEl.classList.remove('ps-animating-in');
      void nextEl.offsetWidth;
      nextEl.style.transition = '';
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

      // nextEl をリセット（点滅しない）
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
      '    <p class="ps-caption ps-caption--next" style="opacity:0;transform:translateX(-40px)"></p>',
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
