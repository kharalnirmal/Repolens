"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

import { LandingThemeToggle } from "@/components/landing-theme-toggle";

export function WorkspaceHeader({ projectName }: { projectName?: string }) {
  return (
    <header className="shrink-0 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-[1440px] items-center gap-2.5 px-4 py-2 sm:px-6">
        <form action="/" method="get" className="shrink-0">
          <button
            type="submit"
            className="rounded-md font-heading text-lg font-semibold tracking-[-0.05em] outline-none focus-visible:ring-2 focus-visible:ring-imports focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            RepoLens
          </button>
        </form>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          appearance={{
            elements: {
              rootBox: "min-w-0",
              organizationSwitcherTrigger: "rounded-md border-0 bg-transparent px-2 py-1.5 shadow-none hover:bg-surface-muted",
              organizationPreviewMainIdentifier: "text-xs font-semibold text-foreground",
              organizationSwitcherTriggerIcon: "text-muted-foreground",
              avatarBox: "size-6 rounded-md",
            },
          }}
        />
        {projectName ? (
          <>
            <span className="mx-1 hidden h-5 w-px bg-border md:block" />
            <span className="hidden min-w-0 truncate font-mono text-xs font-semibold text-foreground md:block">
              {projectName}
            </span>
          </>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <LandingThemeToggle />
          <div className="ml-0.5 grid size-9 place-items-center">
            <UserButton />
          </div>
        </div>
      </div>
    </header>
  );
}
