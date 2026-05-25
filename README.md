# PhotoSlider

既存ホームページに組み込める写真スライダーWebコンポーネントです。  
Vanilla JS / CSS のみで動作します。外部ライブラリは不要です。

---

## 特徴

- **モザイクモーフィング** — 画像・説明文ともにピクセルブロックが溶けるように切り替わる
- **方向アニメーション** — 「次へ」は左下から登場・右下へ退避、「前へ」はその逆
- **説明文オーバーレイ** — 説明文は画像に重ねて表示。画像と完全同期で切り替わる
- **ドットナビゲーション** — 現在のスライドが一目でわかる。クリックで直接移動可能
- **自動再生 / 停止 / 再開** — APIで制御可能
- **設定ファイル分離** — `slides-config.js` だけ編集すれば画像・文言を追加・削除できる
- **スマホ対応** — 高さ自動縮小・ドット横スクロール対応
- **既存サイト無干渉** — グローバルスコープ汚染なし。CSSは `.ps-root` スコープ内に限定

---

## ファイル構成

```
photo-slider/
  slides-config.js  ★ スライドの追加・削除・設定はここだけ編集
  photo-slider.js   スライダー本体（IIFE形式）
  photo-slider.css  スライダー専用CSS
  demo.html         動作確認デモ
  README.md         本ファイル
```

---

## 組み込み手順

### 1. ファイルを配置する

`slides-config.js` `photo-slider.js` `photo-slider.css` を既存サイトの任意のディレクトリに配置します。

### 2. HTMLに読み込みを追加する

**設定ファイルを先に**、本体を後に読み込みます。

```html
<link rel="stylesheet" href="/path/to/photo-slider.css">

<!-- 設定ファイル（先に読み込む） -->
<script src="/path/to/slides-config.js"></script>
<!-- スライダー本体 -->
<script src="/path/to/photo-slider.js"></script>
```

### 3. マウント先のdivを配置する

```html
<div id="my-slider"></div>
```

### 4. 初期化スクリプトを追加する

```html
<script>
  var config = PHOTO_SLIDER_CONFIG; // slides-config.js の内容

  var slider = PhotoSlider.init({
    mountElement: '#my-slider',
    slides:       config.slides,
    autoPlay:     config.autoPlay,
    dots:         config.dots
  });
</script>
```

### 5. ボタンを接続する（任意）

```html
<button onclick="slider.prev()">← 前へ</button>
<button onclick="slider.next()">次へ →</button>
<button onclick="slider.stop()">停止</button>
<button onclick="slider.play()">再生</button>
```

---

## スライドの追加・削除（slides-config.js）

**スライドの管理は `slides-config.js` だけを編集します。**  
`photo-slider.js` や `demo.html` は触る必要はありません。

```js
var PHOTO_SLIDER_CONFIG = {

  autoPlay: {
    enabled:  true,   // true=自動再生ON / false=OFF
    interval: 5000    // 切替間隔（ミリ秒）
  },

  dots: true,         // true=ドットナビゲーション表示 / false=非表示

  slides: [
    {
      imageSrc: 'https://example.com/photo1.jpg',
      caption:  '1枚目の説明文'
    },
    {
      imageSrc: 'https://example.com/photo2.jpg',
      caption:  '2枚目の説明文'
    }
    // ↑ { imageSrc, caption } を追記するだけで追加できる
    // 最大100件まで設定可能
  ]
};
```

### 追加方法

```js
,{
  imageSrc: '画像のURL',
  caption:  '説明文'
}
```

### 削除方法

削除したい `{ ... },` の行をまるごと消す。

### 並び替え方法

行をカット＆ペーストで並べ替える。

---

## 初期化オプション一覧

| オプション | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `mountElement` | string \| Element | ✅ | — | CSSセレクタまたはDOM要素 |
| `slides` | Array | ✅ | — | `{ imageSrc, caption }` の配列（最大100件） |
| `autoPlay.enabled` | boolean | — | `false` | 自動再生の有無 |
| `autoPlay.interval` | number | — | `5000` | 自動再生間隔（ミリ秒） |
| `dots` | boolean | — | `true` | ドットナビゲーションの表示・非表示 |

### slides の制約

- `imageSrc` は空文字列不可（初期化時に例外を投げます）
- `caption` は省略可能（省略時は空文字列）
- 最大100件（101件目以降は自動的に無視されます）

---

## API（戻り値）

`PhotoSlider.init()` は以下のメソッドを持つオブジェクトを返します。

| メソッド | 説明 |
|---|---|
| `slider.next()` | 次のスライドへ（アニメーション中は無視） |
| `slider.prev()` | 前のスライドへ（アニメーション中は無視） |
| `slider.stop()` | 自動再生を停止する |
| `slider.play()` | 自動再生を再開する |
| `slider.isPlaying()` | 自動再生中なら `true` を返す |
| `slider.destroy()` | 完全停止（ページ離脱時などに呼ぶ） |
| `slider._getState()` | 現在の内部状態を返す（デバッグ用） |

---

## アニメーションのカスタマイズ

`photo-slider.js` 冒頭の定数で調整できます。

```js
var MORPH_MS  = 1600;  // アニメーション総時間（ミリ秒）
var PIXEL_MAX = 200;   // モザイクの最大ピクセルサイズ（大きいほど荒い）
var MOVE_X    = 1.20;  // 水平移動量（1.0=画面幅と同じ距離）
var MOVE_Y    = 0.90;  // 垂直移動量（1.0=画面高さと同じ距離）
```

---

## レイアウトのカスタマイズ

`photo-slider.css` の CSS カスタムプロパティで調整できます。

```css
.ps-root {
  --ps-stage-height: 480px;  /* ステージの高さ（スマホは260pxに自動縮小） */
}
```

---

## スマホ対応

`@media (max-width: 768px)` で以下が自動適用されます。

- ステージ高さ: `480px → 260px`
- ドットサイズ: `10px → 8px`（タップ領域は広めに確保）
- ドットが多い場合: 横スクロールで対応（スクロールバーは非表示）
- アクティブなドットは常に中央付近に自動スクロール

---

## 動作確認項目

1. `demo.html` をブラウザで開き、画像が表示されること
2. 「次へ」を押す → 現在画像が右下へモザイクで退避し、次画像が左下からモザイクが取れながら登場すること
3. 「前へ」を押す → 逆方向（現在画像が左下へ退避、次画像が右下から登場）に動くこと
4. 説明文が画像と完全同期で切り替わること（ずれがないこと）
5. アニメーション中に連打しても二重発火しないこと
6. 最後のスライドで「次へ」→ 最初に戻ること（ループ）
7. 最初のスライドで「前へ」→ 最後に移動すること（ループ）
8. ドットが現在のスライドに対応して光ること
9. ドットをクリックすると直接そのスライドに移動すること
10. 「ストップ」→ 自動再生が止まること
11. 「再生」→ 自動再生が再開すること
12. スマホ幅でドットが多い場合に横スクロールになること
13. `window._slider.destroy()` をコンソールで実行 → タイマーが止まること

---

## 既存サイトへの影響

- グローバルスコープには `window.PhotoSlider` と `window.PHOTO_SLIDER_CONFIG` のみを追加します
- 全CSSは `.ps-root` スコープ内に限定されます
- 既存のCSS・JavaScriptには一切干渉しません
