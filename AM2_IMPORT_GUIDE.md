# 午前II（午前2）過去問 取り込み指示書

このドキュメントは、**IPA公式PDF（問題冊子＋解答例）から SC 午前II の過去問をアプリに取り込む**作業を、
別の作業者（Claude Opus 4.8 を想定）が**他の資料を読まなくても実行できる**ように書いた自己完結の指示書である。

対象リポジトリ: `sT-aK/SCkakomonAM`（単一 `index.html` の PWA、ビルド無し・依存無し）。
既存の午前I（`data/sc_*_am1.json`）と同じ仕組みに午前II（`am2`）を追加する。

> **重要な前提**: `CLAUDE.md` の規約に必ず従うこと（簡潔なコード様式・UI文言は日本語・`sw.js` の `CACHE` バンプ必須）。
> 開発ブランチは `claude/github-tenbin-repo-jd1trd`。作業は「1期ぶん取り込み → 検証 → PR → squashマージ」を期ごとに反復する。

---

## §0 全体の進め方

- ユーザーは1期（=試験1回ぶん、PDF 2枚: `..._qs.pdf` 問題冊子 と `..._ans.pdf` 解答例）を添付して取り込みを依頼する。
- 2021〜2025年の各期（春/秋）が順次来る。**1期ごとに独立した PR** にする（差分を小さく保つ）。
- **最初の1期の取り込み時だけ**、§3 のアプリ改修（午前I/II の UI 分離）も同じ PR で行う。2期目以降はデータ追加＋登録（§2・§4）と検証（§5）のみ。
- 完了ごとに `sw.js` の `CACHE` を +1（このドキュメント作成時点は `kakomon-v28`。**必ず現在値を `sw.js` で確認してから** +1 する）。

---

## §1 入力PDFの読み方（最重要・実測済みの注意あり）

### ファイル名と年度表記
- 添付PDFは概ね `<西暦>r<NN><a|h>_sc_am2_{qs,ans}.pdf` の形式（例: `2021r03a_sc_am2_qs.pdf`）。
  - `r<NN>` = 令和の年数、`a` = **秋**、`h` = **春**。
  - 年度の内部表記は `R<NN>秋` / `R<NN>春`（例: 令和3年秋 → `R3秋`）。**`NN` は表示・IDともゼロ埋めしない**方の年数（`R3秋`）を年表記に使い、**IDのみ** `r03` のようにゼロ埋めする（§2のID規約に従う。既存AM1のIDは `sc-r3a-...` のようにゼロ埋め無しなので、**既存に合わせて `r<年数>` はゼロ埋めしない**。下の§2を正とする）。

### 問題冊子（`_qs.pdf`）
- 表紙の後に **問1〜問25**（IPA標準レイアウト）。各問は「問題文 → ア／イ／ウ／エの4択」。
- PDFにテキスト層はあるが**文字化けすることがある**。化けた場合は**ページを画像として開いて目視で転記**する（`Read` の `pages` で画像として読める）。
- 転記ルール:
  - 問題文の改行は `\n` で保持（アプリは `white-space:pre-wrap` で表示）。
  - 全角記号・単位・英数字は**原文どおり**（IPAは全角が多い）。勝手に半角化しない。
  - 選択肢は**ア→イ→ウ→エの順**で `choices` 配列に入れる（先頭の「ア．」等の記号は含めない）。

### 解答例（`_ans.pdf`）— ★実測: テキスト抽出では解答が取れない
- **この解答例PDFは、テキスト抽出すると表の番号（1〜25）しか出ず、肝心の解答文字（ア〜エ）が取得できない**（埋め込みフォントの都合。R3秋で実測済み）。
- したがって**必ずページを画像として開き、目視で 25 問ぶんの解答（ア/イ/ウ/エ）を読み取る**こと。
- レイアウトは「問番号｜解答」の表が3列（1〜10 / 11〜20 / 21〜25）に分かれている。
- **検算（必須）**:
  1. 解答がちょうど **25個** そろっているか。
  2. ア〜エの分布が極端でないか（各3個以上が目安。1つの選択肢に偏りすぎていたら読み違いを疑う）。
  3. **3〜5問を自分で実際に解いて**、読み取った解答と一致するか照合。
- 目視でも判読できない／検算が合わない場合は、**推測で埋めずユーザーに「解答列（問番号:解答）」の提供を依頼**する。

