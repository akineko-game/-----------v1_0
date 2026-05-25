/**
 * PhotoSlider — photo-slider.js
 * 既存ホームページ組み込み型Webコンポーネント（IIFE形式）
 *
 * [Undefined] direction をアニメーターへ渡すか否か: 未確定。渡さない実装。
 * [Undefined] morphStrength: CSSのtransition値で固定。
 * [Undefined] delayMs 具体値: デフォルト 300ms を暫定採用。
 * [Undefined] AutoPlayTimer.enabled 初期値: false を暫定採用。
 * [Undefined] AutoPlayTimer.interval 具体値: 5000ms を暫定採用。
 * [Undefined] データの供給方法: JS配列を暫定採用。
 * [Undefined] SystemTerminate 時に切替中だった場合の処理: destroy() は timer.stop() のみ。
 * [Undefined] slideCount の最大値: 制限なし。
 * [Undefined] OutCompleted と DelayElapsed の到着順序依存分岐:
 *             outCompletedフラグで管理。DelayElapsed優先でAnimatingInへ遷移。
 */
(function (global) {
  'use strict';

  /* ================================================================
     M5 — SlideCollection（データ層）
     状態なし。getCount() / getSlide(index) のみ公開。
     ================================================================ */
  function createSlideCollection(slides) {
    if (!Array.isArray(slides)) {
      throw new Error('[SlideCollection] slides は配列でなければなりません。');
    }
    slides.forEach(function (slide, i) {
      if (!slide.imageSrc || slide.imageSrc === '') {
        throw new Error('[SlideCollection] slides[' + i + '].imageSrc が空文字列です。');
      }
    });
    var _slides = slides.map(function (slide, i) {
      return { index: i, imageSrc: slide.imageSrc, caption: slide.caption || '' };
    });
    return {
      getCount: function () { return _slides.length; },
      getSlide: function (index) {
        if (index < 0 || index >= _slides.length) {
          throw new Error('[SlideCollection] index ' + index + ' は範囲外です。');
        }
        return _slides[index];
      }
    };
  }

  /* ================================================================
     M2 — AutoPlayTimer
     状態: "Stopped" | "Running" | "Fired"
     ================================================================ */
  function createAutoPlayTimer(opts) {
    var interval = opts.interval;
    var enabled  = opts.enabled;
    var onFire   = opts.onFire;

    if (typeof interval !== 'number' || interval <= 0) {
      throw new Error('[AutoPlayTimer] interval は 0 より大きい整数（ミリ秒）でなければなりません。');
    }

    var state   = 'Stopped';
    var timerId = null;

    function _tick() {
      state = 'Fired';
      onFire();
      state = 'Running';
    }

    return {
      getState: function () { return state; },
      start: function () {
        if (!enabled) return;
        if (state !== 'Stopped') return;
        timerId = setInterval(_tick, interval);
        state = 'Running';
      },
      reset: function () {
        // Running でなくても（Stopped でも）enabled なら再スタートする
        clearInterval(timerId);
        timerId = null;
        if (!enabled) return;
        timerId = setInterval(_tick, interval);
        state = 'Running';
      },
      stop: function () {
        clearInterval(timerId);
        timerId = null;
        state = 'Stopped';
      }
    };
  }

  /* ================================================================
     M3 — ImageAnimator
     状態: "Idle" | "AnimatingOut" | "AnimatingIn" | "Done"

     【修正】
     - transitionend のフィルタを propertyName ではなく
       「最後に発火する opacity」ではなく、
       一発で確実に検知するため setTimeout(0) による非同期確定方式に変更。
       CSS transition が複数プロパティあると transitionend が複数回発火するため、
       フラグで二重発火を防ぐ。
     ================================================================ */
  function createImageAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var onCompleted = opts.onCompleted;

    var state = 'Idle';
    var _outFired = false;
    var _inFired  = false;

    function _handleOutCompleted(e) {
      if (state !== 'AnimatingOut') return;
      if (_outFired) return;
      _outFired = true;

      currentEl.removeEventListener('transitionend', _handleOutCompleted);

      // AnimatingOut → AnimatingIn
      currentEl.classList.remove('ps-animating-out');
      // nextEl を最前面に
      nextEl.style.zIndex = '3';
      currentEl.style.zIndex = '1';
      nextEl.classList.add('ps-animating-in');
      state = 'AnimatingIn';
      _inFired = false;

      nextEl.addEventListener('transitionend', _handleInCompleted);
    }

    function _handleInCompleted(e) {
      if (state !== 'AnimatingIn') return;
      if (_inFired) return;
      _inFired = true;

      nextEl.removeEventListener('transitionend', _handleInCompleted);
      state = 'Done';

      // スワップ: currentEl を次の画像に更新し、nextEl をリセット
      currentEl.src = nextEl.src;
      currentEl.style.zIndex = '';
      nextEl.style.zIndex = '';

      // nextEl のクラスを外してから opacity/transform をリセット
      // （即座に外すと transition が走るため、一旦 transition を無効化）
      nextEl.style.transition = 'none';
      nextEl.classList.remove('ps-animating-in');
      // reflow を強制してリセットを反映
      void nextEl.offsetWidth;
      nextEl.style.transition = '';

      state = 'Idle';
      onCompleted();
    }

    return {
      getState: function () { return state; },
      startAnimation: function (payload) {
        if (state !== 'Idle') return;

        _outFired = false;
        _inFired  = false;

        nextEl.src = payload.nextImageSrc;

        // transition を一時無効にして nextEl を初期位置に戻す
        nextEl.style.transition = 'none';
        nextEl.classList.remove('ps-animating-in');
        void nextEl.offsetWidth; // reflow
        nextEl.style.transition = '';

        currentEl.addEventListener('transitionend', _handleOutCompleted);
        currentEl.classList.add('ps-animating-out');
        state = 'AnimatingOut';
      }
    };
  }

  /* ================================================================
     M4 — CaptionAnimator
     状態: "Idle" | "DelayWaiting" | "AnimatingIn" | "Done"
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
      if (state !== 'DelayWaiting') return;
      currentEl.removeEventListener('transitionend', _handleOutCompleted);
      outCompleted = true;
    }

    function _handleInCompleted(e) {
      if (state !== 'AnimatingIn') return;
      if (_inFired) return;
      _inFired = true;

      nextEl.removeEventListener('transitionend', _handleInCompleted);
      state = 'Done';

      // スワップ
      currentEl.textContent = nextEl.textContent;
      currentEl.style.opacity = '';
      currentEl.classList.remove('ps-animating-out');

      nextEl.style.transition = 'none';
      nextEl.classList.remove('ps-animating-in');
      void nextEl.offsetWidth;
      nextEl.style.transition = '';

      outCompleted = false;
      state = 'Idle';
      onCompleted();
    }

    function _onDelayElapsed() {
      if (state !== 'DelayWaiting') return;
      state    = 'AnimatingIn';
      _inFired = false;

      nextEl.style.transition = 'none';
      nextEl.classList.remove('ps-animating-in');
      void nextEl.offsetWidth;
      nextEl.style.transition = '';

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
     状態: "Idle" | "SwitchingImage" | "SwitchingCaption" | "Completing"
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

    var DELAY_MS = 300; // [Undefined] delayMs 具体値: 300ms 暫定

    function dispatch(event) {
      _log('[M1] dispatch: ' + event + ' (state=' + state + ')');

      switch (event) {

        case 'RequestNext':
        case 'RequestPrev': {
          if (state !== 'Idle') { _log('[M1] 棄却: ' + event + ' state=' + state); return; }
          if (slideCount < 2)   { _log('[M1] 棄却: slideCount=' + slideCount); return; }

          nextIndex = (event === 'RequestNext')
            ? (currentIndex + 1) % slideCount
            : (currentIndex - 1 + slideCount) % slideCount;

          var cs = collection.getSlide(currentIndex);
          var ns = collection.getSlide(nextIndex);
          _currentCaption = cs.caption;
          _nextCaption    = ns.caption;

          state = 'SwitchingImage';
          imageAnimator.startAnimation({
            currentImageSrc: cs.imageSrc,
            nextImageSrc:    ns.imageSrc
          });
          break;
        }

        case 'ImageSwitchCompleted': {
          if (state !== 'SwitchingImage') { _log('[M1] 棄却: ImageSwitchCompleted'); return; }
          state = 'SwitchingCaption';
          captionAnimator.startAnimation({
            currentCaption: _currentCaption,
            nextCaption:    _nextCaption,
            delayMs:        DELAY_MS
          });
          break;
        }

        case 'CaptionSwitchCompleted': {
          if (state !== 'SwitchingCaption') { _log('[M1] 棄却: CaptionSwitchCompleted'); return; }
          state        = 'Completing';
          currentIndex = nextIndex;
          state        = 'Idle';
          timer.reset();
          _log('[M1] 切替完了。currentIndex=' + currentIndex);
          break;
        }

        default:
          _log('[M1] 未知のイベント: ' + event);
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
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _buildDOM(firstSlide) {
    return [
      '<div class="ps-root">',
      '  <div class="ps-stage">',
      '    <img class="ps-image-slot ps-image-slot--current" src="' + _esc(firstSlide.imageSrc) + '" alt="' + _esc(firstSlide.caption) + '">',
      '    <img class="ps-image-slot ps-image-slot--next" src="" alt="">',
      '  </div>',
      '  <div class="ps-caption-area">',
      '    <p class="ps-caption ps-caption--current">' + _esc(firstSlide.caption) + '</p>',
      '    <p class="ps-caption ps-caption--next"></p>',
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
      ? document.querySelector(mountElement)
      : mountElement;

    if (!root) throw new Error('[PhotoSlider] mountElement が見つかりません: ' + mountElement);

    _log('Global: Initializing');

    var collection = createSlideCollection(slides);
    if (collection.getCount() === 0) {
      _log('slides が空のため初期化を中断。');
      return { destroy: function () {}, next: function () {}, prev: function () {} };
    }

    var firstSlide = collection.getSlide(0);
    root.innerHTML = _buildDOM(firstSlide);
    var psRoot = root.querySelector('.ps-root');

    var controller; // 前方参照

    var imageAnimator = createImageAnimator({
      currentEl:   psRoot.querySelector('.ps-image-slot--current'),
      nextEl:      psRoot.querySelector('.ps-image-slot--next'),
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

    // SystemInit（Initializing → Running）
    timer.start();
    _log('Global: Running (autoPlay.enabled=' + autoPlay.enabled + ')');

    return {
      next:    function () { controller.dispatch('RequestNext'); },
      prev:    function () { controller.dispatch('RequestPrev'); },
      destroy: function () { timer.stop(); _log('Global: Terminated'); },
      _getState: function () { return controller.getState(); }
    };
  }

  global.PhotoSlider = { init: init };

})(window);
