import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { movieTools } from "@/lib/agent-tools";
import {
  searchMovies,
  discoverMovies,
  getSimilarMovies,
  getWatchProviders,
  getMovieDetails,
} from "@/lib/tmdb";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

const client = new Anthropic();

async function executeTool(toolName: string, toolInput: Record<string, unknown>, preferred: string[] = []) {
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const normalizedPreferred = preferred.map(normalize);

  async function withStreaming(movieId: number) {
    const { providers } = await getWatchProviders(movieId).catch(() => ({ providers: [], link: "" }));
    const matched = preferred.length > 0
      ? providers.filter((p) => normalizedPreferred.some(
          (s) => normalize(p.provider_name).includes(s) || s.includes(normalize(p.provider_name))
        ))
      : providers;
    return {
      available_on_preferred: matched.length > 0,
      streaming_services: matched.map((p) => p.provider_name),
    };
  }

  switch (toolName) {
    case "search_movies_by_title": {
      const titles = (toolInput.titles as string[]) ?? [];
      const results = await Promise.all(titles.map((t) => searchMovies(t).catch(() => [])));
      return results.map((movies, i) => ({
        query: titles[i],
        found: movies.length,
        movies: movies.slice(0, 5).map((m) => ({
          id: m.id,
          title: m.title,
          year: m.release_date?.slice(0, 4),
        })),
      }));
    }
    case "discover_movies": {
      const movies = await discoverMovies({
        with_genres: (toolInput.genre_ids as number[])?.join(","),
        "with_runtime.lte": toolInput.max_runtime_minutes as number | undefined,
        "vote_average.gte": (toolInput.min_rating as number) ?? 5.0,
        pages: 1,
      });
      const top5 = movies.slice(0, 5);
      // getMovieDetailsは不要（discoverが既にoverview/runtime/ratingを含む）
      // ストリーミング確認を同時に実行してClaudeのラウンドトリップを削減
      const moviesWithStreaming = await Promise.all(
        top5.map(async (m) => {
          const streaming = await withStreaming(m.id);
          return {
            id: m.id,
            title: m.title,
            overview: (m.overview ?? "").slice(0, 80),
            runtime: m.runtime,
            rating: m.vote_average,
            release_year: m.release_date?.slice(0, 4),
            ...streaming,
          };
        })
      );
      return {
        total_found: movies.length,
        movies: moviesWithStreaming,
        note: movies.length === 0
          ? "条件に一致する映画が見つかりませんでした。条件を緩めて再検索してください。"
          : preferred.length > 0
            ? `streaming_services情報が含まれています。available_on_preferred: falseの映画は推薦しないでください。check_streaming_availabilityの呼び出しは不要です。`
            : `streaming_services情報が含まれています。check_streaming_availabilityの呼び出しは不要です。`,
      };
    }
    case "get_similar_movies": {
      const movies = await getSimilarMovies(toolInput.movie_id as number);
      return movies.slice(0, 6).map((m) => ({
        id: m.id,
        title: m.title,
        rating: m.vote_average,
      }));
    }
    case "check_streaming_availability": {
      const movieIds = (toolInput.movie_ids as number[]) ?? [];
      const preferred = (toolInput.preferred_services as string[]) ?? [];
      // 大文字小文字・スペースを正規化してマッチング精度を上げる
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
      const normalizedPreferred = preferred.map(normalize);
      const results = await Promise.all(
        movieIds.map(async (id) => {
          const { providers } = await getWatchProviders(id).catch(() => ({ providers: [], link: "" }));
          const matched = preferred.length > 0
            ? providers.filter((p) =>
                normalizedPreferred.some(
                  (s) => normalize(p.provider_name).includes(s) || s.includes(normalize(p.provider_name))
                )
              )
            : providers;
          return {
            movie_id: id,
            available_on_preferred: matched.length > 0,
            providers: matched.map((p) => p.provider_name),
            all_providers: providers.map((p) => p.provider_name),
          };
        })
      );
      // サービス指定がある場合、利用不可の映画を明示してAIが除外できるようにする
      return {
        results,
        note: preferred.length > 0
          ? `preferred_servicesが指定されています。available_on_preferred: false の映画は推薦しないでください。`
          : "サービス未指定のため全映画が対象です。",
      };
    }
    default:
      return { error: "Unknown tool" };
  }
}

