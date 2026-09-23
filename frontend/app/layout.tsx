import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/sidebar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OptiTeach — Intelligent Course Teaching & Optimization Platform",
  description:
    "A DBMS-centric intelligent course teaching and optimization platform with curriculum graph analytics, constrained time allocation, and adaptive class planning.",
  keywords: ["DBMS", "teaching optimization", "curriculum", "lesson plan", "normalization"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} dark`}>
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          background: "var(--bg-primary)",
          color: "var(--text-primary)",
        }}
      >
        <Sidebar />
        <main
          style={{
            flex: 1,
            marginLeft: "var(--sidebar-width)",
            minHeight: "100vh",
            transition: "margin-left var(--transition-base)",
          }}
        >
          <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
