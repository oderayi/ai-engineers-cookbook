import type { SourceBundle } from "@/lib/api/models";

/**
 * `GET /recipes/{slug}/source` fixtures, keyed by slug — one per recipe in
 * `recipes.ts`. Content is illustrative, not runnable; what matters for
 * `source-viewer.tsx`'s tests is that a byte-for-byte comparison against
 * this exact `text` succeeds.
 */
export const catalogFixtureSourceBundles: Record<string, SourceBundle> = {
  "prompt-basics": {
    files: [
      {
        path: "recipe.py",
        language: "python",
        text:
          "from skillet.recipe import Params as BaseParams\n\n\n" +
          "class Params(BaseParams):\n    question: str\n\n\n" +
          'async def run(params: Params, ctx) -> None:\n    await ctx.emit.result({"answer": params.question})\n',
        sha256: "fixture-sha-prompt-basics-recipe-py",
      },
    ],
    bundleSha256: "fixture-sha-prompt-basics-bundle",
  },
  "tokens-and-context": {
    files: [
      {
        path: "recipe.py",
        language: "python",
        text:
          "from skillet.recipe import Params as BaseParams\n\n\n" +
          "class Params(BaseParams):\n    tokenizer: str\n    max_tokens: int = 512\n\n\n" +
          "async def run(params: Params, ctx) -> None:\n    await ctx.emit.result({})\n",
        sha256: "fixture-sha-tokens-and-context-recipe-py",
      },
    ],
    bundleSha256: "fixture-sha-tokens-and-context-bundle",
  },
  "embeddings-101": {
    files: [
      {
        path: "recipe.py",
        language: "python",
        text:
          "from skillet.recipe import Params as BaseParams\n\n" +
          "from .helpers import cosine_similarity\n\n\n" +
          "class Params(BaseParams):\n    texts: list[str]\n\n\n" +
          "async def run(params: Params, ctx) -> None:\n    await ctx.emit.result({})\n",
        sha256: "fixture-sha-embeddings-101-recipe-py",
      },
      {
        path: "helpers.py",
        language: "python",
        text: "def cosine_similarity(a: list[float], b: list[float]) -> float:\n    ...\n",
        sha256: "fixture-sha-embeddings-101-helpers-py",
      },
    ],
    bundleSha256: "fixture-sha-embeddings-101-bundle",
  },
  "hybrid-search": {
    files: [
      {
        path: "recipe.py",
        language: "python",
        text:
          "from skillet.recipe import Params as BaseParams\n\n\n" +
          "class Params(BaseParams):\n    query: str\n    keyword_weight: int = 50\n\n\n" +
          "async def run(params: Params, ctx) -> None:\n    await ctx.emit.result({})\n",
        sha256: "fixture-sha-hybrid-search-recipe-py",
      },
    ],
    bundleSha256: "fixture-sha-hybrid-search-bundle",
  },
};
