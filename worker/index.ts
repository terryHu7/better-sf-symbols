/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

/**
 * Security headers for documents this Worker renders itself.
 *
 * `public/_headers` cannot do this job. Cloudflare applies that file to *static
 * asset* responses only, and the HTML here is server-rendered by the Worker, so
 * it never passes through the asset pipeline — verified against the live
 * deployment, where `/symbols/*.png` came back with its immutable cache header
 * and `/` came back with no CSP at all.
 *
 * That gap matters more than usual for this site: the interface tells the
 * reader their text never leaves the browser, and `connect-src 'self'` is what
 * makes that a rule the browser enforces rather than a claim we make. Keep the
 * two in sync — `_headers` still owns caching and the asset responses.
 *
 * `unsafe-inline` is required, not preferred: the SSR output carries inline
 * <script> blocks holding the React payload, hashes change every build, and
 * vinext has no nonce support. Without it the page never hydrates.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

function withSecurityHeaders(response: Response): Response {
  if (!response.headers.get("content-type")?.includes("text/html")) return response;

  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  // So the *next* visit never starts in plaintext, whatever the reader types or
  // whatever link they follow. The redirect below only fixes the request it is
  // handed; this fixes the ones after it, inside the browser, before anything
  // is sent. Deliberately no `preload` — that submission is hard to undo.
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    /**
     * workers.dev answers on plain HTTP as readily as on HTTPS, and this page
     * tells the reader that what they paste never leaves their browser. Over
     * http that sentence is unenforceable: everything the promise rests on —
     * the CSP, the script that would have to break it — arrives in the clear
     * and can be rewritten in transit by anything on the path. The header is
     * ours, so an attacker simply sends their own.
     *
     * It is not only the promise. `navigator.clipboard` is gated on a secure
     * context, so on http the copy button silently falls back to the
     * execCommand route for every visitor.
     *
     * 301 rather than 302: this is permanent, and it is what lets a browser
     * skip the plaintext hop next time even before the HSTS header lands.
     *
     * Loopback is exempt, and not as a convenience: there is no transit between
     * a local server and the browser on the same machine, so there is nothing
     * to protect — and `wrangler dev` and the SSR tests both speak http to
     * localhost, which this would otherwise turn into a redirect loop.
     */
    const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol === "http:" && !loopback) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
};

export default worker;
