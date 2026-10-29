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
