import escape from 'escape-string-regexp';

type RequestMatcher = (spy: FetchSpyObject, request: RequestDetails) => boolean;

type RequestDetails = {
  url: string;
  method: string;
} & {
    [K in keyof Omit<RequestInit, 'method'>]-?: RequestInit[K] | undefined | null
  };

type MockedResponse = Response | Error | {
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
  body?: unknown;
};

type FetchSpyObject = {
  matcher: RequestMatcher;
  response: MockedResponse | ((spy: FetchSpyObject, request: RequestDetails) => Promise<MockedResponse>) | undefined;
  calls: RequestDetails[];
  once: boolean;
}

type MatcherConfig = {
  [K in keyof Omit<typeof matchers, 'compose'>]?: Parameters<typeof matchers[K]>[0];
};

/**
 * Global state.
 */
const state = {
  spies: [] as FetchSpyObject[],
}

/**
 * patching globalThis.fetch to spy fetch request.
 */
{
  const pureFetch = globalThis.fetch;
  globalThis.fetch = async <T extends Parameters<typeof pureFetch>>(...args: T) => {
    const request = await getRequestDetails(...args);
    for (const spy of state.spies) {
      if (spy.matcher(spy, request)) {
        spy.calls.push(request);
        if (spy.response) {
          return getResponse(spy, request);
        }
      }
    }
    return pureFetch.call(globalThis, ...args);
  };
}

/**
 * Resolve all spies.
 */
export function reset() {
  state.spies = [];
}

/**
 * Spy fetch request.
 */
export function spy(matcherConfig: MatcherConfig, response?: MockedResponse | ((spy: FetchSpyObject, request: RequestDetails) => Promise<MockedResponse>)) {
  const spy: FetchSpyObject = {
    matcher: matcher(matcherConfig),
    response,
    calls: [],
    once: false
  }
  state.spies.push(spy);
  return {
    calls: spy.calls
  }
}

/**
 * Create matcher.
 */
function matcher(config: MatcherConfig) {
  const fns: RequestMatcher[] = [];
  if (typeof config.method !== 'undefined') {
    fns.push(matchers.method(config.method));
  }
  if (typeof config.origin !== 'undefined') {
    fns.push(matchers.origin(config.origin));
  }
  if (typeof config.pathname !== 'undefined') {
    fns.push(matchers.pathname(config.pathname));
  }
  if (typeof config.queryparams !== 'undefined') {
    fns.push(matchers.queryparams(config.queryparams));
  }
  return matchers.compose(...fns);
}

/**
 * Matching helpers.
 */
const matchers = {
  compose(...matchers: RequestMatcher[]) {
    return (spy: FetchSpyObject, request: RequestDetails) => {
      return matchers.every(matcher => matcher(spy, request));
    }
  },
  method(method: string) {
    return (_: FetchSpyObject, request: RequestDetails) => {
      return request.method.toLowerCase() === method.toLowerCase();
    }
  },
  origin(origin: string) {
    return (_: FetchSpyObject, request: RequestDetails) => {
      return new URL(request.url).origin === origin;
    }
  },
  pathname(pathname: string) {
    return (_: FetchSpyObject, request: RequestDetails) => {
      pathname = pathname.replace(/[\*\/]*$/, '') + '*';
      return new RegExp(escape(pathname).replace('\\*', '.*?')).test(new URL(request.url).pathname);
    }
  },
  queryparams(queryparams: Record<string, string>) {
    return (_: FetchSpyObject, request: RequestDetails) => {
      const url = new URL(request.url);
      for (const [key, value] of Object.entries(queryparams)) {
        if (url.searchParams.get(key) !== value) {
          return false;
        }
      }
      return true;
    }
  },
};

/**
 * Create Request instance.
 */
async function getRequestDetails<T extends Parameters<typeof globalThis['fetch']>>(...args: T): Promise<RequestDetails> {
  if (args[0] instanceof Request) {
    const arg0 = args[0] as Request;
    return {
      url: arg0.url,
      method: arg0.method,
      body: await arg0.clone().text(),
      mode: arg0.mode,
      cache: arg0.cache,
      signal: arg0.signal,
      credentials: arg0.credentials,
      headers: arg0.headers,
      referrer: arg0.referrer,
      referrerPolicy: arg0.referrerPolicy,
      integrity: arg0.integrity,
      redirect: arg0.redirect,
      keepalive: arg0.keepalive,
      window: null,
    };
  }
  if (typeof args[1] === 'object') {
    return {
      url: args[0].toString(),
      method: args[1].method ?? 'GET',
      body: args[1].body,
      mode: args[1].mode,
      cache: args[1].cache,
      signal: args[1].signal,
      credentials: args[1].credentials,
      headers: args[1].headers,
      referrer: args[1].referrer,
      referrerPolicy: args[1].referrerPolicy,
      integrity: args[1].integrity,
      redirect: args[1].redirect,
      keepalive: args[1].keepalive,
      window: args[1].window,
    };
  }
  return {
    url: args[0].toString(),
    method: 'GET',
    body: null,
    mode: null,
    cache: null,
    signal: null,
    credentials: null,
    headers: null,
    referrer: null,
    referrerPolicy: null,
    integrity: null,
    redirect: null,
    keepalive: null,
    window: null,
  }
}

/**
 * Create Response instance.
 */
async function getResponse(spy: FetchSpyObject, request: RequestDetails): Promise<Response> {
  if (!spy.response) {
    throw new Error('spy.response is undefined');
  }

  const response = typeof spy.response === 'function' ? (await spy.response(spy, request)) : spy.response;
  if (response instanceof Error) {
    return Promise.reject(response);
  }
  if (response instanceof Response) {
    return Promise.resolve(response);
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json');
  return Promise.resolve(new Response(JSON.stringify(response.body), {
    status: response.status!,
    statusText: response.statusText!,
    headers: headers!,
  }));
}
