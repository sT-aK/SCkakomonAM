# リキッドグラスUI刷新 詳細設計書

Apple の Liquid Glass（iOS 26系）風デザインへの刷新と、「ゆっくり・ぬるっと」した
粘性系モーションの導入のための実装仕様。**この文書だけで実装できる**ことを目標に、
現状の実測インベントリ・新トークン・コンポーネント仕様・モーション仕様・実装手順・
検証手順・本リポジトリの運用ルールを全て含む。

## 0. 実装者への前提（必読）

- 対象リポジトリ: `sT-aK/SCkakomonAM`。**単一 `index.html`** のPWA（CSSは冒頭の
  `<style>` 18〜259行、JSは末尾の単一IIFE 279行〜）。ビルド無し・依存無し・
  フレームワーク無し。`CLAUDE.md` の規約（簡潔なコード様式・UI文言は日本語）に従う
- **変更対象は `index.html`（CSS大部分＋JS小改修）と `sw.js`（CACHEバンプのみ）**
- `sw.js` の `CACHE` は現在 `kakomon-v23` → **`kakomon-v24`** にバンプ必須
  （プリキャッシュのため、忘れると実機に反映されない）
- 検証: `python3 -m http.server 8080` ＋ Playwright（iPhone 13 エミュレーション、
  chromium は `/opt/pw-browsers/chromium`、モジュールは
  `/opt/node22/lib/node_modules/playwright`）。埋め込みJSは `<script>` を抽出して
  `node --check`
- 完了後: branch `claude/…` に force-with-lease push → PR作成 → **squash merge** が
  本リポの運用（ユーザーが実機確認するには main 反映が必要）
- 昼テーマ判定は `applyTheme()`（時刻6〜17時=昼）。テストでは `addInitScript` で
  `Date.getHours` を偽装して両テーマを強制する（このリポの既存テストの常套手段）

## 1. デザインコンセプト

Apple Liquid Glass の本質を、このアプリの既存資産（昼「オーロラ」/夜「ナイトグラス」の
背景グラデ＋ランダムウォーク）の上に実装する:

1. **レンズのようなガラス** — 強いblur＋彩度ブースト(saturate)＋縁のスペキュラ
   ハイライト（上縁が光る）で「向こうが屈折して見える」質感
2. **カプセルと大きな角丸** — バーとボタンはカプセル(999px)、カードは26pxの同心的な丸み
3. **液体のような動き** — 粘性のある長い減速（バウンスなし）。押下の戻りだけ極小の弾み

ユーザー確定事項:
- タブバーは**浮遊カプセル型**（画面下端から浮いた丸カプセル。選択ハイライトは
  液体的にスライドする「グライダー」方式）
- モーション質感は**粘性系（ぬるっと）**。オーバーシュートは押下の戻りのみ極小

## 2. 現状インベントリ（実測・現行mainの行番号）

### トークン
- `:root`(19-22): `--radius:16px; --blur:blur(14px); --jp:(フォントスタック)`
- 昼 `#app-root`(30-46): `--bg-grad:linear-gradient(160deg,#0ea5a3,#3b82f6 55%,#8b5cf6)`,
  `--card:rgba(255,255,255,.62)`, `--card2:rgba(255,255,255,.5)`, `--ink:#1c2340`,
  `--muted:#44507a`, `--line:rgba(255,255,255,.6)`, `--primary:#1d6fb8`,
  `--ok/#17805a --ng/#c53049 --due/#916300 --new/#2b6cb0 --unk/#6d5ce0`（各soft/line付き）,
  `--btn-bg:#fff`, `--btn-ink:#1d6fb8`, `--tabbar-bg:rgba(255,255,255,.18)`,
  `--tab-on-bg:#1d6fb8`, `--tab-on-ink:#fff`, `--track`, `--hero`, `--on-grad`,
  `--shadow:0 8px 24px rgba(10,50,90,.16)`
