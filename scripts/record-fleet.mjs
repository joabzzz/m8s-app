// Live showcase capture of the current-mesh UI. Never substitutes mock responses.
// Requires a separately reconciled, bounded rental plan in the running app.
import { chromium } from '../ui/node_modules/playwright/index.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
const [flag, output] = process.argv.slice(2)
if (flag !== '--live' || !output || !path.isAbsolute(output)) throw Error('Usage: record-fleet.mjs --live /absolute/new-private-output')
const base = 'http://127.0.0.1:4640'
const read = async route => {
  const r = await fetch(base + route, { signal: AbortSignal.timeout(30000) })
  if (!r.ok) throw Error(`Read failed: ${route}`)
  return r.json()
}
const initial = await read('/api/status')
const rentals = await read('/app/rentals')
const tokenMode = rentals.admission === 'token-only-provider-trusted'
if ((!tokenMode && !initial.owner?.verified) || !initial.is_client || initial.is_host || initial.peers?.length || !rentals.configured || rentals.rental) throw Error('Expected verified passive mesh with no peers and an unused rental plan')
await fs.mkdir(output, { mode: 0o700 })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(output, 'video'), size: { width: 1440, height: 900 } } })
const page = await context.newPage()
page.setDefaultTimeout(30000)
const started = Date.now(), timeline = []
const save = (name, value) => fs.writeFile(path.join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 })
const mark = async event => { timeline.push({ event, seconds: (Date.now()-started)/1000 }); await save('timeline.json', timeline); console.log(event) }
const hold = ms => new Promise(resolve => setTimeout(resolve, ms))
let requested = false, passed = false, removed = false
try {
  await page.goto(base)
  await page.getByTestId('nav-compute').click()
  await mark('fleet')
  await hold(3000)
  await page.getByRole('button', { name: 'Providers', exact: true }).click()
  await hold(2500)
  await mark('providers')
  await page.getByRole('button', { name: 'Fleet', exact: true }).click()
  const offersResponse = page.waitForResponse(r => r.url().endsWith('/app/compute/offers'))
  await page.getByRole('button', { name: 'Add compute', exact: true }).click()
  const catalog = await (await offersResponse).json()
  await page.getByRole('button', { name: 'Review instance', exact: true }).first().waitFor()
  await mark('browse')
  await hold(3000)
  const excluded = new Set((process.env.M8S_RECORD_SKIP_OFFERS ?? '').split(',').map(Number))
  const candidates = catalog.offers.map((offer,index)=>({offer,index})).filter(x=>x.offer.qualified_for_profile && !excluded.has(x.offer.id))
    .sort((a,b)=>a.offer.compute_micro_usd_per_hour-b.offer.compute_micro_usd_per_hour)
  let chosen
  for (const candidate of candidates.slice(0,8)) {
    await page.getByRole('button', { name: 'Review instance', exact: true }).nth(candidate.index).click()
    const response = page.waitForResponse(r=>r.url().endsWith('/app/rentals/quote'))
    await page.getByRole('button', { name: 'Check availability & budget' }).click()
    const r = await response
    if (r.ok()) {
      const q = await r.json()
      if (!(q.cap_micro_usd>0 && q.cap_micro_usd<=6000000)) throw Error('Allowance exceeds capture boundary')
      chosen=candidate.offer
      await save('offer.json', { ...chosen, cap_micro_usd:q.cap_micro_usd, estimated_reserve_micro_usd:q.estimated_reserve_micro_usd })
      break
    }
    await page.getByRole('button', { name: 'Back to offers' }).click()
  }
  if (!chosen) throw Error('No fresh qualifying offer; no rental created')
  await mark('review')
  await hold(3500)
  requested = true // Cleanup even if launch acknowledgement is lost.
  await page.getByRole('button', { name: 'Confirm rental', exact: true }).click()
  await page.getByRole('region', { name: 'Owned rentals' }).waitFor()
  await mark('rental-requested')
  const deadline=Date.now()+20*60*1000
  let last='', ready=false
  while(Date.now()<deadline) {
    const rental=(await read('/app/rentals')).rental
    if(rental?.stage!==last) {last=rental?.stage;await mark(last??'unknown')}
    if(last===(tokenMode?'token_inference_verified':'mesh_canary_completed')) {ready=true;break}
    if(['removed','cleanup_unconfirmed','model_download_error','removal_requested'].includes(last)) throw Error(`Rental not ready: ${last}`)
    await hold(3000)
  }
  if(!ready) throw Error('Bounded readiness wait expired')
  const status=await read('/api/status')
  if(status.peers?.length!==1) throw Error('Expected exactly one remote host for inference evidence')
  await save('mesh.json', {node_id:status.node_id,mesh_id:status.mesh_id,peers:status.peers.map(p=>({id:p.id??p.node_id,hostname:p.hostname,gpus:p.gpus,hosted_models:p.hosted_models}))})
  await page.getByRole('button',{name:'Inspect node',exact:true}).click()
  await mark('hardware-details')
  await hold(6500)
  await page.getByRole('button',{name:'Close node details'}).click()
  await page.getByTestId('nav-chat').click()
  await page.getByTestId('chat-new').click()
  const prompts=['Explain a mesh network in two sentences.','How does a remote GPU on this mesh help my laptop? Answer in two sentences.']
  for(const [i,prompt] of prompts.entries()) {
    await page.getByTestId('chat-input').fill(prompt)
    await hold(1800)
    await mark(`question-${i+1}`)
    await page.getByTestId('chat-send').click()
    const answer=page.getByTestId('assistant-message').nth(i)
    await answer.getByTestId('assistant-text').filter({hasText:/\S+/}).waitFor({timeout:120000})
    await page.getByTestId('chat-stop').waitFor({state:'hidden',timeout:120000})
    const text=await answer.getByTestId('assistant-text').innerText()
    if(!text.trim() || /failed to|unable to connect|error:/i.test(text)) throw Error('Chat did not return a usable answer')
    await save(`answer-${i+1}.json`,{prompt,text})
    await mark(`answer-${i+1}`)
    await hold(7000)
  }
  await page.screenshot({path:path.join(output,'conversation.png')})
  passed=true
} catch(error) {
  await mark('recording-error')
  console.error(String(error))
} finally {
  if(requested) {
    await mark('remove-compute')
    try {
      await page.getByTestId('nav-compute').click()
      const close=page.getByRole('button',{name:'Close node details'})
      if(await close.count())await close.click()
      await page.getByRole('button',{name:'Remove compute',exact:true}).click({timeout:7000})
      await hold(2000)
      await page.getByRole('button',{name:'Confirm removal',exact:true}).click()
    } catch {
      await fetch(base+'/app/rentals/remove',{method:'POST',headers:{'x-m8s-desktop':'1'},signal:AbortSignal.timeout(15000)}).catch(()=>{})
    }
    const deadline=Date.now()+240000
    while(Date.now()<deadline) {
      const rental=await read('/app/rentals').catch(()=>null)
      if(rental?.rental?.stage==='removed') {removed=true;await save('removal.json',rental.rental);break}
      await hold(2000)
    }
    await mark(removed?'provider-confirmed-removed':'removal-unconfirmed')
    if(removed) {await hold(6000);await page.screenshot({path:path.join(output,'removed.png')})}
  }
  await save('result.json',{passed:passed&&removed,conversation_completed:passed,provider_confirmed_removed:removed,admission:tokenMode?'token-only-provider-trusted':'owner-certified',certificate_verified:!tokenMode})
  await context.close()
  await browser.close()
}
if(!passed||!removed)process.exitCode=1
