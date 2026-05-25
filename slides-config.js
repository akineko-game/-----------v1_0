/**
 * =====================================================================
 * PhotoSlider — slides-config.js  【設定ファイル】
 *
 * ここだけ編集すれば、スライドの追加・削除・並び替えができます。
 *
 * 【追加方法】
 *   下の配列に { imageSrc: '画像URL', caption: '説明文' } を1行追加する。
 *   最大100件まで設定可能です。
 *
 * 【削除方法】
 *   削除したい { ... }, の行をまるごと消す。
 *
 * 【並び替え方法】
 *   行をカット＆ペーストで並べ替える。
 *
 * 【自動再生の設定】
 *   PHOTO_SLIDER_CONFIG.autoPlay.enabled  : true=自動再生 / false=手動のみ
 *   PHOTO_SLIDER_CONFIG.autoPlay.interval : 切替間隔（ミリ秒）例: 5000=5秒
 *
 * =====================================================================
 */
var PHOTO_SLIDER_CONFIG = {

  autoPlay: {
    enabled:  true,   // true=自動再生ON / false=OFF
    interval: 5000    // 切替間隔（ミリ秒）
  },

  // ------------------------------------------------------------------
  // スライド一覧（最大100件）
  // imageSrc : 画像のURL
  // caption  : 画像に重ねて表示する説明文
  // ------------------------------------------------------------------
  slides: [

    {
      imageSrc: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=860&q=80',
      caption:  '山の夜明け — 稜線から差し込む最初の光が、谷をゆっくりと照らしていく。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=860&q=80',
      caption:  '森の霧 — 早朝の静寂の中、木々の間から光が筋となって落ちてくる。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=860&q=80',
      caption:  '海岸の夕暮れ — 波が砂を引いていくたびに、空の色が変わっていく。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=860&q=80',
      caption:  '秋の渓谷 — 赤と黄が混じり合う木々の間を、流れが静かに走る。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=860&q=80',
      caption:  '雪山の頂 — 白銀の稜線が、澄み切った青空の中へ溶け込んでいく。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=860&q=80',
      caption:  '湖畔の朝 — 鏡のような水面に、対岸の木々がそのまま映り込む。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=860&q=80',
      caption:  '草原の風 — 丘を渡る風が、緑の波を次々と押し流していく。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=860&q=80',
      caption:  '滝の轟音 — 岩肌を削りながら落ちる水が、霧となって林の中に広がる。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1510784722466-f2aa240c5ece?w=860&q=80',
      caption:  '砂漠の夕焼け — 果てしない砂の海が、橙と紅に燃え上がる時間。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1504701954957-2010ec3bcec1?w=860&q=80',
      caption:  '熱帯の密林 — 幾重にも重なる緑の天蓋が、地面への光を遮る。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=860&q=80',
      caption:  '冬の星空 — 雪原の静寂の上に、無数の星々が降り注ぐ夜。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1433086966358-54859d0ed716?w=860&q=80',
      caption:  '渓流の朝 — 苔むした岩の間を縫うように、清流がひたすら下っていく。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=860&q=80',
      caption:  '海霧の朝 — 沖から流れ込む霧が、港町の輪郭をやわらかく包む。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=860&q=80',
      caption:  '花畑の午後 — 風に揺れる色とりどりの花が、大地を染め上げていく。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=860&q=80',
      caption:  '氷河の蒼 — 万年氷の深みから滲み出す青が、光を吸い込んで輝く。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1525088553748-01d6e210e00b?w=860&q=80',
      caption:  '竹林の道 — 空へ向かってまっすぐ伸びる青竹の間を、風が抜けていく。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1516912481808-3406841bd33c?w=860&q=80',
      caption:  '雪景色 — 一面の白に、木々の影だけが細い線を刻んでいる。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=860&q=80',
      caption:  '針葉樹の森 — 霧の中に浮かぶ巨木の列が、深い奥行きを生み出す。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?w=860&q=80',
      caption:  '夜明けの海 — 水平線から光が広がり、波頭がひとつひとつ金色に染まる。'
    },
    {
      imageSrc: 'https://images.unsplash.com/photo-1501003878151-d3cb87799705?w=860&q=80',
      caption:  '高原の雲 — 地平線まで続く草地の上を、巨大な影が静かに移動していく。'
    }

    // ----------------------------------------------------------------
    // ↑ここまでが現在のスライド（20件）
    //
    // 追加する場合は上の行の末尾カンマのあとに以下の形式で追記:
    //
    // ,{
    //   imageSrc: '画像のURL',
    //   caption:  '説明文'
    // }
    //
    // 最大100件まで追加できます。
    // ----------------------------------------------------------------
  ]

};
