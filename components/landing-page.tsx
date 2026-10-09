import Link from "next/link";

import { EvidenceCoverageIllustration } from "@/components/evidence-coverage-illustration";
import { FrameworkContextIllustration } from "@/components/framework-context-illustration";
import { LandingThemeToggle } from "@/components/landing-theme-toggle";
import { TraceChangeCopy } from "@/components/trace-change-copy";
import { TraceChangeIllustration } from "@/components/trace-change-illustration";
import { Button } from "@/components/ui/button";
import { ContainerScroll } from "@/components/ui/container-scroll-animation";
import HowItWorks from "@/components/ui/how-it-works";
import { Input } from "@/components/ui/input";

interface IconProps {
  className?: string;
}

function GithubIcon({ className = "size-4" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 1.8a13.4 13.4 0 0 0-7 0C4.8.1 3.7.5 3.7.5A5 5 0 0 0 3.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 8 18v4" />
      <path d="M8 19c-3 .9-3-1.5-4-2" />
    </svg>
  );
}

function MailIcon({ className = "size-4" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function FacebookIcon({ className = "size-4" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M13.5 22v-8h2.8l.42-3.2H13.5V8.76c0-.93.26-1.56 1.62-1.56h1.73V4.34a23 23 0 0 0-2.52-.13c-2.5 0-4.2 1.52-4.2 4.32v2.27H7.3V14h2.83v8h3.37Z" />
    </svg>
  );
}

function InstagramIcon({ className = "size-4" }: IconProps) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="20" x="2" y="2" rx="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z" /><path d="M17.5 6.5h.01" />
    </svg>
  );
}

const sectionHeading = "max-w-[18ch] font-heading text-[clamp(2.2rem,4.4vw,4rem)] font-semibold leading-[1.04] tracking-[-0.055em]";