### 図・表・コードを含む問題
- **単純な表**（数行の対応表など）は、可能な限り**問題文テキストに書き下す**（`\n` と全角スペースで整形）。これが最優先。
- **図・回路・ネットワーク構成・レイアウトそのものが解答に必要**な問題は、PDF該当ページの図領域を切り出して画像添付する:
  - 切り出しは PyMuPDF（`pip install pymupdf`）または `pdftoppm`＋crop。環境に無ければインストールしてよい。
  - **幅 ≦ 720px、目安 150KB 以下**の PNG にダウンスケールし、`"image": "data:image/png;base64,...."`（data URL）として当該問題オブジェクトに入れる。
  - 既存の午前Iでは25問が同方式で画像を持つ実績がある（同じ data URL 形式）。アプリ側は `image` を検出して IndexedDB に退避し `hasImage:true` を立てる（追加実装不要）。

---

## §2 データファイル仕様

- 追加ファイル: **`data/sc_r<NN><a|h>_am2.json`**（例: `data/sc_r3a_am2.json`）。スキーマは既存 `data/sc_*_am1.json` と完全に同じ。
- 1ファイル = その期の午前II 25問。

各問オブジェクト:
```json
{
  "id": "sc-r3a-am2-q01",
  "section": "午前2",
  "year": "R3秋",
  "exam": "R3秋 午前II 問1",
  "category": "攻撃手法",
  "question": "問題文（改行は \\n）",
  "choices": ["ア の本文", "イ の本文", "ウ の本文", "エ の本文"],
  "answer": 1,
  "explanation": "解説（下記の基準で執筆）",
  "calc": true,
  "image": "data:image/png;base64,...."
}
```

規約:
- **`id`**: `sc-r<NN><a|h>-am2-q<NN>`。`<NN>`（年数）は**既存AM1に合わせてゼロ埋めしない**（`r3`,`r4`…）。ただし**問番号 `q<NN>` はゼロ埋め2桁**（`q01`〜`q25`）。
  - 例: R3秋 問1 → `sc-r3a-am2-q01`、R5春 問25 → `sc-r5h-am2-q25`。
  - **既存IDを変更・流用しないこと**（ユーザーのSRS進捗が問題IDに紐づくため）。
- **`section`**: 文字列 **`"午前2"` を必ず明示**する。理由: 取り込み時の正規化（`index.html` の `raw.section||'午前1'`）で、未指定だと午前I 扱いになってしまうため。
  - 注意: `section` の値は算用数字の **`午前2`**（既存AM1は `午前1`）。一方 `exam` 表示は**ローマ数字**の `午前II`（既存AM1は `午前I`）。**両者は表記が違う**ので混同しないこと。
- **`year`**: `"R3秋"` 等。
- **`exam`**: `"R3秋 午前II 問1"`（一覧やバッジに表示される）。
- **`answer`**: **0始まり**の整数（0=ア,1=イ,2=ウ,3=エ）。
- **`choices`**: 必ず4件。
- **`calc`**: 計算問題のみ **JSONに直接 `"calc": true`** を書く（午前IIは新規なので、コード側の `CALC_IDS` セットは**触らない**。`isCalcQ` は `raw.calc` を優先する仕様）。計算不要な問題は `calc` キー自体を省略してよい。
- **`image`**: §1の方針で必要な問題のみ。不要なら省略。
- **`explanation`**: **全25問に必ず執筆**する。品質基準は既存 `data/sc_r7a_am1.json`（特にPR #33で直したR7秋問2）を参照。構成:
  1. **正解の根拠**（なぜその選択肢が正しいか）。
  2. **誤答肢それぞれが、なぜ誤りか**（ア〜エ全てに触れる）。
  3. **重要用語の一言解説**（問題文・選択肢に出た専門用語）。
  4. **計算問題・論理式・進数変換などは、途中式を省略せず番号付きのステップで**示す。

### カテゴリ分類（`category`）
午前IIはセキュリティ問題が多い（R3秋は25問中17問前後）。**セキュリティを4つに細分化**し、非セキュリティ問題は既存カテゴリ名を流用する。

