import type { FetchContext } from "../src/adapters/types.js";

type Route = { body: string; status?: number; headers?: Record<string, string> };

/** Fake fetch: routes by URL predicate; records every requested URL. */
export function fakeFetch(routes: Array<[(url: string) => boolean, Route]>) {
  const calls: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    const route = routes.find(([match]) => match(url))?.[1];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body, { status: route.status ?? 200, headers: route.headers });
  }) as typeof globalThis.fetch;
  return { fn, calls };
}

export function ctx(overrides: Partial<FetchContext> & Pick<FetchContext, "fetch">): FetchContext {
  return {
    since: new Date("2026-11-10T00:00:00Z"),
    isKnownUrl: () => false,
    log: () => {},
    ...overrides,
  };
}
