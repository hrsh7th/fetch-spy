fetch-spy
============================================================

simple fetch mocking module.

Usage
------------------------------------------------------------

```ts
import * as FetchSpy from 'fetch-spy';

describe('test', () => {
  beforeEach(() => {
    FetchSpy.reset()
  })

  it('should work' () => {
    const spy = FetchSpy.spy({ method: 'GET', pathname: '/foo/bar/*' }, new Response(JSON.stringify({
      foo: 'bar'
    }), { status: 200 }));
    await complexFunction();
    expect(spy.calls).toMatchSnapshot([{
      url: '/foo/bar'
    }]);
  })
})
```

