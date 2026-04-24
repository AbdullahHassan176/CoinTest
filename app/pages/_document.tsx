import { Html, Head, Main, NextScript } from "next/document";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live";
const DEFAULT_TITLE = "HORMUZ — Strait of Hormuz Live Intelligence Hub";
const DEFAULT_DESC =
  "Real-time Strait of Hormuz intelligence: live oil prices, VLCC shipping rates, war risk premiums, shipping lane maps, pipeline alternatives, and geopolitical threat analysis. The world's most critical oil chokepoint — monitored live.";
const OG_IMAGE = `${SITE_URL}/og-image.png`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* ── Charset + theme ───────────────────────────────────────────── */}
        <meta charSet="utf-8" />
        <meta name="theme-color" content="#0A0E1A" />
        <meta name="color-scheme" content="dark" />

        {/* ── Default SEO (overridden per-page via next/head) ───────────── */}
        <meta name="robots" content="index, follow" />
        <meta name="googlebot" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />

        {/* ── Default Open Graph ────────────────────────────────────────── */}
        <meta property="og:type"        content="website" />
        <meta property="og:site_name"   content="HORMUZ Intelligence" />
        <meta property="og:title"       content={DEFAULT_TITLE} />
        <meta property="og:description" content={DEFAULT_DESC} />
        <meta property="og:image"       content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height"content="630" />
        <meta property="og:image:alt"   content="HORMUZ live intelligence dashboard showing Strait of Hormuz shipping lanes, oil prices and threat level" />

        {/* ── Default Twitter Card ──────────────────────────────────────── */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:site"        content="@HormuzIntel" />
        <meta name="twitter:creator"     content="@HormuzIntel" />
        <meta name="twitter:title"       content={DEFAULT_TITLE} />
        <meta name="twitter:description" content={DEFAULT_DESC} />
        <meta name="twitter:image"       content={OG_IMAGE} />

        {/* ── Canonical base (per-page canonical set in <Head>) ─────────── */}
        <link rel="canonical" href={SITE_URL} />

        {/* ── Favicons ─────────────────────────────────────────────────── */}
        <link rel="icon"             href="/favicon.ico" />
        <link rel="icon"             href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest"         href="/site.webmanifest" />

        {/* ── DNS prefetch for data sources ────────────────────────────── */}
        <link rel="dns-prefetch" href="//query1.finance.yahoo.com" />
        <link rel="dns-prefetch" href="//feeds.reuters.com" />
        <link rel="dns-prefetch" href="//feeds.bbci.co.uk" />
        <link rel="dns-prefetch" href="//www.aljazeera.com" />

        {/* ── Fonts ─────────────────────────────────────────────────────── */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
