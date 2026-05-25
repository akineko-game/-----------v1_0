/**
 * PhotoSlider — photo-slider.js
 * 既存ホームページ組み込み型Webコンポーネント（IIFE形式）
 *
 * グローバルに公開するのは window.PhotoSlider = { init } のみ。
 * それ以外はすべてIIFEクロージャ内に封じる。
 *
 * [Undefined] direction をアニメーターへ渡すか否か: 未確定。渡さない実装。
 *             渡す場合は startAnimation のペイロードに direction を追加すること。
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
    // 初期化時バリデーション
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
      getCount: function () {
        return _slides.length;
      },
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

    // M2 制約: interval > 0
    if (typeof interval !== 'number' || interval <= 0) {
      throw new Error('[AutoPlayTimer] interval は 0 より大きい整数（ミリ秒）でなければなりません。');
    }

    var state   = 'Stopped';
    var timerId = null;

    function _tick() {
      // IntervalElapsed → Fired
      state = 'Fired';
      onFire();
      // Fired →（即時）Running
      state = 'Running';
    }

    return {
      getState: function () { return state; },

      /** Start: enabled=true のときのみ Running へ遷移 */
      start: function () {
        if (!enabled) return; // [Rule] enabled=false なら無視
        if (state !== 'Stopped') return;
        timerId = setInterval(_tick, interval);
        state = 'Running';
      },

      /** Reset: clearInterval → setInterval で再スタート（state 維持） */
      reset: function () {
        if (state !== 'Running') return;
        clearInterval(timerId);
        timerId = setInterval(_tick, interval);
        // state は "Running" を維持
      },

      /** Stop: カウント破棄 → Stopped */
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

     transitionend の二重発火防止:
       opacity の transitionend のみを OutCompleted / InCompleted に使用。
       (opacity は必ず1回だけ発火し、かつ最もわかりやすいプロパティ)
     ================================================================ */
  function createImageAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var onCompleted = opts.onCompleted;

    var state = 'Idle';

    /* 内部: OutCompleted ハンドラ */
    function _handleOutCompleted(e) {
      if (e.propertyName !== 'opacity') return;
      if (state !== 'AnimatingOut') return;

      currentEl.removeEventListener('transitionend', _handleOutCompleted);

      // AnimatingOut → AnimatingIn
      currentEl.classList.remove('ps-animating-out');
      nextEl.classList.add('ps-animating-in');
      state = 'AnimatingIn';

      nextEl.addEventListener('transitionend', _handleInCompleted);
    }

    /* 内部: InCompleted ハンドラ */
    function _handleInCompleted(e) {
      if (e.propertyName !== 'opacity') return;
      if (state !== 'AnimatingIn') return;

      nextEl.removeEventListener('transitionend', _handleInCompleted);

      // AnimatingIn → Done
      state = 'Done';

      // Done後リセット: src と クラスをスワップ
      currentEl.src = nextEl.src;
      currentEl.classList.remove('ps-animating-out');
      nextEl.classList.remove('ps-animating-in');

      // z-index をリセット（CSSクラスで管理しているため不要だが念のため）
      state = 'Idle';

      // M1 へ通知
      onCompleted();
    }

    return {
      getState: function () { return state; },

      /**
       * startAnimation: Idle のときのみ受け付ける。
       * @param {Object} payload - { currentImageSrc, nextImageSrc }
       * [Undefined] direction: 受け取らない（未確定）
       */
      startAnimation: function (payload) {
        if (state !== 'Idle') return; // [Rule] AnimatingOut/In中は無視

        var currentImageSrc = payload.currentImageSrc;
        var nextImageSrc    = payload.nextImageSrc;

        // nextEl に画像をセット
        nextEl.src = nextImageSrc;

        // currentEl を退避アニメーション開始
        currentEl.addEventListener('transitionend', _handleOutCompleted);
        currentEl.classList.add('ps-animating-out');

        state = 'AnimatingOut';
      }
    };
  }

  /* ================================================================
     M4 — CaptionAnimator
     状態: "Idle" | "DelayWaiting" | "AnimatingIn" | "Done"
     ※ "AnimatingOut" は DelayWaiting 内の並行処理として内部フラグで管理。

     [Undefined] OutCompleted と DelayElapsed の到着順序依存分岐:
       outCompletedフラグで管理。DelayElapsed優先で AnimatingIn へ遷移。
     ================================================================ */
  function createCaptionAnimator(opts) {
    var currentEl   = opts.currentEl;
    var nextEl      = opts.nextEl;
    var onCompleted = opts.onCompleted;

    var state        = 'Idle';
    var outCompleted = false;
    var delayTimerId = null;

    /* 内部: OutCompleted ハンドラ（DelayWaiting 中の先着ケース） */
    function _handleOutCompleted(e) {
      if (e.propertyName !== 'opacity') return;
      if (state !== 'DelayWaiting') return;

      currentEl.removeEventListener('transitionend', _handleOutCompleted);

      // DelayWaiting 維持のまま outCompleted = true を記録
      outCompleted = true;
      // DelayElapsed を待つ（状態は DelayWaiting のまま）
    }

    /* 内部: InCompleted ハンドラ */
    function _handleInCompleted(e) {
      if (e.propertyName !== 'opacity') return;
      if (state !== 'AnimatingIn') return;

      nextEl.removeEventListener('transitionend', _handleInCompleted);

      // AnimatingIn → Done
      state = 'Done';

      // Done後リセット: textContent と クラスをスワップ
      currentEl.textContent = nextEl.textContent;
      currentEl.classList.remove('ps-animating-out');
      nextEl.classList.remove('ps-animating-in');
      outCompleted = false;

      state = 'Idle';

      // M1 へ通知
      onCompleted();
    }

    /* 内部: DelayElapsed（setTimeout コールバック） */
    function _onDelayElapsed() {
      if (state !== 'DelayWaiting') return;

      // DelayWaiting → AnimatingIn（outCompleted の状態に関わらず遷移）
      state = 'AnimatingIn';
      nextEl.classList.add('ps-animating-in');
      nextEl.addEventListener('transitionend', _handleInCompleted);
    }

    return {
      getState: function () { return state; },

      /**
       * startAnimation: Idle のときのみ受け付ける。
       * @param {Object} payload - { currentCaption, nextCaption, delayMs }
       */
      startAnimation: function (payload) {
        if (state !== 'Idle') return;

        var currentCaption = payload.currentCaption;
        var nextCaption    = payload.nextCaption;
        var delayMs        = payload.delayMs;

        // 次説明文をセット
        nextEl.textContent = nextCaption;

        // 現在説明文フェードアウト開始
        currentEl.addEventListener('transitionend', _handleOutCompleted);
        currentEl.classList.add('ps-animating-out');

        // delayMs タイマー開始（DelayElapsed）
        delayTimerId = setTimeout(_onDelayElapsed, delayMs);

        state        = 'DelayWaiting';
        outCompleted = false;
      }
    };
  }

  /* ================================================================
     M1 — SliderController
     状態: "Idle" | "SwitchingImage" | "SwitchingCaption" | "Completing"

     dispatch(event, payload) で全イベントを受け付ける。
     ================================================================ */
  function createSliderController(opts) {
    var collection      = opts.collection;
    var imageAnimator   = opts.imageAnimator;
    var captionAnimator = opts.captionAnimator;
    var timer           = opts.timer;

    // [Undefined] direction をアニメーターへ渡すか否か: 渡さない。
    var state        = 'Idle';
    var currentIndex = 0;
    var nextIndex    = null;
    var slideCount   = collection.getCount();

    // 切替中に保持する説明文
    var _currentCaption = '';
    var _nextCaption    = '';

    // [Undefined] delayMs 具体値: 300ms を暫定採用
    var DELAY_MS = 300;

    /**
     * dispatch — 全イベントの入口
     * @param {string} event
     * @param {Object} [payload]
     */
    function dispatch(event, payload) {
      _log('[M1] dispatch: ' + event + ' (state=' + state + ')');

      switch (event) {

        case 'RequestNext':
        case 'RequestPrev': {
          // 棄却: 非Idle または slideCount < 2
          if (state !== 'Idle') {
            _log('[M1] ' + event + ' 棄却: state=' + state);
            return;
          }
          if (slideCount < 2) {
            _log('[M1] ' + event + ' 棄却: slideCount=' + slideCount);
            return;
          }

          // nextIndex 計算
          if (event === 'RequestNext') {
            nextIndex = (currentIndex + 1) % slideCount;
          } else {
            nextIndex = (currentIndex - 1 + slideCount) % slideCount;
          }

          // [Undefined] direction: 内部で保持するが、アニメーターへは渡さない
          // var direction = (event === 'RequestNext') ? 'forward' : 'backward';

          // M5.getSlide で両スライドのデータを取得（GetSlide → payload確定 → StartAnimation の順を保証）
          var currentSlide = collection.getSlide(currentIndex);
          var nextSlide    = collection.getSlide(nextIndex);
          _currentCaption  = currentSlide.caption;
          _nextCaption     = nextSlide.caption;

          // M3.startAnimation を呼ぶ
          state = 'SwitchingImage';
          imageAnimator.startAnimation({
            currentImageSrc: currentSlide.imageSrc,
            nextImageSrc:    nextSlide.imageSrc
          });
          break;
        }

        case 'ImageSwitchCompleted': {
          if (state !== 'SwitchingImage') {
            _log('[M1] ImageSwitchCompleted 棄却: state=' + state);
            return;
          }
          // SwitchingImage → SwitchingCaption
          state = 'SwitchingCaption';
          // M4.startAnimation を呼ぶ（M3完了後に初めて送信）
          captionAnimator.startAnimation({
            currentCaption: _currentCaption,
            nextCaption:    _nextCaption,
            delayMs:        DELAY_MS
          });
          break;
        }

        case 'CaptionSwitchCompleted': {
          if (state !== 'SwitchingCaption') {
            _log('[M1] CaptionSwitchCompleted 棄却: state=' + state);
            return;
          }
          // SwitchingCaption → Completing
          state        = 'Completing';
          currentIndex = nextIndex; // currentIndex は Completing 後にのみ更新

          // Completing →（即時）Idle
          state = 'Idle';
          timer.reset();
          _log('[M1] 切替完了。currentIndex=' + currentIndex);
          break;
        }

        default:
          _log('[M1] 未知のイベント: ' + event);
      }
    }

    return {
      dispatch:       dispatch,
      getCurrentIndex: function () { return currentIndex; },
      getState:        function () { return state; },
      getSlideCount:   function () { return slideCount; }
    };
  }

  /* ================================================================
     ユーティリティ: ログ
     ================================================================ */
  function _log(msg) {
    if (typeof console !== 'undefined' && console.log) {
      console.log('[PhotoSlider] ' + msg);
    }
  }

  /* ================================================================
     DOM構築ヘルパー
     ================================================================ */
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

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ================================================================
     PhotoSlider.init — 公開API（Global: Initializing → Running）
     ================================================================ */
  function init(opts) {
    var mountElement = opts.mountElement;
    var slides       = opts.slides;
    var autoPlay     = opts.autoPlay || {};

    // 1. マウント先DOM取得
    var root = (typeof mountElement === 'string')
      ? document.querySelector(mountElement)
      : mountElement;

    if (!root) {
      throw new Error('[PhotoSlider] mountElement が見つかりません: ' + mountElement);
    }

    // Global: Initializing フェーズ
    _log('Global: Initializing');

    // 2. M5 生成（GetCount はここで完結）
    var collection = createSlideCollection(slides);
    var slideCount = collection.getCount();

    if (slideCount === 0) {
      _log('[PhotoSlider] slides が空のため初期化を中断します。');
      return { destroy: function () {} };
    }

    // 3. DOM構築（最初のスライドで初期表示）
    var firstSlide = collection.getSlide(0);
    root.innerHTML = _buildDOM(firstSlide);
    var psRoot = root.querySelector('.ps-root');

    // 4. M3 生成
    //    controller が後で生成されるため、コールバックは遅延参照
    var controller; // 前方参照
    var imageAnimator = createImageAnimator({
      currentEl:   psRoot.querySelector('.ps-image-slot--current'),
      nextEl:      psRoot.querySelector('.ps-image-slot--next'),
      onCompleted: function () { controller.dispatch('ImageSwitchCompleted'); }
    });

    // 5. M4 生成
    var captionAnimator = createCaptionAnimator({
      currentEl:   psRoot.querySelector('.ps-caption--current'),
      nextEl:      psRoot.querySelector('.ps-caption--next'),
      onCompleted: function () { controller.dispatch('CaptionSwitchCompleted'); }
    });

    // 6. M2 生成
    var timer = createAutoPlayTimer({
      interval: (autoPlay.interval != null ? autoPlay.interval : 5000), // [Undefined] 5000ms 暫定
      enabled:  (autoPlay.enabled  != null ? autoPlay.enabled  : false), // [Undefined] false 暫定
      onFire:   function () { controller.dispatch('RequestNext'); }
    });

    // 7. M1 生成
    controller = createSliderController({
      collection:      collection,
      imageAnimator:   imageAnimator,
      captionAnimator: captionAnimator,
      timer:           timer
    });

    // 8. SystemInit（Initializing → Running）
    timer.start();
    _log('Global: Running');

    // 9. Viewerイベントの接続を返す（demo.html 側で接続）
    //    矢印ボタン・ドットナビゲーションは [Undefined] のため、ここでは接続しない。

    // 10. destroy（SystemTerminate相当）を返す
    //     [Undefined] SystemTerminate 時に切替中だった場合の処理: timer.stop() のみ。
    return {
      /** 次へ */
      next:    function () { controller.dispatch('RequestNext'); },
      /** 前へ */
      prev:    function () { controller.dispatch('RequestPrev'); },
      /** 停止 */
      destroy: function () {
        timer.stop();
        _log('Global: Terminated');
      },
      /** デバッグ用 */
      _getState: function () { return controller.getState(); }
    };
  }

  /* ================================================================
     グローバル公開
     window.PhotoSlider のみを公開。それ以外は非公開。
     ================================================================ */
  global.PhotoSlider = { init: init };

})(window);
