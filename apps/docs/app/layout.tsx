import type { Metadata } from "next";
import { JetBrains_Mono, Outfit, Source_Sans_3 } from "next/font/google";
import { DocsShell } from "../components/DocsShell";
import "./globals.css";

const display = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Weavo Docs",
    template: "%s · Weavo Docs",
  },
  description:
    "Collaborative text editing over a CRDT — client binding, membership, presence, and the wire protocol.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        <DocsShell>{children}</DocsShell>
      </body>
    </html>
  );
}
