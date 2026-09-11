import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/primitives/empty-state";

export default function Home() {
  return (
    <EmptyState
      icon={BookOpen}
      message="The recipe catalog isn't built yet — this is app-shell's placeholder main content, rendered against fixture nav data with no backend."
    />
  );
}