const SYSTEM_PROMPT = `あなたはYO-IN AIです。映画好きの友人のように、ユーザーにぴったりの映画を一緒に探す映画推薦AIです。堅苦しくなく、フレンドリーにテンポよく会話を進めてください。

## ⚠️ 絶対ルール（必ず守ること）
1. **optionsは絶対に空配列にしない。recommendationsが[]のときは必ず次の質問の選択肢をoptionsに入れること。**
2. 出力は必ず生のJSON（コードブロックなし）。
3. messageはプレーンテキストのみ。マークダウン記法（**、---、#）は使わない。
4. messageは2文以内。相槌は1文以内でテンポよく。
5. **過去に提案済み・保存済みの映画は絶対に再提案しない。**
6. **シリーズ作品は必ず第1作目から提案する。**（ユーザーが続編を明示した場合のみ例外）
7. **日本語タイトルが存在しない映画は推薦しない。** 日本語タイトルが確認できる映画のみ推薦すること。

---

## ヒアリングの流れ

ユーザーは最初に「じっくり選びたい」か「サクッと決めたい」を選んでいる。

### 🎯 じっくりモード（「じっくり探したい」選択時）
Q2 → (Q2b) → Q3 → Q4 → Q5 → Q6 → 推薦

### ⚡ サクッとモード（「サクッと探したい」選択時）
Q2 → (Q2b) → Q3simple → Q6 → 推薦（Q4・Q5はスキップ）

---

## 各質問の定義（選択肢は必ずそのまま使うこと）

### Q2 — 視聴スタイル（両モード必須）
message例: "一人でゆっくり観る？それとも誰かと一緒に？"
⚠️ optionsに必ずこの2つを使うこと:
options: ["👤 一人でゆっくり観る", "👫 誰かと一緒に観る"]

→ 「誰かと一緒に観る」選択時のみQ2bへ進む（一人の場合はQ3またはQ3simpleへ）

### Q2b — 同伴者（「誰かと」選択時のみ）
message例: "誰と観る予定ですか？"
⚠️ optionsに必ずこの3つを使うこと:
options: ["💕 恋人・パートナーと", "👨‍👩‍👧 家族と", "👥 友人と"]
→ この回答を映画選びに反映する（ロマンス系・家族向け・わいわい系など）

### Q3 — 気分（じっくりモードのみ）
message例: "見終わった後にどんな気分になりたい？"
⚠️ optionsに必ずこの7つを全て使うこと:
options: ["😂 笑いたい・元気になりたい", "😢 泣きたい・感動したい", "😱 ドキドキ・ハラハラしたい", "🤔 じっくり考えさせられたい", "😌 癒されたい・ほっとしたい", "👻 怖い思いをしたい", "🌌 壮大な世界観に浸りたい"]

### Q3simple — 気分・簡易版（サクッとモードのみ）
message例: "どんな気分の映画が見たい？"
⚠️ optionsに必ずこの4つを使うこと:
options: ["😂 笑える・楽しい系", "😢 感動・泣ける系", "😱 スリル・ドキドキ系", "😌 癒し・ほっこり系"]

### Q4 — 気分の深掘り（じっくりモードのみ、Q3の回答に応じて変える）
⚠️ Q3の回答に対応する選択肢を必ず全て含めること。空にしない。

Q3「笑いたい」→ message: "どんな感じで笑いたい？" options: ["😂 思いっきり声に出して笑いたい", "😊 クスッと笑いながらほっこりしたい", "💕 笑いながら温かい気持ちになりたい", "🎭 笑いながらちょっと泣けるのも好き"]
Q3「泣きたい」→ message: "どんなシチュエーションに弱い？" options: ["💕 恋愛・別れ", "👨‍👩‍👧 家族・絆", "🤝 友情・青春", "🐾 動物・自然"]
Q3「ドキドキ」→ message: "どんなジャンルが好き？" options: ["🔫 アクション・バトル系", "🔍 謎解き・サスペンス系", "🌍 冒険・スパイ系"]
Q3「考えさせられたい」→ message: "どんなテーマが気になる？" options: ["🧠 SF・近未来", "🏛 歴史・実話ベース", "🎭 人間ドラマ", "🌐 社会問題・メッセージ性"]
Q3「癒されたい」→ message: "どんな雰囲気が好き？" options: ["☕ のんびりほっこり系", "🌿 旅・ロードムービー系", "🎨 おしゃれ・アート系"]
Q3「怖い」→ message: "どんなホラーが好み？" options: ["👻 ジャパニーズホラー", "🧟 モンスター・ゾンビ系", "🔪 サイコ・スリラー系", "🌀 じわじわくる系"]
Q3「壮大な世界観」→ message: "どんな設定が好き？" options: ["🚀 宇宙・SF", "🐉 ファンタジー・魔法", "🌊 大自然・冒険"]

### Q5 — 映画タイプ（じっくりモードのみ）
Q5では必ず以下の完全なJSONを出力すること（messageの文言は少し変えてよい）:
{"message":"洋画・邦画・アニメ、どれが気分？","options":["🌎 洋画","🗾 邦画","🎌 アニメ","🤷 気にしない"],"recommendations":[]}

### Q6 — 映画の尺（両モード必須）
Q6では必ず以下の完全なJSONを出力すること（messageの文言は少し変えてよい）:
{"message":"時間はどのくらいある？","options":["⏱ 90分以内","🎞 90〜120分","🍿 120分以上でもOK","✨ 気にしない"],"recommendations":[]}

→ Q6の回答直後に映画を検索して3本推薦する。

---

## 映画推薦のステップ（厳守）
1. 「探してみます！」とだけ書いてツールを使う（前置き禁止）
2. discover_movies または search_movies_by_title で候補を集める
3. **discover_moviesの結果にはstreaming_servicesとavailable_on_preferredが含まれている。check_streaming_availabilityを呼ぶ必要はない。**
4. 契約サービス指定ありの場合、available_on_preferred: trueの映画のみ推薦（例外なし）
5. 3本未満なら条件を緩めて再検索（評価を下げる→ジャンルを広げる→時間制限を緩める）
6. 過去に提案済み・保存済みのタイトルを除外してから推薦
7. 日本語タイトルが確認できない映画は候補から除外する

## 各推薦映画に含める情報
① overview（1〜2文） — どんな映画かをひと言で。ネタバレなし。
② reason（1〜2文） — ユーザーの選択を「」で引用して、なぜこの映画かを端的に。例:「『泣きたい』という気分にぴったりで、家族の絆を描いた感動作です。」
③ match_score（0〜100）＋ match_reason（10文字以内）例:「泣きたい気分との一致度」

## 推薦後の選択肢（必ず含める）
⚠️ optionsに必ずこの5つを使うこと:
options: ["👍 ピッタリ！これにする", "🔍 似た映画をもっと見せて", "🎭 別の気分で探し直したい", "😕 全然違う映画にしたい", "⏱ もっと短い作品で"]

## レスポンス形式（必ずJSON・コードブロックなし）
【ヒアリング中】
{"message":"質問文","options":["A","B","C"],"recommendations":[]}

【推薦時】
{"message":"一言コメント","options":["👍 ピッタリ！これにする","🔍 似た映画をもっと見せて","🎭 別の気分で探し直したい","😕 全然違う映画にしたい","⏱ もっと短い作品で"],"recommendations":[{"movie_id":12345,"title":"タイトル","overview":"1〜2文","reason":"1〜2文","streaming_services":["Netflix"],"runtime_minutes":120,"match_score":85,"match_reason":"泣きたい気分との一致度"}]}

## 臨機応変な対応
- 「別の気分で探し直したい」「別ジャンルにしたい」→ Q3（またはQ3simple）の全選択肢を出してやり直す。過去に選んだ選択肢も必ず含める。
- 「全然違う映画にしたい」→ 同じ条件でまったく異なる映画を検索して提案
- 「もう1本見たい」「似た映画を教えて」→ 即座に新しい映画を検索して提案
- ユーザーが自由にテキストを入力してきた場合も、会話の文脈を読んで柔軟に対応

## ハルシネーション防止
- 検索結果が少ない場合は条件を緩めて再検索する
- 「存在しない」と断言しない
- 何度試しても見つからない場合のみ「見つかりませんでした」と伝え代替案を提示`;

