import {
  BookOpen,
  CheckCircle2,
  Circle,
  Database,
  Folder,
  type LucideIcon,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

/**
 * `catalog`'s per-recipe progress state (SPEC-catalog.md, `workspace`
 * cross-module contract §3). Optional: absent means "no progress data
 * available" and renders no badge — not a placeholder or empty box.
 */
export interface NavRecipeProgress {
  viewed: boolean;
  completed: boolean;
}

export interface NavRecipe {
  slug: string;
  title: string;
  difficulty: "basic" | "intermediate" | "advanced";
  progress?: NavRecipeProgress;
}

export interface NavGroup {
  id: string;
  title: string;
  /** A lucide-react icon name (catalog's `group.toml` `icon` field). Optional
   * — an absent or unrecognized name renders no icon slot. */
  icon?: string;
  recipes: NavRecipe[];
}

export interface NavModel {
  groups: NavGroup[];
}

export interface SidebarNavProps {
  nav: NavModel;
  /**
   * Icon-only mode (Task 8's collapse-to-icons). Recipes have no icon of
   * their own — only groups do — so this doesn't try to fabricate one:
   * collapsed mode shows one compact, tooltipped entry per group (its icon,
   * or a generic fallback) and omits the recipe list entirely, rather than
   * rendering a misleading partial nav.
   */
  collapsed?: boolean;
  className?: string;
}

/**
 * Fixed name -> component lookup for the lucide icon names a group can carry
 * (see SPEC-catalog.md open question 5). This is intentionally a small,
 * explicit map rather than a dynamic `lucide-react` import: it keeps the
 * bundle deterministic and makes an unrecognized name fail safe (no icon)
 * instead of throwing. Extend it as new group icons are adopted.
 */
const GROUP_ICONS: Record<string, LucideIcon> = {
  BookOpen,
  Database,
};

const DIFFICULTY_LABEL: Record<NavRecipe["difficulty"], string> = {
  basic: "Basic",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/**
 * Renders a group/recipe nav tree it is handed. No data fetching, no
 * business logic — `catalog` builds the `NavModel`, this only draws it
 * (SPEC-app-shell.md Project Structure note on `sidebar-nav.tsx`).
 *
 * Each recipe is a plain `<a href="/r/{slug}">` rather than a `next/link` or
 * a `<button>`: there is no `/r/[slug]` route yet (that's `catalog`'s Task),
 * so a real anchor keeps the entry a genuine, keyboard-focusable link with
 * correct browser affordances (open-in-new-tab, status-bar preview, etc.)
 * without pretending to navigate anywhere client-side-only.
 */
export function SidebarNav({ nav, collapsed = false, className }: SidebarNavProps) {
  if (collapsed) {
    return (
      <nav
        aria-label="Recipe navigation, collapsed"
        className={cn("flex flex-col items-center gap-1", className)}
      >
        {nav.groups.map((group) => {
          const GroupIcon = (group.icon ? GROUP_ICONS[group.icon] : undefined) ?? Folder;
          return (
            <Tooltip key={group.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={group.title}
                    data-testid={`nav-group-collapsed-${group.id}`}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md text-sidebar-foreground/70",
                      "outline-none transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                    )}
                  />
                }
              >
                <GroupIcon aria-hidden="true" className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right">{group.title}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Recipe navigation" className={cn("flex flex-col gap-4", className)}>
      {nav.groups.map((group) => {
        const GroupIcon = group.icon ? GROUP_ICONS[group.icon] : undefined;

        return (
          <div key={group.id} data-testid={`nav-group-${group.id}`} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-2 text-xs font-medium tracking-wide text-sidebar-foreground/70 uppercase">
              {GroupIcon ? (
                <GroupIcon
                  aria-hidden="true"
                  data-testid={`nav-group-icon-${group.id}`}
                  className="size-3.5 shrink-0"
                />
              ) : null}
              <span>{group.title}</span>
            </div>
            <ul className="flex flex-col gap-0.5">
              {group.recipes.map((recipe) => (
                <li key={recipe.slug}>
                  <a
                    href={`/r/${recipe.slug}`}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                      "text-sm text-sidebar-foreground",
                      "outline-none transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
                    )}
                  >
                    <span className="truncate">{recipe.title}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {recipe.progress ? (
                        <RecipeProgressBadge slug={recipe.slug} progress={recipe.progress} />
                      ) : null}
                      <span
                        data-testid={`nav-difficulty-${recipe.slug}`}
                        className="rounded-full border border-sidebar-border px-1.5 py-0.5 text-[10px] tracking-wide text-sidebar-foreground/70 uppercase"
                      >
                        {DIFFICULTY_LABEL[recipe.difficulty]}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function RecipeProgressBadge({
  slug,
  progress,
}: {
  slug: string;
  progress: NavRecipeProgress;
}) {
  if (progress.completed) {
    return (
      <span
        role="img"
        aria-label="Completed"
        data-testid={`nav-progress-${slug}`}
        className="inline-flex"
      >
        <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      </span>
    );
  }

  if (progress.viewed) {
    return (
      <span
        role="img"
        aria-label="Viewed"
        data-testid={`nav-progress-${slug}`}
        className="inline-flex"
      >
        <Circle aria-hidden="true" className="size-3.5 shrink-0 text-sidebar-foreground/40" />
      </span>
    );
  }

  return null;
}
