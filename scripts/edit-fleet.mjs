import { chromium } from '../ui/node_modules/playwright/index.mjs'
// Edit only a successful live capture. Title cards/footers identify shortened waits.
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const [source]=process.argv.slice(2)
if(!source || !path.isAbsolute(source))throw Error('Pass the absolute live recording directory')
const result=JSON.parse(await fs.readFile(path.join(source,'result.json'),'utf8'))
if(!result.passed || !result.provider_confirmed_removed)throw Error('Only a successful live recording may replace the showcase')
const tokenMode=result.admission==='token-only-provider-trusted'
const timeline=JSON.parse(await fs.readFile(path.join(source,'timeline.json'),'utf8'))
const at=name=>{const item=timeline.find(t=>t.event===name);if(!item)throw Error(`Missing ${name}`);return item.seconds}
const video=path.join(source,'video',(await fs.readdir(path.join(source,'video'))).find(f=>f.endsWith('.webm')))
const out=path.join(source,'edited');await fs.mkdir(out,{recursive:true})
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:1440,height:900}})
for(const [name,title,subtitle] of [
 ['intro','Qwen 27B. On your mesh.','Rent a GPU · inspect your fleet · chat · release compute'],
 ['wait','From rental to mesh host',tokenMode?'Token-only admission · model startup wait shortened':'Authentication and model startup · wait shortened'],
 ['end','Compute released. Mesh stays yours.','Provider-confirmed removal · no local model required'],
]) {
 await page.setContent(`<html><style>body{margin:0;background:#080808;color:#f4f4f4;font-family:Arial;display:flex;align-items:center;justify-content:center;height:900px;text-align:center}i{display:block;width:48px;height:4px;background:#ff6500;margin:0 auto 36px}h1{font-size:54px;letter-spacing:-1.8px;margin:0 0 22px}p{font-size:22px;color:#a6a6a6}.brand{font-size:17px;letter-spacing:5px;color:#ff6500;margin-bottom:30px}</style><div><div class="brand">m8s</div><i></i><h1>${title}</h1><p>${subtitle}</p></div></html>`)
 await page.screenshot({path:path.join(out,`${name}.png`)})
}
const footerHtml=`<html><style>html,body{margin:0;background:transparent}footer{position:absolute;top:868px;width:1440px;height:32px;background:#080808;color:#aaa;font:14px Arial;display:flex;align-items:center;justify-content:center}</style><footer>LIVE APP UI · WAITS SHORTENED · IDS REDACTED · PEER DISCOVERY MAY LAG REMOVAL${tokenMode?' · TOKEN-ONLY ADMISSION':''}</footer></html>`
// Fixed capture geometry, reviewed against each published clip.
for(const kind of ['none','fleet','compute','hardware','removed','chat']) {
 const boxes=[]
 if(['fleet','compute','hardware','removed'].includes(kind))boxes.push([170,246,110,18,'Node ID hidden',11])
 if(['compute','hardware','removed'].includes(kind))boxes.push([164,465,166,22,'Vast rental · ID hidden',12],[164,493,480,18,'Private mesh · ID hidden',11],[472,794,155,24,'Rented GPU',14])
 if(kind==='hardware')boxes.push([955,72,270,32,'Rented GPU',24],[955,145,140,18,'Node ID hidden',11])
 if(kind==='chat')boxes.push([1160,377,180,24,'Rented GPU',13])
 const labels=boxes.map(([x,y,w,h,label,size])=>`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#080808;color:#aaa;font:${size}px Arial;display:flex;align-items:center">${label}</div>`).join('')
 await page.setContent(footerHtml+labels)
 await page.screenshot({path:path.join(out,`overlay-${kind}.png`),omitBackground:true})
}
await browser.close()
const ff=(args)=>execFileSync('/opt/homebrew/bin/ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit'})
const encode=['-an','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-r','25']
let counter=0,sequence=[],duration=0
function card(name,seconds){const file=path.join(out,`part-${counter++}.mp4`);ff(['-loop','1','-i',path.join(out,`${name}.png`),'-t',String(seconds),...encode,file]);sequence.push(file);duration+=seconds}
function clip(start,seconds,kind='none'){
 const file=path.join(out,`part-${counter++}.mp4`)
 ff(['-ss',String(Math.max(0,start)),'-i',video,'-loop','1','-i',path.join(out,`overlay-${kind}.png`),'-filter_complex','[0:v]setpts=PTS-STARTPTS[v];[v][1:v]overlay=0:0:shortest=1','-t',String(seconds),...encode,file]);sequence.push(file);duration+=seconds
}
card('intro',2.5)
clip(at('fleet'),3,'fleet')
clip(at('providers')-2.3,2)
clip(at('browse'),3)
clip(at('review'),3.5)
clip(at('rental-requested')+0.5,3,'compute')
clip(at(tokenMode?'token_provisioning':'preparing_model')+0.5,3,'compute')
card('wait',2)
clip(at(tokenMode?'token_inference_verified':'mesh_canary_completed')-2,2,'compute')
clip(at('hardware-details')+0.8,5.5,'hardware')
for(let i=1;i<=2;i++){
 clip(at(`question-${i}`)-1.3,3.3,'chat')
 clip(at(`answer-${i}`)+0.3,6.7,'chat')
}
clip(at('remove-compute')+1,3,'compute')
clip(at('provider-confirmed-removed')+2.5,3,'removed')
card('end',Math.max(2,60-duration))
await fs.writeFile(path.join(out,'concat.txt'),sequence.map(f=>`file '${f}'`).join('\n'))
ff(['-f','concat','-safe','0','-i',path.join(out,'concat.txt'),'-c','copy','-movflags','+faststart',path.join(out,'demo.mp4')])
// 30-second companion cut, retaining both answers and confirmed teardown.
ff(['-i',path.join(out,'demo.mp4'),'-vf',`setpts=${30/duration}*PTS,fps=12,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3`,'-loop','0',path.join(out,'demo.gif')])
await fs.writeFile(path.join(out,'edit.json'),JSON.stringify({duration,target:'60-second MP4, 30-second GIF',source:video,edits:'Chronological live UI cuts; startup/response waits shortened; editorial title cards and disclosure footer; operational identifiers redacted; mesh-discovery lag disclosed; answers held about seven seconds'},null,2))
console.log(JSON.stringify({duration,mp4:path.join(out,'demo.mp4'),gif:path.join(out,'demo.gif')}))