async function buildUserHistoryContext(supabase: Awaited<ReturnType<typeof createServerClient>>): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "";

  // 保存した映画・過去の推薦映画・ユーザーメッセージを並列取得
  const [savedResult, convResult] = await Promise.all([
    supabase
      .from("saved_movies")
      .select("title")
      .eq("user_id", user.id)
      .order("saved_at", { ascending: false })
      .limit(20),
    supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const savedTitles = (savedResult.data ?? []).map((m) => m.title);
  const convIds = (convResult.data ?? []).map((c) => c.id);

  let pastRecommendedTitles: string[] = [];
  let userMoodKeywords: string[] = [];

  if (convIds.length > 0) {
    const [msgRecs, msgUser] = await Promise.all([
      supabase
        .from("messages")
        .select("recommendations")
        .in("conversation_id", convIds)
        .eq("role", "assistant")
        .not("recommendations", "is", null),
      supabase
        .from("messages")
        .select("content")
        .in("conversation_id", convIds)
        .eq("role", "user")
        .limit(60),
    ]);

    // 過去に推薦されたタイトルを収集
    for (const msg of msgRecs.data ?? []) {
      const recs = msg.recommendations as Array<{ title?: string }> | null;
      if (recs) pastRecommendedTitles.push(...recs.map((r) => r.title).filter(Boolean) as string[]);
    }
    pastRecommendedTitles = [...new Set(pastRecommendedTitles)];

    // ユーザーメッセージから気分・ジャンルキーワードを抽出
    const allUserText = (msgUser.data ?? []).map((m) => m.content).join(" ");
    const moodKeywords = ["笑いたい", "元気になりたい", "ドキドキ", "ハラハラ", "感動", "泣きたい", "ホラー", "スリラー", "癒し", "ゆったり", "考えさせられる", "アクション", "コメディ", "恋愛", "ラブ", "SF", "ミステリー", "サスペンス", "青春", "家族", "友情"];
    userMoodKeywords = moodKeywords.filter((k) => allUserText.includes(k));
  }

  if (savedTitles.length === 0 && pastRecommendedTitles.length === 0) return "";

  const lines: string[] = ["\n## このユーザーの過去の履歴（必ず参照すること）"];

  lines.push(`\n⚠️ 以下の履歴情報は推薦精度の向上にのみ使用すること。ユーザーに対して「保存済み映画を参考にしました」「過去の履歴をもとに」などと言及しないこと。あくまで内部的な判断材料として使用する。`);

  if (savedTitles.length > 0) {
    lines.push(`\n### 保存済み映画（ユーザーが気に入った作品）\n${savedTitles.slice(0, 10).join("、")}\n→ これらと傾向が似た作品を優先的に推薦してください。`);
  }

  if (pastRecommendedTitles.length > 0) {
    lines.push(`\n### 過去に提案済みの映画（重複禁止）\n${pastRecommendedTitles.slice(0, 30).join("、")}\n→ これらはすでに提案済みです。必ず別の作品を推薦してください。`);
  }

  if (userMoodKeywords.length > 0) {
    lines.push(`\n### 過去の嗜好傾向\n「${userMoodKeywords.join("」「")}」系のコンテンツへの関心が見られます。今回の提案にも参考にしてください。`);
  }

  return lines.join("\n");
}

export const maxDuration = 60;

// AIが選択肢を出力し忘れた場合に会話履歴とメッセージ内容から補完するフォールバック
function ensureOptions(
  parsed: Record<string, unknown>,
  messages?: Anthropic.MessageParam[]
): Record<string, unknown> {
  const options = (parsed.options as string[] | undefined) ?? [];
  const recs = (parsed.recommendations as unknown[] | undefined) ?? [];
  if (options.length > 0 || recs.length > 0) return parsed;

  const msg = ((parsed.message as string) ?? "");

  // ── メッセージテキストベースのマッチング ──────────────────────
  // Q5: 映画タイプ
  if (msg.includes("洋画") || msg.includes("邦画") || msg.includes("アニメ")) {
    return { ...parsed, options: ["🌎 洋画", "🗾 邦画", "🎌 アニメ", "🤷 気にしない"] };
  }
  // Q6: 尺（時間関連ワードで広めにキャッチ）
  if (msg.includes("時間") || msg.includes("何分") || msg.includes("90分") || msg.includes("120分")) {
    return { ...parsed, options: ["⏱ 90分以内", "🎞 90〜120分", "🍿 120分以上でもOK", "✨ 気にしない"] };
  }
  // Q2b: 同伴者
  if (msg.includes("誰と") || msg.includes("誰と観")) {
    return { ...parsed, options: ["💕 恋人・パートナーと", "👨‍👩‍👧 家族と", "👥 友人と"] };
  }
  // Q2: 視聴スタイル
  if (msg.includes("一人") || (msg.includes("誰か") && msg.includes("一緒"))) {
    return { ...parsed, options: ["👤 一人でゆっくり観る", "👫 誰かと一緒に観る"] };
  }
  // Q3: 気分（じっくり）
  if (msg.includes("見終わった") || (msg.includes("気分") && msg.includes("なりたい"))) {
    return { ...parsed, options: ["😂 笑いたい・元気になりたい", "😢 泣きたい・感動したい", "😱 ドキドキ・ハラハラしたい", "🤔 じっくり考えさせられたい", "😌 癒されたい・ほっとしたい", "👻 怖い思いをしたい", "🌌 壮大な世界観に浸りたい"] };
  }
  // Q3simple: 気分（サクッと）
  if (msg.includes("気分") && (msg.includes("映画") || msg.includes("見たい") || msg.includes("どんな"))) {
    return { ...parsed, options: ["😂 笑える・楽しい系", "😢 感動・泣ける系", "😱 スリル・ドキドキ系", "😌 癒し・ほっこり系"] };
  }
  // Q4: 笑い系
  if (msg.includes("笑い") || msg.includes("笑いたい")) {
    return { ...parsed, options: ["😂 思いっきり声に出して笑いたい", "😊 クスッと笑いながらほっこりしたい", "💕 笑いながら温かい気持ちになりたい", "🎭 笑いながらちょっと泣けるのも好き"] };
  }
  // Q4: 泣き系
  if (msg.includes("シチュエーション") || msg.includes("弱い") || msg.includes("どんなシーン")) {
    return { ...parsed, options: ["💕 恋愛・別れ", "👨‍👩‍👧 家族・絆", "🤝 友情・青春", "🐾 動物・自然"] };
  }
  // Q4: ドキドキ系（"好み"も含める）
  if (msg.includes("ジャンル") && (msg.includes("好き") || msg.includes("好み") || msg.includes("？"))) {
    return { ...parsed, options: ["🔫 アクション・バトル系", "🔍 謎解き・サスペンス系", "🌍 冒険・スパイ系"] };
  }
  // Q4: 考え系
  if (msg.includes("テーマ") || msg.includes("気になる")) {
    return { ...parsed, options: ["🧠 SF・近未来", "🏛 歴史・実話ベース", "🎭 人間ドラマ", "🌐 社会問題・メッセージ性"] };
  }
  // Q4: 癒し系
  if (msg.includes("雰囲気") || (msg.includes("好き") && msg.includes("どんな"))) {
    return { ...parsed, options: ["☕ のんびりほっこり系", "🌿 旅・ロードムービー系", "🎨 おしゃれ・アート系"] };
  }
  // Q4: ホラー系（"好み"は癒し系より後でチェック）
  if (msg.includes("ホラー") || (msg.includes("好み") && msg.includes("どんな"))) {
    return { ...parsed, options: ["👻 ジャパニーズホラー", "🧟 モンスター・ゾンビ系", "🔪 サイコ・スリラー系", "🌀 じわじわくる系"] };
  }
  // Q4: 壮大系
  if (msg.includes("設定") || msg.includes("世界観")) {
    return { ...parsed, options: ["🚀 宇宙・SF", "🐉 ファンタジー・魔法", "🌊 大自然・冒険"] };
  }

  // ── 会話履歴ベースのフォールバック ──────────────────────────
  // テキストマッチが全て外れた場合、ユーザーの選択履歴から現在のステージを判定する
  if (messages && messages.length > 0) {
    const getTextContent = (m: Anthropic.MessageParam): string => {
      if (typeof m.content === "string") return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
          .map((b) => b.text)
          .join(" ");
      }
      return "";
    };

    const userText = messages
      .filter((m) => m.role === "user")
      .map(getTextContent)
      .join(" ");

    const isJikkuri = userText.includes("じっくり");
    const selectedWithSomeone = userText.includes("誰かと一緒");

    // Q4以降の選択肢キーワード（Q4の回答が含まれるか判定）
    const Q4_KEYWORDS = ["声に出して", "クスッと", "泣けるのも", "恋愛・別れ", "家族・絆", "友情・青春", "動物・自然",
      "アクション・バトル", "謎解き・サスペンス", "冒険・スパイ", "SF・近未来", "歴史・実話", "人間ドラマ", "社会問題",
      "のんびりほっこり", "ロードムービー", "アート系", "ジャパニーズホラー", "モンスター・ゾンビ", "サイコ・スリラー",
      "じわじわくる", "宇宙・SF", "ファンタジー・魔法", "大自然・冒険"];
    const hasQ4Answer = Q4_KEYWORDS.some((k) => userText.includes(k));

    // Q5の回答が含まれるか
    const hasQ5Answer = ["🌎 洋画", "🗾 邦画", "🎌 アニメ", "🤷 気にしない"].some((k) => userText.includes(k));

    // Q3の回答が含まれるか（じっくり/サクッと共通）
    const Q3_KEYWORDS = ["笑いたい", "泣きたい", "ドキドキ", "考えさせられ", "癒されたい", "怖い思い", "壮大な世界観",
      "笑える", "感動", "スリル・ドキドキ", "癒し・ほっこり"];
    const hasQ3Answer = Q3_KEYWORDS.some((k) => userText.includes(k));

    // Q5済み → Q6
    if (hasQ5Answer) {
      return { ...parsed, options: ["⏱ 90分以内", "🎞 90〜120分", "🍿 120分以上でもOK", "✨ 気にしない"] };
    }
    // じっくりモードでQ4済み → Q5
    if (isJikkuri && hasQ4Answer) {
      return { ...parsed, options: ["🌎 洋画", "🗾 邦画", "🎌 アニメ", "🤷 気にしない"] };
    }
    // サクッとモードでQ3済み → Q6
    if (!isJikkuri && hasQ3Answer) {
      return { ...parsed, options: ["⏱ 90分以内", "🎞 90〜120分", "🍿 120分以上でもOK", "✨ 気にしない"] };
    }
    // じっくりモードでQ3済み → Q4（気分から適切なQ4選択肢を選ぶ）
    if (isJikkuri && hasQ3Answer) {
      if (userText.includes("笑いたい") || userText.includes("笑える")) {
        return { ...parsed, options: ["😂 思いっきり声に出して笑いたい", "😊 クスッと笑いながらほっこりしたい", "💕 笑いながら温かい気持ちになりたい", "🎭 笑いながらちょっと泣けるのも好き"] };
      }
      if (userText.includes("泣きたい") || userText.includes("感動")) {
        return { ...parsed, options: ["💕 恋愛・別れ", "👨‍👩‍👧 家族・絆", "🤝 友情・青春", "🐾 動物・自然"] };
      }
      if (userText.includes("ドキドキ") || userText.includes("スリル")) {
        return { ...parsed, options: ["🔫 アクション・バトル系", "🔍 謎解き・サスペンス系", "🌍 冒険・スパイ系"] };
      }
      if (userText.includes("考えさせられ")) {
        return { ...parsed, options: ["🧠 SF・近未来", "🏛 歴史・実話ベース", "🎭 人間ドラマ", "🌐 社会問題・メッセージ性"] };
      }
      if (userText.includes("癒されたい")) {
        return { ...parsed, options: ["☕ のんびりほっこり系", "🌿 旅・ロードムービー系", "🎨 おしゃれ・アート系"] };
      }
      if (userText.includes("怖い思い") || userText.includes("ホラー")) {
        return { ...parsed, options: ["👻 ジャパニーズホラー", "🧟 モンスター・ゾンビ系", "🔪 サイコ・スリラー系", "🌀 じわじわくる系"] };
      }
      if (userText.includes("壮大な世界観")) {
        return { ...parsed, options: ["🚀 宇宙・SF", "🐉 ファンタジー・魔法", "🌊 大自然・冒険"] };
      }
    }
    // Q2b（誰かと一緒を選んだ）→ Q3
    if (selectedWithSomeone && !hasQ3Answer) {
      if (isJikkuri) {
        return { ...parsed, options: ["😂 笑いたい・元気になりたい", "😢 泣きたい・感動したい", "😱 ドキドキ・ハラハラしたい", "🤔 じっくり考えさせられたい", "😌 癒されたい・ほっとしたい", "👻 怖い思いをしたい", "🌌 壮大な世界観に浸りたい"] };
      }
      return { ...parsed, options: ["😂 笑える・楽しい系", "😢 感動・泣ける系", "😱 スリル・ドキドキ系", "😌 癒し・ほっこり系"] };
    }
  }

  return parsed;
}

