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
        pages: 2,
      });
      // レートリミット対策: 5件ずつバッチで詳細取得
      const top20 = movies.slice(0, 20);
      const detailed: Awaited<ReturnType<typeof getMovieDetails>>[] = [];
      for (let i = 0; i < top20.length; i += 5) {
        const batch = await Promise.all(
          top20.slice(i, i + 5).map((m) => getMovieDetails(m.id).catch(() => m))
        );
        detailed.push(...batch);
      }
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

const SYSTEM_PROMPT = `あなたは映画をこよなく愛するパーソナル映画コンシェルジュです。

## 2つのモード

### ⚡ サクッとモード（ユーザーが「サクッと探したい」を選んだ場合）
ヒアリングは最大2往復で完了し、即座に推薦する。
1. 気分を1問聞く（options 4択）
2. 上映時間を1問聞く（options 3択）
3. すぐに映画を検索して3本推薦

### 🎯 じっくりモード（ユーザーが「じっくり探したい」を選んだ場合）
3〜4往復かけてユーザーの好みを深掘りしてから推薦する。
1. 気分・感情を聞く
2. 好きな映画・ジャンルを聞いて深掘り
3. 上映時間を聞く（3択）
4. 視聴環境・苦手なものを任意で確認
5. 3〜5本を詳しい理由とともに推薦

---

## 共通ルール

### 会話スタイル
- 友人のように親しみやすい口調
- 一度に質問は1〜2個まで
- 上映時間は**必ず3択**で聞く。自動的に仮定しないこと
  - options: ["90分以内でサクッと", "90〜120分くらい", "2時間以上でもOK"]

### 映画推薦のステップ（厳守）
1. 「探してみますね！」と一言添えてからツールを使う
2. discover_movies または get_similar_movies で候補を集める
3. **必ず** check_streaming_availability で配信確認
4. 契約サービス指定ありの場合、**配信中の映画のみ**推薦（例外なし）
5. 3本未満なら条件を緩めて再検索

### 推薦理由（60〜80文字）
会話で出た言葉を引用して書く。
- NG：「アクションが好きな方に」
- OK：「『インセプション』好きとのことで、同じく現実が揺らぐ緊張感がある作品です。90分とコンパクトなのもぴったり。」

## レスポンス形式（必ずJSON・コードブロックなし）

【ヒアリング中】
{"message":"質問","options":["A","B","C"],"recommendations":[]}

【推薦時】
{"message":"導入文","options":["もっと短い作品で","別ジャンルも見たい","似た映画をもっと"],"recommendations":[{"movie_id":12345,"title":"タイトル","reason":"理由60〜80文字","streaming_services":["Netflix"],"runtime_minutes":120,"match_score":85}]}

推薦後は「気になった作品はありますか？」と続け、追加要望に柔軟に対応する。

## ハルシネーション防止（厳守）
- 「〇〇サービスには△△な映画が存在しない」と断言しない。ツールの検索結果はあくまで一部であり、実際には存在する可能性がある
- 検索結果が0件・少数だった場合は「私の検索では見つかりませんでした」と伝え、条件を変えて再検索を試みる
- 再検索の戦略：評価基準を下げる→ジャンルを広げる→runtime上限を緩める
- 何度試しても見つからない場合のみ「現時点では見つかりませんでした」と伝え、代替案を提案する`;

export async function POST(req: NextRequest) {
  const { messages, preferences } = await req.json();

  const userContext = `
ユーザーの現在の設定:
- 契約中のサービス: ${preferences.streamingServices.join(", ") || "指定なし"}
※ 視聴可能時間は会話の中でユーザーに確認してください（上映時間の希望は自動設定しないこと）
`;

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
