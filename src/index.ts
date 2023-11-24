import escape from 'escape-string-regexp';

type RequestMatcher = (spy: FetchSpyObject, request: Request) => boolean;

type MockedResponse = Response | Error | {
  status?: number;
  statusText?: string;
  headers?: HeadersInit;
  body?: unknown;
};

type FetchSpyObject = {
  matcher: RequestMatcher;
  response?: MockedResponse | ((spy: FetchSpyObject, request: Request) => Promise<MockedResponse>);
  calls: Request[];
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
  globalThis.fetch = <T extends Parameters<typeof pureFetch>>(...args: T) => {
    const request = getRequest(...args);
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
export function spy(matcherConfig: MatcherConfig, response?: MockedResponse | ((spy: FetchSpyObject, request: Request) => Promise<MockedResponse>)) {
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
    return (spy: FetchSpyObject, request: Request) => {
      return matchers.every(matcher => matcher(spy, request));
    }
  },
  method(method: string) {
    return (_: FetchSpyObject, request: Request) => {
      return request.method === method;
    }
  },
  origin(origin: string) {
    return (_: FetchSpyObject, request: Request) => {
      return new URL(request.url).origin === origin;
    }
  },
  pathname(pathname: string) {
    return (_: FetchSpyObject, request: Request) => {
      pathname = pathname.replace(/[\*\/]*$/, '') + '*';
      return new RegExp(escape(pathname).replace('\\*', '.*?')).test(new URL(request.url).pathname);
    }
  },
  queryparams(queryparams: Record<string, string>) {
    return (_: FetchSpyObject, request: Request) => {
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
function getRequest<T extends Parameters<typeof globalThis['fetch']>>(...args: T) {
  return args[0] instanceof Request ? new Request(args[0]) : new Request(args[0].toString());
}

/**
 * Create Response instance.
 */
async function getResponse(spy: FetchSpyObject, request: Request): Promise<Response> {
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
    status: response.status,
    statusText: response.statusText,
    headers: headers,
  }));
}
