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
  await expect(page.getByRole('button', { name: 'Open inference chat' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Compute providers' })).toBeHidden()
  await page.getByTestId('nav-chat').click()
  await expect(page.getByTestId('chat-input')).toBeVisible()
  await page.getByTestId('nav-compute').click()
  await expect(page.getByTestId('compute-screen')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Local node identity' })).toBeVisible()
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
    await expect(page.getByText('Node owner not verified')).toBeVisible()
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
  await expect(page.getByText('Node owner not verified')).toBeVisible()
  await page.evaluate(() => (window as unknown as { failCompute: () => void }).failCompute())
  await expect(page.getByText('Node owner not verified')).toBeVisible({ timeout: 12000 })
  await expect(page.getByText('dedicated-owner-node', { exact: true })).toHaveCount(0, {
    timeout: 12000,
  })
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

test('hardware details distinguish advertised memory from running models and trap focus', async ({
  page,
}) => {
  await installMockBackend(page, {
    startRunning: true,
    peers: [
      {
        id: 'gpu-1',
        hostname: 'Rented GPU',
        role: 'Host',
        state: 'ready',
        gpus: [
          {
            name: 'RTX PRO 6000',
            vram_bytes: 96e9,
            reserved_bytes: 8e9,
            allocatable_vram_bytes: 88e9,
          },
        ],
        hosted_models_known: true,
        hosted_models: ['Qwen 27B'],
        serving_models: ['Assigned only'],
        available_models: ['Cached model'],
      },
    ],
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  await expect(page.getByRole('button', { name: /Rented GPU/ })).toContainText('96 GB')
  await expect(page.getByRole('button', { name: 'Manage mesh' })).toHaveCount(0)
  await page.getByRole('button', { name: /Rented GPU/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Node details: Rented GPU' })
  await expect(dialog).toContainText('88 GB')
  await expect(dialog).toContainText('Qwen 27B')
  await expect(dialog).toContainText('it is not a live measurement')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Rented GPU/ })).toBeFocused()
})

test('offers are filtered by per-GPU memory and booking requires a fresh quote', async ({
  page,
}) => {
  await installMockBackend(page, { startRunning: true })
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (input, init) => {
      if (String(input) === '/app/rentals') return Response.json({ configured: true, rental: null })
      if (String(input) === '/app/compute/offers')
        return Response.json({
          observed_at: 1800000000,
          disk_gb: 80,
          offers: [
            {
              id: 7,
              gpu_name: 'RTX PRO 6000',
              qualified_for_profile: true,
              gpu_count: 1,
              gpu_memory_mib: 96 * 1024,
              host_memory_mib: 128 * 1024,
              location: 'US',
              compute_micro_usd_per_hour: 1200000,
              storage_micro_usd_per_hour: 20000,
              transfer_micro_usd_per_gb: 1000,
            },
          ],
        })
      if (String(input) === '/app/rentals/quote')
        return Response.json(
          { error: 'The mesh changed. Review the instance again.' },
          { status: 409 },
        )
      return original(input, init)
    }
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  await page.getByRole('button', { name: 'Add compute', exact: true }).click()
  await expect(page.getByText('Estimated fit: 70B · 4-bit')).toBeVisible()
  await page.getByRole('button', { name: 'Review instance' }).click()
  await expect(page.getByRole('button', { name: 'Confirm rental' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Check availability & budget' }).click()
  await expect(page.getByRole('alert')).toContainText('The mesh changed')
  await expect(page.getByRole('button', { name: 'Confirm rental' })).toHaveCount(0)
})

test('SVG context menus are suppressed while primary navigation clicks work', async ({ page }) => {
  await installMockBackend(page, { startRunning: true })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  const button = page.getByRole('button', { name: 'Add compute', exact: true })
  expect(
    await button
      .locator('svg')
      .evaluate(
        (element) =>
          !element.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
          ),
      ),
  ).toBe(true)
  await button.locator('svg').click()
  await expect(page.getByRole('heading', { name: 'Add compute' })).toBeVisible()
})

test('booking confirms a bounded quote and removal remains pending until evidence arrives', async ({
  page,
}) => {
  await installMockBackend(page, { startRunning: true })
  await page.addInitScript(() => {
    const original = window.fetch
    let active = false,
      removing = false
    window.fetch = async (input, init) => {
      const path = String(input)
      if (path === '/app/compute/offers')
        return Response.json({
          observed_at: 1800000000,
          disk_gb: 80,
          offers: [
            {
              id: 7,
              gpu_name: 'RTX PRO 6000',
              gpu_count: 1,
              gpu_memory_mib: 96 * 1024,
              host_memory_mib: 128 * 1024,
              location: 'US',
              compute_micro_usd_per_hour: 1200000,
              storage_micro_usd_per_hour: 20000,
              transfer_micro_usd_per_gb: 1000,
              qualified_for_profile: true,
            },
          ],
        })
      if (path === '/app/rentals/quote')
        return Response.json({
          quote_id: 'reviewed',
          cap_micro_usd: 6000000,
          expires_at: Date.now() / 1000 + 30,
          model: 'Qwen 27B',
        })
      if (path === '/app/rentals/launch') {
        if (JSON.parse(String(init?.body)).quote_id !== 'reviewed')
          return new Response('', { status: 409 })
        active = true
        return Response.json({ accepted: true })
      }
      if (path === '/app/rentals/remove') {
        removing = true
        return Response.json({ removal_requested: true, removed: false })
      }
      if (path === '/app/rentals')
        return Response.json({
          configured: true,
          rental: active
            ? {
                offer_id: 7,
                target: { mesh_id: 'mesh-a', node_id: 'local' },
                expires_at: Date.now() / 1000 + 1200,
                stage: removing ? 'removal_requested' : 'provisioning_or_running',
              }
            : null,
        })
      return original(input, init)
    }
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  await page.getByRole('button', { name: 'Add compute', exact: true }).click()
  await page.getByRole('button', { name: 'Review instance' }).click()
  await page.getByRole('button', { name: 'Check availability & budget' }).click()
  await expect(page.getByText(/Maximum lease budget \$6.00/)).toBeVisible()
  await page.getByRole('button', { name: 'Confirm rental' }).click()
  await expect(page.getByRole('region', { name: 'Owned rentals' })).toContainText(
    'Provisioning or running',
  )
  await page.getByRole('button', { name: 'Remove compute', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm removal' }).click()
  await expect(page.getByRole('region', { name: 'Owned rentals' })).toContainText(
    'awaiting confirmation',
  )
  await expect(page.getByText('Removal confirmed', { exact: true })).toHaveCount(0)
})

test('owned node details lead to the exact rental controls', async ({ page }) => {
  await installMockBackend(page, {
    startRunning: true,
    peers: [{ id: 'owned-host', hostname: 'My rented GPU', role: 'Host', state: 'serving' }],
  })
  await page.addInitScript(() => {
    const original = window.fetch
    window.fetch = async (input, init) =>
      String(input) === '/app/rentals'
        ? Response.json({
            configured: true,
            rental: {
              node_id: 'owned-host',
              instance_id: 123,
              offer_id: 7,
              target: { mesh_id: 'mesh-a', node_id: 'local' },
              expires_at: Date.now() / 1000 + 1200,
              stage: 'provisioning_or_running',
            },
          })
        : original(input, init)
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  await page.getByRole('button', { name: 'Inspect node', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Node details: My rented GPU' })
  await expect(dialog).not.toContainText('not bound to an owned rental')
  await dialog.getByRole('button', { name: 'Manage rented compute' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Owned rentals' })).toContainText('instance 123')
  await expect(page.getByRole('button', { name: 'Remove compute', exact: true })).toBeVisible()
})

test('Home groups rotated invites by mesh identity without merging equal names', async ({
  page,
}) => {
  await installMockBackend(page)
  await page.addInitScript(() => {
    const original = window.fetch
    const token = (node: string) =>
      btoa(JSON.stringify({ id: node, addrs: ['synthetic-address-padding'] })).replace(/=/g, '')
    window.fetch = async (input, init) =>
      String(input) === '/app/meshes'
        ? Response.json([
            {
              name: 'Studio',
              mesh_id: 'mesh-one',
              config: { kind: 'join', token: token('new-node'), share: false },
            },
            {
              name: 'Studio',
              mesh_id: 'mesh-one',
              config: { kind: 'join', token: token('old-node'), share: false },
            },
            {
              name: 'Studio',
              mesh_id: 'mesh-two',
              config: { kind: 'join', token: token('another-node'), share: false },
            },
          ])
        : original(input, init)
  })
  await page.goto('/')
  await expect(page.getByTestId('recent-mesh')).toHaveCount(2)
})

test('token-only readiness is labeled and failed polling retains removal controls', async ({
  page,
}) => {
  await installMockBackend(page, { startRunning: true })
  await page.addInitScript(() => {
    const original = window.fetch
    let polls = 0
    window.fetch = async (input, init) => {
      if (String(input) === '/app/rentals') {
        if (++polls > 1) return Response.json({ error: 'unavailable', rental: null })
        return Response.json({
          configured: true,
          admission: 'token-only-provider-trusted',
          rental: {
            offer_id: 7,
            instance_id: 123,
            target: { mesh_id: 'mesh-a', node_id: 'local' },
            expires_at: Date.now() / 1000 + 1200,
            stage: 'token_inference_verified',
            certificate_verified: false,
          },
        })
      }
      return original(input, init)
    }
  })
  await page.goto('/')
  await page.getByTestId('nav-compute').click()
  const rental = page.getByRole('region', { name: 'Owned rentals' })
  await expect(rental).toContainText('Token-only mesh inference verified · not owner-certified')
  await expect(rental).toContainText('Rental status unavailable', { timeout: 10000 })
  await expect(rental.getByRole('button', { name: 'Remove compute', exact: true })).toBeVisible()
  await expect(rental).not.toContainText('Removal confirmed')
})
