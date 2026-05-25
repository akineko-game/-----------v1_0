/**
 * PhotoSlider — photo-slider.js
 * 既存ホームページ組み込み型Webコンポーネント（IIFE形式）
 *
 * [Undefined] direction をアニメーターへ渡すか否か: 未確定。渡さない実装。
 * [Undefined] delayMs 具体値: デフォルト 350ms を暫定採用。
 * [Undefined] AutoPlayTimer.enabled 初期値: false を暫定採用。
 * [Undefined] AutoPlayTimer.interval 具体値: 5000ms を暫定採用。
 * [Undefined] データの供給方法: JS配列を暫定採用。
 * [Undefined] SystemTerminate 時に切替中だった場合の処理: destroy() は timer.stop() のみ。
 * [Undefined] slideCount の最大値: 制限なし。
 * [Undefined] morphStrength: canvasピクセルサイズとアニメーション時間で表現。
 */
(function (global) {
  'use strict';

  /* ================================================================
     M5 — SlideCollection（データ層）
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
     M3 — ImageAnimator（モザイク → クリア のモーフィング）

     実装方針:
       - 次画像をオフスクリーン canvas に描画
       - requestAnimationFrame ループで pixelSize を大→小へ変化させる
       - pixelSize が 1 になったら canvas を非表示にし img を表示（完了）
       - 現在画像は canvas アニメーション中に opacity フェードアウト
     ================================================================ */
  function createImageAnimator(opts) {
    var currentEl   = opts.currentEl;  // img.ps-image-slot--current
    var nextEl      = opts.nextEl;     // img.ps-image-slot--next（モザイク中は非表示）
    var stageEl     = opts.stageEl;    // .ps-stage（canvas をここに追加）
    var onCompleted = opts.onCompleted;

    var state = 'Idle';
    var _canvas = null;
    var _ctx    = null;
    var _rafId  = null;
    var _offImg = null; // 次画像のオフスクリーンImage

    var MORPH_MS    = 900;  // モザイク→クリアの総時間（ms）
    var PIXEL_START = 48;   // 最初のピクセルサイズ（大きいほど荒い）
    var PIXEL_END   = 1;    // 最終ピクセルサイズ（1 = 通常）

    /* canvas を生成してステージに追加 */
    function _createCanvas() {
      var c = document.createElement('canvas');
      c.style.cssText = [
        'position:absolute',
        'top:0', 'left:0',
        'width:100%', 'height:100%',
        'z-index:4',
        'display:none',
        'image-rendering:pixelated',
        'image-rendering:crisp-edges'
      ].join(';');
      stageEl.appendChild(c);
      return c;
    }

    /* canvas に pixelSize でモザイクを描画 */
    function _drawMosaic(pixelSize) {
      var w = _canvas.width, h = _canvas.height;
      _ctx.clearRect(0, 0, w, h);
      if (pixelSize <= 1) {
        _ctx.drawImage(_offImg, 0, 0, w, h);
        return;
      }
      var cols = Math.ceil(w / pixelSize);
      var rows = Math.ceil(h / pixelSize);
      // 縮小して拡大（ピクセル化）
      var tmpW = cols, tmpH = rows;
      _ctx.drawImage(_offImg, 0, 0, tmpW, tmpH);
      _ctx.imageSmoothingEnabled = false;
      _ctx.drawImage(_canvas, 0, 0, tmpW, tmpH, 0, 0, w, h);
    }

    /* モザイクアニメーションループ */
    function _animate(startTs, imgSrc) {
      function _frame(ts) {
        if (state !== 'AnimatingIn') return;
        var elapsed = ts - startTs;
        var t = Math.min(elapsed / MORPH_MS, 1); // 0.0 → 1.0
        // イーズアウト
        var eased = 1 - Math.pow(1 - t, 3);
        var pixelSize = Math.max(PIXEL_END, Math.round(PIXEL_START * (1 - eased)));
        _drawMosaic(pixelSize);

        if (t < 1) {
          _rafId = requestAnimationFrame(_frame);
        } else {
          // アニメーション完了 → canvas を隠して img を表示
          _canvas.style.display = 'none';
          nextEl.style.opacity  = '1';
          nextEl.style.filter   = '';
          state = 'Done';
          _finish();
        }
      }
      _rafId = requestAnimationFrame(_frame);
    }

    /* 完了処理: currentEl を次画像にスワップし、nextEl をリセット */
    function _finish() {
      // currentEl を次画像に更新
      currentEl.src = nextEl.src;
      currentEl.style.opacity    = '1';
      currentEl.style.transition = 'none';
      currentEl.classList.remove('ps-animating-out');
      void currentEl.offsetWidth;
      currentEl.style.transition = '';

      // nextEl を非表示に戻す（transition なしで即時）
      nextEl.style.transition = 'none';
      nextEl.style.opacity    = '0';
      void nextEl.offsetWidth;
      nextEl.style.transition = '';

      state = 'Idle';
      onCompleted();
    }

    /* canvas サイズをステージに合わせる */
    function _resizeCanvas() {
      _canvas.width  = stageEl.offsetWidth  || 800;
      _canvas.height = stageEl.offsetHeight || 480;
    }

    // 初期化
    _canvas = _createCanvas();
    _ctx    = _canvas.getContext('2d');

    return {
      getState: function () { return state; },

      startAnimation: function (payload) {
        if (state !== 'Idle') return;
        state = 'AnimatingOut';

        // 現在画像フェードアウト開始
        currentEl.classList.add('ps-animating-out');

        // 次画像を Image オブジェクトとして読み込む
        _offImg = new Image();
        _offImg.crossOrigin = 'anonymous';

        _offImg.onload = function () {
          if (state !== 'AnimatingOut') return; // キャンセルされた場合

          // AnimatingOut → AnimatingIn
          currentEl.classList.remove('ps-animating-out');
          currentEl.style.opacity = '0';

          // canvas を表示してモザイク開始
          _resizeCanvas();
          _canvas.style.display = 'block';
          nextEl.style.opacity  = '0'; // img は非表示のまま（canvas で表示）
          nextEl.src = payload.nextImageSrc;

          state = 'AnimatingIn';
          requestAnimationFrame(function (ts) { _animate(ts, payload.nextImageSrc); });
        };

        _offImg.onerror = function () {
          // 画像読み込み失敗時: フォールバックとして即時完了
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
     状態: "Idle" | "DelayWaiting" | "AnimatingIn" | "Done"

     点滅の原因と修正:
       完了後に nextEl のテキスト・クラスをリセットする際、
       transition が残っていると opacity:0 へ戻るアニメーションが走る。
       → visibility:hidden で即時非表示にしてからリセットし、
         visibility を戻す方式で点滅を防ぐ。
     ================================================================ */
  function createCaptionAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var onCompleted = opts.onCompleted;

    var state        = 'Idle';
    var outCompleted = false;
    var delayTimerId = null;
    var _inFired     = false;

    function _handleOutCompleted(e) {
      if (e.propertyName !== 'opacity') return;
      if (state !== 'DelayWaiting') return;
      currentEl.removeEventListener('transitionend', _handleOutCompleted);
      outCompleted = true;
    }

    function _handleInCompleted(e) {
      if (e.propertyName !== 'opacity') return;
      if (state !== 'AnimatingIn') return;
      if (_inFired) return;
      _inFired = true;

      nextEl.removeEventListener('transitionend', _handleInCompleted);
      state = 'Done';

      // ① currentEl に表示テキストをスワップ（まだ opacity:0 のまま）
      currentEl.textContent = nextEl.textContent;
      currentEl.classList.remove('ps-animating-out');
      // transition なしで currentEl を即時表示状態に戻す
      currentEl.style.transition = 'none';
      currentEl.style.opacity    = '1';
      void currentEl.offsetWidth;
      currentEl.style.transition = '';

      // ② nextEl を visibility:hidden で即時非表示 → クラス除去 → 待機位置へ戻す
      //    visibility:hidden なら transition は視覚的に発生しない
      nextEl.style.visibility = 'hidden';
      nextEl.classList.remove('ps-animating-in');
      // transition を無効にして即時リセット
      nextEl.style.transition = 'none';
      nextEl.style.opacity    = '0';
      nextEl.style.transform  = 'translateX(-40px)';
      void nextEl.offsetWidth;
      // transition と visibility を戻す
      nextEl.style.transition = '';
      nextEl.style.visibility = '';

      outCompleted = false;
      state = 'Idle';
      onCompleted();
    }

    function _onDelayElapsed() {
      if (state !== 'DelayWaiting') return;
      state    = 'AnimatingIn';
      _inFired = false;

      // ps-animating-in 付与前に確実に待機状態を作る
      nextEl.style.visibility = 'hidden';
      nextEl.classList.remove('ps-animating-in');
      nextEl.style.transition = 'none';
      nextEl.style.opacity    = '0';
      nextEl.style.transform  = 'translateX(-40px)';
      void nextEl.offsetWidth;
      nextEl.style.transition = '';
      nextEl.style.visibility = '';

      // クラス付与で transition 発火
      nextEl.classList.add('ps-animating-in');
      nextEl.addEventListener('transitionend', _handleInCompleted);
    }

    return {
      getState: function () { return state; },
      startAnimation: function (payload) {
        if (state !== 'Idle') return;

        nextEl.textContent = payload.nextCaption;

        currentEl.addEventListener('transitionend', _handleOutCompleted);
        currentEl.classList.add('ps-animating-out');

        delayTimerId = setTimeout(_onDelayElapsed, payload.delayMs);
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
          captionAnimator.startAnimation({ currentCaption: _currentCaption, nextCaption: _nextCaption, delayMs: DELAY_MS });
          break;

        case 'CaptionSwitchCompleted':
          if (state !== 'SwitchingCaption') { _log('[M1] 棄却: CaptionSwitchCompleted'); return; }
          state = 'Completing';
          currentIndex = nextIndex;
          state = 'Idle';
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
      '    <img class="ps-image-slot ps-image-slot--next" src="" alt="" style="opacity:0">',
      '  </div>',
      '  <div class="ps-caption-area">',
      '    <p class="ps-caption ps-caption--current">'+_esc(firstSlide.caption)+'</p>',
      '    <p class="ps-caption ps-caption--next" style="opacity:0;transform:translateX(-40px)"></p>',
      '  </div>',
      '</div>'
    ].join('\n');
  }

  /* ================================================================
     PhotoSlider.init — 公開API
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
      _log('slides が空。');
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
      collection: collection, imageAnimator: imageAnimator,
      captionAnimator: captionAnimator, timer: timer
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
