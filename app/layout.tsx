import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist_Mono, Manrope, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RepoLens",
  description: "Dependency maps built from real code.",
};

const themeScript = `
  try {
    var theme = localStorage.getItem("repolens-theme");
    document.documentElement.dataset.theme =
      theme === "light" || theme === "dark" ? theme : "system";
  } catch (_) {
    document.documentElement.dataset.theme = "system";
  }
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="system"
      suppressHydrationWarning
      className={`${manrope.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          {children}
        </ClerkProvider>
        <Script id="theme-script" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </body>
    </html>
  );
}
