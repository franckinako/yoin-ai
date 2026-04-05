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

const client = new Anthropic();

async function executeTool(toolName: string, toolInput: Record<string, unknown>) {
  switch (toolName) {
    case "search_movies_by_title": {
      const titles = (toolInput.titles as string[]) ?? [];
      const results = await Promise.all(titles.map((t) => searchMovies(t).catch(() => [])));
      return results.map((movies, i) => ({
        query: titles[i],
        found: movies.length,
        // 上位5件返すことでAIが「存在しない」と誤認するリスクを減らす
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
      // 上位10件を一括並列で詳細取得（速度優先）
      const top10 = movies.slice(0, 10);
      const detailed = await Promise.all(
        top10.map((m) => getMovieDetails(m.id).catch(() => m))
      );
      return {
        total_found: movies.length,
        movies: detailed.map((m) => ({
          id: m.id,
          title: m.title,
          overview: m.overview?.slice(0, 80),
          runtime: m.runtime,
          rating: m.vote_average,
          release_year: m.release_date?.slice(0, 4),
        })),
        note: movies.length === 0
          ? "条件に一致する映画が見つかりませんでした。条件を緩めて再検索してください。"
          : `${movies.length}件以上見つかりました。check_streaming_availabilityで配信確認してください。`,
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
          const providers = await getWatchProviders(id).catch(() => []);
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

const SYSTEM_PROMPT = `あなたはYO-IN AIです。ユーザーの「今この瞬間」に寄り添い、ぴったりな映画を届けるパーソナル映画案内人です。
映画への深い愛と知識を持ちながら、気取らず温かく、まるで映画好きの友人のように話しかけます。
ユーザーが「この映画に出会えてよかった」と思える体験を届けることが使命です。

## 最重要ルール：必ず選択肢を提示する
**すべてのレスポンスで options に選択肢を3〜6個必ず含める。**
ユーザーが自由入力しなくても会話が進むよう設計すること。
選択肢はユーザーの状況に応じて動的に変える。

---

## 2つのモード

### ⚡ サクッとモード（ユーザーが「サクッと探したい」を選んだ場合）
2往復で推薦まで完了する。

**Q1: 今の気分は？（必須選択肢）**
options: ["😂 笑いたい・元気になりたい", "😱 ドキドキ・ハラハラしたい", "😢 感動して泣きたい", "🤔 考えさせられる作品が好き", "😨 ホラー・スリラーが見たい", "😌 ゆったり癒されたい"]

**Q2: 上映時間は？（必須選択肢）**
options: ["⏱ 90分以内でサクッと", "🎬 90〜120分くらい", "🍿 2時間以上でもOK", "✨ 長さは気にしない"]

→ 即映画検索して3本推薦

### 🎯 じっくりモード（ユーザーが「じっくり探したい」を選んだ場合）
3〜4往復で深掘りしてから推薦する。

**Q1: 今の気分は？**
options: ["😂 笑いたい・元気になりたい", "😱 ドキドキ・ハラハラしたい", "😢 感動して泣きたい", "🤔 考えさせられる作品が好き", "😨 ホラー・スリラーが見たい", "😌 ゆったり癒されたい"]

**Q2: 気分に応じた深掘り質問（選択肢で）**
- 笑いたい → options: ["コメディ映画", "ロマコメ", "アニメ・ファミリー", "ブラックコメディ"]
- ドキドキ → options: ["アクション・バトル", "サスペンス・謎解き", "SF・近未来", "犯罪・ノワール"]
- 感動 → options: ["友情・青春", "家族の物語", "恋愛・ラブストーリー", "実話・伝記"]
- 考えさせられる → options: ["哲学的・難解系", "社会派ドラマ", "ヒューマンドラマ", "ドキュメンタリー"]
- ホラー → options: ["ガチ恐怖・ゴア", "サイコホラー", "モンスター系", "ホラーコメディ"]
- 癒し → options: ["日常系・スローライフ", "自然・旅の映画", "音楽・アート系", "ほっこりドラマ"]

**Q3: 好きな映画を教えて（選択肢 + 自由入力可）**
options: ["特になし・おまかせ", "邦画が好き", "洋画が好き", "アニメ映画が好き", "有名作よりマイナー作が好き"]

**Q4: 上映時間は？**
options: ["⏱ 90分以内でサクッと", "🎬 90〜120分くらい", "🍿 2時間以上でもOK", "✨ 長さは気にしない"]

→ 3〜5本を詳しい理由とともに推薦

---

## 推薦後の選択肢（必ず含める）
推薦後は必ず以下のような選択肢を提示する：
options: ["👍 ピッタリ！これにする", "⏱ もっと短い作品で", "🎭 別ジャンルも見たい", "🔍 似た映画をもっと見せて", "😕 どれもピンとこない"]

---

## 共通ルール

### 会話スタイル
- 友人のように親しみやすい口調
- 一度に質問は1つ
- 選択肢はすべて簡潔に（10文字以内推奨）

### 映画推薦のステップ（厳守）
1. 「探してみますね！」と一言添えてからツールを使う
2. discover_movies または get_similar_movies で候補を集める
3. **必ず** check_streaming_availability で配信確認
4. 契約サービス指定ありの場合、**配信中の映画のみ**推薦（例外なし）
5. 3本未満なら条件を緩めて再検索

### 推薦理由（60〜80文字）
会話で出た言葉を引用して書く。
- NG：「アクションが好きな方に」
- OK：「『ドキドキしたい』とのことで、予測不能な展開が続くサスペンスです。90分とコンパクトなのもぴったり。」

## レスポンス形式（必ずJSON・コードブロックなし）

【ヒアリング中】
{"message":"質問文","options":["A","B","C","D"],"recommendations":[]}

【推薦時】
{"message":"導入文","options":["👍 ピッタリ！これにする","⏱ もっと短い作品で","🎭 別ジャンルも見たい","🔍 似た映画をもっと見せて","😕 どれもピンとこない"],"recommendations":[{"movie_id":12345,"title":"タイトル","reason":"理由60〜80文字","streaming_services":["Netflix"],"runtime_minutes":120,"match_score":85}]}

## ハルシネーション防止（厳守）
- 「〇〇サービスには△△な映画が存在しない」と断言しない
- 検索結果が0件・少数だった場合は条件を変えて再検索
- 再検索の戦略：評価基準を下げる→ジャンルを広げる→runtime上限を緩める
- 何度試しても見つからない場合のみ「現時点では見つかりませんでした」と伝え、代替案を提案する`;

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

export async function POST(req: NextRequest) {
  const { messages, preferences } = await req.json();

  const supabase = await createServerClient();
  const historyContext = await buildUserHistoryContext(supabase);

  const userContext = `ユーザーの現在の設定:
- 契約中のサービス: ${preferences.streamingServices.join(", ") || "指定なし"}
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
        if (status === 529 && attempt < 2) {
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
      system: SYSTEM_PROMPT,
      tools: movieTools,
      messages: currentMessages,
      stream: false,
    });

    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      const text = textBlock?.type === "text" ? textBlock.text : "";
      // まず完全なJSONとしてパース、失敗したらテキスト内のJSONブロックを抽出して試みる
      try {
        const parsed = JSON.parse(text);
        return NextResponse.json(parsed);
      } catch {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return NextResponse.json(parsed);
          } catch { /* fall through */ }
        }
        return NextResponse.json({ message: text, recommendations: [], options: [] });
      }
    }

    if (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          if (block.type !== "tool_use") return null;
          const result = await executeTool(
            block.name,
            block.input as Record<string, unknown>
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
          content: toolResults.filter(
            (r): r is NonNullable<typeof r> => r !== null
          ),
        },
      ];
    }
  }

  return NextResponse.json({
    message: "推薦の生成に時間がかかっています。再度お試しください。",
    recommendations: [],
  });
}
