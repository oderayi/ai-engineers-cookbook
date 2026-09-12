import { ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/cn";

export interface KeysSafetyNoteProps {
  className?: string;
}

/**
 * Static messaging block reused on both the global settings screen and the
 * per-recipe overrides panel: keys never leave the browser except when a
 * recipe actually runs.
 */
export function KeysSafetyNote({ className }: KeysSafetyNoteProps) {
  return (
    <Alert className={cn(className)}>
      <ShieldCheck />
      <AlertTitle>Your keys stay on this device</AlertTitle>
      <AlertDescription>
        API keys are stored only in this browser&apos;s local storage. They
        are never sent anywhere until you run a recipe that needs them.
      </AlertDescription>
    </Alert>
  );
}
