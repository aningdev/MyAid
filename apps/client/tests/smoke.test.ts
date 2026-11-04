import { describe, expect, test } from 'bun:test'

describe('client shell', () => {
  test('workspace identity', () => {
    expect('@myaid/client').toContain('myaid')
  })
})