- 夜 `#app-root.night`(48-64): 同構成の低α版（`--tabbar-bg:rgba(20,18,45,.22)`,
  `--tab-on-bg:#6d5ce0`, `--btn-bg:linear-gradient(135deg,#8be9fd,#a78bfa)` 等）
- 背景ゆらぎ変数 `--bg-x/--bg-y/--bg-hue`(65)。`html`は単色fallback(27-28)

### モーション現状（置換対象）
| 対象 | 現在 |
|---|---|
| 画面切替 `.view.active`(93) + `@keyframes viewIn`(94) | `.28s ease`、opacity＋translateY(10px) |
| タブ `.tab`(89) | `transition:.15s`。選択(90)は `--tab-on-bg` の塗り替え（スライド無し） |
| ボタン群共通(96) | `transform .12s ease, background/color/border-color/box-shadow/opacity/filter .15s` |
| `:active`(97-98) | sink `translateY(1px) scale(.985)` ／ `scale(.95)` |
| 👍 `@keyframes likePop`(100-107) | `1s cubic-bezier(.2,.8,.3,1)`。0%:scale(0)rot(-16deg)→22%:1.18/rot7→42%:.94→60%:1→100%:上昇+消失 |
| `.feedback.ok` `okPulse`(108-109) | `.42s ease` の微パルス |
| 進捗 `.qprog>i`(180) | `width .3s` |
| 背景 `#app-root::before`(66-71) | `transition:transform 3s ease-in-out, filter 3s ease-in-out`。JSランダムウォーク(310-319): `--bg-x`±3% `--bg-y`±2% `--bg-hue`±10deg、間隔2.6〜3.4s |
| reduced-motion | CSS 72行（::before）、110-113行（viewIn/like-burst/okPulse停止＋全transition .01ms）、JSガード311行 |

### 構造・コンポーネント
- DOM順: `.topbar`(261-264, sticky top:0, `--tabbar-bg`＋blur, border-bottom) →
  `.wrap`(265-270, `max-width:760px`, `padding:14px 16px calc(64px+env(safe-area-inset-bottom))`(76)) →
  `.tabs`(271-276, **fixed bottom:0 全幅**, `max-width:760px; margin-inline:auto`,
  border-top, `box-shadow:0 -3px 16px rgba(20,18,30,.10)`(88)) — 静的HTMLの4ボタン
  （`role="tab"`, `data-view`, `aria-selected`）
- `show(view)`(468-477): `.tab`のaria-selected切替→`.view.active`切替→`render*()`が
  innerHTML再構築→`window.scrollTo(0,0)`。スワイプ切替(481-498)も`show()`を呼ぶ
- 主要コンポーネント: `.stat`(115)/`.panel`(130)/`.qcard`(184)/`.scorecard`(120)/
  `.daylist`(147)＝`--card`系＋`backdrop-filter:var(--blur)`(73)。
  `.startbtn`(151, radius12)/`.nextbtn`(212, radius12)/`.btn`(215, radius10)/
  `.choice`(191, radius11)＋`.k`(193, 34px radius9)/`.chk`(159)/`.diff-btn`(172)/
  `.seg button`(236, cap)/`.persist-note`(81, cap)/`.dunno`(202, radius11)/
  `.feedback`(206, radius12)/`.bar`(136)/`.qprog`(179)/`.badge`(181, cap)
- `answer()`内で👍 `like-burst` を `.qcard` に生成(784-788)。`applyTheme`(298-305)

## 3. 新デザイントークン

`:root`(19-22) を以下に拡張（`--jp` は現状維持）:

```css
:root{
  /* モーション（粘性系） */
  --ease-liquid: cubic-bezier(.22,1,.36,1);       /* ぬるっと減速 */
  --ease-liquid-inout: cubic-bezier(.65,0,.35,1); /* 対称の粘性 */
  --ease-press: cubic-bezier(.34,1.25,.64,1);     /* 押下の戻り専用・極小の弾み */
  --dur-fast:.3s; --dur-med:.55s; --dur-slow:.8s;
  /* ガラス材質 */
  --glass-blur: blur(22px) saturate(180%);        /* バー/浮遊要素用（強） */
  --blur: blur(14px) saturate(150%);              /* 既存カード用（saturate追加） */
  --radius:18px; --radius-lg:26px; --radius-cap:999px;
  --jp: /* 現状のまま */;
}
```

