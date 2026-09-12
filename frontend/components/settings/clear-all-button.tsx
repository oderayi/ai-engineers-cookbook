"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface ClearAllButtonProps {
  onConfirm: () => void;
}

/**
 * Destructive action guarded behind a confirmation dialog. Fully
 * presentational/controlled around `onConfirm` -- it does not read or write
 * any settings itself, so whoever mounts it decides what "clear all"
 * actually does (see Task 11, which wires this to `useSettings().clearAll`).
 */
export function ClearAllButton({ onConfirm }: ClearAllButtonProps) {
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    onConfirm();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" />}>
        Clear all settings
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clear all settings?</DialogTitle>
          <DialogDescription>
            This permanently deletes every saved setting in this browser,
            including API keys and preferences. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={handleConfirm}>
            Clear all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
