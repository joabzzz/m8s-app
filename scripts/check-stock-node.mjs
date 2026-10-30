// No provider credentials or rentals. Requires a new private output directory.
import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
const [binary, plugin, cli, appBinary, root] = process.argv.slice(2);
if (process.argv.length !== 7 || ![binary,plugin,cli,appBinary,root].every(p=>path.isAbsolute(p))) throw Error('Usage: node scripts/check-stock-node.mjs /abs/stock-mesh /abs/plugin /abs/m8s /abs/mesh-consoled /abs/NEW-private-output');
// Refuse occupied test ports before starting any process or sending HTTP requests.
for (const port of [19640,19637,19631,19651,19657]) {
 const server=net.createServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 await new Promise(resolve=>server.close(resolve));
}
await fs.mkdir(root,{mode:0o700});
const children=[],logs=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function start(label,port,invite){
 const dir=root+'/'+label;await fs.mkdir(dir,{mode:0o700});
 await fs.writeFile(dir+'/config.toml','',{mode:0o600});
 const env={PATH:process.env.PATH,HOME:dir,TMPDIR:dir,LANG:'en_US.UTF-8',MESH_LLM_CONFIG:dir+'/config.toml',MESH_LLM_NODE_KEY_PATH:dir+'/node.key',MESH_LLM_RUNTIME_ROOT:dir+'/runtime',MESH_LLM_PLUGIN_DIR:dir+'/plugins',MESH_LLM_NO_DEFAULT_PLUGINS:'1',HF_HUB_CACHE:dir+'/hf',HF_HUB_DISABLE_IMPLICIT_TOKEN:'true',MESH_LLM_ANALYTICS:'0',DO_NOT_TRACK:'1'};
 const log=await fs.open(dir+'/host.log','wx',0o600);logs.push(log);
 const args=['client','--config',dir+'/config.toml','--port',String(port+6),'--console',String(port),'--bind-port',String(port+1),'--log-format','json'];
 if(invite){await fs.writeFile(dir+'/join',invite,{mode:0o600});args.push('--join-file',dir+'/join');}
 const child=spawn(binary,args,{env,detached:true,stdio:['ignore',log.fd,log.fd]});children.push(child);
 for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('host exited');try{const r=await fetch(`http://127.0.0.1:${port}/api/status`,{signal:AbortSignal.timeout(1000)});if(r.ok)return await r.json();}catch{}await delay(500);}throw Error('readiness timeout');
}

