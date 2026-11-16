import { PID, test } from './fixtures'
for (const [name, path] of [['project', ''], ['edit', '/edit'], ['style', '/style'], ['export', '/export'], ['play', '/play']] as const) {
  test('shot ' + name, async ({ page, backend }) => {
    void backend
    await page.goto('/projects/' + PID + path)
    await page.waitForTimeout(2500)
    await page.screenshot({ path: '/tmp/claude-0/-home-user-karaokesync-ai/92203b19-aa5b-571c-a274-bb3996bfe0e3/scratchpad/shots/' + name + '-' + test.info().project.name + '.png', fullPage: true })
  })
}
