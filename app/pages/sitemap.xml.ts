import type { GetServerSideProps } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hormuz.live";

function sitemap(urls: Array<{ loc: string; priority: string; changefreq: string }>) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const xml = sitemap([
    { loc: `${SITE_URL}/`,        priority: "1.0", changefreq: "daily"   },
    { loc: `${SITE_URL}/monitor`, priority: "0.9", changefreq: "always"  },
    { loc: `${SITE_URL}/markets`, priority: "0.7", changefreq: "hourly"  },
  ]);

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
  res.write(xml);
  res.end();
  return { props: {} };
};

export default function SitemapXml() { return null; }
