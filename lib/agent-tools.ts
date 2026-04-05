import Anthropic from "@anthropic-ai/sdk";

export const movieTools: Anthropic.Tool[] = [
  {
    name: "search_movies_by_title",
    description: "ユーザーが好きな映画のタイトルからTMDB映画IDを検索する",
    input_schema: {
      type: "object",
      properties: {
        titles: {
          type: "array",
          items: { type: "string" },
          description: "検索する映画タイトルのリスト",
        },
      },
      required: ["titles"],
    },
  },
  {
    name: "discover_movies",
    description: "ジャンル・上映時間・評価などの条件で映画を検索する",
    input_schema: {
      type: "object",
      properties: {
        genre_ids: {
          type: "array",
          items: { type: "number" },
          description:
            "TMDBジャンルID（28=アクション, 35=コメディ, 18=ドラマ, 27=ホラー, 10749=ロマンス, 878=SF, 53=スリラー, 16=アニメ）",
        },
        max_runtime_minutes: {
          type: "number",
          description: "最大上映時間（分）",
        },
        min_rating: {
          type: "number",
          description: "最低評価スコア（0-10）",
        },
      },
      required: [],
    },
  },
  {
    name: "get_similar_movies",
    description: "指定した映画IDに類似した映画を取得する",
    input_schema: {
      type: "object",
      properties: {
        movie_id: {
          type: "number",
          description: "基準となる映画のTMDB ID",
        },
      },
      required: ["movie_id"],
    },
  },
  {
    name: "check_streaming_availability",
    description: "映画が日本のどのサブスクリプションサービスで配信されているか確認する",
    input_schema: {
      type: "object",
      properties: {
        movie_ids: {
          type: "array",
          items: { type: "number" },
          description: "確認する映画IDのリスト",
        },
        preferred_services: {
          type: "array",
          items: { type: "string" },
          description: "ユーザーが契約しているサービス名（例: Netflix, Amazon Prime Video）",
        },
      },
      required: ["movie_ids"],
    },
  },
];
