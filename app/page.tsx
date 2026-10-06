import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { InviteMemberForm } from "@/components/invite-member-form";
import { ThemeControl } from "@/components/theme-control";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function WorkspacePage() {
  await auth.protect();
  const authentication = await auth();

  const { has, orgId, orgSlug } = authentication;

  // Constructed here so every future server query inherits this request's token.
  createServerSupabaseClient(authentication.getToken);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex min-h-12 flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-2 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="font-mono text-sm font-semibold tracking-tight">
            RepoLens
          </span>
          <span className="hidden h-4 w-px bg-border sm:block" />
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            afterLeaveOrganizationUrl="/"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {has({ role: "org:admin" }) ? <InviteMemberForm /> : null}
          <ThemeControl />
          <UserButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div className="flex h-9 items-center border-b border-border bg-surface-muted px-3 font-mono text-[11px] text-muted sm:px-4">
          <span className="mr-2 uppercase tracking-wider">Active team</span>
          <span className="text-foreground">
            {orgSlug ?? orgId ?? "No active organization"}
          </span>
        </div>

        <div className="grid flex-1 place-items-center p-6">
          <div className="max-w-md border border-border bg-surface p-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
              Workspace ready
            </p>
            <h1 className="mt-2 text-base font-semibold">
              Your team shell is in place.
            </h1>
            <p className="mt-2 text-sm leading-5 text-muted">
              Repository analyses will appear here in the next phase.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
