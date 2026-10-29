import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test('Home is the landing page and mesh tabs are hidden while detached', async ({ page }) => {
  await installMockBackend(page)
  await page.goto('/')
  await expect(page.getByTestId('welcome-public')).toBeVisible()
  await expect(page.getByTestId('nav-chat')).toHaveCount(0)
  await expect(page.getByTestId('nav-compute')).toHaveCount(0)
  await expect(page.getByTestId('compute-screen')).toHaveCount(0)
})

test('operator can open chat and return to compute without leaving the mesh', async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  await page.getByRole('button', { name: 'Inference', exact: true }).click()
  await page.getByRole('button', { name: 'Open inference chat' }).click()
  await expect(page.getByTestId('chat-input')).toBeVisible()
  await page.getByTestId('nav-compute').click()
  await expect(page.getByTestId('compute-screen')).toBeVisible()
  await expect(page.getByText('Connection active')).toBeVisible()
})

for (const serving of [false, true]) {
  test(`fleet identifies ${serving ? 'host' : 'passive client'} without granting rental authority`, async ({
    page,
  }, testInfo) => {
    await installMockBackend(page, { startRunning: true, runningPhase: { serving, mode: 'join' } })
    await page.goto('/')
    await page.getByTestId('nav-compute').click()
    await expect(
      page.getByText(serving ? 'Inference host' : 'Passive client', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Owner attachment required')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('fleet.png'), fullPage: true })
  })
}

test('managed fleet uses its owner and drops stale authority when polling fails', async ({
  page,
}) => {
  await installMockBackend(page, { startRunning: true })
  await page.addInitScript(() => {
    const original = window.fetch
    let failed = false
    Object.assign(window, {
      failCompute: () => {
        failed = true
      },
    })
    window.fetch = async (input, init) => {
      if (String(input) === '/app/compute') {
        if (failed) return new Response('', { status: 503 })
        return Response.json({
          enabled: true,
          stage: 'ready',
          cap_micro_usd: 1_200_000,
          node: { node_id: 'dedicated-owner-node', peers: [] },
          expires_at: null,
        })
      }
      return original(input, init)
    }
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  await expect(page.getByText('dedicated-owner-node', { exact: true })).toBeVisible()
  await expect(page.getByText('Owner verified · dedicated mesh')).toBeVisible()
  await page.evaluate(() => (window as unknown as { failCompute: () => void }).failCompute())
  await expect(page.getByText('Owner attachment required')).toBeVisible({ timeout: 12000 })
  await expect(page.getByText('dedicated-owner-node', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Managed client disconnected')).toBeVisible()
})

test('private mesh starts as a passive client without model setup', async ({ page }) => {
  await installMockBackend(page)
  await page.goto('/')
  await page.getByTestId('welcome-host').click()
  await page.getByTestId('private-continue').click()
  await expect(page.getByTestId('mesh-live-screen')).toBeVisible()
  await expect(page.getByText(/This Mac is a passive client/)).toBeVisible()
  const calls = await page.evaluate(
    () => (window as unknown as { __mockState: { hostCalls: unknown[] } }).__mockState.hostCalls,
  )
  expect(calls).toEqual([{ visibility: 'private', mesh_name: null }])
  await page.getByTestId('go-to-chat').click()
  await page.getByTestId('nav-home').click()
  await expect(page.getByRole('region', { name: 'Your meshes' })).toContainText('Connected')
  await page.getByTestId('nav-compute').click()
  await expect(page.getByTestId('compute-screen')).toBeVisible()
})

test('a rejected public join shows an error instead of an endless spinner', async ({ page }) => {
  await installMockBackend(page)
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (input, init) =>
      String(input) === '/app/join'
        ? Response.json({ error: 'busy' }, { status: 409 })
        : original(input, init)
  })
  await page.goto('/')
  await page.getByTestId('welcome-public').click()
  await page.getByTestId('public-continue').click()
  await expect(page.getByTestId('error-screen')).toContainText('409')
})

test('Home discovers local meshes and offers remembered connections', async ({ page }) => {
  await installMockBackend(page)
  await page.addInitScript(() => {
    const original = window.fetch
    const token = btoa(JSON.stringify({ mesh_id: 'synthetic-local-mesh', bootstrap: [] })).replace(
      /=/g,
      '',
    )
    window.fetch = async (input, init) => {
      if (String(input) === '/app/meshes')
        return Response.json(
          init?.method === 'POST'
            ? { ok: true }
            : [{ name: 'Saved public mesh', config: { kind: 'public', share: false } }],
        )
      if (String(input) === '/app/local-meshes')
        return Response.json({
          instances: [
            {
              pid: 123,
              node_id: 'synthetic-local-node',
              name: 'Studio mesh',
              role: 'Passive client',
              is_self: false,
              token,
            },
          ],
        })
      return original(input, init)
    }
  })
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Your meshes' })).toContainText('Studio mesh')
  await expect(page.getByTestId('recent-mesh')).toContainText('Saved public mesh')
  await expect(page.getByTestId('nav-compute')).toHaveCount(0)
  await page.getByRole('button', { name: 'Join mesh', exact: true }).click()
  await expect(page.getByTestId('nav-compute')).toBeVisible()
  await page.getByTestId('nav-home').click()
  await expect(page.getByRole('region', { name: 'Your meshes' })).toContainText('Connected')
})