昼 `#app-root` に追加:
```css
  --glass-bg: rgba(255,255,255,.16);
  --glass-line: rgba(255,255,255,.5);
  --glass-edge: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -1px 0 rgba(255,255,255,.12);
  --glass-shadow: 0 12px 36px rgba(10,50,90,.22);
```
夜 `#app-root.night` に追加:
```css
  --glass-bg: rgba(30,26,60,.34);
  --glass-line: rgba(255,255,255,.22);
  --glass-edge: inset 0 1px 0 rgba(255,255,255,.28), inset 0 -1px 0 rgba(255,255,255,.06);
  --glass-shadow: 0 12px 36px rgba(0,0,0,.5);
```

- 既存 `--tabbar-bg`（41, 59行）は**廃止**し、`.topbar`/`.tabs` の参照を
  `--glass-bg` に置換する
- `--blur` の saturate 追加は既存カード5種（73行: `.stat,.panel,.qcard,.scorecard,.daylist`）
  に自動適用され「レンズ感」が出る

**ガラス材質レシピ**（バー・浮遊要素共通。以後「ガラスレシピ」と呼ぶ）:
```css
background:var(--glass-bg);
-webkit-backdrop-filter:var(--glass-blur); backdrop-filter:var(--glass-blur);
border:1px solid var(--glass-line);
box-shadow:var(--glass-edge), var(--glass-shadow);
```

## 4. コンポーネント仕様

### 4.1 浮遊カプセルタブバー（目玉・要JS小改修）

- `.tabs`(88) を置換:
  ```css
  .tabs{position:fixed; left:50%; transform:translateX(-50%);
    bottom:calc(12px + env(safe-area-inset-bottom)); z-index:50;
    width:min(92vw,560px); display:flex; gap:4px; padding:5px;
    border-radius:var(--radius-cap);
    /* ガラスレシピ */}
  ```
  旧 `border-top` / 旧`box-shadow` / `margin-inline:auto` / `max-width:760px` /
  safe-area左右padding / `bottom:0` は削除（浮遊するので不要）
- `.wrap`(76) の padding-bottom を `calc(88px + env(safe-area-inset-bottom))` に増加
  （浮遊バー高さ＋余白のクリアランス）
- **選択ハイライト「グライダー」**: HTML(271行) の tablist 先頭に
  `<div id="tabGlider"></div>` を追加。CSS:
  ```css
  #tabGlider{position:absolute; top:5px; bottom:5px; left:0; width:0;
    border-radius:var(--radius-cap); background:var(--tab-on-bg);
    box-shadow:var(--shadow); z-index:0; pointer-events:none;
    transition:transform var(--dur-med) var(--ease-liquid), width var(--dur-med) var(--ease-liquid);}
  ```
- `.tab`(89-90) 改修: `position:relative; z-index:1; border-radius:var(--radius-cap);
  transition:color var(--dur-fast) var(--ease-liquid), transform var(--dur-fast) var(--ease-press);`
  選択時(90)は **背景を塗らず文字色のみ** `color:var(--tab-on-ink)`（背景は
  グライダーが担う）。旧 `box-shadow:var(--shadow)` は削除
- **JS**: `moveGlider()` を追加し、`show()`(477付近)の末尾・boot時・resize時に呼ぶ:
  ```js
  function moveGlider(){
    const t=root.querySelector('.tab[aria-selected="true"]'), g=$('#tabGlider');
    if(!t||!g) return;
    g.style.width=t.offsetWidth+'px';
    g.style.transform='translateX('+t.offsetLeft+'px)';
  }
  ```
  - boot時は transition を一時無効化して初期配置
    （`g.style.transition='none'; moveGlider(); requestAnimationFrame(()=>g.style.transition='');`）。
    フォント読込後のズレ対策に `setTimeout(moveGlider,300)` も1回
  - `window.addEventListener('resize', moveGlider);`
  - スワイプ切替(481-498)は `show()` 経由なので自動で追従する

