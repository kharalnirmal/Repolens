"use client";

import { useActionState } from "react";
import { inviteMember, type InviteState } from "@/app/actions";

const initialState: InviteState = { status: "idle" };

export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(
    inviteMember,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="order-3 flex w-full items-center gap-1.5 md:order-none md:w-auto"
    >
      <label htmlFor="invite-email" className="sr-only">
        Teammate email
      </label>
      <input
        id="invite-email"
        name="email"
        type="email"
        required
        placeholder="teammate@example.com"
        aria-describedby="invite-status"
        className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted focus:border-accent md:w-44 md:flex-none"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-7 rounded border border-border bg-surface-muted px-2.5 text-xs font-medium hover:border-accent disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Sending..." : "Invite"}
      </button>
      <span
        id="invite-status"
        aria-live="polite"
        className={`max-w-32 truncate text-[11px] ${
          state.status === "error" ? "text-red-600" : "text-muted"
        }`}
        title={state.message}
      >
        {state.message}
      </span>
    </form>
  );
}