function extractJSON(src: string): unknown | null {
  const trimmed = src.trim();
  try { return JSON.parse(trimmed); } catch { /* continue */ }
  const start = trimmed.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(trimmed.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: { messages?: unknown; preferences?: { streamingServices?: string[] } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = body.messages;
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > 40 ||
    messages.some(
      (m) =>
        typeof m !== "object" ||
        m === null ||
        (typeof m.content === "string" && m.content.length > 4000)
    )
  ) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  const streamingServices: string[] = body.preferences?.streamingServices ?? [];
  const encoder = new TextEncoder();

  const supabase = await createServerClient();
  const allowed = await checkRateLimit(supabase, `chat:${getClientIp(req)}`, 20, 60);
  if (!allowed) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        message: "リクエストが多すぎます。少し時間をおいてからもう一度お試しください。",
        recommendations: [],
        options: ["🔄 もう一度試す"],
      })}\n\n`,
      {
        status: 429,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // 履歴コンテキストは初回メッセージ（1往復目）のみ取得。それ以降はすでにコンテキストに含まれているためスキップ
        const isFirstTurn = messages.length <= 2;
        const historyContext = isFirstTurn
          ? await buildUserHistoryContext(supabase).catch(() => "")
          : "";

        const userContext = `ユーザーの現在の設定:
