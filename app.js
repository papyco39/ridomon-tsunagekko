'use strict';
const $=s=>document.querySelector(s),P=Puzzle,names=['ポピ','モモ','ラヴィ','ブル'],files=['popi','momo','ravi','buru'];
let chars=Array.from({length:9},(_,i)=>i<4?{name:names[i],src:`assets/${files[i]}.png`,original:`assets/${files[i]}.png`,crop:{zoom:1,x:0,y:0}}:null),bests={},selected=[0,1,2,3],sound=false,sfxVolume=.8,bgmVolume=.35,frameTheme='white',duration=60,db=null,storage='local',world=null,pieceElements=new Map(),board=[],path=[],playing=false,busy=false,paused=false,shuffling=false,shuffleReady=false,score=0,remaining=0,last=0,raf=0,epoch=0,activeIds=[],pointer=null,editSlot=0,cropImage=null,cropOriginal='',crop={zoom:1,x:0,y:0},drag=null,toastTimer;
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200)}
function show(id){document.querySelectorAll('.screen').forEach(e=>e.hidden=e.id!==id);document.body.dataset.screen=id;window.scrollTo(0,0);requestAnimationFrame(fitBoard)}
function state(){return {chars,bests,duration,selected,sound,sfxVolume,bgmVolume,frameTheme,builtinsVersion:P.BUILTINS_VERSION}}
async function save(){try{if(db){await new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(state(),'state');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}else localStorage.setItem('tsunagekko-v1',JSON.stringify(state()));return true}catch(e){toast('保存できませんでした。空き容量やブラウザ設定を確認してください。');return false}}
async function backupLegacy(data){
 if(db)await new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite'),store=tx.objectStore('data'),r=store.get('before-v1.1.0');r.onsuccess=()=>{if(!r.result)store.put(data,'before-v1.1.0')};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
 else if(!localStorage.getItem('tsunagekko-before-v1.1.0'))localStorage.setItem('tsunagekko-before-v1.1.0',JSON.stringify(data));
}
async function backupBeforeIcons(data){
 if(db)await new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite'),store=tx.objectStore('data'),r=store.get('before-v1.3.0-icons');r.onsuccess=()=>{if(!r.result)store.put(data,'before-v1.3.0-icons')};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
 else if(!localStorage.getItem('tsunagekko-before-v1.3.0-icons'))localStorage.setItem('tsunagekko-before-v1.3.0-icons',JSON.stringify(data));
}
async function init(){try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tsunagekko-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});storage='IndexedDB'}catch(e){db=null}try{let data=db?await new Promise((resolve,reject)=>{const r=db.transaction('data').objectStore('data').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)}):JSON.parse(localStorage.getItem('tsunagekko-v1')||'null');if(!data&&db){try{data=JSON.parse(localStorage.getItem('tsunagekko-v1')||'null')}catch(e){}}const migrated=P.migrate(data,chars);({chars,selected,bests,duration,sound,frameTheme}=migrated);({sfxVolume,bgmVolume}=RidomonSound.settings(data));if(data?.chars?.length===7)await backupLegacy(data);if(data&&data.builtinsVersion!==P.BUILTINS_VERSION){await backupBeforeIcons(data);await save();}}catch(e){toast('保存データを読み込めませんでした。')}renderAll();renderSettings();document.body.dataset.screen='home';fitBoard()}
function applySlotStyle(el,slot,c){if(!el||slot<0||slot>8)return;el.dataset.slot=String(slot);el.style.setProperty('--slot-color',P.SLOT_COLORS[slot]);el.style.setProperty('--slot-ring',P.ringWidth(c,slot)+'px');}
function image(src,alt,slot=-1){const i=document.createElement('img');i.src=src;i.alt=alt;if(slot>=0){i.classList.add('slot-icon');applySlotStyle(i,slot,chars[slot]);}return i}
function renderAll(){renderSettings();const filled=chars.filter(Boolean);$('#mascots').replaceChildren(...filled.slice(0,4).map(c=>image(c.src,c.name,chars.indexOf(c))));renderTeam();$('#times').replaceChildren(...[30,60,90,120,150,180].map(t=>{const b=document.createElement('button');b.innerHTML=`${t}<span>秒</span>`;b.className=t===duration?'selected':'';b.setAttribute('aria-pressed',t===duration);b.onclick=()=>{duration=t;renderAll();save()};return b}));$('#bestSetup').textContent=`✦ BEST (${duration}秒) ${(bests[duration]||0).toLocaleString()}`;renderSlots()}
function renderTeam(){
 selected=P.validSelection(chars,selected);
 $('#team').replaceChildren(...chars.flatMap((c,i)=>{if(!c)return [];const b=document.createElement('button');b.className='team-choice'+(selected.includes(i)?' chosen':'');b.setAttribute('aria-label',c.name);b.setAttribute('aria-pressed',selected.includes(i));const label=document.createElement('span');label.textContent=c.name;const check=document.createElement('b');check.className='check';check.textContent='✓';b.append(image(c.src,c.name,i),label,check);b.onclick=async()=>{const old=selected.slice();if(selected.includes(i))selected=selected.filter(x=>x!==i);else if(selected.length<7)selected.push(i);else return toast('選べるのは7種類までだよ。');renderTeam();if(!await save()){selected=old;renderTeam()}};return [b]}));
 $('#selectionCount').textContent=`${selected.length} / 7種類`;
 $('#selectionHint').textContent=selected.length<4?'あと'+(4-selected.length)+'種類を選んでね。':'このなかまであそべるよ ♡';
 $('#start').disabled=selected.length<4;
}
function renderSlots(){$('#slots').replaceChildren(...chars.map((c,i)=>{const box=document.createElement('div');box.className='slot';const a=document.createElement('button');a.className='avatar';a.setAttribute('aria-label',`${i+1}枠目 ${c?c.name+'を編集':'画像を追加'}`);if(c)a.append(image(c.src,c.name,i));else a.textContent='＋';a.onclick=()=>c?openEdit(i):pick(i);const name=document.createElement('strong');name.textContent=c?c.name:`${i+1} なかまを追加`;box.append(a,name);return box}))}
function openEdit(i){editSlot=i;$('#editTitle').textContent=chars[i].name+'の編集';$('#editPreview').replaceChildren(image(chars[i].src,chars[i].name,i));$('#editDialog').showModal()}
$('#closeEdit').onclick=()=>$('#editDialog').close();
$('#adjustChar').onclick=()=>{const i=editSlot,c=chars[i];$('#editDialog').close();openCrop(i,c.original||c.src,c.crop,c.name)};
$('#replaceChar').onclick=()=>{$('#editDialog').close();pick(editSlot)};
$('#deleteChar').onclick=async()=>{const old=chars[editSlot],oldSelected=selected.slice();chars[editSlot]=null;selected=selected.filter(i=>i!==editSlot);if(!await save()){chars[editSlot]=old;selected=oldSelected}else $('#editDialog').close();renderAll();if(selected.length<4)toast('プレイ用のキャラを4種類以上選んでね。')};
function pick(i){editSlot=i;$('#file').value='';$('#file').click()}
$('#file').onchange=async e=>{const f=e.target.files[0];if(!f)return;if(f.size>20*1024*1024){toast('20MB以下の画像を選んでください。');return}try{const url=URL.createObjectURL(f),im=await loadImage(url);const c=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(im.width,im.height));c.width=Math.round(im.width*scale);c.height=Math.round(im.height*scale);c.getContext('2d').fillStyle='white';c.getContext('2d').fillRect(0,0,c.width,c.height);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);await openCrop(editSlot,c.toDataURL('image/jpeg',.88),null,chars[editSlot]?.name||`キャラ${editSlot+1}`)}catch(err){toast('この画像を読み込めません。PNGやJPEGをお試しください。')}};
function loadImage(src){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src})}
async function openCrop(i,src,info,name){try{cropImage=await loadImage(src);editSlot=i;cropOriginal=src;crop=info?{...info}:{zoom:1,x:0,y:0};$('#zoom').value=crop.zoom;$('#charName').value=name;drawCrop();$('#cropDialog').showModal()}catch(e){toast('画像を読み込めませんでした。')}}
function dimensions(){const s=320/Math.min(cropImage.width,cropImage.height)*crop.zoom;return {w:cropImage.width*s,h:cropImage.height*s}}
function drawCrop(){const {w,h}=dimensions();crop.x=Math.max(-(w-320)/2,Math.min((w-320)/2,crop.x));crop.y=Math.max(-(h-320)/2,Math.min((h-320)/2,crop.y));const ctx=$('#cropCanvas').getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,320,320);ctx.drawImage(cropImage,(320-w)/2+crop.x,(320-h)/2+crop.y,w,h)}
$('#zoom').oninput=e=>{crop.zoom=+e.target.value;drawCrop()};$('#cropCanvas').onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,ox:crop.x,oy:crop.y};e.target.setPointerCapture(e.pointerId)};$('#cropCanvas').onpointermove=e=>{if(!drag)return;const s=320/e.target.getBoundingClientRect().width;crop.x=drag.ox+(e.clientX-drag.x)*s;crop.y=drag.oy+(e.clientY-drag.y)*s;drawCrop()};$('#cropCanvas').onpointerup=$('#cropCanvas').onpointercancel=()=>drag=null;
$('#cropCancel').onclick=()=>$('#cropDialog').close();$('#cropSave').onclick=async()=>{const old=chars[editSlot];chars[editSlot]={name:$('#charName').value.trim()||`キャラ${editSlot+1}`,src:$('#cropCanvas').toDataURL('image/jpeg',.9),original:cropOriginal,crop:{...crop}};if(await save()){$('#cropDialog').close();renderAll();toast('なかまを保存しました ♡')}else chars[editSlot]=old};
$('#restore').onclick=async()=>{const old=chars.slice();for(let i=0;i<4;i++)chars[i]={name:names[i],src:`assets/${files[i]}.png`,original:`assets/${files[i]}.png`,crop:{zoom:1,x:0,y:0}};if(!await save())chars=old;renderAll();toast('最初の4キャラを表示しました')};
function setup(){if(chars.filter(Boolean).length<4){toast('キャラを4種類以上登録してね。');show('characters');return}renderAll();show('setup')}
$('#play').onclick=$('#ready').onclick=setup;$('#setupEdit').onclick=()=>{renderAll();show('characters')};$('#sound').onclick=$('#gameSound').onclick=toggleSound;$('#edit').onclick=$('#resultEdit').onclick=()=>{renderAll();show('characters')};document.querySelectorAll('.back, #result .home-button').forEach(b=>b.onclick=()=>show('home'));$('#homeLink').onclick=e=>{e.preventDefault();if(playing)pauseGame();else show('home')};$('#help').onclick=()=>$('#helpDialog').showModal();$('#closeHelp').onclick=()=>$('#helpDialog').close();
let idleSince=performance.now(),idleHint=[],pendingClear=Promise.resolve();
let viewScale=1,previousPoint=null,finger=null,moveCheck=0,audio=null,voices=new Set();
function renderSettings(){
 for(const id of ['sound','gameSound']){const b=$('#'+id);b.textContent=sound?'♪ 音 ON':'♪ 音 OFF';b.setAttribute('aria-pressed',String(sound));b.setAttribute('aria-label',sound?'音 ON（タップでOFF）':'音 OFF（タップでON）');}
 document.documentElement.style.setProperty('--piece-frame','#ffffff');
 for(const [id,value] of [['sfxVolume',sfxVolume],['bgmVolume',bgmVolume]]){const el=$('#'+id);el.value=Math.round(value*100);$('#'+id+'Value').textContent=Math.round(value*100)+'%';}
}
const mixer=new RidomonSound.Mixer();
function refreshMixer(){mixer.configure(sound,{sfxVolume,bgmVolume});}
async function toggleSound(){
 const old=sound;sound=!sound;renderSettings();refreshMixer();if(sound)tone(0);
 $('#sound').disabled=$('#gameSound').disabled=true;
 try{if(!await save()){sound=old;renderSettings();refreshMixer();}}finally{$('#sound').disabled=$('#gameSound').disabled=false;}
}
function tone(n){refreshMixer();mixer.tone(n);}
function openAudio(){renderSettings();$('#audioDialog').showModal();}
$('#audioSettings').onclick=$('#pauseAudio').onclick=$('#homeAudio').onclick=openAudio;
$('#closeAudio').onclick=()=>$('#audioDialog').close();
$('#restartAudio').onclick=()=>{if(!sound){sound=true;renderSettings();save();}refreshMixer();mixer.recover().then(ok=>{if(ok)tone(0);else toast('音の再開には、もう一度タップしてね。');});};
$('#previewSound').onclick=()=>{if(!sound){sound=true;renderSettings();save();}tone(4);};
for(const [id,key] of [['sfxVolume','sfxVolume'],['bgmVolume','bgmVolume']]){
 const input=$('#'+id);let committed;
 input.onfocus=()=>{committed=key==='sfxVolume'?sfxVolume:bgmVolume;};
 input.oninput=()=>{const v=Math.max(0,Math.min(1,Number(input.value)/100));if(key==='sfxVolume')sfxVolume=v;else bgmVolume=v;refreshMixer();$('#'+id+'Value').textContent=Math.round(v*100)+'%';};
 input.onchange=async()=>{if(!await save()){if(key==='sfxVolume')sfxVolume=committed??.8;else bgmVolume=committed??.35;renderSettings();refreshMixer();}else committed=key==='sfxVolume'?sfxVolume:bgmVolume;};
}
// Resume/re-unlock from real user input. Never change hardware volume.
document.addEventListener('pointerdown',()=>{refreshMixer();mixer.unlock();},{passive:true});
document.addEventListener('click',()=>{refreshMixer();mixer.unlock();},{passive:true});
function fitBoard(){
 const zone=$('#boardZone'),el=$('#board');if(!zone||!el||!playing)return;
 const r=zone.getBoundingClientRect(),w=Math.max(1,Math.min(r.width-8,(r.height-8)*P.WIDTH/P.HEIGHT));
 el.style.width=w+'px';el.style.height=w*P.HEIGHT/P.WIDTH+'px';if(world)renderBoard();
}
if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitBoard).observe($('#boardZone'));
function updateVisibleViewport(){const v=window.visualViewport;if(v){document.documentElement.style.setProperty('--visible-height',v.height+'px');document.documentElement.style.setProperty('--viewport-top',v.offsetTop+'px');}fitBoard();}
window.visualViewport?.addEventListener('resize',updateVisibleViewport);
window.visualViewport?.addEventListener('scroll',updateVisibleViewport);
updateVisibleViewport();
function syncPieces(){
 const existing=new Set(world.bodies.map(b=>b.uid));for(const [uid,el]of pieceElements)if(!existing.has(uid)){el.remove();pieceElements.delete(uid)}
 for(const b of world.bodies){let el=pieceElements.get(b.uid);if(!el){el=document.createElement('div');el.className='piece';el.dataset.uid=b.uid;const orb=document.createElement('div');orb.className='orb';const mask=document.createElement('div');mask.className='art-mask';mask.append(image(chars[b.kind].src,chars[b.kind].name,b.kind));orb.append(mask);el.append(orb);$('#pieces').append(el);pieceElements.set(b.uid,el)}else{const im=el.querySelector('img');if(im.alt!==chars[b.kind].name||el.dataset.kind!==String(b.kind)){im.src=chars[b.kind].src;im.alt=chars[b.kind].name}}el.dataset.kind=b.kind;applySlotStyle(el,b.kind,chars[b.kind]);applySlotStyle(el.querySelector('img'),b.kind,chars[b.kind]);}
}
function renderBoard(){
 const boardEl=$('#board');viewScale=boardEl.clientWidth/P.WIDTH;const yScale=boardEl.clientHeight/P.HEIGHT;
 for(const b of world.bodies){const el=pieceElements.get(b.uid);if(!el)continue;
  const impact=b.impact||0,angle=(b.impactAngle??Math.PI/2).toFixed(3),elasticKey=impact.toFixed(3)+':'+angle;
  if(el.dataset.elasticKey!==elasticKey){el.style.setProperty('--squash-normal',(1-.065*impact).toFixed(3));el.style.setProperty('--squash-side',(1+.085*impact).toFixed(3));el.style.setProperty('--impact-angle',angle+'rad');el.style.setProperty('--impact-back',(-Number(angle)).toFixed(3)+'rad');el.dataset.elasticKey=elasticKey;}
  const puff=(1+.012*impact).toFixed(3);if(el.dataset.puff!==puff){el.style.setProperty('--puff-scale',puff);el.dataset.puff=puff;}
  const transform=`translate3d(${((b.x-b.r)*viewScale).toFixed(2)}px,${(b.y*yScale-b.r*viewScale).toFixed(2)}px,0) rotate(${b.angle.toFixed(3)}rad)`;
  if(el.dataset.position!==transform){el.style.transform=transform;el.dataset.position=transform;}
 }
 drawPath();
}
function drawPath(){const next=new Set(world?P.candidates(world.bodies,path):[]);for(const[uid,el]of pieceElements){el.classList.toggle('selected',path.includes(uid));el.classList.toggle('candidate',next.has(uid));el.classList.toggle('idle-hint',!path.length&&idleHint.includes(uid));el.classList.toggle('subdued',path.length>0&&!path.includes(uid)&&!next.has(uid));}$('#route').setAttribute('viewBox',`0 0 ${P.WIDTH} ${P.HEIGHT}`);const points=path.map(uid=>world.get(uid)).filter(Boolean).map(b=>`${b.x},${b.y}`);if(finger&&path.length)points.push(`${finger.x},${finger.y}`);$('#route polyline').setAttribute('points',points.join(' '));$('#chainText').textContent=path.length?`${path.length} CONNECT${path.length>=3?' ♡':''}${next.size?' · 候補'+next.size:''}`:'3つ以上つなげよう ♡';renderShuffleButton();}
function point(e){const b=$('#board'),r=b.getBoundingClientRect();return {x:(e.clientX-r.left-b.clientLeft)/b.clientWidth*P.WIDTH,y:(e.clientY-r.top-b.clientTop)/b.clientHeight*P.HEIGHT};}
function extend(b){if(!b||!path.length)return;const end=world.get(path.at(-1));if(path.length>1&&b.uid===path.at(-2)){path.pop();drawPath()}else if(!path.includes(b.uid)&&b.kind===world.get(path[0]).kind&&P.canConnect(end,b,world.bodies)){path.push(b.uid);drawPath();}}
function movePointer(e){const p=point(e);finger={x:Math.max(0,Math.min(P.WIDTH,p.x)),y:Math.max(0,Math.min(P.HEIGHT,p.y))};const prev=previousPoint||p,steps=Math.max(1,Math.ceil(Math.hypot(p.x-prev.x,p.y-prev.y)/(P.RADIUS*.3)));for(let i=1;i<=Math.min(steps,100);i++)extend(world.pick(prev.x+(p.x-prev.x)*i/steps,prev.y+(p.y-prev.y)*i/steps));previousPoint=p;drawPath();}
$('#board').onpointerdown=e=>{if(!playing||paused||busy||shuffling||pointer!==null)return;const p=point(e),b=world.pick(p.x,p.y);if(!b)return;e.preventDefault();idleSince=performance.now();idleHint=[];pointer=e.pointerId;path=[b.uid];previousPoint=p;finger=p;$('#board').setPointerCapture(e.pointerId);drawPath();};
$('#board').onpointermove=e=>{if(e.pointerId!==pointer||paused||busy)return;e.preventDefault();const events=e.getCoalescedEvents?.();for(const p of events?.length?events:[e])movePointer(p);};
$('#board').onpointerup=e=>{if(e.pointerId!==pointer)return;movePointer(e);pointer=null;finger=null;previousPoint=null;pendingClear=resolvePath();};
function clearPath(){idleSince=performance.now();idleHint=[];pointer=null;finger=null;previousPoint=null;path=[];drawPath();}
$('#board').onpointercancel=clearPath;$('#board').onlostpointercapture=()=>{if(pointer!==null)clearPath()};
function delay(ms){return new Promise(r=>setTimeout(r,ms));}
async function resolvePath(){
 if(!playing||paused||busy)return;if(path.length<3){clearPath();return;}busy=true;const token=epoch;try{const chosen=[...new Set(path)].filter(uid=>world.get(uid)),gain=P.points(chosen.length);score+=gain;$('#score').textContent=score.toLocaleString();$('#boardMessage').textContent=`${chosen.length>=4?'✦ ながくつながった！':'きらり！'} ＋${gain.toLocaleString()}`;tone(chosen.length);
 for(const uid of chosen){const b=world.get(uid);pieceElements.get(uid)?.classList.add('pop');for(let n=0;n<(chosen.length>=4?5:3);n++){const s=document.createElement('span');s.className='spark';s.textContent=n%2?'♡':'✦';s.style.left=`${b.x/P.WIDTH*100}%`;s.style.top=`${b.y/P.HEIGHT*100}%`;s.style.setProperty('--dx',`${Math.random()*90-45}px`);s.style.setProperty('--dy',`${-20-Math.random()*65}px`);$('#particles').append(s);setTimeout(()=>s.remove(),650);}}
 if(chosen.length>=4){const burst=document.createElement('span');burst.className='combo-label';burst.textContent=`${chosen.length} CONNECT!`;$('#particles').append(burst);setTimeout(()=>burst.remove(),850);}
 clearPath();await delay(240);if(token!==epoch)return;world.remove(chosen);syncPieces();renderBoard();moveCheck=0;}catch(error){console.error('消去処理を復旧',error);toast('盤面を整えました。つづけて遊べます。');}finally{if(token===epoch){world.reconcile();syncPieces();clearPath();renderBoard();busy=false;}}
}
function renderShuffleButton(){
 const enabled=playing&&!paused&&!shuffling;$('#shuffle').disabled=!enabled;$('#shuffle').classList.toggle('ready',enabled);
 $('#shuffle').textContent=shuffling?'↻ 並べ直し中…':'↻ シャッフル';
 $('#shuffleHint').textContent=shuffling?'ふんわり落下中。スコアも時間も、そのまま。':'いつでも何度でも ♡ スコア・時間のペナルティなし';
}
function updateShuffleStatus(){renderShuffleButton();}
async function shuffleGame(){
 if(!playing||paused||shuffling)return;
 const token=epoch;shuffling=true;clearPath();renderShuffleButton();
 try{
  await pendingClear;if(token!==epoch)return;busy=true;$('#board').classList.add('shuffle-out');
  await delay(160);if(token!==epoch)return;
  world.shuffle();syncPieces();$('#board').classList.remove('shuffle-out');
  const began=world.time;
  while(token===epoch&&playing){
   await delay(40);if(paused)continue;
   if(world.stable()&&world.time-began>.5)break;
   if(world.time-began>12){world.bodies.forEach((b,i)=>{const row=Math.floor(i/6),col=i%6;Object.assign(b,{x:44+col*92+(row%2)*44,y:756-row*79,vx:0,vy:0,entered:true});});break;}
  }
  if(token!==epoch)return;
  if(!world.finishShuffle())throw Error('接続グループを確保できませんでした');
  renderBoard();tone(4);$('#boardMessage').textContent='ふんわり、並べ直したよ ♡';
 }catch(error){console.error('並べ直し',error);toast('もう一度シャッフルしてね。');}
 finally{if(token===epoch){$('#board').classList.remove('shuffle-out','shuffle-in');busy=false;shuffling=false;last=performance.now();idleSince=last;updateShuffleStatus();}}
}
$('#shuffle').onclick=shuffleGame;
function start(){
 selected=P.validSelection(chars,selected);if(selected.length<4||selected.length>7){toast('プレイ用のキャラを4〜7種類選んでね。');return setup();}
 idleSince=performance.now();idleHint=[];pendingClear=Promise.resolve();epoch++;cancelAnimationFrame(raf);activeIds=selected.slice();world=new P.World(activeIds);score=0;remaining=duration;path=[];pointer=null;finger=null;busy=false;paused=false;shuffling=false;shuffleReady=false;playing=true;moveCheck=0;renderShuffleButton();$('#score').textContent='0';$('#gameBest').textContent=`BEST ${(bests[duration]||0).toLocaleString()}`;$('#boardMessage').textContent='';$('#particles').replaceChildren();$('#pieces').replaceChildren();pieceElements.clear();show('game');syncPieces();fitBoard();renderBoard();last=performance.now();updateTime();tone(0);raf=requestAnimationFrame(tick);
}
function updateTime(){$('#timer').textContent=Math.ceil(remaining);$('#timeBar').style.width=`${remaining/duration*100}%`;}
function tick(t){
 if(!playing)return;const elapsed=Math.max(0,(t-last)/1000);last=t;
 if(!paused){
  if(!shuffling){remaining=Math.max(0,remaining-elapsed);updateTime();if(!remaining){finish();return;}}
  if(pointer===null&&(!busy||shuffling)){
   world.step(elapsed);moveCheck+=elapsed;
   if(moveCheck>.3){moveCheck=0;world.reconcile();syncPieces();updateShuffleStatus();
    idleHint=!busy&&!shuffling&&performance.now()-idleSince>2800&&world.stable()?(world.findChain()||[]).map(b=>b.uid):[];
   }
   if(idleHint.length&&!idleHint.every((id,i)=>!i||P.canConnect(world.get(idleHint[i-1]),world.get(id),world.bodies)))idleHint=[];
   renderBoard();
  }
 }
 raf=requestAnimationFrame(tick);
}
function finish(){playing=false;epoch++;busy=false;shuffling=false;shuffleReady=false;clearPath();const record=score>(bests[duration]||0);if(record){bests[duration]=score;save();}$('#record').textContent=record?'✦ NEW BEST！ ハイスコア更新 ✦':'つながるって、たのしいね。';$('#finalScore').textContent=score.toLocaleString();$('#finalBest').textContent=`BEST (${duration}秒) ${(bests[duration]||0).toLocaleString()}`;show('result');renderAll();}
function pauseGame(){if(!playing||paused)return;if(!shuffling)remaining=Math.max(0,remaining-(performance.now()-last)/1000);last=performance.now();if(!remaining)return finish();paused=true;clearPath();renderShuffleButton();$('#pauseDialog').showModal();}
$('#pause').onclick=pauseGame;$('#resume').onclick=()=>{$('#pauseDialog').close();paused=false;refreshMixer();mixer.unlock();last=performance.now();renderShuffleButton();};$('#pauseDialog').addEventListener('cancel',e=>e.preventDefault());$('#quit').onclick=()=>{$('#pauseDialog').close();playing=false;shuffling=false;shuffleReady=false;epoch++;cancelAnimationFrame(raf);$('#board').classList.remove('shuffle-out','shuffle-in');show('home');};document.addEventListener('visibilitychange',()=>{if(document.hidden){mixer.stop();pauseGame();}});$('#start').onclick=$('#again').onclick=start;window.addEventListener('resize',()=>{if(playing)renderBoard();});init();
