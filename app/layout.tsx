import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

import { brandName, messages, resolveLocale, siteOrigin } from "./messages";

/**
 * The page is dark to the edge of the glass, and on a phone the browser's own
 * bars are part of that edge — without this, Safari framed a near-black page in
 * light grey chrome. `color-scheme` is the same statement made to the form
 * controls, so the select and the scrollbars are drawn dark too.
 */
export const viewport: Viewport = {
  themeColor: "#07090c",
  colorScheme: "dark",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  // Fixed, not taken from the request: see the note on `siteOrigin`. Everything
  // below that carries a URL — the canonical link, og:url, the share image — is
  // a claim about which address this page *is*, and a claim that agrees with
  // whoever asked is not a claim.
  const metadataBase = new URL(siteOrigin);
  const locale = resolveLocale(requestHeaders.get("cookie"), requestHeaders.get("accept-language"));
  const { title, description, imageAlt, ogLocale } = messages[locale].meta;
  const image = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title,
    description,
    // One page, one address. Without this the same card can be shared under a
    // preview host, a trailing slash and the canonical name as three documents.
    alternates: { canonical: "/" },
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
      // Added to the home screen, iOS otherwise shows a screenshot of the page.
      apple: "/favicon.png",
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: metadataBase.toString(),
      siteName: brandName,
      locale: ogLocale,
      // Width and height are what let Slack, X and WeChat commit to the large
      // card immediately instead of fetching the image to find out how big it
      // is — and deciding on a small one when that fetch is slow.
      images: [{ url: image, width: 1200, height: 630, alt: imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: imageAlt }],
    },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = resolveLocale(requestHeaders.get("cookie"), requestHeaders.get("accept-language"));

  // The client switch rewrites this attribute when the reader picks a language.
  //
  // suppressHydrationWarning is for a second, deliberate edit to this element:
  // `columnBootScript` writes the stored column widths onto <html> as custom
  // properties before React loads, so the first frame is the reader's layout
  // rather than the default one. React finds a style attribute it did not
  // render, leaves it alone (which is what we want) and logs a mismatch about
  // it. The flag is scoped to this element's own attributes — every child is
  // still checked normally.
  return (
    <html lang={messages[locale].htmlLang} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
