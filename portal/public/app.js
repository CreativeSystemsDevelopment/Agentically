
// ── State ──
let ws, term, fitAddon, termInit = false;
let oauthToken = localStorage.getItem('gh_token');
let pollTimer = null, pollInFlight = false, pollActive = false, pollInterval = 5000, visibilityHandler = null;
let catalog = null, editingSlug = null;
let canvasTools = new Set(), canvasInstructions = [], canvasPrompts = [], canvasMcp = new Set();
let graphNodes = []; // {id, type, label, detail, x, y}
let dragNode = null, dragOff = {x:0,y:0};
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// ══════════════════════════════════════════════════════════════════════════════
// WebSocket + Auth + Chat + Terminal + FileTree + Models (compact)
// ══════════════════════════════════════════════════════════════════════════════
function connect(){const p=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(p+'://'+location.host+'/ws');ws.onopen=()=>{addSystemMsg('Connected');if(oauthToken)ws.send(JSON.stringify({type:'auth:token',token:oauthToken}))};ws.onmessage=e=>{const m=JSON.parse(e.data);switch(m.type){case'terminal:output':if(term)term.write(m.data);break;case'chat:thinking':addSystemMsg(m.status);break;case'chat:tool_call':addToolMsg('Tool: '+m.tool);break;case'chat:tool_result':addToolMsg('Result: '+m.result.slice(0,300));break;case'chat:response':addAssistantMsg(m.text);enableChat();break;case'chat:error':addSystemMsg('Error: '+m.error);enableChat();break;case'auth:verified':if(m.authenticated){updateAuthBadge(true);document.getElementById('auth-step-code').style.display='none';document.getElementById('auth-step-done').style.display='block'}break}};ws.onclose=()=>{addSystemMsg('Disconnected...');setTimeout(connect,2000)}}
function showAuthModal(){document.getElementById('auth-modal').classList.remove('hidden');document.getElementById('auth-step-start').style.display='block';document.getElementById('auth-step-code').style.display='none';document.getElementById('auth-step-done').style.display='none';if(oauthToken){document.getElementById('auth-step-start').style.display='none';document.getElementById('auth-step-done').style.display='block'}}
function closeAuthModal(){document.getElementById('auth-modal').classList.add('hidden');stopPolling()}
async function startDeviceFlow(){const s=document.getElementById('auth-start-status');s.innerHTML='<span class="spinner"></span>Requesting...';try{const r=await(await fetch('/api/auth/device-code',{method:'POST'})).json();if(r.error)throw new Error(r.error);document.getElementById('device-code-display').textContent=r.user_code;document.getElementById('device-verify-link').href=r.verification_uri;document.getElementById('auth-step-start').style.display='none';document.getElementById('auth-step-code').style.display='block';document.getElementById('auth-poll-status').innerHTML='<span class="spinner"></span>Waiting...';pollInterval=(r.interval||5)*1000;const dc=r.device_code;pollActive=true;schedulePoll(dc);visibilityHandler=async()=>{if(document.visibilityState==='visible'&&pollActive)await doPoll(dc)};document.addEventListener('visibilitychange',visibilityHandler)}catch(e){s.textContent='Error: '+e.message;s.className='status error'}}
function schedulePoll(dc){if(!pollActive)return;pollTimer=setTimeout(()=>doPoll(dc),pollInterval)}
async function doPoll(dc){if(pollInFlight||!pollActive)return;pollInFlight=true;try{const r=await(await fetch('/api/auth/poll-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_code:dc})})).json();if(r.access_token){stopPolling();oauthToken=r.access_token;localStorage.setItem('gh_token',oauthToken);ws.send(JSON.stringify({type:'auth:token',token:oauthToken}));document.getElementById('auth-poll-status').textContent='Authenticated!';document.getElementById('auth-poll-status').className='status success';updateAuthBadge(true);loadModels();setTimeout(()=>{document.getElementById('auth-step-code').style.display='none';document.getElementById('auth-step-done').style.display='block'},800);return}else if(r.error==='slow_down'){pollInterval=(r.interval||(pollInterval/1000)+5)*1000}else if(r.error==='expired_token'){stopPolling();document.getElementById('auth-poll-status').textContent='Expired.';return}else if(r.error==='access_denied'){stopPolling();document.getElementById('auth-poll-status').textContent='Denied.';return}schedulePoll(dc)}catch(e){schedulePoll(dc)}finally{pollInFlight=false}}
function stopPolling(){pollActive=false;if(pollTimer){clearTimeout(pollTimer);pollTimer=null}if(visibilityHandler){document.removeEventListener('visibilitychange',visibilityHandler);visibilityHandler=null}}
function copyCode(){navigator.clipboard.writeText(document.getElementById('device-code-display').textContent).catch(()=>{})}
function updateAuthBadge(ok){const b=document.getElementById('auth-badge');b.className=ok?'auth-status ok':'auth-status no';b.textContent=ok?'Signed in':'Not signed in'}
const chatMsgs=document.getElementById('chat-messages');
function addMsg(c,t){const d=document.createElement('div');d.className='msg '+c;d.textContent=t;chatMsgs.appendChild(d);chatMsgs.scrollTop=chatMsgs.scrollHeight}
function addSystemMsg(t){addMsg('system',t)}
function addToolMsg(t){addMsg('tool',t)}
function addAssistantMsg(t){const d=document.createElement('div');d.className='msg assistant';let h=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');h=h.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre><code>$2</code></pre>');h=h.replace(/`([^`]+)`/g,'<code>$1</code>');h=h.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');d.innerHTML=h;chatMsgs.appendChild(d);chatMsgs.scrollTop=chatMsgs.scrollHeight}
function sendChat(){const i=document.getElementById('chat-input');const t=i.value.trim();if(!t||!ws||ws.readyState!==1)return;addMsg('user',t);ws.send(JSON.stringify({type:'chat:message',text:t,model:document.getElementById('model-select').value}));i.value='';disableChat()}
function disableChat(){document.getElementById('chat-send').disabled=true}
function enableChat(){document.getElementById('chat-send').disabled=false}
document.getElementById('chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}});
function switchTab(el){document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));el.classList.add('active');const p=el.dataset.panel;document.getElementById('panel-'+p).classList.add('active');if(p==='terminal')initTerminal();if(p==='agents')loadAgents();if(p==='builder'&&!catalog)loadCatalog()}
function initTerminal(){if(termInit){if(fitAddon)fitAddon.fit();return}termInit=true;term=new Terminal({theme:{background:'#0d1117',foreground:'#e6edf3',cursor:'#58a6ff'},fontSize:13,fontFamily:"'SF Mono',Monaco,monospace",cursorBlink:true});fitAddon=new FitAddon.FitAddon();term.loadAddon(fitAddon);term.open(document.getElementById('terminal-container'));fitAddon.fit();term.onData(d=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'terminal:input',data:d,cols:term.cols,rows:term.rows}))});term.onResize(({cols,rows})=>{if(ws?.readyState===1)ws.send(JSON.stringify({type:'terminal:resize',cols,rows}))});window.addEventListener('resize',()=>{if(fitAddon)fitAddon.fit()})}
async function loadTree(path){try{const d=await(await fetch('/api/fs/list?path='+encodeURIComponent(path))).json();const t=document.getElementById('file-tree');t.innerHTML='';if(path!=='.'){const u=document.createElement('div');u.className='item dir';u.textContent='.. (up)';u.onclick=()=>loadTree(path.split('/').slice(0,-1).join('/')||'.');t.appendChild(u)}d.items.forEach(i=>{const e=document.createElement('div');e.className='item '+i.type;e.textContent=(i.type==='dir'?'\u{1F4C1} ':'\u{1F4C4} ')+i.name;e.onclick=()=>i.type==='dir'?loadTree(i.path):openFile(i.path);t.appendChild(e)})}catch(e){}}
async function openFile(path){try{const d=await(await fetch('/api/fs/read?path='+encodeURIComponent(path))).json();document.getElementById('editor-area').innerHTML='<pre>'+esc(d.content)+'</pre>';document.querySelector('.tab[data-panel="editor"]').click()}catch(e){}}
async function loadModels(){if(!oauthToken)return;try{const d=await(await fetch('/api/models',{headers:{'X-GitHub-Token':oauthToken}})).json();if(!d.models?.length)return;populateModelSelect('model-select',d.models);populateModelSelect('agent-model',d.models)}catch(e){}}
function populateModelSelect(id,models){const s=document.getElementById(id);const c=s.value;s.innerHTML='';let lc='';models.forEach(m=>{if(m.category&&m.category!==lc){const o=document.createElement('optgroup');o.label=m.category.charAt(0).toUpperCase()+m.category.slice(1);s.appendChild(o);lc=m.category}const o=document.createElement('option');o.value=m.id;o.textContent=m.name+(m.preview?' (preview)':'');(s.querySelector('optgroup:last-of-type')||s).appendChild(o)});if(c&&s.querySelector('option[value="'+c+'"]'))s.value=c}
async function loadAgents(){try{const agents=await(await fetch('/api/agents')).json();const g=document.getElementById('agent-grid'),e=document.getElementById('agent-empty');g.innerHTML='';if(!agents.length){g.style.display='none';e.style.display='block';return}g.style.display='grid';e.style.display='none';agents.forEach(a=>{const c=document.createElement('div');c.className='agent-card';const tools=Array.isArray(a.meta.tools)?a.meta.tools:[];c.innerHTML='<h3>'+esc(a.meta.name||a.slug)+'</h3><p>'+esc(a.meta.description||'No description')+'</p><div class="meta"><span>'+(a.meta.model||'default')+'</span><span>'+tools.length+' tools</span></div>';c.onclick=()=>editAgent(a.slug);g.appendChild(c)})}catch(e){}}

// ══════════════════════════════════════════════════════════════════════════════
// Catalog & Toolbox
// ══════════════════════════════════════════════════════════════════════════════
async function loadCatalog(){try{catalog=await(await fetch('/api/catalog')).json();renderToolbox()}catch(e){console.error(e)}}

function renderToolbox(filter){
  if(!catalog)return;
  const lf=(filter||'').toLowerCase();
  // Agents
  const ae=document.getElementById('tb-agents');ae.innerHTML='';
  const filteredAgents=catalog.agents.filter(a=>!lf||a.name.toLowerCase().includes(lf)||a.slug.toLowerCase().includes(lf));
  document.getElementById('tb-agents-label').textContent='Agents ('+filteredAgents.length+')';
  filteredAgents.forEach(a=>{const el=mkTbItem(a.name,a.tools.length+'t','agent',JSON.stringify({type:'agent',slug:a.slug}));el.title=a.description||a.slug;el.ondblclick=()=>loadAgentTemplate(a);ae.appendChild(el)});
  // Tools by category
  const te=document.getElementById('tb-tools');te.innerHTML='';let tc=0;
  catalog.toolCategories.forEach(cat=>{const tools=cat.tools.filter(t=>!lf||t.toLowerCase().includes(lf));if(!tools.length)return;tc+=tools.length;const h=document.createElement('div');h.className='tb-sub-header';h.textContent=cat.name+' ('+tools.length+')';te.appendChild(h);tools.forEach(t=>{const el=mkTbItem(t,'','tool',JSON.stringify({type:'tool',id:t}));el.ondblclick=()=>{addToolToCanvas(t)};te.appendChild(el)})});
  document.getElementById('tb-tools-label').textContent='Tools ('+tc+')';
  // Instructions
  const ie=document.getElementById('tb-instructions');ie.innerHTML='';
  const filteredInstr=catalog.instructions.filter(i=>!lf||i.name.toLowerCase().includes(lf)||i.slug.toLowerCase().includes(lf));
  document.getElementById('tb-instr-label').textContent='Instructions ('+filteredInstr.length+')';
  filteredInstr.forEach(i=>{const el=mkTbItem(i.slug,i.applyTo?i.applyTo.slice(0,20):'','instruction',JSON.stringify({type:'instruction',slug:i.slug}));el.title=i.name;el.ondblclick=()=>{addInstructionToCanvas(i)};ie.appendChild(el)});
  // Prompts
  const pe=document.getElementById('tb-prompts');pe.innerHTML='';
  const filteredPrompts=catalog.prompts.filter(p=>!lf||p.name.toLowerCase().includes(lf)||p.slug.toLowerCase().includes(lf));
  document.getElementById('tb-prompts-label').textContent='Prompts ('+filteredPrompts.length+')';
  filteredPrompts.forEach(p=>{const el=mkTbItem(p.slug,'','prompt',JSON.stringify({type:'prompt',slug:p.slug}));el.title=p.name;el.ondblclick=()=>{addPromptToCanvas(p)};pe.appendChild(el)});
  // MCP
  const me=document.getElementById('tb-mcp');me.innerHTML='';
  const filteredMcp=catalog.mcpServers.filter(m=>!lf||m.id.toLowerCase().includes(lf));
  document.getElementById('tb-mcp-label').textContent='MCP Servers ('+filteredMcp.length+')';
  filteredMcp.forEach(m=>{const el=mkTbItem(m.id,m.type,'mcp',JSON.stringify({type:'mcp',id:m.id}));el.ondblclick=()=>{addMcpToCanvas(m.id)};me.appendChild(el)});
  // Collections
  const ce=document.getElementById('tb-collections');ce.innerHTML='';
  const filteredColl=(catalog.collections||[]).filter(c=>!lf||c.name.toLowerCase().includes(lf));
  document.getElementById('tb-coll-label').textContent='Collections ('+filteredColl.length+')';
  filteredColl.forEach(c=>{const el=mkTbItem(c.name,c.items?.length+'items','collection',JSON.stringify({type:'collection',slug:c.slug}));el.title=c.description;ce.appendChild(el)});
}

function mkTbItem(label,meta,colorClass,dragData){
  const colors={agent:'var(--accent)',tool:'#1f6feb',instruction:'var(--green)',prompt:'#a371f7',mcp:'var(--yellow)',collection:'var(--muted)'};
  const el=document.createElement('div');el.className='tb-item';el.draggable=true;
  el.innerHTML='<span class="tb-icon" style="color:'+colors[colorClass]+'">&#9632;</span><span class="tb-label">'+esc(label)+'</span>'+(meta?'<span class="tb-meta">'+esc(meta)+'</span>':'');
  el.ondragstart=e=>{e.dataTransfer.setData('text/plain',dragData);el.classList.add('dragging')};
  el.ondragend=()=>el.classList.remove('dragging');
  return el;
}

function toggleSection(h){h.parentElement.classList.toggle('open')}
function filterToolbox(v){renderToolbox(v)}

// ══════════════════════════════════════════════════════════════════════════════
// Graph Canvas - Node Management
// ══════════════════════════════════════════════════════════════════════════════
let nodeIdCounter=0;
function addGraphNode(type,label,detail,x,y){
  const id='n'+(nodeIdCounter++);
  const node={id,type,label,detail:detail||'',x:x||0,y:y||0};
  graphNodes.push(node);
  renderGraphNode(node);
  drawConnections();
  updatePreview();
  return node;
}

function removeGraphNode(id){
  graphNodes=graphNodes.filter(n=>n.id!==id);
  const el=document.getElementById(id);if(el)el.remove();
  // Also remove from canvas sets
  const node=graphNodes.find(n=>n.id===id);
  drawConnections();updatePreview();
}

function renderGraphNode(node){
  const canvas=document.getElementById('graph-canvas');
  const el=document.createElement('div');
  el.id=node.id;el.className='graph-node';
  el.style.left=node.x+'px';el.style.top=node.y+'px';
  const colorClass={tool:'tool-color',instruction:'instr-color',prompt:'prompt-color',mcp:'mcp-color'}[node.type]||'tool-color';
  const typeLabel={tool:'Tool',instruction:'Instruction',prompt:'Prompt',mcp:'MCP Server'}[node.type]||node.type;
  el.innerHTML='<div class="node-header '+colorClass+'">'+typeLabel+'</div><div class="node-body">'+esc(node.label)+(node.detail?'<br><span style="color:var(--muted);font-size:10px">'+esc(node.detail.slice(0,80))+'</span>':'')+'</div><span class="node-remove" onclick="removeNodeById(\''+node.id+'\')">&times;</span>';
  // Drag to move
  el.onmousedown=e=>{if(e.target.classList.contains('node-remove'))return;dragNode=node;dragOff={x:e.clientX-node.x,y:e.clientY-node.y};e.preventDefault()};
  canvas.appendChild(el);
}

function removeNodeById(id){
  const node=graphNodes.find(n=>n.id===id);
  if(!node)return;
  if(node.type==='tool')canvasTools.delete(node.label);
  else if(node.type==='instruction')canvasInstructions=canvasInstructions.filter(i=>i.slug!==node.detail);
  else if(node.type==='prompt')canvasPrompts=canvasPrompts.filter(p=>p.slug!==node.detail);
  else if(node.type==='mcp')canvasMcp.delete(node.label);
  graphNodes=graphNodes.filter(n=>n.id!==id);
  const el=document.getElementById(id);if(el)el.remove();
  drawConnections();updatePreview();
}

// Mouse move/up for node dragging
document.addEventListener('mousemove',e=>{
  if(!dragNode)return;
  dragNode.x=e.clientX-dragOff.x;dragNode.y=e.clientY-dragOff.y;
  const el=document.getElementById(dragNode.id);
  if(el){el.style.left=dragNode.x+'px';el.style.top=dragNode.y+'px'}
  drawConnections();
});
document.addEventListener('mouseup',()=>{dragNode=null});

function drawConnections(){
  const svg=document.getElementById('graph-svg');
  const agentEl=document.getElementById('node-agent');
  if(!agentEl||agentEl.style.display==='none'){svg.innerHTML='';return}
  const ar=agentEl.getBoundingClientRect();
  const cr=document.getElementById('graph-canvas').getBoundingClientRect();
  const ax=ar.left-cr.left+ar.width/2+document.getElementById('graph-canvas').scrollLeft;
  const ay=ar.top-cr.top+ar.height/2+document.getElementById('graph-canvas').scrollTop;
  let lines='';
  graphNodes.forEach(n=>{
    const el=document.getElementById(n.id);if(!el)return;
    const nr=el.getBoundingClientRect();
    const nx=nr.left-cr.left+nr.width/2+document.getElementById('graph-canvas').scrollLeft;
    const ny=nr.top-cr.top+nr.height/2+document.getElementById('graph-canvas').scrollTop;
    const color={tool:'#1f6feb',instruction:'#3fb950',prompt:'#a371f7',mcp:'#d29922'}[n.type]||'#30363d';
    lines+='<line x1="'+ax+'" y1="'+ay+'" x2="'+nx+'" y2="'+ny+'" style="stroke:'+color+';stroke-width:2;stroke-dasharray:6,4"/>';
  });
  svg.innerHTML=lines;
}

// ══════════════════════════════════════════════════════════════════════════════
// Canvas Drop Handling
// ══════════════════════════════════════════════════════════════════════════════
function canvasDragOver(e){e.preventDefault();e.currentTarget.classList.add('drag-over')}
function canvasDrop(e){
  e.preventDefault();e.currentTarget.classList.remove('drag-over');
  try{
    const payload=JSON.parse(e.dataTransfer.getData('text/plain'));
    const cr=document.getElementById('graph-canvas').getBoundingClientRect();
    const x=e.clientX-cr.left+document.getElementById('graph-canvas').scrollLeft-80;
    const y=e.clientY-cr.top+document.getElementById('graph-canvas').scrollTop-20;
    handleCanvasDrop(payload,x,y);
  }catch(err){console.error(err)}
}

function handleCanvasDrop(payload,x,y){
  showAgentNode();
  if(payload.type==='agent'){
    const a=catalog.agents.find(ag=>ag.slug===payload.slug);
    if(a)loadAgentTemplate(a);
  }else if(payload.type==='tool'){addToolToCanvas(payload.id,x,y)}
  else if(payload.type==='instruction'){const i=catalog.instructions.find(ii=>ii.slug===payload.slug);if(i)addInstructionToCanvas(i,x,y)}
  else if(payload.type==='prompt'){const p=catalog.prompts.find(pp=>pp.slug===payload.slug);if(p)addPromptToCanvas(p,x,y)}
  else if(payload.type==='mcp'){addMcpToCanvas(payload.id,x,y)}
}

function addToolToCanvas(id,x,y){
  if(canvasTools.has(id))return;
  canvasTools.add(id);showAgentNode();
  addGraphNode('tool',id,'',x||randomX(),y||randomY());
}
function addInstructionToCanvas(instr,x,y){
  if(canvasInstructions.find(i=>i.slug===instr.slug))return;
  canvasInstructions.push(instr);showAgentNode();
  addGraphNode('instruction',instr.slug,instr.slug,x||randomX(),y||randomY());
}
function addPromptToCanvas(prompt,x,y){
  if(canvasPrompts.find(p=>p.slug===prompt.slug))return;
  canvasPrompts.push(prompt);showAgentNode();
  addGraphNode('prompt',prompt.slug,prompt.slug,x||randomX(),y||randomY());
}
function addMcpToCanvas(id,x,y){
  if(canvasMcp.has(id))return;
  canvasMcp.add(id);showAgentNode();
  const srv=catalog?.mcpServers.find(m=>m.id===id);
  addGraphNode('mcp',id,srv?.type||'',x||randomX(),y||randomY());
}

function randomX(){return 100+Math.random()*400}
function randomY(){return 80+Math.random()*300}

function showAgentNode(){
  document.getElementById('graph-empty').style.display='none';
  document.getElementById('node-agent').style.display='block';
  if(!document.getElementById('node-agent').style.left||document.getElementById('node-agent').style.left==='0px'){
    document.getElementById('node-agent').style.left='250px';
    document.getElementById('node-agent').style.top='150px';
  }
}

function loadAgentTemplate(agent){
  clearCanvas();showAgentNode();
  document.getElementById('agent-name').value=agent.slug||agent.name;
  document.getElementById('agent-desc').value=agent.description||'';
  if(agent.model){const s=document.getElementById('agent-model');if(s.querySelector('option[value="'+agent.model+'"]'))s.value=agent.model}
  // Add tools as nodes in a circle around agent
  const cx=250,cy=150,r=200;
  const allItems=[...agent.tools.map(t=>({type:'tool',id:t}))];
  allItems.forEach((item,i)=>{
    const angle=(2*Math.PI*i/allItems.length)-Math.PI/2;
    const x=cx+r*Math.cos(angle);const y=cy+r*Math.sin(angle)+50;
    if(item.type==='tool'){canvasTools.add(item.id);addGraphNode('tool',item.id,'',x,y)}
  });
  if(agent.body)document.getElementById('agent-instructions').value=agent.body;
  updatePreview();
}

function clearCanvas(){
  graphNodes.forEach(n=>{const el=document.getElementById(n.id);if(el)el.remove()});
  graphNodes=[];canvasTools.clear();canvasInstructions=[];canvasPrompts=[];canvasMcp.clear();
  document.getElementById('graph-svg').innerHTML='';
}

function autoLayout(){
  const agentEl=document.getElementById('node-agent');
  if(!agentEl||agentEl.style.display==='none')return;
  const cx=350,cy=200,r=220;
  agentEl.style.left=cx+'px';agentEl.style.top=cy+'px';
  graphNodes.forEach((n,i)=>{
    const angle=(2*Math.PI*i/graphNodes.length)-Math.PI/2;
    n.x=cx+r*Math.cos(angle);n.y=cy+r*Math.sin(angle)+50;
    const el=document.getElementById(n.id);
    if(el){el.style.left=n.x+'px';el.style.top=n.y+'px'}
  });
  drawConnections();
}

// ══════════════════════════════════════════════════════════════════════════════
// Agent CRUD
// ══════════════════════════════════════════════════════════════════════════════
function newAgent(){editingSlug=null;clearCanvas();document.getElementById('agent-name').value='';document.getElementById('agent-desc').value='';document.getElementById('agent-instructions').value='';document.getElementById('btn-delete-agent').style.display='none';showAgentNode();updatePreview();document.querySelector('.tab[data-panel="builder"]').click()}
async function editAgent(slug){try{const d=await(await fetch('/api/agents/'+slug)).json();editingSlug=slug;clearCanvas();document.getElementById('agent-name').value=slug;document.getElementById('agent-desc').value=d.meta.description||'';document.getElementById('agent-instructions').value=d.body||'';const m=d.meta.model||'';const s=document.getElementById('agent-model');if(s.querySelector('option[value="'+m+'"]'))s.value=m;const tools=Array.isArray(d.meta.tools)?d.meta.tools:[];showAgentNode();const cx=350,cy=200,r=220;tools.forEach((t,i)=>{canvasTools.add(t);const angle=(2*Math.PI*i/tools.length)-Math.PI/2;addGraphNode('tool',t,'',cx+r*Math.cos(angle),cy+r*Math.sin(angle)+50)});document.getElementById('btn-delete-agent').style.display='inline-block';updatePreview();document.querySelector('.tab[data-panel="builder"]').click()}catch(e){console.error(e)}}
async function saveAgent(){const slug=document.getElementById('agent-name').value.trim().toLowerCase().replace(/[^a-z0-9-]/g,'-');if(!slug)return alert('Name required');const content=generateAgentMd();try{const d=await(await fetch('/api/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,content})})).json();if(d.error)throw new Error(d.error);editingSlug=slug;document.getElementById('btn-delete-agent').style.display='inline-block';alert('Saved: '+d.path);loadAgents()}catch(e){alert('Error: '+e.message)}}
async function deleteAgent(){if(!editingSlug||!confirm('Delete "'+editingSlug+'"?'))return;try{await fetch('/api/agents/'+editingSlug,{method:'DELETE'});editingSlug=null;document.querySelector('.tab[data-panel="agents"]').click();loadAgents()}catch(e){alert(e.message)}}
function previewAgent(){updatePreview()}

function generateAgentMd(){
  const name=document.getElementById('agent-name').value.trim()||'my-agent';
  const desc=document.getElementById('agent-desc').value.trim();
  const model=document.getElementById('agent-model').value;
  const tools=Array.from(canvasTools);
  const customInstr=document.getElementById('agent-instructions').value;
  let md='---\n';
  md+='name: "'+name+'"\n';
  if(desc)md+='description: "'+desc+'"\n';
  if(model)md+='model: "'+model+'"\n';
  if(tools.length)md+='tools: ['+tools.map(t=>"'"+t+"'").join(', ')+']\n';
  if(canvasMcp.size){md+='mcp-servers:\n';canvasMcp.forEach(id=>{const srv=catalog?.mcpServers.find(m=>m.id===id);md+='  '+id+':\n    type: "'+(srv?.type||'http')+'"\n';if(srv?.url)md+='    url: "'+srv.url+'"\n'})}
  md+='---\n\n';
  // Add instruction bodies
  canvasInstructions.forEach(i=>{if(i.body)md+=i.body+'\n\n'});
  // Add prompt bodies
  canvasPrompts.forEach(p=>{if(p.body)md+=p.body+'\n\n'});
  if(customInstr)md+=customInstr+'\n';
  return md;
}

function updatePreview(){document.getElementById('preview-content').textContent=generateAgentMd()}
['agent-name','agent-desc','agent-instructions'].forEach(id=>{document.getElementById(id).addEventListener('input',updatePreview)});
document.getElementById('agent-model').addEventListener('change',updatePreview);

// Make agent node draggable too
(function(){
  const an=document.getElementById('node-agent');
  let dragging=false,ox=0,oy=0;
  an.onmousedown=e=>{if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;dragging=true;ox=e.clientX-an.offsetLeft;oy=e.clientY-an.offsetTop;e.preventDefault()};
  document.addEventListener('mousemove',e=>{if(!dragging)return;an.style.left=(e.clientX-ox)+'px';an.style.top=(e.clientY-oy)+'px';drawConnections()});
  document.addEventListener('mouseup',()=>{dragging=false});
})();

// ══════════════════════════════════════════════════════════════════════════════
// Init
// ══════════════════════════════════════════════════════════════════════════════
connect();loadTree('.');loadAgents();loadCatalog();
if(oauthToken){updateAuthBadge(true);loadModels()}

// ══════════════════════════════════════════════════════════════════════════════
// Builder AI Assistant Chat
// ══════════════════════════════════════════════════════════════════════════════
function toggleBuilderChat(){document.getElementById('builder-chat').classList.toggle('hidden')}

function sendBuilderChat(){
  const input=document.getElementById('builder-chat-input');
  const text=input.value.trim();if(!text||!ws||ws.readyState!==1)return;
  addBuilderMsg('bc-user',text);input.value='';
  // Send via websocket with a special builder context
  const currentAgent=generateAgentMd();
  const prompt='You are an AI assistant helping build GitHub Copilot agents. The user is using a visual agent builder with tools, instructions, prompts, and MCP servers from the awesome-copilot repository.\n\nCurrent agent config:\n```\n'+currentAgent+'\n```\n\nAvailable tools: '+Array.from(canvasTools).join(', ')+'\nAvailable in catalog: '+catalog.tools.length+' tools, '+catalog.instructions.length+' instructions, '+catalog.prompts.length+' prompts, '+catalog.mcpServers.length+' MCP servers\n\nHelp the user by:\n1. Understanding their use case\n2. Suggesting which tools, instructions, and prompts to add\n3. Writing custom instruction text they can paste in\n4. Recommending agent configurations\n\nUser message: '+text;
  ws.send(JSON.stringify({type:'chat:message',text:prompt,model:document.getElementById('model-select').value||'gpt-4.1'}));
  addBuilderMsg('bc-system','Thinking...');
  // Override the next chat response to go to builder chat
  builderChatActive=true;
}

let builderChatActive=false;
const origOnMessage=ws?ws.onmessage:null;
// Patch the websocket handler to intercept builder chat responses
const _origConnect=connect;
connect=function(){
  _origConnect();
  const _origOnMsg=ws.onmessage;
  ws.onmessage=function(e){
    const msg=JSON.parse(e.data);
    if(builderChatActive&&(msg.type==='chat:response'||msg.type==='chat:error')){
      builderChatActive=false;
      // Remove "Thinking..." message
      const msgs=document.getElementById('builder-chat-messages');
      const last=msgs.lastElementChild;
      if(last&&last.classList.contains('bc-system'))last.remove();
      if(msg.type==='chat:response')addBuilderMsg('bc-ai',msg.text);
      else addBuilderMsg('bc-ai','Error: '+msg.error);
      enableChat();
      return;
    }
    if(builderChatActive&&msg.type==='chat:thinking')return; // suppress thinking in main chat
    _origOnMsg.call(ws,e);
  };
};

function addBuilderMsg(cls,text){
  const msgs=document.getElementById('builder-chat-messages');
  const d=document.createElement('div');d.className='bc-msg '+cls;
  if(cls==='bc-ai'){
    let h=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    h=h.replace(/```(\w*)\n([\s\S]*?)```/g,'<pre style="background:#0d1117;padding:6px;border-radius:4px;overflow-x:auto;margin:4px 0"><code>$2</code></pre>');
    h=h.replace(/`([^`]+)`/g,'<code style="background:rgba(110,118,129,.4);padding:1px 4px;border-radius:3px">$1</code>');
    d.innerHTML=h;
  }else{d.textContent=text}
  msgs.appendChild(d);msgs.scrollTop=msgs.scrollHeight;
}

document.getElementById('builder-chat-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendBuilderChat()}});