let result={passed:false,provider_calls:false,rentals_created:0,scope:'app-owned stock-main sidecar plus unsigned stock-main peer; no inference'};
try {
 const dir=root+'/app';await fs.mkdir(dir,{mode:0o700});await fs.mkdir(dir+'/control',{mode:0o700});
 await fs.writeFile(dir+'/config.toml','',{mode:0o600});
 const log=await fs.open(dir+'/host.log','wx',0o600);logs.push(log);
 const env={PATH:process.env.PATH,HOME:dir,TMPDIR:dir,LANG:'en_US.UTF-8',GOOSE_PATH_ROOT:dir+'/goose',MESH_LLM_CONFIG:dir+'/config.toml',MESH_LLM_NODE_KEY_PATH:dir+'/node.key',MESH_LLM_RUNTIME_ROOT:dir+'/runtime',MESH_LLM_PLUGIN_DIR:dir+'/plugins',MESH_LLM_NO_DEFAULT_PLUGINS:'1',HF_HUB_CACHE:dir+'/hf',HF_HUB_DISABLE_IMPLICIT_TOKEN:'true',MESH_LLM_ANALYTICS:'0',DO_NOT_TRACK:'1',M8S_STOCK_MESH:binary,M8S_PLUGIN:plugin,M8S_CLI:cli,M8S_V0_PLAN:dir+'/plan.json'};
 const app=spawn(appBinary,['--app-port','19640','--api-port','19637','--console-port','19631'],{env,detached:true,stdio:['ignore',log.fd,log.fd]});children.push(app);
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:19640/app/state');if(r.ok)break;}catch{}await delay(250);}
 const created=await fetch('http://127.0.0.1:19640/app/host',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:null,visibility:'private',mesh_name:'v0 compatibility check'})});
 if(created.status!==202)throw Error('app private creation refused');
 let owner;
 for(let i=0;i<100;i++){try{const r=await fetch('http://127.0.0.1:19631/api/status');if(r.ok){const j=await r.json();if(j.node_id&&j.token){owner=j;break;}}}catch{}await delay(250);}
 if(!owner)throw Error('app node readiness timeout');
 await fs.writeFile(dir+'/join',owner.token,{mode:0o600});
 await fs.writeFile(dir+'/target.json',JSON.stringify({schema:'m8s.token-target/v0',admission:'token-only-provider-trusted',join_file:dir+'/join',api_port:19637,console_port:19631,node_id:owner.node_id,mesh_id:owner.mesh_id}),{mode:0o600});
 await fs.writeFile(dir+'/plan.json',JSON.stringify({schema:'m8s.vast-demo/v1',model:'qwen3.8-27b',token_target:dir+'/target.json',control_directory:dir+'/control',directory:dir+'/unused-attempt',image:'unqualified-no-launch',expected_account_id:42}),{mode:0o600});
 const rentals=await fetch('http://127.0.0.1:19640/app/rentals');const rentalBody=await rentals.json();
 result.app_plugin_status=rentals.ok&&rentalBody.configured===true&&rentalBody.admission==='token-only-provider-trusted'&&rentalBody.rental===null;
 result.app_runtime_version=owner.version;result.owner_verified=owner.owner?.verified===true;
 await start('worker',19651,owner.token);
 for(let i=0;i<60;i++){
  const a=await(await fetch('http://127.0.0.1:19631/api/status')).json();
  const b=await(await fetch('http://127.0.0.1:19651/api/status')).json();
  result={...result,same_mesh:a.mesh_id===b.mesh_id,app_peer_count:a.peers?.length??0,worker_peer_count:b.peers?.length??0};
  if(result.same_mesh&&result.app_peer_count>0&&result.worker_peer_count>0){result.passed=result.app_plugin_status&&result.owner_verified&&result.app_runtime_version.startsWith('0.78.0');break;}await delay(500);
 }
 await delay(3000);
 const ownerRoot=dir+'/goose/compute-owner';
 const sessions=(await fs.readdir(ownerRoot)).filter(n=>n.startsWith('stock-session-'));
 const nodeLog=await fs.readFile(ownerRoot+'/'+sessions[0]+'/node.log','utf8');
 result.no_duplicate_relay_registration=!nodeLog.includes('Another endpoint connected with the same endpoint id');
 result.passed=result.passed&&result.no_duplicate_relay_registration;
}catch(e){result.error=e.message;}
finally{
 try{
 const expected=JSON.parse(await fs.readFile(root+'/app/target.json','utf8'));
 const current=await(await fetch('http://127.0.0.1:19631/api/status',{signal:AbortSignal.timeout(1000)})).json();
 if(current.node_id===expected.node_id&&current.mesh_id===expected.mesh_id) await fetch('http://127.0.0.1:19640/app/shutdown',{method:'POST',signal:AbortSignal.timeout(10000)});
}catch{}
 for(const child of children)if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGINT')}catch{}}
 for(let i=0;i<20&&children.some(c=>c.exitCode===null&&c.signalCode===null);i++)await delay(250);
 for(const child of children)if(child.exitCode===null&&child.signalCode===null){try{process.kill(-child.pid,'SIGKILL')}catch{}}
 await delay(100);for(const log of logs)await log.close();result.hosts_stopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);
 try{await fetch('http://127.0.0.1:19631/api/status',{signal:AbortSignal.timeout(1000)});result.sidecar_stopped=false;}catch{result.sidecar_stopped=true;} result.passed=result.passed&&result.sidecar_stopped;
 await fs.writeFile(root+'/result.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
}

if(!result.passed)process.exitCode=1;
