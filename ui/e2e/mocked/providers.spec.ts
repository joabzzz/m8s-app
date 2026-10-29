import { expect, test } from '@playwright/test'
import { installMockBackend } from '../support/mock-backend'

test('Compute onboards Vast without retaining the key in browser storage', async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.addInitScript(() => {
    const original = window.fetch
    let configured = false
    window.fetch = async (input, init) => {
      const path = String(input)
      if (path === '/app/providers')
        return Response.json({
          vast: { configured, account_id: configured ? 42 : undefined },
          controller_ready: true,
        })
      if (path === '/app/providers/vast') {
        if (JSON.parse(String(init?.body)).api_key !== 'synthetic-key-123456')
          return new Response('', { status: 400 })
        configured = true
        return Response.json({ configured: true, account_id: 42 })
      }
      if (path === '/app/providers/open') return Response.json({ opened: true })
      if (path === '/app/providers/vast/disconnect') {
        configured = false
        return Response.json({ disconnected: true })
      }
      return original(input, init)
    }
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  await expect(page.getByRole('region', { name: 'Compute providers' })).toContainText(
    'Not connected',
  )
  await expect(page.getByText('Nebius', { exact: true })).toBeVisible()
  await expect(page.getByText('Coming soon', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add compute', exact: true }).click()
  await page.getByLabel('Vast API key', { exact: true }).fill('synthetic-key-123456')
  await page.getByRole('button', { name: 'Verify & connect' }).click()
  await expect(page.getByRole('status')).toContainText('account 42')
  await expect(page.getByLabel('Vast API key', { exact: true })).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    ),
  ).not.toContain('synthetic-key')
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm disconnect' }).click()
  await expect(page.getByRole('region', { name: 'Compute providers' })).toContainText(
    'Not connected',
  )
})

test('Settings exposes setup while detached and failed verification does not mark connected', async ({
  page,
}) => {
  await installMockBackend(page)
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (input, init) => {
      if (String(input) === '/app/providers')
        return Response.json({ vast: { configured: false }, controller_ready: true })
      if (String(input) === '/app/providers/vast')
        return Response.json({ error: 'Vast rejected this API key.' }, { status: 409 })
      return original(input, init)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Manage compute providers' }).click()
  await page.getByRole('button', { name: 'Connect Vast', exact: true }).click()
  await page.getByLabel('Vast API key', { exact: true }).fill('synthetic-rejected-key')
  await page.getByRole('button', { name: 'Verify & connect' }).click()
  await expect(page.getByRole('alert')).toContainText('Vast rejected')
  await expect(page.getByLabel('Vast API key', { exact: true })).toHaveValue('')
  await expect(page.getByRole('region', { name: 'Compute providers' })).toContainText(
    'Not connected',
  )
  await expect(page.getByTestId('nav-compute')).toHaveCount(0)
})

test('managed rentals expose provider controls without pretending to offer terminal or pause', async ({
  page,
}) => {
  await installMockBackend(page, { startRunning: true })
  await page.addInitScript(() => {
    const original = window.fetch
    Object.assign(window, { providerDestination: '' })
    window.fetch = async (input, init) => {
      if (String(input) === '/app/rentals')
        return Response.json({
          configured: true,
          rental: {
            instance_id: 123,
            offer_id: 7,
            target: { mesh_id: 'synthetic-mesh', node_id: 'local' },
            expires_at: Date.now() / 1000 + 900,
            stage: 'preparing_model',
          },
        })
      if (String(input) === '/app/providers/open') {
        Object.assign(window, { providerDestination: JSON.parse(String(init?.body)).target })
        return Response.json({ opened: true })
      }
      return original(input, init)
    }
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  const rental = page.getByRole('region', { name: 'Owned rentals' })
  await rental.getByRole('button', { name: 'Connection details' }).click()
  await expect(rental).toContainText('cannot open an interactive terminal')
  await expect(rental).toContainText('Pause/resume is unavailable')
  await rental.getByRole('button', { name: 'Open Vast console' }).click()
  expect(
    await page.evaluate(
      () => (window as unknown as { providerDestination: string }).providerDestination,
    ),
  ).toBe('vast_console')
  await expect(rental.getByRole('button', { name: 'Copy instance ID' })).toBeVisible()
  await expect(rental.getByRole('button', { name: 'Remove compute', exact: true })).toBeVisible()
})
