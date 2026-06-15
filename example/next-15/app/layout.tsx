import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Next.js HPKE Demo",
  description: "End-to-end encryption with HPKE + Next.js",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        {children}
      </body>
    </html>
  );
}
