import { test, expect, type APIRequestContext } from '@playwright/test';

// Crawler-access regression guard.
//
// middleware.ts matches every route except /_next/static, /_next/image,
// favicon.ico and /api/auth/session, and its matcher does NOT exclude
// .txt/.xml/.png. Before the fix, /robots.txt, /sitemap.xml and
// /og-image.png were therefore bounced to /auth/login: crawlers could never
// read the allowlist or the sitemap, and every social-share preview resolved
// og:image to an HTML login page.
//
// The fix allowlists '/robots.txt', '/sitemap.xml' and '/og-image.*' in
// `unAuthenticatedRoutes`. That regression previously had ZERO test coverage —
// no spec under tests/e2e/ referenced any of the three paths — so a fully
// green e2e run could not have caught it returning. These tests close that
// hole and must not be loosened to make them pass.
//
// FLAKINESS CONTRACT: the three files are static assets served from /public,
// so nothing here touches the database, the session or the signup flow. The
// requests go through the standalone `request` fixture, which shares no cookie
// jar with the browser context, so they are anonymous by construction.
// Redirects are NOT followed (maxRedirects: 0): a 3xx is observed as a 3xx
// instead of being silently absorbed into a 200 login page, which is the only
// way this spec can actually see the regression it exists to catch.
//
// The suite's baseURL is pinned to /en, so these tests build absolute URLs
// against the app origin — the same approach as locale.spec.ts.
const APP_URL = 'http://localhost:4002';

// The exact directive the committed public/robots.txt must keep advertising.
const SITEMAP_DIRECTIVE =
  /^Sitemap:\s*https:\/\/platform\.smartapro\.com\/sitemap\.xml\s*$/m;

// The exact regression shape: middleware answering with a redirect to the
// login page instead of the requested file.
const LOGIN_REDIRECT = /\/auth\/login/;

const PNG_MAGIC_BYTES = '89504e470d0a1a0a';

const CRAWLER_FILES = [
  {
    path: '/robots.txt',
    contentType: /^text\/plain/,
    description: 'robots allowlist',
  },
  {
    path: '/sitemap.xml',
    contentType: /xml/,
    description: 'sitemap',
  },
  {
    path: '/og-image.png',
    contentType: /^image\/png/,
    description: 'OpenGraph share image',
  },
] as const;

/** Fetches a crawler file anonymously without following redirects. */
const fetchCrawlerFile = (request: APIRequestContext, path: string) =>
  request.get(`${APP_URL}${path}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });

test.describe('crawler-facing files are reachable anonymously', () => {
  for (const { path, contentType, description } of CRAWLER_FILES) {
    test(`anonymous GET ${path} returns 200 with the ${description}`, async ({
      request,
    }) => {
      const response = await fetchCrawlerFile(request, path);

      expect(
        response.status(),
        `anonymous ${path} answered ${response.status()} instead of 200`
      ).toBe(200);
      expect(
        response.headers()['content-type'] ?? '',
        `anonymous ${path} was served with the wrong content type`
      ).toMatch(contentType);
      expect(
        (await response.body()).length,
        `anonymous ${path} returned an empty body`
      ).toBeGreaterThan(0);
    });
  }

  test('no crawler file is redirected to the login page (the PR #56 regression)', async ({
    request,
  }) => {
    for (const { path } of CRAWLER_FILES) {
      const response = await fetchCrawlerFile(request, path);
      const status = response.status();
      const location = response.headers()['location'] ?? '';

      // A 3xx here is the regression: crawlers get sent away from the file.
      expect(
        status >= 300 && status < 400,
        `anonymous ${path} answered ${status}${
          location ? ` -> ${location}` : ''
        }`
      ).toBe(false);

      // Named explicitly because this is the exact historical failure mode.
      expect(
        LOGIN_REDIRECT.test(location),
        `anonymous ${path} was redirected to the login page: ${location}`
      ).toBe(false);
    }
  });

  test('robots.txt advertises the production sitemap to crawlers', async ({
    request,
  }) => {
    const response = await fetchCrawlerFile(request, '/robots.txt');

    expect(response.status()).toBe(200);

    const body = await response.text();

    // A robots.txt crawlers can read but whose Sitemap directive is missing
    // leaves the site with no discoverable sitemap at all.
    expect(body).toMatch(/^User-agent:\s*\*\s*$/m);
    expect(body).toMatch(SITEMAP_DIRECTIVE);
  });

  test('sitemap.xml is a well-formed urlset served to anonymous crawlers', async ({
    request,
  }) => {
    const response = await fetchCrawlerFile(request, '/sitemap.xml');

    expect(response.status()).toBe(200);

    const body = await response.text();

    expect(body).toContain('<urlset');
    expect(body).toContain('</urlset>');
    // An empty <urlset/> would satisfy the tags alone, so the landing URLs
    // must actually be enumerated for the sitemap to be useful.
    expect(body.match(/<loc>/g) ?? []).not.toHaveLength(0);
    expect(body).toMatch(/<loc>https:\/\/platform\.smartapro\.com\//);
  });

  test('og-image.png is served as real PNG bytes, so share previews render', async ({
    request,
  }) => {
    const response = await fetchCrawlerFile(request, '/og-image.png');

    expect(response.status()).toBe(200);

    const body = await response.body();

    // PNG magic number: proves the image itself reached the crawler rather
    // than an HTML page that merely claimed an image content type.
    expect(body.subarray(0, 8).toString('hex')).toBe(PNG_MAGIC_BYTES);
  });
});
