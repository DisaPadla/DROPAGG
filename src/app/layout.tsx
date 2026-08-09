import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { LanguageProvider } from "@/context/language-context";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "DropAgg | Агрегатор стрітвір та брендового одягу",
  description: "Відстежуйте дропи, нові колекції та наявність розмірів у магазинах одягу.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <LanguageProvider>
          <Suspense fallback={<nav className="sticky top-0 z-50 w-full h-16 border-b bg-background" />}>
            <Navbar />
          </Suspense>
          <main className="flex-1">
            <Suspense fallback={null}>
              {children}
            </Suspense>
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}