function ProductImagePlaceholder() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-muted/40 p-6">
      <div className="flex h-full w-full items-center justify-center rounded-sm border border-dashed border-border bg-background/60">
        <span className="font-mono text-[10px] text-muted-foreground">Product image</span>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-5 sm:px-6" aria-label="Primary navigation">
          <Link href="/" className="flex items-center gap-2.5 outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-imports focus-visible:ring-offset-2 focus-visible:ring-offset-background">
            <span className="font-heading text-xl font-semibold tracking-[-0.055em]">RepoLens</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LandingThemeToggle />
            <Button nativeButton={false} render={<Link href="/sign-in" />} className="h-9 rounded-lg bg-foreground px-4 text-sm font-semibold text-background shadow-sm hover:bg-foreground hover:opacity-85 focus-visible:ring-2 focus-visible:ring-imports focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              Sign in
            </Button>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative isolate w-full overflow-hidden bg-surface-muted/25">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-35 [mask-image:linear-gradient(to_bottom,black_0%,black_55%,transparent_92%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[420px] w-[min(760px,90vw)] -translate-x-1/2 rounded-full bg-imports/10 blur-3xl"
          />
          <ContainerScroll
            titleComponent={
              <div className="mx-auto w-full max-w-[960px] text-center">
                <h1 className="w-full font-heading text-[clamp(2.5rem,4.8vw,4.4rem)] font-semibold leading-[0.98] tracking-[-0.055em]">
                  Understand any codebase at a glance.
                </h1>
                <p className="mx-auto mt-5 max-w-[48ch] text-base leading-7 text-muted-foreground sm:text-lg">
                  Turn a public GitHub repository into a visual map. See how files connect and what a change will affect.
                </p>
                <form action="/start" method="get" className="mx-auto mt-8 max-w-[620px] border border-border bg-surface/95 p-1.5 text-left shadow-sm focus-within:border-imports focus-within:ring-2 focus-within:ring-imports/15">
                  <label htmlFor="landing-repository-url" className="sr-only">Public GitHub repository URL</label>
                  <div className="flex min-w-0 items-center gap-2">
                    <GithubIcon className="ml-2.5 size-4 shrink-0 text-muted-foreground" />
                    <Input
                      id="landing-repository-url"
                      name="repositoryUrl"
                      type="url"
                      inputMode="url"
                      required
                      autoComplete="url"
                      placeholder="https://github.com/owner/repository"
                      className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 font-mono text-[11px] placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent"
                    />
                    <Button type="submit" className="h-10 shrink-0 rounded-sm bg-imports px-5 text-sm font-semibold text-white hover:bg-imports hover:brightness-95 focus-visible:ring-2 focus-visible:ring-imports">
                      Map repository
                    </Button>
                  </div>
                </form>
                <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-1 font-mono text-[10px] leading-5 text-muted-foreground">
                  <span>No setup</span>
                  <span>No repository token</span>
                  <span>TypeScript and JavaScript</span>
                </div>
              </div>
            }
          >
            <ProductImagePlaceholder />
          </ContainerScroll>
        </section>

        <section className="relative isolate overflow-hidden bg-background">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-surface-muted/45 [clip-path:polygon(64%_0,100%_0,100%_100%,46%_100%)]" />
          <div className="mx-auto w-full max-w-[1240px] px-6 pb-24 pt-16 lg:pb-32 lg:pt-20">
            <h2 className={`${sectionHeading} mx-auto text-center`}>See Every Connection.</h2>
            <HowItWorks className="mt-12" />
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-background">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-surface-muted/45 [clip-path:polygon(0_0,calc(45%_+_13px)_0,calc(63%_+_13px)_100%,0_100%)]" />
          <div className="mx-auto grid w-full max-w-[1200px] items-center gap-10 px-6 pb-16 pt-12 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:gap-12 lg:pb-20 lg:pt-14 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] xl:gap-16">
            <TraceChangeCopy />
            <TraceChangeIllustration />
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-surface-muted/25">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />
          <div aria-hidden="true" className="pointer-events-none absolute right-[8%] top-1/2 -z-10 h-72 w-72 -translate-y-1/2 rounded-full bg-imports/10 blur-3xl" />
          <div className="mx-auto grid w-full max-w-[1140px] items-center gap-12 px-6 py-24 lg:grid-cols-[0.88fr_1.12fr] lg:gap-20 lg:py-28">
            <div>
              <h2 className={sectionHeading}>Framework context, without changing the facts.</h2>
              <p className="mt-6 max-w-[46ch] text-base leading-7 text-muted-foreground">
                RepoLens recognizes how Next.js, NestJS, Express, and React organize code after it maps the imports. That adds useful roles without changing a single connection.
              </p>
              <p className="mt-8 max-w-[43ch] text-sm font-medium leading-6 text-foreground">A route appears only when its method and complete path are present in the source.</p>
            </div>
            <FrameworkContextIllustration />
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-surface-muted/25">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px] opacity-25" />
          <div aria-hidden="true" className="pointer-events-none absolute left-[8%] top-1/2 -z-10 h-72 w-72 -translate-y-1/2 rounded-full bg-imports/10 blur-3xl" />
          <div className="mx-auto grid w-full max-w-[1140px] items-center gap-12 px-6 pb-28 pt-20 lg:grid-cols-[1.12fr_0.88fr] lg:gap-20 lg:pb-32 lg:pt-24">
            <EvidenceCoverageIllustration />
            <div>
              <h2 className={sectionHeading}>If the code cannot prove it, RepoLens leaves it out.</h2>
              <p className="mt-6 max-w-[46ch] text-base leading-7 text-muted-foreground">
                A connection appears only when an import resolves to a real file. Missing targets and skipped files stay visible, so you can see exactly where the map stops.
              </p>
              <ul className="mt-8 space-y-3 text-sm leading-6 text-foreground">
                {[
                  "Resolved imports become connections.",
                  "Unresolved imports keep their reason.",
                  "Skipped files remain in the coverage report.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-imports" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative mt-16 bg-black text-white">
        <svg aria-hidden="true" viewBox="0 0 1440 96" preserveAspectRatio="none" className="absolute -top-16 left-0 h-16 w-full fill-black">
          <path d="M0 48C178 7 332 84 541 51C771 14 928 76 1120 42C1265 16 1367 29 1440 55V96H0Z" />
        </svg>
        <div className="mx-auto w-full max-w-[1140px] px-6">
          <div className="grid gap-8 pb-16 pt-20 sm:grid-cols-[1fr_auto] sm:items-end lg:pb-20 lg:pt-24">
            <div>
              <h2 className="max-w-[16ch] font-heading text-[clamp(2.2rem,4vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.055em]">
                Open the map before you open the code.
              </h2>
              <p className="mt-5 max-w-[48ch] text-sm leading-6 text-white/75">
                Paste a public TypeScript or JavaScript repository. RepoLens will map the connections it can prove.
              </p>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/start" />}
              className="h-11 w-fit rounded-md bg-white px-5 font-semibold text-black hover:bg-white hover:opacity-85 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              Map a repository
            </Button>
          </div>

          <div className="grid gap-12 pb-14 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1.35fr] lg:gap-16">
            <div>
              <Link href="/" className="inline-flex font-heading text-xl font-semibold tracking-[-0.055em] outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-white">
                RepoLens
              </Link>
              <p className="mt-3 max-w-[36ch] text-sm leading-6 text-white/55">
                A dependency map for developers opening code they did not write, or can no longer hold in their head.
              </p>
            </div>

            <nav aria-label="Footer navigation">
              <p className="text-xs font-semibold text-white">Product</p>
              <div className="mt-4 flex flex-col items-start gap-3 text-sm text-white/55">
                <Link href="/start" className="transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none">Map repository</Link>
                <Link href="/sign-in" className="transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none">Sign in</Link>
              </div>
            </nav>

            <div>
              <p className="text-xs font-semibold text-white">Connect</p>
              <a
                href="mailto:nirmalkharal40@gmail.com"
                className="mt-4 inline-flex items-center gap-2 text-sm text-white/55 transition-colors hover:text-white focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
              >
                <MailIcon className="size-3.5" />
                nirmalkharal40@gmail.com
              </a>
              <nav className="mt-5 flex items-center gap-2" aria-label="Social media">
                {[
                  { label: "GitHub", href: "https://github.com/kharalnirmal", icon: <GithubIcon className="size-4" /> },
                  { label: "Instagram", href: "https://www.instagram.com/nirmalkharal/", icon: <InstagramIcon className="size-4" /> },
                  { label: "Facebook", href: "https://www.facebook.com/imnirmalkharal/", icon: <FacebookIcon className="size-4" /> },
                ].map(({ label, href, icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="grid size-8 place-items-center rounded-sm text-white/50 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none"
                  >
                    {icon}
                  </a>
                ))}
              </nav>
            </div>
          </div>

          <div className="flex flex-col gap-2 pb-7 font-mono text-[10px] text-white/35 sm:flex-row sm:items-center sm:justify-between">
            <span>&copy; 2026 RepoLens. All rights reserved.</span>
            <span>Built by Nirmal Kharal</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
