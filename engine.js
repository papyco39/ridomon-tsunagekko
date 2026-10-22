/* Fixed-step circle physics. No external runtime or network dependencies. */
(function(root){
'use strict';
const WIDTH=600,HEIGHT=800,RADIUS=44,COUNT=48,STEP=1/120;
const SLOT_COLORS=Object.freeze(['#efa633','#ed82ab','#ac86dd','#66b9e8','#67c8ae','#ee967f','#dcc355','#8ca9df','#c794cf']);
const SLOT_COLOR_NAMES=Object.freeze(['オレンジ','ピンク','ラベンダー','スカイブルー','ミント','コーラル','レモン','ペリウィンクル','ライラック']);
function isBuiltinIcon(c,slot){if(slot<0||slot>3||!c)return false;const file=['popi','momo','ravi','buru'][slot];const ref=String(c.original||c.src||'').replace(/\\/g,'/');return !ref.startsWith('data:')&&ref.includes('assets/')&&ref.split('/').pop().split('?')[0]===file+'.png';}
function ringWidth(c,slot){return isBuiltinIcon(c,slot)?3.5:6;}
const BUILTINS_VERSION='round-icons-20261022';
// Center distance in multiples of the combined radii; applies equally in all directions.
const CONNECT_DISTANCE_RATIO=1.75,OBSTRUCTION_RADIUS_RATIO=.78;
function connectionLimit(a,b){return (a.r+b.r)*CONNECT_DISTANCE_RATIO;}
function near(a,b){return a.uid!==b.uid&&Math.hypot(a.x-b.x,a.y-b.y)<=connectionLimit(a,b);}
function canConnect(a,b,bodies,same=true){
 if(!a||!b||!near(a,b)||(same&&a.kind!==b.kind)||a.y<0||b.y<0)return false;
 const dx=b.x-a.x,dy=b.y-a.y,d2=dx*dx+dy*dy;if(!d2)return false;
 return !bodies.some(c=>{if(c.uid===a.uid||c.uid===b.uid||c.y<0)return false;const t=((c.x-a.x)*dx+(c.y-a.y)*dy)/d2;if(t<=0||t>=1)return false;return Math.hypot(c.x-a.x-t*dx,c.y-a.y-t*dy)<c.r*OBSTRUCTION_RADIUS_RATIO;});
}
function candidates(bodies,path){
 if(!path.length)return [];const tail=bodies.find(b=>b.uid===path.at(-1));if(!tail)return [];
 const used=new Set(path);return bodies.filter(b=>!used.has(b.uid)&&canConnect(tail,b,bodies)).map(b=>b.uid);
}
function upgradeBuiltins(chars,data,defaults){
 if(data?.builtinsVersion===BUILTINS_VERSION)return chars;
 const files=['popi','momo','ravi','buru'];return chars.map((c,i)=>{
  if(i>=4||!c||!defaults[i])return c;
  const reference=String(c.original||c.src||'').replace(/\\/g,'/');
  const file=reference.split('/').pop().split('?')[0];
  if(file!==files[i]+'.png'||!reference.includes('assets/'))return c;
  return {...defaults[i],name:c.name||defaults[i].name};
 });
}
function validSelection(chars,selected){return [...new Set(selected)].filter(i=>Number.isInteger(i)&&i>=0&&i<9&&chars[i]).slice(0,7);}
function migrate(data,defaults){const source=Array.isArray(data?.chars)?data.chars:defaults;const chars=upgradeBuiltins(Array.from({length:9},(_,i)=>source[i]||null),data,defaults);return {builtinsVersion:BUILTINS_VERSION,chars,selected:validSelection(chars,Array.isArray(data?.selected)?data.selected:[0,1,2,3]),bests:data?.bests||{},duration:[30,60,90,120,150,180].includes(data?.duration)?data.duration:60,sound:data?.sound===true,frameTheme:['white','pink','lavender','blue'].includes(data?.frameTheme)?data.frameTheme:'white'};}
class World{
constructor(ids,random=Math.random){if(ids.length<4||ids.length>7)throw Error('4〜7種類が必要です');this.ids=ids.slice();this.random=random;this.bodies=[];this.serial=0;this.bag=[];this.accumulator=0;this.targetCount=COUNT;this.time=0;this.stats={removed:0,replenished:0,recovered:0};this.reconcile();}
nextKind(){if(!this.bag.length){this.bag=this.ids.slice();for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}}return this.bag.pop();}
entryPoint(){
 // Choose among random entry lanes, favoring short queues and valleys in the pile.
 let best=null;
 for(let i=0;i<16;i++){
  const x=RADIUS+this.random()*(WIDTH-2*RADIUS);
  let y=-RADIUS-4,surface=HEIGHT;
  for(const b of this.bodies){const dx=Math.abs(b.x-x);if(dx>=RADIUS+b.r+3)continue;
   if(b.y<RADIUS*2)y=Math.min(y,b.y-(RADIUS+b.r+5));
   if(b.y>=RADIUS)surface=Math.min(surface,b.y-Math.sqrt(Math.max(0,(RADIUS+b.r)**2-dx**2)));
  }
  const rank=y*2+surface*.55+this.random()*RADIUS*.7;
  if(!best||rank>best.rank)best={x,y,rank};
 }
 return best;
}
spawn(n){
 for(let i=0;i<n;i++){const {x,y}=this.entryPoint();this.bodies.push({uid:++this.serial,kind:this.nextKind(),x,y,r:RADIUS,vx:(this.random()-.5)*30,vy:65,angle:(this.random()-.5)*.1,born:this.time,entered:false});}
 return n;
}
reconcile(){
 // Repair a missing/corrupt body without allowing the target population to drift.
 const seen=new Set();this.bodies=this.bodies.filter(b=>{if(seen.has(b.uid)||!Number.isFinite(b.x)||!Number.isFinite(b.y))return false;seen.add(b.uid);if(!Number.isFinite(b.vx))b.vx=0;if(!Number.isFinite(b.vy))b.vy=0;if(!this.ids.includes(b.kind))b.kind=this.nextKind();return true;});
 if(this.bodies.length>this.targetCount)this.bodies=this.bodies.slice(0,this.targetCount);const missing=Math.max(0,this.targetCount-this.bodies.length);if(missing){this.spawn(missing);this.stats.replenished+=missing;}return missing;
}
remove(uids){const set=new Set(uids),before=this.bodies.length;this.bodies=this.bodies.filter(b=>!set.has(b.uid));const removed=before-this.bodies.length;this.stats.removed+=removed;const added=this.reconcile();return {removed,added,total:this.bodies.length};}
step(seconds){this.reconcile();this.accumulator+=Math.min(Math.max(seconds,0),.05);while(this.accumulator>=STEP){this.integrate();this.accumulator-=STEP;}this.recoverWaiting();}
markImpact(b,speed,angle=Math.PI/2){if(speed<80||this.time-(b.lastImpact??-1)<.16)return;b.impact=Math.max(b.impact||0,Math.min(1,speed/450));b.impactAngle=angle;b.lastImpact=this.time;}
integrate(){
this.time+=STEP;
for(const b of this.bodies){b.impact=(b.impact||0)*Math.exp(-STEP*8.5);if(b.impact<.01)b.impact=0;b.px=b.x;b.py=b.y;b.vy=Math.min(1100,b.vy+1750*STEP);b.vx*=.997;b.vy*=.999;b.x+=b.vx*STEP;b.y+=b.vy*STEP;b.angle+=(b.vx*.00003-b.angle*.018);}
for(let iteration=0;iteration<18;iteration++){
for(let i=0;i<this.bodies.length;i++)for(let j=i+1;j<this.bodies.length;j++){
const a=this.bodies[i],b=this.bodies[j];let dx=b.x-a.x,dy=b.y-a.y;const min=a.r+b.r;if(Math.abs(dx)>=min||Math.abs(dy)>=min)continue;let d=Math.hypot(dx,dy);if(d>=min)continue;if(d<.0001){dx=.001;dy=.0005;d=Math.hypot(dx,dy);}const nx=dx/d,ny=dy/d,correction=Math.max(0,min-d-.005)*.5;a.x-=nx*correction;a.y-=ny*correction;b.x+=nx*correction;b.y+=ny*correction;
const vn=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(vn<0){this.markImpact(a,-vn,Math.atan2(ny,nx));this.markImpact(b,-vn,Math.atan2(ny,nx));const restitution=vn< -110?.09:0,impulse=-(1+restitution)*vn*.5;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;const tangent=(b.vx-a.vx)*(-ny)+(b.vy-a.vy)*nx,friction=Math.max(-impulse*.045,Math.min(impulse*.045,-tangent*.025));a.vx-=friction*(-ny);a.vy-=friction*nx;b.vx+=friction*(-ny);b.vy+=friction*nx;}
}
for(const b of this.bodies){if(b.y>=b.r)b.entered=true;if(b.entered&&b.y<b.r){b.y=b.r;if(b.vy<0)b.vy=0;}if(b.x<b.r){b.x=b.r;if(b.vx<0)b.vx*=-.05;}if(b.x>WIDTH-b.r){b.x=WIDTH-b.r;if(b.vx>0)b.vx*=-.05;}if(b.y>HEIGHT-b.r){this.markImpact(b,b.vy);b.y=HEIGHT-b.r;if(b.vy>0)b.vy=b.vy>100?-b.vy*.09:0;b.vx*=.97;}}
}
for(const b of this.bodies){b.vx=b.vx*.12+(b.x-b.px)/STEP*.88;b.vy=b.vy*.12+(b.y-b.py)/STEP*.88;if(Math.hypot(b.vx,b.vy)<.02){b.vx=0;b.vy=0;}}
}
recoverWaiting(){
 for(const b of this.bodies){if(b.entered||this.time-b.born<3.5)continue;const others=this.bodies;this.bodies=others.filter(x=>x!==b);const entry=this.entryPoint();this.bodies=others;b.x=entry.x;b.y=Math.max(-RADIUS*2,entry.y);b.vx=(this.random()-.5)*30;b.vy=100;b.born=this.time;this.stats.recovered++;}
}
get(uid){return this.bodies.find(b=>b.uid===uid);}
pick(x,y){let best=null,dist=Infinity;for(const b of this.bodies){if(b.y<0)continue;const d=Math.hypot(b.x-x,b.y-y);if(d<=b.r*1.06&&d<dist){best=b;dist=d;}}return best;}
stable(){return this.bodies.every(b=>b.y>=b.r&&Math.hypot(b.vx,b.vy)<26);}
findChain(same=true){for(const b of this.bodies){if(b.y<b.r)continue;const neighbors=this.bodies.filter(a=>a.y>=a.r&&canConnect(a,b,this.bodies,same));if(neighbors.length>=2)return [neighbors[0],b,neighbors[1]];}return null;}
shuffle(){
 this.reconcile();const shuffled=this.bodies.slice();
 for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 this.bodies=[];
 for(const b of shuffled){const entry=this.entryPoint();Object.assign(b,{x:entry.x,y:entry.y,vx:(this.random()-.5)*65,vy:65,entered:false,born:this.time,impact:.65,angle:(this.random()-.5)*.1});this.bodies.push(b);}
 return {ok:true,total:this.bodies.length};
}
finishShuffle(){
 if(this.findChain())return true;
 const targets=this.findChain(false),group=this.ids.map(k=>this.bodies.filter(b=>b.kind===k)).find(g=>g.length>=3);
 if(!targets||!group)return false;
 const points=targets.map(b=>({x:b.x,y:b.y}));
 for(let i=0;i<3;i++){const b=group[i],p=points[i],other=this.bodies.find(c=>c.x===p.x&&c.y===p.y);if(other&&other!==b){const x=b.x,y=b.y;b.x=other.x;b.y=other.y;other.x=x;other.y=y;}}
 this.bodies.forEach(b=>{b.vx=0;b.vy=0;});return !!this.findChain();
}
ensureMove(){if(this.findChain())return false;const chain=this.findChain(false);if(!chain)return false;const kind=chain[0].kind;chain.forEach(b=>b.kind=kind);return true;}
}
const api={SLOT_COLORS,SLOT_COLOR_NAMES,isBuiltinIcon,ringWidth,World,near,canConnect,CONNECT_DISTANCE_RATIO,OBSTRUCTION_RADIUS_RATIO,connectionLimit,candidates,upgradeBuiltins,BUILTINS_VERSION,validSelection,migrate,points:n=>n*100+(n-3)*(n-3)*50,WIDTH,HEIGHT,RADIUS,COUNT};root.Puzzle=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);