セキュリティ細分（この4つのいずれかを使う）:
| category | 対象の目安 |
|---|---|
| `暗号・認証` | 暗号方式・鍵管理・ハッシュ・電子署名・PKI・認証プロトコル・生体認証・多要素認証 |
| `攻撃手法` | マルウェア・各種攻撃（SQLi/XSS/CSRF/DoS/中間者/サイドチャネル等）・脆弱性・攻撃の兆候 |
| `セキュリティ対策・技術` | FW/IDS/IPS/WAF・VPN・TLS運用・ログ監査・マルウェア対策・アクセス制御の実装・セキュアなプロトコル運用 |
| `セキュア開発・法規` | セキュアコーディング・脆弱性管理プロセス・リスクマネジメント・各種規格/ガイドライン・関連法規・組織運用（CSIRT等） |

非セキュリティ問題は既存の名称をそのまま使う（アプリ内で午前Iと同じ区分として集計される）:
`ネットワーク` / `データベース` / `システム開発` / `コンピュータ構成` / `マネジメント` / `基礎理論`
（※午前IIの技術寄り問題はこの多くが `ネットワーク` か `データベース` に該当する。判断に迷う場合はセキュリティ4分類を優先。）

---

## §3 アプリ改修（**最初の1期の取り込み時のみ**・`index.html`）

午前I/IIを混在させず区別するための最小改修。**行番号は現行 main（CACHE v28 時点）の実測値**。ずれていたら周辺の同一コードを探して適用すること。

### 3-1. 「年度別に学習」を (年度 × 区分) で分割
`index.html` の renderHome 内、`// by year`（**632〜642行**付近）:
```js
// 現在
const years=[...new Set(questions.map(q=>q.year))].filter(Boolean);
if(years.length){
  const yp=el('div','panel'); yp.appendChild(el('h3',null,'年度別に学習','<small>全問を忘却曲線順で</small>'));
  const g=el('div','startgrid');
  years.forEach(y=>{
    const cnt=questions.filter(q=>q.year===y).length;
    const b=el('button','startbtn ghost', y+'<small>'+cnt+'問</small>');
    b.addEventListener('click',()=>startSession({year:y}, true, y));
    g.appendChild(b);
  });
  yp.appendChild(g); v.appendChild(yp);
}
```
これを **(year, section) の組**でボタン生成するよう変更する。表示ラベルは `section` の算用数字をローマ数字に直して「R3秋 午前I / R3秋 午前II」とする:
```js
// 変更後（例）
const secLabel = s => (s==='午前2' ? '午前II' : '午前I');
const pairs=[];
questions.forEach(q=>{ if(q.year){ const k=q.year+' '+(q.section||'午前1'); if(!pairs.includes(k)) pairs.push(k); } });
if(pairs.length){
  const yp=el('div','panel'); yp.appendChild(el('h3',null,'年度別に学習','<small>全問を忘却曲線順で</small>'));
  const g=el('div','startgrid');
  pairs.forEach(k=>{
    const [y,s]=k.split(' ');
    const label=y+' '+secLabel(s);
    const cnt=questions.filter(q=>q.year===y && (q.section||'午前1')===s).length;
    const b=el('button','startbtn ghost', label+'<small>'+cnt+'問</small>');
    b.addEventListener('click',()=>startSession({year:y, section:s}, true, label));
    g.appendChild(b);
  });
  yp.appendChild(g); v.appendChild(yp);
}
```
`matchFilter`（**462行**）は `f.section` に既に対応済みなので、フィルタ側の追加改修は不要。

### 3-2. 区分選択（午前I/II チップ）を「区分を選んで学習」パネルに追加
- カテゴリチェックボックス群と同じ `chip()` の仕組みで、**午前I / 午前II の2チップ**（両方ON=初期状態）を追加する。ちょうど計算問題チップ（`計算問題`/`計算以外`）と同じ作りにすると自然（`selBar`・`chip` を流用）。
- `selected()` が返すフィルタに **`sections` 配列**（選択中の `section` 値 `'午前1'/'午前2'`）を含める。両方ON（または両方OFF扱いの全選択）は「制限なし」= `sections:null` にする（計算チップの `calc=null` と同じ考え方）。
- `matchFilter`（**462行**の `if(f.section ...)` の直後）に配列版を追加:
```js
if(f.sections && f.sections.length && f.sections.indexOf(q.section||'午前1')<0) return false;
```
- 問題数カウント（`matchCount`）にも `sections` を渡す。

> 単一の `午前II` だけ学習したいニーズは 3-1 の年度ボタンでも満たせるが、「複数年の午前IIだけ・特定カテゴリだけ」を横断学習できるようこのチップも入れる。

