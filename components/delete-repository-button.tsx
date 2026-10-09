"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";

import {
  deleteRepository,
  type DeleteRepositoryState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";

const initialState: DeleteRepositoryState = { status: "idle" };

type DeleteRepositoryButtonProps = {
  projectId: string;
  repositoryName: string;
};

export function DeleteRepositoryButton({
  projectId,
  repositoryName,
}: DeleteRepositoryButtonProps) {
  const [state, formAction, pending] = useActionState(
    deleteRepository,
    initialState,
  );

  useEffect(() => {
    if (state.status === "error") window.alert(state.message);
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete ${repositoryName} and all of its analysis data? This cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={`Delete ${repositoryName}`}
        title={`Delete ${repositoryName}`}
        className="text-muted-foreground hover:bg-red-500/10 hover:text-red-700 focus-visible:border-red-500/40 focus-visible:ring-red-500/20 dark:hover:text-red-400"
      >
        <Trash2 aria-hidden="true" className="size-3.5" />
      </Button>
    </form>
  );
}
