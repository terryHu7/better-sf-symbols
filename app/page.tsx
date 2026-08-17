import { headers } from "next/headers";

import SymbolFlow from "./symbol-flow";
import { resolveLocale } from "./messages";

// The interface language is picked from the request — the reader's own choice
// first, the browser's guess after — so the first paint is already in the right
// language instead of every word on the page changing after hydration.
export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const locale = resolveLocale(requestHeaders.get("cookie"), requestHeaders.get("accept-language"));

  return <SymbolFlow initialLocale={locale} />;
}
