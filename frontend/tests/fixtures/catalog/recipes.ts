import type { RecipeDetail } from "@/lib/api/models";

/**
 * Sample `RecipeDetail`s for catalog's own unit/component tests — not real
 * recipe content (authoring that is ongoing work outside all 8
 * capability-map modules; see docs/intent/v1.md). Slugs/groups/titles
 * intentionally match `tests/fixtures/nav-tree.ts` (app-shell's own
 * placeholder, replaced by real data in Task 6) for visual continuity
 * rather than inventing a second, disconnected sample set.
 *
 * Deliberately varied per Task 2's acceptance criteria:
 * - `prompt-basics`: has `readmeMarkdown`, one example, no `env`, a plain
 *   string field
 * - `tokens-and-context`: no readme, no examples, no `env`, an enum field
 *   and a constrained number field (min/max — drives the slider control)
 * - `embeddings-101`: has `env` (one required key), two examples, a
 *   `list[UploadedFile]`-shaped field (drives the file-dropzone control)
 * - `hybrid-search`: has `env` (one required, one optional key), advanced
 *   difficulty, a constrained int field, no examples, no readme
 */
export const promptBasics: RecipeDetail = {
  slug: "prompt-basics",
  title: "Prompt Basics",
  summary: "Learn how a prompt actually reaches the model.",
  group: "fundamentals",
  groupTitle: "Fundamentals",
  groupIcon: "BookOpen",
  difficulty: "basic",
  order: 10,
  estimatedRuntimeSeconds: 15,
  useCases: ["Understand system vs. user messages", "See how instructions shape output"],
  readmeMarkdown:
    "# Prompt Basics\n\nA prompt is just text the model conditions its response on.\n\n" +
    "| Role | Purpose |\n| --- | --- |\n| system | sets behavior |\n| user | asks the question |\n\n" +
    "- [x] Read the source\n- [ ] Run it yourself\n\n~~It's not magic.~~ It's just text.\n",
  examples: [
    {
      title: "A direct question",
      summary: "The simplest possible prompt.",
      expect: "A short, direct answer with no preamble.",
      params: { question: "What is the capital of France?" },
    },
  ],
  inputSchema: {
    title: "Params",
    type: "object",
    properties: {
      question: { title: "Question", type: "string" },
    },
    required: ["question"],
  },
  sourceFiles: [{ path: "recipe.py", language: "python" }],
  env: [],
};

export const tokensAndContext: RecipeDetail = {
  slug: "tokens-and-context",
  title: "Tokens & Context",
  summary: "See how text gets chopped into tokens and why context windows matter.",
  group: "fundamentals",
  groupTitle: "Fundamentals",
  groupIcon: "BookOpen",
  difficulty: "basic",
  order: 20,
  estimatedRuntimeSeconds: 20,
  useCases: ["Visualize tokenization", "Understand context window limits"],
  readmeMarkdown: null,
  examples: [],
  inputSchema: {
    title: "Params",
    type: "object",
    properties: {
      tokenizer: { title: "Tokenizer", type: "string", enum: ["gpt-4", "claude", "llama"] },
      max_tokens: { title: "Max Tokens", type: "integer", minimum: 1, maximum: 4096, default: 512 },
    },
    required: ["tokenizer"],
  },
  sourceFiles: [{ path: "recipe.py", language: "python" }],
  env: [],
};

export const embeddings101: RecipeDetail = {
  slug: "embeddings-101",
  title: "Embeddings 101",
  summary: "Turn text into vectors and see nearest neighbors in action.",
  group: "rag",
  groupTitle: "RAG",
  groupIcon: "Database",
  difficulty: "basic",
  order: 10,
  estimatedRuntimeSeconds: 25,
  useCases: ["Understand embedding vectors", "Compare similarity scores"],
  readmeMarkdown: "# Embeddings 101\n\nEmbeddings turn text into vectors.\n",
  examples: [
    {
      title: "Two similar sentences",
      summary: "High similarity expected.",
      expect: "A cosine similarity above 0.8.",
      params: { texts: ["The cat sat on the mat.", "A cat was sitting on a mat."] },
    },
    {
      title: "Two unrelated sentences",
      summary: "Low similarity expected.",
      expect: "A cosine similarity below 0.3.",
      params: { texts: ["The cat sat on the mat.", "Quarterly revenue rose 3%."] },
    },
  ],
  inputSchema: {
    title: "Params",
    type: "object",
    properties: {
      texts: { title: "Texts", type: "array", items: { type: "string" } },
      documents: {
        title: "Documents",
        type: "array",
        items: { type: "string", format: "binary" },
        json_schema_extra: { accept: [".txt", ".md"], maxFiles: 3 },
      },
    },
    required: ["texts"],
  },
  sourceFiles: [{ path: "recipe.py", language: "python" }],
  env: [{ key: "OPENAI_API_KEY", provider: "OpenAI", required: true, description: "Used to embed the input text." }],
};

export const hybridSearch: RecipeDetail = {
  slug: "hybrid-search",
  title: "Hybrid Search",
  summary: "Combine keyword and vector search for better retrieval.",
  group: "rag",
  groupTitle: "RAG",
  groupIcon: "Database",
  difficulty: "advanced",
  order: 30,
  estimatedRuntimeSeconds: 40,
  useCases: ["Blend BM25 and vector scores", "Tune the blend weight"],
  readmeMarkdown: null,
  examples: [],
  inputSchema: {
    title: "Params",
    type: "object",
    properties: {
      query: { title: "Query", type: "string" },
      keyword_weight: { title: "Keyword Weight", type: "integer", minimum: 0, maximum: 100, default: 50 },
    },
    required: ["query"],
  },
  sourceFiles: [{ path: "recipe.py", language: "python" }],
  env: [
    { key: "OPENAI_API_KEY", provider: "OpenAI", required: true, description: "Used to embed the query." },
    {
      key: "COHERE_API_KEY",
      provider: "Cohere",
      required: false,
      description: "Optional: enables Cohere's reranker.",
    },
  ],
};

export const catalogFixtureRecipes: RecipeDetail[] = [
  promptBasics,
  tokensAndContext,
  embeddings101,
  hybridSearch,
];
