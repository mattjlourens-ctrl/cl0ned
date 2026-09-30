import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import "./globals.css";

// The only font family on the site: a geometric sans for everything.
const interTight = Inter_Tight({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "cl0ned",
  description: "Find open-source alternatives to paid software.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={interTight.variable}>
      <body>{children}</body>
    </html>
  );
}