### 4.2 トップバー
`.topbar`(78): 全幅stickyのまま**ガラスレシピ**適用。`border` はレシピの4辺でなく
`border-bottom:1px solid var(--glass-line)` のみ残す（上端はステータスバー裏なので不要）。
box-shadowは `var(--glass-edge)` のみ（外形shadowは付けない）。
`#syncNote`/`.persist-note`(81-84): capのまま `box-shadow:var(--glass-edge)` を追加。

### 4.3 カード類（.stat / .panel / .qcard / .scorecard / .daylist）
- `border-radius:var(--radius-lg)`（=26px。`--radius` 参照箇所をこれに変更、
  または `--radius:18px` のままカード5種だけ `--radius-lg` を指定）
- 既存の `box-shadow` に `var(--glass-edge),` を**前置**して縁ハイライトを追加
  （例: `.qcard{box-shadow:var(--glass-edge), var(--shadow);}`）。
  `.stat`/`.panel`/`.daylist` は現在 box-shadow 無し → `box-shadow:var(--glass-edge);` を追加
- blurのsaturate強化は73行経由で自動

### 4.4 ボタン/操作要素の形状
| 要素 | 新radius |
|---|---|
| `.startbtn` / `.nextbtn` / `.btn` | `var(--radius-cap)`（カプセル化） |
| `.choice` | 16px、`.choice .k` は 12px |
| `.chk` / `.diff-btn` | 14px |
| `.dunno` / `.feedback` | 16px |
| `.seg button` / `.badge` / `.persist-note` | cap（現状維持） |

## 5. モーション仕様（「ゆっくりぬるっと」）

| 対象 | 新仕様 |
|---|---|
| 画面切替 `viewIn`(93-94) | `from{opacity:0; transform:translateY(16px) scale(.985)}` → to 通常。`animation:viewIn var(--dur-med) var(--ease-liquid) both` |
| タブ選択 | グライダーが `var(--dur-med) var(--ease-liquid)` でスライド（§4.1）。文字色は `--dur-fast` |
| ボタン共通(96) | `transition:transform var(--dur-fast) var(--ease-press), background .35s var(--ease-liquid), color .35s var(--ease-liquid), border-color .35s var(--ease-liquid), box-shadow .35s var(--ease-liquid), opacity .35s var(--ease-liquid), filter .35s var(--ease-liquid);` さらに `:active` 側(97-98)に `transition-duration:.15s;` を追加 → **押しは速く、戻りはぬるっと＋極小の弾み** |
| 選択肢 `.choice`(191) | `transition:.35s var(--ease-liquid)`（正解/不正解の塗り変化もぬるっと） |
| フィードバック(206-209) | `okPulse` 廃止。新規 `@keyframes fbIn{from{opacity:0; transform:translateY(10px) scale(.97)}}` を `.feedback{animation:fbIn var(--dur-med) var(--ease-liquid) both;}` として ok/ng 共通に適用 |
| 👍 `likePop`(100-107) | 全体を **1.4s**、easing `cubic-bezier(.3,.9,.35,1)`。中間キー%は現状の形を保ちつつ、上昇消失（60%→100%）がゆっくりになるよう再配分（例: 0/18/36/52/100%） |
| 進捗 `.qprog>i`(180) | `transition:width .6s var(--ease-liquid)` |
| 履歴バー `.bar>i`(137) | `transition:width .6s var(--ease-liquid)` を追加（現状無し） |
| 背景ゆらぎ(71, 310-319) | 維持。transition を `4s var(--ease-liquid-inout)` に、JS間隔を `3400+Math.random()*1000`（3.4〜4.4s）に微調整 |
| reduced-motion | 既存3ブロック（CSS72行・110-113行・JS311行）維持。`#tabGlider{transition:none}` を110-113行のブロックに追加 |

