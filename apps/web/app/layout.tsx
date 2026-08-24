import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChainOS",
  description: "Supply chain operating system — phase 0 scaffold",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
