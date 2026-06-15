import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SupabaseProvider } from "@/components/SupabaseProvider";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "YO-IN AI - 今のあなたが求める映画と出会い、最高の余韻を。",
  description: "AIが今の気分や好みをヒアリングし、あなたにぴったりな映画を提案する映画推薦AIエージェント。",
  keywords: "AI映画推薦, 映画おすすめ, 映画選び, YO-IN AI",
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico" },
    ],
  },
  openGraph: {
    type: "website",
    url: "https://www.yoin-ai.com",
    title: "YO-IN AI - 今のあなたが求める映画と出会い、最高の余韻を。",
    description: "AIが今の気分や好みをヒアリングし、あなたにぴったりな映画を1本提案する映画推薦AIエージェント。",
    siteName: "YO-IN AI",
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: "YO-IN AI - 映画推薦AIエージェント",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "YO-IN AI - 今のあなたが求める映画と出会い、最高の余韻を。",
    description: "AIが今の気分や好みをヒアリングし、あなたにぴったりな映画を1本提案する映画推薦AIエージェント。",
    images: ["/ogp.png"],
  },
  metadataBase: new URL("https://www.yoin-ai.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${notoSansJP.variable} h-full antialiased`}>
      <head>
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="dns-prefetch" href="https://image.tmdb.org" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="YO-IN AI" />
        <meta name="theme-color" content="#0a0a0f" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ServiceWorkerRegistrar />
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
      {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
      )}
    </html>
  );
}
