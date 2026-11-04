import { describe, expect, test } from 'bun:test'
import { PLUGIN_ID, pluginName } from './index.ts'

describe('myaid-plugin-core', () => {
  test('exports shell identity', () => {
    expect(PLUGIN_ID).toBe('myaid-core')
    expect(pluginName()).toBe('@myaid/myaid-plugin-core')
  })
})
