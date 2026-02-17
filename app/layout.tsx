import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import { ThemeToggle } from "@/components/theme-toggle";
import { validateServerRuntimeConfig } from "@/lib/env.server";

import "./globals.css";

validateServerRuntimeConfig();

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NexusDash",
  description: "Personal productivity hub for projects, tasks, and resources.",
};

const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const saved = localStorage.getItem("nexusdash-theme");
    const theme = saved === "dark" ? "dark" : "light";
    document.documentElement.classList.toggle("dark", theme === "dark");
  } catch (error) {
    document.documentElement.classList.remove("dark");
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body
        className={`${inter.variable} ${jetBrainsMono.variable} min-h-screen antialiased`}
      >
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
