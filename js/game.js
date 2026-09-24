/* Chip's Challenge – HTML5.
   Original client-compatible renderer/movement preserved: 30 FPS, one-tile/500 ms
   Chip input and the original atlas/CSS are retained. This file extends the client
   with JSON levels, generic tile-linked monster actors, pushable dirt blocks,
   line-of-sight chase/return-to-path behavior, and editor compatibility.
*/
(()=>{'use strict';
const T=CC.TILES,DX=[0,-1,0,1],DY=[-1,0,1,0],MOVE_MS=500,FT=1000/30,ANIM=140,AUTO=200,AGGRO=14;
// Easy-to-tune monster settings. Lower milliseconds = faster movement.
const MONSTER_CONFIG=window.CC_MONSTER_CONFIG=Object.assign({
  spiderMoveMs:800,
  spiralMoveMs:600,
  teethMoveMs:400,
  genericMonsterMoveMs:500,
  teethFocusMs:5000,
  defaultVisionTiles:10,
  focusLoseDistanceTiles:10,
  spiderAggroTiles:9,
  spiderMaxPathTiles:14,
  monsterMaxPathTiles:32
},window.CC_MONSTER_CONFIG||{});
let ACTIVE_CONFIG=Object.assign({},MONSTER_CONFIG);
const $=i=>document.getElementById(i);
const LG={'.':0,'#':1,c:2,'~':3,f:4,x:0x2C,h:0x2F,E:0x15,S:0x22,B:0x16,R:0x17,G:0x18,Y:0x19,b:0x64,r:0x65,g:0x66,y:0x67,w:0x68,z:0x69,k:0x6A,u:0x6B,',':0x0B,':':0x2D,i:0x0C,'^':0x12,v:0x0D,'<':0x14,'>':0x13,t:0x21,o:0x2A,'@':0x29,p:0x2E,n:0x1E,N:0x1F,'=':0x23,a:0x25,A:0x26};
const LEVELS=(window.CC_LEVELS||[]).slice();
const MSG={spider:'Chip died to a spider.',spiral:'Chip died to a spiral thing.',teeth:'Chip died to the teeth monster.'};
const BASE={spider:0x40,spiral:0x44,teeth:0x54},LD={U:0,L:1,D:2,R:3};

const MONSTER_FAMILY={bug:{base:0x40,defaultSpeed:MONSTER_CONFIG.spiderMoveMs,ai:true,water:false,fire:false},fireball:{base:0x44,defaultSpeed:MONSTER_CONFIG.spiralMoveMs,ai:false,water:false,fire:true},ball:{base:0x48,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false},tank:{base:0x4C,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false},glider:{base:0x50,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:true,fire:false},teeth:{base:0x54,defaultSpeed:MONSTER_CONFIG.teethMoveMs,ai:true,water:false,fire:false},walker:{base:0x5C,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false},paramecium:{base:0x60,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false}};
const MONSTER_TILE_FAMILY=id=>T.monsterForTile?T.monsterForTile(id):(
  id>=0x40&&id<=0x43?{kind:'bug',base:0x40}:id>=0x44&&id<=0x47?{kind:'fireball',base:0x44}:
  id>=0x48&&id<=0x4B?{kind:'ball',base:0x48}:id>=0x4C&&id<=0x4F?{kind:'tank',base:0x4C}:
  id>=0x50&&id<=0x53?{kind:'glider',base:0x50}:id>=0x54&&id<=0x57?{kind:'teeth',base:0x54}:
  id>=0x5C&&id<=0x5F?{kind:'walker',base:0x5C}:id>=0x60&&id<=0x63?{kind:'paramecium',base:0x60}:null);
const KD={KeyW:0,ArrowUp:0,KeyA:1,ArrowLeft:1,KeyS:2,ArrowDown:2,KeyD:3,ArrowRight:3};
const SL=[['c',0x64],['r',0x65],['g',0x66],['y',0x67],['w',0x68],['z',0x69],['k',0x6A],['u',0x6B]];
const world=$('world'),app=$('app'),msgEl=$('msg'),invEl=$('inv');
let S=2,lv=0,total=0,tries=1,L,W,H,g,cells,chip,mons,blocks,act,inv,left,time,acc,state,hint,gt=0,held=[],buf=null,wLast='',sig='',custom=false,hintMode='none',hintOffAt=0,hiddenDirtActivated=false,waterFlashes=[];
const inb=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
const F=id=>{const b=T[id]||T[0],r=L&&L.rules&&L.rules[String(id)];return r?Object.assign({},b,r):b};
const TH=id=>F(id).th|0;
const blockAt=(x,y)=>blocks.find(b=>b.x===x&&b.y===y);
const monsterAt=(x,y)=>mons.find(m=>m.x===x&&m.y===y);
function actor(o){return Object.assign({ox:o.x,oy:o.y,d:2,t0:0,dur:0,fx:0,sid:-1,last:'',vx:o.x,vy:o.y},o)}
function normalizeLevel(data){
  const d=JSON.parse(JSON.stringify(data||{}));
  if(Array.isArray(d.tiles)&&d.width&&d.height){d.width|=0;d.height|=0;d.title=d.title||'CUSTOM LEVEL';d.timeLimit=Number.isFinite(+d.timeLimit)?+d.timeLimit:200;d.hint=typeof d.hint==='string'?d.hint:'';d.hintSettings=d.hintSettings&&typeof d.hintSettings==='object'?d.hintSettings:{};d.hintSettings.triggerTileId=Number.isInteger(d.hintSettings.triggerTileId)?d.hintSettings.triggerTileId:0x2F;d.hintSettings.offDelayMs=Math.max(0,Math.min(60000,Number(d.hintSettings.offDelayMs)||5000));d.hiddenDirtSettings=d.hiddenDirtSettings&&typeof d.hiddenDirtSettings==='object'?d.hiddenDirtSettings:{};d.hiddenDirtSettings.triggerTileId=Number.isInteger(d.hiddenDirtSettings.triggerTileId)?d.hiddenDirtSettings.triggerTileId:0x24;d.hiddenDirtSettings.oncePerMap=d.hiddenDirtSettings.oncePerMap!==false;d.hiddenDirt=Array.isArray(d.hiddenDirt)?d.hiddenDirt.map(p=>({x:p.x|0,y:p.y|0,underTile:Number.isInteger(p.underTile)?p.underTile:null})).filter(p=>p.x>=0&&p.y>=0&&p.x<d.width&&p.y<d.height):[];d.actors=Array.isArray(d.actors)?d.actors:[];d.rules=d.rules&&typeof d.rules==='object'?d.rules:{};d.monsterSettings=d.monsterSettings&&typeof d.monsterSettings==='object'?d.monsterSettings:(d.settings&&d.settings.monsters&&typeof d.settings.monsters==='object'?d.settings.monsters:{});return d}
  if(Array.isArray(d.map)){
    const h=d.map.length,w=Math.max(1,...d.map.map(r=>String(r).length)),tiles=new Array(w*h).fill(0),actors=[];
    d.map.forEach((row,y)=>[...String(row)].forEach((ch,x)=>{
      if(ch==='P'){actors.push({id:'chip',type:'chip',variant:'default',x,y,direction:2,speed:500,path:[]});tiles[y*w+x]=0}
      else if(ch==='D'){actors.push({id:'block-'+actors.length,type:'block',variant:'default',x,y,direction:2,speed:500,path:[]});tiles[y*w+x]=0}
      else tiles[y*w+x]=LG[ch]??0;
    }));
    (d.mons||[]).forEach((m,i)=>actors.push({id:m.id||('monster-'+i),type:m.k||m.type||'spider',tileId:m.tileId,direction:m.direction??2,speed:m.speed,path:Array.isArray(m.path)?m.path:[],variant:m.variant||'red',aiChase:!!m.aiChase}));
    return {schema:'chips-custom-level',version:5,title:d.name||'LEVEL',author:d.author||'',timeLimit:d.time||200,requiredChips:tiles.filter(x=>x===2).length,hint:typeof d.hint==='string'?d.hint:'',hintSettings:{triggerTileId:0x2F,offDelayMs:5000},hiddenDirt:[],hiddenDirtSettings:{triggerTileId:0x24,oncePerMap:true},width:w,height:h,tiles,actors,rules:d.rules||{},monsterSettings:d.monsterSettings||{},tileset:window.CC_TILESET_INFO};
  }
  throw new Error('Unsupported level format.');
}
function pathToLoop(path){
  if(!Array.isArray(path)||path.length<2)return '';
  let s='';for(let i=0;i<path.length;i++){const a=path[i],b=path[(i+1)%path.length],dx=b.x-a.x,dy=b.y-a.y;s+=dx===1?'R':dx===-1?'L':dy===1?'D':dy===-1?'U':''}return s;
}
function loadData(raw,index=-1,isCustom=false){
  const data=normalizeLevel(raw);L=data;ACTIVE_CONFIG=Object.assign({},MONSTER_CONFIG,data.monsterSettings||{});custom=isCustom;lv=index;H=data.height;W=data.width;g=new Uint8Array(W*H);mons=[];blocks=[];left=0;chip=null;inv={c:0,r:0,g:0,y:0,w:0,z:0,k:0,u:0};hiddenDirtActivated=false;waterFlashes=[];
  if(Array.isArray(data.tiles))for(let i=0;i<g.length;i++)g[i]=Number.isInteger(data.tiles[i])&&data.tiles[i]>=0&&data.tiles[i]<T.length?data.tiles[i]:0;
  for(let i=0;i<g.length;i++)if(g[i]===2)left++;
  const actors=Array.isArray(data.actors)?data.actors:[];
  for(const a of actors){
    if(a.type==='chip')chip=actor({x:a.x|0,y:a.y|0,d:a.direction??2,ready:gt,fd:-1,auto:0,speed:a.speed||500,id:a.id||'chip',variant:a.variant||'default'});
    else if(a.type==='block'||a.type==='dirtBlock'){const bx=a.x|0,by=a.y|0,bi=by*W+bx,under=Number.isInteger(a.underTile)?a.underTile:(g[bi]===0x0A?0:g[bi]);if(inb(bx,by)&&g[bi]===0x0A)g[bi]=under;blocks.push(actor({x:bx,y:by,d:a.direction??2,id:a.id||('block-'+blocks.length),fd:-1,auto:0,speed:Math.max(100,Math.min(1000,Number(a.speed)||500)),underTile:under,hidden:false}));}
    else {
      let tileId=Number.isInteger(a.tileId)?a.tileId:null;
      let kind=a.type;
      if(kind==='spider')tileId=0x40+(a.direction??2),kind='bug';
      if(kind==='spiral')tileId=0x44+(a.direction??2),kind='fireball';
      if(kind==='teeth')tileId=0x54+(a.direction??2),kind='teeth';
      const fam=MONSTER_TILE_FAMILY(tileId);
      if(!fam)continue;
      const def=MONSTER_FAMILY[fam.kind]||MONSTER_FAMILY.teeth;const defaultSpeed=fam.kind==='bug'?ACTIVE_CONFIG.spiderMoveMs:fam.kind==='fireball'?ACTIVE_CONFIG.spiralMoveMs:fam.kind==='teeth'?ACTIVE_CONFIG.teethMoveMs:ACTIVE_CONFIG.genericMonsterMoveMs;
      const p=Array.isArray(a.path)?a.path:[];
      const isSpider = a.type==='spider' || fam.kind==='bug';
      mons.push(actor({id:a.id||fam.kind+'-'+mons.length,k:fam.kind,tileId:fam.base, x:a.x|0,y:a.y|0,d:a.direction??((tileId-fam.base)&3),variant:a.variant||'red',speed:Math.max(100,Math.min(2000,Number(a.speed)||defaultSpeed)),loop:pathToLoop(p),path:p,li:0,next:gt+1200+mons.length*180,aiChase:a.aiChase??(isSpider||def.ai),pathMode:a.pathMode||(isSpider?'ai':'loop'),visionRange:Math.max(1,Number(a.visionRange)||ACTIVE_CONFIG.defaultVisionTiles),focusLoseDistanceTiles:Math.max(1,Number(a.focusLoseDistanceTiles)||ACTIVE_CONFIG.focusLoseDistanceTiles),neverLoseFocus:a.neverLoseFocus===1||a.neverLoseFocus===true,focusMs:Math.max(250,Math.min(60000,Number(a.focusMs)||ACTIVE_CONFIG.teethFocusMs)),mode:'path',focusUntil:0,hasFocused:false,returnIndex:0}));
    }
  }
  // Palette-placed dirt-block tiles are also real movable blocks. Keep the saved tile as their floor underneath until they move.
  for(let i=0;i<g.length;i++)if(g[i]===0x0A){const x=i%W,y=(i/W)|0;if(!blockAt(x,y)){g[i]=0;blocks.push(actor({x,y,d:2,id:`tile-block-${i}`,fd:-1,auto:0,speed:500,underTile:0,hidden:false}));}}
  if(!chip)chip=actor({x:1,y:1,d:2,ready:gt,fd:-1,auto:0,speed:500,id:'chip',variant:'default'});
  // Hidden dirt is an overlay: its underlying tile remains walkable/unchanged until the red trigger fires.
  for(const p of data.hiddenDirt||[]){const i=p.y*W+p.x;if(i>=0&&i<g.length&&!Number.isInteger(p.underTile))p.underTile=g[i]}
  time=Math.max(0,Math.floor(+data.timeLimit||200));acc=0;state='play';hint='';hintMode='none';hintOffAt=0;held=[];buf=null;sig='';wLast='';msgEl.className='';
  world.textContent='';world.style.setProperty('--w',W);cells=[];
  for(let i=0;i<W*H;i++){const e=document.createElement('div');cells.push(e);world.append(e);paint(i)}
  act=[chip,...mons,...blocks];for(const o of act){o.el=document.createElement('div');o.el.className='a';world.append(o.el)}
}
function load(n){if(LEVELS[n])loadData(LEVELS[n],n,false)}
function paint(i){const e=cells[i],id=g[i];if(id>=0x40){CC.setTile(e,0);let s=e.firstChild;if(!s)e.append(s=document.createElement('div'));CC.setTile(s,id)}else{CC.setTile(e,id);if(e.firstChild)e.textContent=''}}
function sk(o){
  let id=o.fx;
  if(!id){
    if(o===chip)id=(F(g[o.y*W+o.x]).water?0x3C:0x6C)+o.d;
    else if(o.k==='spider')id=0x40+(o.d&3);
    else if(o.k==='spiral')id=0x44+(o.d&3);
    else if(o.k==='teeth')id=0x54+(o.d&3);
    else if(o.k)id=(o.tileId||0x40)+(o.d&3);
    else id=0x0A;
  }
  if(id!==o.sid){o.sid=id;CC.setTile(o.el,id)}
}
/* ---------- Chip ---------- */
function enter(id,i){const f=F(id);
  if(f.wall){if(id===0x2C){g[i]=1;paint(i)}return false}
  if(f.door){const k=f.door;if(!inv[k])return false;if(k!=='g')inv[k]--;g[i]=0;paint(i);return true}
  if(id===0x22){if(left>0)return false;g[i]=0;paint(i);return true}
  if(id===0x1E){g[i]=0;paint(i)}
  return !!(f.walk||f.item)
}
function blockCanEnter(id,d){
  const f=F(id);
  if(f.wall||f.door||id===0x22||id===0x15)return false;
  if(id===3||id===4||id===0x0C||f.ice||f.force!=null)return true;
  return f.walk||f.item||id===0||id===0x0B||id===0x2D||id===0x2E||id===0x2A||id===0x29;
}

// Dirt blocks are consumed by water. At the moment the block reaches the water cell,
// the water briefly becomes the normal walkable-dirt tile (0x0B). Exactly 100 ms later
// it changes into the normal light-grey walkable floor tile (0x00).
function beginWaterConversion(b,index,id){
  if(id!==3)return false;
  b.fd=-1;
  b.auto=0;
  b.waterConversionAt=gt+(b.dur||ANIM);
  b.waterConversionIndex=index;
  return true;
}
function commitWaterConversion(b){
  const index=Number.isInteger(b.waterConversionIndex)?b.waterConversionIndex:-1;
  if(index<0)return;
  // The dirt block is expended; the water cell becomes walkable dirt for 100 ms.
  g[index]=0x0B;
  paint(index);
  const el=b.el;
  blocks=blocks.filter(o=>o!==b);
  act=act.filter(o=>o!==b);
  if(el)el.remove();
  waterFlashes.push({index,until:gt+100});
}
function processWaterConversions(){
  for(const b of [...blocks]){
    if(b.waterConversionAt!=null&&gt>=b.waterConversionAt){
      b.waterConversionAt=null;
      commitWaterConversion(b);
    }
  }
  if(waterFlashes.length){
    const keep=[];
    for(const f of waterFlashes){
      if(gt>=f.until){
        // Only the new walkable floor is replaced; other runtime systems cannot turn this
        // cell back into water during the 100 ms visual transition.
        if(g[f.index]===0x0B){g[f.index]=0x00;paint(f.index)}
      }else keep.push(f);
    }
    waterFlashes=keep;
  }
}
function push(b,d){
  const x=b.x+DX[d],y=b.y+DY[d];if(!inb(x,y)||blockAt(x,y)||monsterAt(x,y))return false;
  const i=y*W+x,id=g[i];
  if(!blockCanEnter(id,d))return false;
  b.ox=b.x;b.oy=b.y;b.x=x;b.y=y;b.d=d;b.t0=gt;b.dur=ANIM;b.fx=0;b.sid=-1;
  if(id===3)beginWaterConversion(b,i,id);
  setupObjectMotion(b,d);
  return true
}
function setupObjectMotion(o,d){
  const id=g[o.y*W+o.x],f=F(id);o.fd=-1;
  // Dirt blocks always glide across ice in the direction they were pushed. Chip's ice skates do not affect blocks.
  if(o!==chip && f.ice){o.fd=d;o.auto=gt+Math.max(80,Math.min(500,Number(o.speed)||200));return}
  if(f.ice&&!inv.k){let nd=d,m=f.th|0;if(m)for(let s=0;s<4;s++)if(!(m>>s&1)&&s!==((d+2)&3)){nd=s;break}o.fd=nd}
  else if(f.force!=null&&!inv.u)o.fd=f.force<0?(Math.random()*4)|0:f.force;
  if(o.fd>=0)o.auto=gt+AUTO
}
function move(d){
  const c=chip,i0=c.y*W+c.x,x=c.x+DX[d],y=c.y+DY[d];c.d=d;if(!inb(x,y)||(TH(g[i0])>>d&1))return false;
  const id=g[y*W+x];if(TH(id)>>((d+2)&3)&1)return false;
  const b=blockAt(x,y);if(b&&!push(b,d))return false;
  if(!enter(id,y*W+x))return false;
  if(g[i0]===0x2E){g[i0]=1;paint(i0)}
  c.ox=c.x;c.oy=c.y;c.x=x;c.y=y;c.t0=gt;c.dur=ANIM;landed(d);return true
}
function landed(d){
  const c=chip,i=c.y*W+c.x,id=g[i],f=F(id);c.fd=-1;
  const hintTile=(L.hintSettings&&Number.isInteger(L.hintSettings.triggerTileId)?L.hintSettings.triggerTileId:0x2F);
  const hintDelay=Math.max(0,Math.min(60000,Number(L.hintSettings&&L.hintSettings.offDelayMs)||5000));
  if(id===0x21){
    hint='The thief took all your items.';hintMode='thief';hintOffAt=0;
    Object.keys(inv).forEach(k=>inv[k]=0);
  }else if(id===hintTile&&String(L.hint||'')){
    hint=String(L.hint);hintMode='question';hintOffAt=0;
  }else if(hintMode==='question'){
    hintOffAt=gt+hintDelay;
  }else if(hintMode==='thief'){
    hint='';hintMode='none';hintOffAt=0;
  }
  if(f.item){pick(id);g[i]=0;paint(i)}
  else if(id===3&&!inv.w)return die('Chip drowned in the water.',0x33);
  else if(id===4&&!inv.z)return die('Chip was burned by the fire.',0x34);
  else if(id===0x2A)return die('Chip was blown up by a bomb.',0x35);
  else if(id===0x15){c.fx=0x39;return win()}
  else if(id===hiddenDirtTriggerTile())revealHiddenDirt();
  if(id===0x23||id===0x24||id===0x27||id===0x28)activateButton(id);
  if(id===0x29)tele();
  if(f.ice&&!inv.k){let nd=d,m=TH(id);if(m)for(let s=0;s<4;s++)if(!(m>>s&1)&&s!==((d+2)&3)){nd=s;break}c.fd=nd}
  else if(f.force!=null&&!inv.u)c.fd=f.force<0?(Math.random()*4)|0:f.force;
  if(c.fd>=0)c.auto=gt+AUTO;hit()
}
function activateButton(id){
  if(id===0x23||id===0x24||id===0x27||id===0x28){
    for(let j=0;j<W*H;j++){
      if(id===0x23&&(g[j]===0x25||g[j]===0x26)){g[j]^=3;paint(j)}
      if(id===0x24&&g[j]===0x42){g[j]=0x41;paint(j)}
      if(id===0x27&&g[j]===0x41){g[j]=0x42;paint(j)}
    }
  }
}
function pick(id){if(id===2)left--;else if(id>=0x64&&id<=0x67)inv['crgy'[id-0x64]]++;else if(id>=0x68&&id<=0x6B)inv['wzku'[id-0x68]]=1}
function tele(){const n=W*H,i0=chip.y*W+chip.x;for(let k=1;k<n;k++){const j=(i0-k+n)%n,x=j%W,y=(j/W)|0;if(g[j]===0x29&&!blockAt(x,y)&&!monsterAt(x,y)){chip.x=x;chip.y=y;chip.dur=0;return}}}
function pump(){if(state!=='play'||gt<chip.ready)return;if(chip.fd>=0&&F(g[chip.y*W+chip.x]).force==null)return;const d=held.length?held[held.length-1]:(buf&&gt-buf.t<250?buf.d:-1);if(d<0)return;buf=null;chip.ready=gt+(move(d)?MOVE_MS:120)}
function pumpBlocks(){
  for(const b of blocks){
    if(state!=='play'||b.waterConversionAt!=null||b.fd<0||gt<b.auto)continue;
    const d=b.fd;
    if(moveBlock(b,d)) continue;
    // A pushed dirt block does not bounce backwards: if it reaches an obstacle/corner on ice it simply stops.
    b.fd=-1;b.auto=0;
  }
}
function moveBlock(b,d){
  const x=b.x+DX[d],y=b.y+DY[d];
  if(!inb(x,y)||blockAt(x,y)&&blockAt(x,y)!==b||monsterAt(x,y)||x===chip.x&&y===chip.y)return false;
  const id=g[y*W+x];if(!blockCanEnter(id,d))return false;
  b.ox=b.x;b.oy=b.y;b.x=x;b.y=y;b.d=d;b.t0=gt;b.dur=ANIM;setupObjectMotion(b,d);
  if(id===3)beginWaterConversion(b,y*W+x,id);
  if(id===0x2A){/* block destroys bomb */g[y*W+x]=0x0B;paint(y*W+x)}
  hit();return true
}
function hiddenDirtTriggerTile(){return Number.isInteger(L?.hiddenDirtSettings?.triggerTileId)?L.hiddenDirtSettings.triggerTileId:0x24}
function revealHiddenDirt(){
  if(hiddenDirtActivated)return false;
  const list=Array.isArray(L.hiddenDirt)?L.hiddenDirt:[];hiddenDirtActivated=true;
  for(let i=0;i<list.length;i++){
    const p=list[i],x=p.x|0,y=p.y|0;
    if(!inb(x,y)||blockAt(x,y)||monsterAt(x,y)||chip.x===x&&chip.y===y)continue;
    const under=Number.isInteger(p.underTile)?p.underTile:g[y*W+x];
    blocks.push(actor({x,y,d:2,id:`hidden-dirt-${i}`,fd:-1,auto:0,speed:500,underTile:under,hidden:true}));
  }
  act=[chip,...mons,...blocks];
  // Render the new blocks immediately without changing the underlying map tiles.
  for(const b of blocks)if(b.hidden&&!b.el){b.el=document.createElement('div');b.el.className='a';world.append(b.el)}
  return true
}
/* ---------- monster movement ---------- */
function monsterPass(m,id){const f=F(id);if(f.wall||f.door||id===0x22)return false;if(id===3)return !!MONSTER_FAMILY[m.k]?.water;if(id===4)return !!MONSTER_FAMILY[m.k]?.fire;return !!(f.walk||f.item)||id===0x0B||id===0x0C||id===0x2D||id===0x2E||id===0x2F||id===0x29}
function spiderPass(id){return id===0||id===0x26||id===0x2F}
function canSpider(m,d){if(d==null||d<0)return false;const x=m.x+DX[d],y=m.y+DY[d];return inb(x,y)&&spiderPass(g[y*W+x])&&!blockAt(x,y)&&!mons.some(o=>o!==m&&o.x===x&&o.y===y)}
function canM(m,d){if(d==null||d<0)return false;const x=m.x+DX[d],y=m.y+DY[d];return inb(x,y)&&monsterPass(m,g[y*W+x])&&!blockAt(x,y)&&!mons.some(o=>o!==m&&o.x===x&&o.y===y)}
function hasVision(m){
  const tx=chip.x,ty=chip.y,dx=tx-m.x,dy=ty-m.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))>m.visionRange)return false;
  if(dx===0&&dy===0)return true;
  // Teeth have line-of-sight in every direction, not just up/down/left/right.
  // Bresenham checks every intervening tile for a blocking wall, door, block, or monster.
  let x0=m.x,y0=m.y,x1=tx,y1=ty,adx=Math.abs(x1-x0),ady=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=adx-ady;
  while(!(x0===x1&&y0===y1)){
    const e2=2*err;if(e2>-ady){err-=ady;x0+=sx}if(e2<adx){err+=adx;y0+=sy}
    if(x0===x1&&y0===y1)break;
    if(!inb(x0,y0)||F(g[y0*W+x0]).wall||F(g[y0*W+x0]).hiddenWall||F(g[y0*W+x0]).popupWall||F(g[y0*W+x0]).door||blockAt(x0,y0)||monsterAt(x0,y0))return false;
  }
  return true;
}
function chaseTo(m,targetX,targetY,maxCost=20){
  if(!inb(targetX,targetY))return -1;
  const n=W*H,gs=new Array(n).fill(1e9),par=new Array(n).fill(-1),cl=new Uint8Array(n),s=m.y*W+m.x,t=targetY*W+targetX,open=[s];gs[s]=0;
  while(open.length){let bi=0,bf=1e9;for(let k=0;k<open.length;k++){const j=open[k],f=gs[j]+Math.abs(j%W-targetX)+Math.abs(((j/W)|0)-targetY);if(f<bf){bf=f;bi=k}}const cur=open.splice(bi,1)[0];if(cur===t)break;cl[cur]=1;for(let d=0;d<4;d++){const x=cur%W+DX[d],y=((cur/W)|0)+DY[d];if(!inb(x,y))continue;const j=y*W+x;if(cl[j]||(j!==t&&!monsterPass(m,g[j])))continue;if(gs[cur]+1<gs[j]&&gs[cur]+1<=maxCost){gs[j]=gs[cur]+1;par[j]=cur;if(!open.includes(j))open.push(j)}}}
  if(par[t]<0||gs[t]>maxCost)return -1;let j=t;while(par[j]!==s&&par[j]>=0)j=par[j];return DX.findIndex((_,d)=>m.x+DX[d]===j%W&&m.y+DY[d]===((j/W)|0))
}
function spiderChase(m){
  // Restored from the original client: A* pursuit within a 9-tile Manhattan aggro radius,
  // with a maximum 14-step path, over the spider's allowed walk tiles.
  const dx=Math.abs(chip.x-m.x),dy=Math.abs(chip.y-m.y);if(dx+dy>ACTIVE_CONFIG.spiderAggroTiles)return -1;
  const n=W*H,gs=new Array(n).fill(1e9),par=new Array(n).fill(-1),cl=new Uint8Array(n),s=m.y*W+m.x,t=chip.y*W+chip.x,open=[s];gs[s]=0;
  while(open.length){let bi=0,bf=1e9;for(let k=0;k<open.length;k++){const j=open[k],f=gs[j]+Math.abs(j%W-chip.x)+Math.abs(((j/W)|0)-chip.y);if(f<bf){bf=f;bi=k}}const cur=open.splice(bi,1)[0];if(cur===t)break;cl[cur]=1;for(let d=0;d<4;d++){const x=cur%W+DX[d],y=((cur/W)|0)+DY[d];if(!inb(x,y))continue;const j=y*W+x;if(cl[j]||(j!==t&&!spiderPass(g[j])))continue;if(gs[cur]+1<gs[j]){gs[j]=gs[cur]+1;par[j]=cur;if(!open.includes(j))open.push(j)}}}
  if(par[t]<0||gs[t]>ACTIVE_CONFIG.spiderMaxPathTiles)return -1;let j=t;while(par[j]!==s)j=par[j];return DX.findIndex((_,d)=>m.x+DX[d]===j%W&&m.y+DY[d]===((j/W)|0));
}
function chase(m,targetX=chip.x,targetY=chip.y){return chaseTo(m,targetX,targetY,ACTIVE_CONFIG.monsterMaxPathTiles)}
function followPath(m){const p=m.path||[];if(p.length<2)return -1;if(m.li>=p.length)m.li=0;const next=p[m.li];if(m.x===next.x&&m.y===next.y)m.li=(m.li+1)%p.length;const target=p[m.li];let d=chaseTo(m,target.x,target.y,Math.max(ACTIVE_CONFIG.monsterMaxPathTiles,W*H));if(d<0){const dx=target.x-m.x,dy=target.y-m.y;if(Math.abs(dx)+Math.abs(dy)===1)d=DX.findIndex((_,q)=>m.x+DX[q]===target.x&&m.y+DY[q]===target.y)}return d}
function focusChase(m){
  const visible=hasVision(m);
  if(visible){m.hasFocused=true;m.focusUntil=m.neverLoseFocus?Number.POSITIVE_INFINITY:gt+(m.focusMs||ACTIVE_CONFIG.teethFocusMs);}
  if(!m.hasFocused)return -1;
  const distance=Math.max(Math.abs(chip.x-m.x),Math.abs(chip.y-m.y));
  if(!m.neverLoseFocus && gt>=m.focusUntil)return -1;
  if(!m.neverLoseFocus && distance>m.focusLoseDistanceTiles)return -1;
  return chaseTo(m,chip.x,chip.y,ACTIVE_CONFIG.monsterMaxPathTiles);
}
function returnToPath(m){
  const p=m.path||[];if(p.length<2)return -1;let best=-1,bestD=1e9;for(let i=0;i<p.length;i++){const q=p[i],dd=Math.abs(q.x-m.x)+Math.abs(q.y-m.y);if(dd<bestD){bestD=dd;best=i}}
  if(best<0)return -1;const q=p[best],d=chaseTo(m,q.x,q.y,Math.max(ACTIVE_CONFIG.monsterMaxPathTiles,W*H));if(m.x===q.x&&m.y===q.y){m.mode='path';m.li=(best+1)%p.length;return followPath(m)}m.returnIndex=best;return d;
}
function stepMon(m){
  const fam=MONSTER_FAMILY[m.k]||MONSTER_FAMILY.bug; m.next=gt+(m.speed||fam.defaultSpeed);
  let d=-1;
  // Spiders default to the original A* AI. A path is optional and can replace that AI when pathMode=loop.
  if(m.k==='bug'&&m.pathMode!=='loop'){d=spiderChase(m);if(d<0||!canSpider(m,d)){d=-1;for(const q of [1,0,3,2]){const e=(m.d+q)&3;if(canSpider(m,e)){d=e;break}}}}
  else if(m.k==='teeth'&&m.aiChase){
    const visible=hasVision(m);
    if(visible){m.hasFocused=true;m.focusUntil=m.neverLoseFocus?Number.POSITIVE_INFINITY:gt+(m.focusMs||ACTIVE_CONFIG.teethFocusMs);}
    const cheb=Math.max(Math.abs(chip.x-m.x),Math.abs(chip.y-m.y));
    const focusActive=m.hasFocused && (m.neverLoseFocus || gt<m.focusUntil) && cheb<=m.focusLoseDistanceTiles;
    if(focusActive){m.mode='chase';d=chaseTo(m,chip.x,chip.y,ACTIVE_CONFIG.monsterMaxPathTiles)}
    else {if(m.mode==='chase')m.mode='return';if(m.mode==='return'||m.mode==='path')d=returnToPath(m);else d=followPath(m);}
  }
  else if(m.aiChase){d=focusChase(m);if(d<0&&m.pathMode==='loop')d=returnToPath(m)}
  else if(m.pathMode==='loop'){d=followPath(m)}
  if(!canM(m,d))return;
  m.d=d;m.ox=m.x;m.oy=m.y;m.x+=DX[d];m.y+=DY[d];m.t0=gt;m.dur=Math.min(m.speed||fam.defaultSpeed,300);m.sid=-1;
}
function hit(){for(const m of mons)if(m.x===chip.x&&m.y===chip.y)return die(MSG[m.k]||'Chip died to a monster.')}
/* ---------- state / UI ---------- */
function show(t,c){msgEl.innerHTML=t;msgEl.className='on '+(c||'')}
function die(m,fx){state='dead';if(fx)chip.fx=fx;show('<b>'+m+'</b><br><br>Press <kbd>Enter</kbd> to try again','bad')}
function win(){state='win';const tb=time*10,lb=Math.round(((lv<0?0:lv)+1)*500*Math.pow(.8,tries-1));total+=tb+lb;show('<b>Level complete!</b><br>Time bonus '+tb+' · Level bonus '+lb+'<br>Score '+total+'<br><br>Press <kbd>Enter</kbd>'+(custom?' to play again':(lv+1<LEVELS.length?' for the next level':' to play again')),'good')}
function hud(){const s=[lv,time,left,hint,Object.values(inv).join(),custom].join('|');if(s===sig)return;sig=s;$('lv').textContent=custom?'CUS':String(lv+1).padStart(3,'0');$('tm').textContent=String(time).padStart(3,'0');$('ch').textContent=String(left).padStart(3,'0');$('hint').textContent=hint;for(const e of invEl.children){const v=inv[e.k];e.style.opacity=v?1:.2;e.lastChild.textContent=v>1?v:''}}
function render(){const sc=32*S;for(const o of act){let x=o.x,y=o.y;if(o.dur){const a=Math.min(1,(gt-o.t0)/o.dur);x=o.ox+(o.x-o.ox)*a;y=o.oy+(o.y-o.oy)*a}o.vx=x;o.vy=y;sk(o);const s='translate3d('+x*sc+'px,'+y*sc+'px,0)';if(s!==o.last){o.last=s;o.el.style.transform=s}}const cl=(v,n)=>n*32<=288?(n*32-288)/2:Math.max(0,Math.min(n*32-288,v));const s='translate3d('+-cl((chip.vx+.5)*32-144,W)*S+'px,'+-cl((chip.vy+.5)*32-144,H)*S+'px,0)';if(s!==wLast){wLast=s;world.style.transform=s}}
function update(dt){if(state!=='play')return;acc+=dt;while(acc>=1000){acc-=1000;if(--time<=0){time=0;return die('Chip ran out of time.',0x33)}}const c=chip;if(c.fd>=0&&gt>=c.auto){const d=c.fd;c.auto=gt+AUTO;if(!move(d)&&F(g[c.y*W+c.x]).ice)c.fd=c.d=(d+2)&3}pump();pumpBlocks();processWaterConversions();for(const m of mons)if(state==='play'&&gt>=m.next)stepMon(m);if(hintMode==='question'&&hintOffAt>0&&gt>=hintOffAt){hint='';hintMode='none';hintOffAt=0}if(state==='play')hit()}
let last=0,prev=0,frames=0,fpsT=0;
function loop(t){requestAnimationFrame(loop);const d=t-last;if(d<FT-2)return;last=t-d%FT;const dt=Math.min(100,t-prev);prev=t;if(state!=='pause')gt+=dt;update(dt);render();hud();frames++;if(t-fpsT>=1000){$('fps').textContent=frames+' FPS';frames=0;fpsT=t}}
function fit(){S=Math.max(1,Math.min(4,Math.floor(Math.min(innerWidth/470,innerHeight/335))));app.style.setProperty('--s',S)}
async function importJSONFile(file){try{const text=await file.text(),data=JSON.parse(text),level=Array.isArray(data.levels)?data.levels[0]:data;if(!level)throw new Error('No level found.');loadData(level,-1,true)}catch(err){alert('Could not import level JSON.\n\n'+err.message)}}
addEventListener('keydown',e=>{const c=e.code;if(c in KD){e.preventDefault();const d=KD[c];if(!held.includes(d)){held.push(d);if(gt<chip.ready)buf={d,t:gt}}pump();return}if(c==='KeyP'||c==='Space'){e.preventDefault();if(state==='play'){state='pause';show('<b>PAUSED</b><br>Press P to resume')}else if(state==='pause'){state='play';msgEl.className=''}}else if(c==='KeyR'){tries++;custom?loadData(L,-1,true):load(lv)}else if(c==='KeyE'){window.location.href='editor.html'}else if(c==='KeyI'){$('levelFile').click()}else if(c==='Enter'){if(state==='win'){tries=1;if(custom)loadData(L,-1,true);else if(lv+1<LEVELS.length)load(lv+1);else{total=0;load(0)}}else if(state==='dead'){tries++;custom?loadData(L,-1,true):load(lv)}}else if(/^Digit[1-9]$/.test(c)&&LEVELS[+c[5]-1]){tries=1;total=0;load(+c[5]-1)}});
addEventListener('keyup',e=>{if(e.code in KD)held=held.filter(d=>d!==KD[e.code])});addEventListener('blur',()=>{held=[]});
$('levelFile').addEventListener('change',e=>{const f=e.target.files[0];if(f)importJSONFile(f);e.target.value=''})
SL.forEach(([k,id])=>{const s=document.createElement('div'),t=document.createElement('div');s.className='s';s.k=k;CC.setTile(t,id);s.append(t,document.createElement('i'));invEl.append(s)});
fit();addEventListener('resize',fit);let pending=null;try{pending=localStorage.getItem('ccPendingLevel')}catch(e){}if(pending){try{const p=JSON.parse(pending);try{localStorage.removeItem('ccPendingLevel')}catch(e){}loadData(p,-1,true)}catch(e){try{localStorage.removeItem('ccPendingLevel')}catch(x){}load(0)}}else load(0);requestAnimationFrame(loop);
})();
