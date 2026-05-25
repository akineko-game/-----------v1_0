# PhotoSlider

既存ホームページに組み込める写真スライダーWebコンポーネントです。  
Vanilla JS / CSS のみで動作します。外部ライブラリは不要です。

---

## ファイル構成

```
photo-slider/
  photo-slider.js   部品本体（IIFE）
  photo-slider.css  部品専用CSS（.ps-root スコープ）
  demo.html         動作確認デモ
  README.md         本ファイル
```

---

## 組み込み手順

### 1. ファイルを配置する

`photo-slider.js` と `photo-slider.css` を既存サイトの任意のディレクトリに配置します。

### 2. HTMLに読み込みを追加する

```html
<link rel="stylesheet" href="/path/to/photo-slider.css">
<script src="/path/to/photo-slider.js"></script>
```

### 3. マウント先のdivを配置する

```html
<div id="my-slider"></div>
```

### 4. 初期化スクリプトを追加する

```html
<script>
  var slider = PhotoSlider.init({
    mountElement: '#my-slider',
    slides: [
      { imageSrc: 'photo1.jpg', caption: '説明文1' },
      { imageSrc: 'photo2.jpg', caption: '説明文2' },
      { imageSrc: 'photo3.jpg', caption: '説明文3' }
    ],
    autoPlay: {
      enabled:  false,  // true にすると自動再生
      interval: 5000    // 自動再生間隔（ミリ秒）
    }
  });
</script>
```

### 5. 前へ・次へ操作を接続する（任意）

```html
<button onclick="slider.next()">次へ</button>
<button onclick="slider.prev()">前へ</button>
```

### 6. 停止する（任意）

```js
slider.destroy(); // AutoPlayTimerを停止。ページ離脱時などに呼ぶ
```

---

## 初期化オプション

| オプション | 型 | 必須 | 説明 |
|---|---|---|---|
| `mountElement` | string \| Element | ✅ | CSSセレクタまたはDOM要素 |
| `slides` | Array | ✅ | `{ imageSrc, caption }` の配列 |
| `autoPlay.enabled` | boolean | — | 自動再生の有無（デフォルト: `false`） |
| `autoPlay.interval` | number | — | 自動再生間隔 ミリ秒（デフォルト: `5000`） |

### slides の制約

- `imageSrc` は空文字列不可（初期化時に例外を投げます）
- `caption` は省略可能（省略時は空文字列）

---

## 戻り値（API）

`PhotoSlider.init()` は以下のメソッドを持つオブジェクトを返します。

| メソッド | 説明 |
|---|---|
| `slider.next()` | 次のスライドへ |
| `slider.prev()` | 前のスライドへ |
| `slider.destroy()` | 停止（AutoPlayTimerを止める） |
| `slider._getState()` | 現在のM1状態を返す（デバッグ用） |

切替中（アニメーション中）に `next()` / `prev()` を呼んでも自動的に無視されます。

---

## スタイルのカスタマイズ

`photo-slider.css` の先頭にある CSS カスタムプロパティで調整できます。

```css
.ps-root {
  --ps-anim-duration-image:   0.6s;   /* 画像アニメーション時間 */
  --ps-anim-duration-caption: 0.5s;   /* 説明文アニメーション時間 */
  --ps-anim-duration-out:     0.4s;   /* 退避アニメーション時間 */
  --ps-stage-height:          480px;  /* ステージ高さ */
  --ps-caption-bg:    rgba(0,0,0,0.55); /* 説明文背景色 */
  --ps-caption-color: #ffffff;          /* 説明文文字色 */
}
```

---

## Undefined（未確定事項）

以下の項目は仕様未確定です。確定後に追加実装が必要です。

| 項目 | 状態 | 対応 |
|---|---|---|
| 矢印ボタンのUI・デザイン | 未確定 | demo.html に仮ボタンあり |
| ドットナビゲーションの有無 | 未確定 | 未実装 |
| スマホ表示時のレイアウト・アニメーション | 未確定 | CSSに `@media` 差し込み箇所を確保済み |
| direction をアニメーターへ渡すか否か | 未確定 | 渡さない実装（追加可能な設計） |
| morphStrength（モーフィング強度） | 未確定 | CSS変数 `--ps-morph-blur` / `--ps-morph-scale` で代替固定 |
| データの供給方法 | 未確定 | JS配列を暫定採用 |
| slideCount の最大値 | 未確定 | 制限なし |
| SystemTerminate 時に切替中だった場合の処理 | 未確定 | `destroy()` は `timer.stop()` のみ |

---

## 動作確認項目

1. `demo.html` をブラウザで開く
2. 「次へ」ボタンを押す → 画像がアニメーションで切り替わり、説明文が遅延してスライドインすること
3. 「前へ」ボタンを押す → 同様に切り替わること
4. アニメーション中に連打しても二重発火しないこと（ログで確認）
5. 最後のスライドで「次へ」→ 最初のスライドに戻ること（ループ）
6. 最初のスライドで「前へ」→ 最後のスライドに移動すること（ループ）
7. `autoPlay.enabled: true` に変更して自動再生されること
8. `window._slider.destroy()` をコンソールで実行 → 自動再生が止まること
9. コンソールに `[PhotoSlider]` プレフィックスの状態遷移ログが出力されること

---

## 既存サイトへの影響について

- グローバルスコープには `window.PhotoSlider` のみを追加します
- 全CSSは `.ps-root` スコープ内に限定されます
- 既存のCSS・JavaScriptには一切干渉しません
