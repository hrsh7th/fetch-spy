import { describe, it, expect } from 'vitest'
import * as FetchSpy from './index.js'

describe('fetch-spy', () => {
  it('should work', async () => {
    const spy = FetchSpy.spy({ pathname: '/foo' }, { body: 'foo' })
    await fetch('https://localhost/foo', {
      method: 'GET',
    })
    expect(spy.calls[0]).toMatchObject({
      method: 'GET',
      url: 'https://localhost/foo',
    })
  })
})
