import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test('compute overview distinguishes unavailable data and planned providers', async ({ page }) => {
  await installMockBackend(page)
  await page.goto('/')
  await expect(page.getByTestId('compute-screen')).toBeVisible()
  await expect(page.getByText('Bring your compute into view')).toBeVisible()
  await page.getByRole('button', { name: 'Providers', exact: true }).click()
  await expect(page.getByText('Planned adapter')).toBeVisible()
  await page.getByRole('button', { name: 'Inference', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open inference chat' })).toBeDisabled()
})

test('operator can open chat and return to compute without leaving the mesh', async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'Inference', exact: true }).click()
  await page.getByRole('button', { name: 'Open inference chat' }).click()
  await expect(page.getByTestId('chat-input')).toBeVisible()
  await page.getByRole('button', { name: 'Open compute workspace' }).click()
  await expect(page.getByTestId('compute-screen')).toBeVisible()
  await expect(page.getByText('Connection active')).toBeVisible()
})

for (const serving of [false, true]) {
  test(`fleet identifies ${serving ? 'host' : 'passive client'} without granting rental authority`, async ({
    page,
  }, testInfo) => {
    await installMockBackend(page, { startRunning: true, runningPhase: { serving, mode: 'join' } })
    await page.goto('/')
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
  await expect(page.getByText('dedicated-owner-node', { exact: true })).toBeVisible()
  await expect(page.getByText('Owner verified · dedicated mesh')).toBeVisible()
  await page.evaluate(() => (window as unknown as { failCompute: () => void }).failCompute())
  await expect(page.getByText('Owner attachment required')).toBeVisible({ timeout: 12000 })
  await expect(page.getByText('dedicated-owner-node', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Managed client disconnected')).toBeVisible()
})
