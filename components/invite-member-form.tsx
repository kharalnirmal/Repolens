"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { inviteMember, type InviteState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: InviteState = { status: "idle" };

export function InviteMemberForm() {
  const [state, formAction, pending] = useActionState(
    inviteMember,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="order-3 flex w-full flex-wrap items-center gap-1.5 sm:order-none sm:ml-auto sm:w-auto"
    >
      <label htmlFor="invite-email" className="sr-only">
        Teammate email
      </label>
      <div className="flex min-w-0 flex-1 items-center rounded-lg border border-border bg-surface p-0.5 shadow-sm focus-within:border-imports focus-within:ring-2 focus-within:ring-imports/15 sm:flex-none">
        <UserPlus aria-hidden="true" className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="name@company.com"
          aria-describedby="invite-status"
          className="h-7 min-w-0 flex-1 rounded-none border-0 bg-transparent px-2 text-[11px] shadow-none placeholder:text-muted-foreground focus-visible:ring-0 sm:w-36 sm:flex-none dark:bg-transparent lg:w-44"
        />
        <Button type="submit" size="sm" disabled={pending} className="h-7 rounded-md bg-foreground px-2.5 text-[11px] font-semibold text-background hover:bg-foreground/85 focus-visible:ring-imports disabled:cursor-wait">
          {pending ? "Sending..." : "Invite"}
        </Button>
      </div>
      <span
        id="invite-status"
        aria-live="polite"
        className={`max-w-32 truncate text-[10px] ${state.status === "error" ? "text-red-600" : "text-muted-foreground"}`}
        title={state.message}
      >
        {state.message}
      </span>
    </form>
  );
}
