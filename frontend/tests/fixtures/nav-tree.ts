import type { NavModel } from "@/components/shell/sidebar-nav";

/**
 * Sample nav model for visual/dev work and tests.
 *
 * Shared across app-shell's own tests (Task 5) and later reused as the
 * fixture backing Task 10 (app/page.tsx wiring) and Task 11 (responsive /
 * keyboard pass) — keep it realistic rather than minimal.
 *
 * Deliberately mixes:
 * - a group with an `icon` (Fundamentals, RAG) and one without (Agents)
 * - all three difficulties across groups
 * - recipes with `progress` (both completed and merely-viewed) and several
 *   with no `progress` entry at all, per catalog's "absent data renders no
 *   badge" contract (SPEC-catalog.md, workspace cross-module contract §3)
 */
export const navTreeFixture: NavModel = {
  groups: [
    {
      id: "fundamentals",
      title: "Fundamentals",
      icon: "BookOpen",
      recipes: [
        {
          slug: "prompt-basics",
          title: "Prompt Basics",
          difficulty: "basic",
          progress: { viewed: true, completed: true },
        },
        {
          slug: "tokens-and-context",
          title: "Tokens & Context",
          difficulty: "basic",
        },
        {
          slug: "temperature-and-sampling",
          title: "Temperature & Sampling",
          difficulty: "intermediate",
        },
      ],
    },
    {
      id: "rag",
      title: "RAG",
      icon: "Database",
      recipes: [
        {
          slug: "embeddings-101",
          title: "Embeddings 101",
          difficulty: "basic",
          progress: { viewed: true, completed: false },
        },
        {
          slug: "chunking-strategies",
          title: "Chunking Strategies",
          difficulty: "intermediate",
        },
        {
          slug: "hybrid-search",
          title: "Hybrid Search",
          difficulty: "advanced",
        },
        {
          slug: "reranking",
          title: "Reranking",
          difficulty: "advanced",
        },
      ],
    },
    {
      id: "agents",
      title: "Agents",
      recipes: [
        {
          slug: "tool-calling-basics",
          title: "Tool-Calling Basics",
          difficulty: "intermediate",
        },
        {
          slug: "multi-agent-orchestration",
          title: "Multi-Agent Orchestration",
          difficulty: "advanced",
          progress: { viewed: true, completed: false },
        },
      ],
    },
  ],
};
