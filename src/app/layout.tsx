import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import TopNav from "@/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Alice Imóveis Vistorias",
  description: "Sistema de vistorias e agenda da Alice Imóveis.",
};

const themeInitScript = `
(() => {
  const h = document.documentElement;
  h.dataset.theme = "dark";
  h.classList.add("dark");
  h.style.colorScheme = "dark";
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <div className="flex min-h-screen flex-col bg-[var(--app-shell-bg)]">
          <TopNav />
          <div className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-8">{children}</div>
          <footer className="mx-auto w-full max-w-screen-2xl px-4 py-4 text-right">
            <p className="text-xs text-[var(--muted)]">
              Sistema desenvolvido por{" "}
              <a
                href="https://wa.me/5551997174866"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-strong)] hover:underline"
              >
                Léo Antunes
              </a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
