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
     ================================================================ */
  function createImageAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var stageEl     = opts.stageEl;
    var onCompleted = opts.onCompleted;

    var state  = 'Idle';
    var _rafId = null;

    /* 定数 */
    var MORPH_MS  = 1200;  /* アニメーション総時間(ms) */
    var PIXEL_MAX = 60;    /* モザイク最大ピクセルサイズ */
    var MOVE_X    = 0.22;  /* 水平移動量（幅の比率） */
    var MOVE_Y    = 0.15;  /* 垂直移動量（高さの比率） */

    var _cA, _ctxA;  /* Canvas A: 現在画像退避 */
    var _cB, _ctxB;  /* Canvas B: 次画像登場   */
    var _imgCur = null, _imgNxt = null;

    /* canvas 生成 */
    function _mkCanvas(z) {
      var c = document.createElement('canvas');
      c.style.cssText = [
        'position:absolute','top:0','left:0',
        'width:100%','height:100%',
        'z-index:'+z,'display:none','pointer-events:none'
      ].join(';');
      stageEl.appendChild(c);
      return c;
    }

    /* ステージサイズに合わせて canvas を設定 */
    function _resize() {
      var w = stageEl.offsetWidth  || 800;
      var h = stageEl.offsetHeight || 480;
      _cA.width = w; _cA.height = h;
      _cB.width = w; _cB.height = h;
    }

    /* 1枚の canvas に画像をモザイク描画する
       img      : Image オブジェクト
       pixelSize: モザイクのブロックサイズ（1=クリア）
       ox, oy   : canvas 上の描画オフセット（移動表現）
       alpha    : 0〜1 の不透明度                        */
    function _drawOne(ctx, img, pixelSize, ox, oy, alpha) {
      var cw = ctx.canvas.width;
      var ch = ctx.canvas.height;
      ctx.clearRect(0, 0, cw, ch);
      if (!img) return;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

      if (pixelSize <= 1) {
        /* クリア描画 */
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(img, ox, oy, cw, ch);
      } else {
        /* モザイク描画:
           (1) 縮小専用の一時 canvas を作って img を sw×sh に縮小
           (2) スムージング OFF で cw×ch に拡大 → ブロック状になる */
        var sw = Math.max(1, Math.ceil(cw / pixelSize));
        var sh = Math.max(1, Math.ceil(ch / pixelSize));

        var tmp = document.createElement('canvas');
        tmp.width  = sw;
        tmp.height = sh;
        var tCtx = tmp.getContext('2d');
        tCtx.imageSmoothingEnabled = true;
        tCtx.drawImage(img, 0, 0, sw, sh);

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, sw, sh, ox, oy, cw, ch);
      }
      ctx.restore();
    }

    /* メインアニメーションループ */
    function _animate(startTs) {
      function _frame(ts) {
        if (state !== 'Animating') return;

        var t       = Math.min((ts - startTs) / MORPH_MS, 1.0);
        var easeOut = 1 - Math.pow(1 - t, 2.5);  /* 0→1 減速 */
        var easeIn  = Math.pow(t, 1.6);           /* 0→1 加速 */
        var W = _cA.width, H = _cA.height;

        /* Canvas A: 現在画像 ── 右下へ移動・モザイク増加・フェードアウト */
        _drawOne(_ctxA, _imgCur,
          Math.round(1 + (PIXEL_MAX - 1) * easeIn),  /* px: 1→PIXEL_MAX */
           W * MOVE_X * easeOut,                      /* ox: 0→右 */
           H * MOVE_Y * easeOut,                      /* oy: 0→下 */
          1.0 - easeOut);                             /* alpha: 1→0 */

        /* Canvas B: 次画像 ── 左下から中央へ移動・モザイク減少・フェードイン */
        _drawOne(_ctxB, _imgNxt,
          Math.max(1, Math.round(PIXEL_MAX * (1 - easeOut))), /* px: PIXEL_MAX→1 */
          -W * MOVE_X * (1 - easeOut),                        /* ox: 左外→0 */
           H * MOVE_Y * (1 - easeOut),                        /* oy: 下→0 */
          easeIn);                                             /* alpha: 0→1 */

        if (t < 1.0) {
          _rafId = requestAnimationFrame(_frame);
        } else {
          _cA.style.display = 'none';
          _cB.style.display = 'none';
          state = 'Done';
          _finish();
        }
      }
      _rafId = requestAnimationFrame(_frame);
    }

    /* 完了後: img 要素を差し替えて canvas を片付ける */
    function _finish() {
      currentEl.src           = nextEl.src;
      currentEl.style.opacity = '1';
      nextEl.style.opacity    = '0';
      state = 'Idle';
      onCompleted();
    }

    /* 2枚の画像を並行ロードし、両方揃ったら cb(imgA, imgB) */
    function _loadBoth(srcA, srcB, cb) {
      var res = [null, null], n = 0;
      function _one(src, idx) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = function () { res[idx] = img; if (++n === 2) cb(res[0], res[1]); };
        img.onerror = function () {                  if (++n === 2) cb(res[0], res[1]); };
        img.src = src;
      }
      _one(srcA, 0);
      _one(srcB, 1);
    }

    /* 初期化 */
    _cA = _mkCanvas(5); _ctxA = _cA.getContext('2d');
    _cB = _mkCanvas(6); _ctxB = _cB.getContext('2d');

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

          /* 初期フレーム: A=クリア表示、B=最大モザイクで透明 */
          _drawOne(_ctxA, _imgCur, 1,        0, 0, 1.0);
          _drawOne(_ctxB, _imgNxt, PIXEL_MAX, 0, 0, 0.0);
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