### 3-3. 履歴・問題管理の年度集計を (年度×区分) で分離
- 履歴タブの「年度別の正答率」（`breakdownPanel('年度別の正答率', 'year', atts)` の呼び出し・**985行**付近）:
  `breakdownPanel` は1キーで集計する作りなので、**各問に複合ラベルを持たせる**か、`breakdownPanel` を「year+section 複合」で集計できるよう小改修する。最小変更なら、集計キー生成を `q.year` から `q.year+' '+secLabel(q.section)` に変えた専用呼び出しにする。
- 問題管理タブの登録数集計（`const byYear={}...`・**1045行**付近）も同様に `year + 区分` でグルーピングして表示する。

### 3-4. 触ってはいけないもの
消去法の回答UI・SRSスケジューラ・Firebase同期・AI解説（Gemini）には**一切変更を加えない**。午前IIの問題でもこれらはそのまま動作する（`section` はフィルタ用の追加軸にすぎない）。

---

## §4 登録作業（毎回）

1. `data/index.json` の `datasets` 配列に追記:
   ```json
   { "file": "sc_r3a_am2.json" }
   ```
2. `sw.js` の `ASSETS` 配列に同じパスを追記:
   ```js
   './data/sc_r3a_am2.json',
   ```
3. `sw.js` の `CACHE` を現在値から +1（例 `kakomon-v28` → `kakomon-v29`）。

---

## §5 検証（期ごとに必須）

### 5-1. JSON構文・スキーマ
```sh
python3 - <<'PY'
import json,re
f='data/sc_r3a_am2.json'  # 対象期に置換
d=json.load(open(f)); qs=d['questions']
assert len(qs)==25, len(qs)
ids=set()
for q in qs:
    assert re.fullmatch(r'sc-r\d+[ah]-am2-q\d{2}', q['id']), q['id']
    assert q['id'] not in ids; ids.add(q['id'])
    assert q['section']=='午前2', q['id']
    assert isinstance(q['answer'],int) and 0<=q['answer']<=3, q['id']
    assert len(q['choices'])==4, q['id']
    assert q['explanation'].strip(), q['id']
print('OK', f, len(qs), 'questions')
PY
```
- 既存の全 `data/*.json` を跨いで **ID重複が無い**ことも確認（午前IのIDと衝突しないこと）。

### 5-2. 解答の正しさ
- §1の目視読み取り25問と、抽出/転記した `answer` を突き合わせる。
- 追加で**3〜5問を自力で解いて**照合。1問でも食い違えば全解答を読み直す。

### 5-3. ブラウザ検証（Playwright, iPhone 13 エミュ）
`python3 -m http.server 8080` で配信し、`/opt/pw-browsers/chromium` の Chromium で:
- ホーム「年度別に学習」に **「R3秋 午前I（30問）」と「R3秋 午前II（25問）」が別ボタン**で出る。
- 「R3秋 午前II」から学習開始 → 出題が午前IIのみ、**画像付き問題の図が表示**される、回答後に**AI解説ボタン**が出る。
- 「区分を選んで学習」で **午前IIチップのみON** にしたときの問題数 = 25 ×（取り込み済み午前IIの期数）。
- 既存の午前Iフロー（消去法・👍・難易度・次へ）が**回帰していない**。
- 履歴/問題管理の年度集計が午前I/IIで分離表示される。
- コンソールエラー無し。埋め込みJSを取り出して `node --check`。
- 昼/夜テーマでスクリーンショット目視。

---

## §6 コミット / PR / マージ・実機反映

- `git fetch origin main && git checkout -B claude/github-tenbin-repo-jd1trd origin/main` で最新化してから作業。
- コミット後 `git push --force-with-lease -u origin claude/github-tenbin-repo-jd1trd`。
- PR作成 → **squashマージ**（既存運用）。PRは1期＝1本。初回はUI改修（§3）を含む旨を本文に明記。
- マージ後、ユーザーに実機反映手順を案内: **アプリを完全終了 → 起動 → もう一度起動**（Service Worker のキャッシュ更新のため。CACHEバンプ必須の理由）。

---

## 付録: R3秋（2021秋）実調査メモ
- 問題冊子 `2021r03a_sc_am2_qs.pdf`: 18ページ、問1〜25。
- 解答例 `2021r03a_sc_am2_ans.pdf`: 1ページ、番号1〜25の3列表。**テキスト抽出では解答文字が出ないため画像目視が必須**（§1）。
- この期を最初のPRにする場合、§3のUI改修を同梱すること。