- 契約中のサービス: ${streamingServices.join(", ") || "指定なし"}
※ 視聴可能時間は会話の中でユーザーに確認してください（上映時間の希望は自動設定しないこと）
${historyContext}`;

        const apiMessages: Anthropic.MessageParam[] = [
          { role: "user", content: userContext },
          ...messages,
        ];

        let currentMessages = apiMessages;

        async function createWithRetry(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              return await client.messages.create(params);
            } catch (err: unknown) {
              const status = (err as { status?: number }).status;
              if ((status === 529 || status === 429) && attempt < 2) {
                await new Promise((r) => setTimeout(r, (attempt + 1) * 3000));
                continue;
              }
              throw err;
            }
          }
          throw new Error("Max retries exceeded");
        }

        for (let i = 0; i < 10; i++) {
          const response = await createWithRetry({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 2048,
            temperature: 0,
            system: SYSTEM_PROMPT,
            tools: movieTools,
            messages: currentMessages,
            stream: false,
          });

          if (response.stop_reason === "end_turn") {
            const textBlock = response.content.find((b) => b.type === "text");
            const text = textBlock?.type === "text" ? textBlock.text : "";
            const parsed = extractJSON(text);
            const base = parsed
              ? (parsed as Record<string, unknown>)
              : { message: text, recommendations: [], options: [] };
            const safePayload = ensureOptions(base, messages as Anthropic.MessageParam[]);
            send("done", safePayload);
            break;
          }

          if (response.stop_reason === "tool_use") {
            send("searching", { message: "映画を検索しています..." });

            const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
            const toolResults = await Promise.all(
              toolUseBlocks.map(async (block) => {
                if (block.type !== "tool_use") return null;
                const result = await executeTool(
                  block.name,
                  block.input as Record<string, unknown>,
                  streamingServices
                );
                return {
                  type: "tool_result" as const,
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                };
              })
            );

            currentMessages = [
              ...currentMessages,
              { role: "assistant", content: response.content },
              {
                role: "user",
                content: toolResults.filter((r): r is NonNullable<typeof r> => r !== null),
              },
            ];
          }
        }
      } catch (err: unknown) {
        const status = (err as { status?: number }).status;
        const message = status === 529 || status === 429
          ? "APIが混み合っています。少し待ってからもう一度お試しください。"
          : "エラーが発生しました。もう一度お試しください。";
        send("error", { message, recommendations: [], options: ["🔄 もう一度試す"] });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
