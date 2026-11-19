import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: { default: "ORIA FUTURE ERP", template: "%s · ORIA FUTURE" }, description: "ORIA FUTURE – eCommerce ERP & multi-account eBay management" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
