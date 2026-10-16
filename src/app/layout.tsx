import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { profile } from "@/data/profile";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${profile.name} | ${profile.role}`,
  description: profile.tagline,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <header className="border-b border-border">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
            <Link href="/" className="font-semibold tracking-tight">
              {profile.name}
            </Link>
            <div className="flex gap-5 text-sm text-muted">
              <Link href="/#projects" className="hover:text-foreground">Projects</Link>
              <Link href="/about" className="hover:text-foreground">About</Link>
              <a href={profile.github} className="hover:text-foreground" target="_blank" rel="noreferrer">GitHub</a>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 sm:px-6">{children}</main>
        <footer className="mx-auto mt-24 max-w-5xl border-t border-border px-4 py-8 text-sm text-muted sm:px-6">
          {profile.name} · {profile.location} ·{" "}
          <a href={`mailto:${profile.email}`} className="hover:text-foreground">{profile.email}</a>
        </footer>
      </body>
    </html>
  );
}
