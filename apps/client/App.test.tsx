// `nsh test` runs this in a headless runner built with the crate:
// count lives in Rust (`Counter`), wording too (`Format.times`).
import { expect, open, test } from 'nsh/test'

test('counts presses', async () => {
  const app = await open('./App.tsx')
  expect(app.texts()).toContain('Not pressed yet')
  await app.press('Press me')
  await app.press('Press me')
  expect(app.texts()).toContain('Pressed twice')
})