## 6. 実装手順（推奨順）

1. `:root`(19-22)と両テーマ(30-64)にトークン追加、`--blur`拡張、`--tabbar-bg`→`--glass-bg`置換
2. `.topbar`(78)をガラスレシピ化（§4.2）
3. `.tabs`(88)を浮遊カプセル化＋`.wrap`(76)のpadding変更（§4.1）
4. HTML(271)に `#tabGlider` 追加、`.tab`/`.tab[aria-selected]`(89-90)改修、グライダーCSS追加
5. JS: `moveGlider()` 追加＋`show()`末尾/boot/resizeで呼ぶ（§4.1）
6. モーション表（§5）どおり transition/keyframes を更新（93-94, 96-98, 100-109, 137, 180, 71, 316）
7. カード角丸・縁ハイライト（§4.3-4.4）
8. `sw.js` CACHE `v23`→`v24`
9. 検証（§7）→コミット→force-with-lease push→PR→squashマージ

## 7. 検証（Playwright・iPhone 13エミュ・昼/夜両テーマ）

- `.tabs`: computed で `position:fixed`、`border-radius` が 999px 系、
  `backdrop-filter` に `saturate` を含む、`left:50%`＋translateX(-50%) で中央浮遊
- `#tabGlider`: 存在し、タブをタップすると `transform` の translateX が変化
  （切替前後で異なる値）、`transition-duration` に `0.55s` を含む
- 画面切替: `.view.active` の `animationDuration` = `0.55s`
- ボタン: `transition-timing-function` に `--ease-press` 由来の bezier を含む
- `.wrap`: 最下部までスクロールしても最後の要素が浮遊バーに隠れない
  （lastContentBottom <= tabs.top）
- reduced-motion コンテキスト: viewIn/glider/背景::before が静止
  （animationName none / transition none）
- 機能回帰: 学習フロー一巡（消去法→番号タップ回答→👍表示→次へ）、4タブ描画、
  履歴の期間切替と日付展開、コンソールエラーなし。昼/夜スクショ目視
- 埋め込みJS `node --check`
- 実機確認（エミュ不可分・ユーザーに依頼）: 浮遊バーの周囲に背景グラデが見える、
  ホームインジケータと重ならない、iOSでガラスの彩度ブーストが効いている

## 8. 注意・制約（このリポジトリの過去の知見）

- **iOSでは `backdrop-filter` に `-webkit-` 併記必須**。ガラス層は増やしすぎない
  （バー2＋グライダー＋カード5種まで。入れ子のblurはGPU負荷）
- `.tabs` は `transform:translateX(-50%)` を持つため **containing block** になる。
  子は absolute の `#tabGlider` のみとし、`.tabs` 内に `position:fixed` の子を置かない
- 背景は「`html`=単色fallback(27-28) ＋ `#app-root::before`=全画面固定グラデ(66-71)」
  構成。**この構成とランダムウォークJS(310-319)は壊さない**。浮遊バー化で画面下端に
  背景が見えるのは意図どおり（過去のOS帯問題は全画面グラデ化で解消済み）
- **ドキュメントスクロール構成（bodyがスクロール）を維持**。`overflow:hidden` を
  html/body に再導入しない（iOSスタンドアロンのビューポート短縮を誘発した過去あり）
- `show()` は `window.scrollTo(0,0)` を使う（内部スクローラは無い）
- スワイプタブ切替(481-498)・消去法（文タップ=消去/番号タップ=回答）・
  👍バースト・自動同期（initSync/onAuthStateChanged）など既存挙動を壊さないこと
- `sw.js` の `CACHE` バンプを忘れると実機に反映されない。ユーザーへの反映案内は
  「アプリ完全終了→起動→もう一度起動」
