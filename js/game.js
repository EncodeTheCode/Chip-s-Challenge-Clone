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
  monsterMaxPathTiles:32,
  gliderMoveMs:450,
  gliderTriggerTile:0x27,
  gliderStationTile:0x2B,
  maxGliderPaths:6,
  pathRouteChunkTiles:32,
  pathRouteMarginTiles:10,
  pathRouteMaxSteps:128
},window.CC_MONSTER_CONFIG||{});
const GLIDER_TRIGGER_TILE=0x27,GLIDER_STATION_TILE=0x2B,MAX_GLIDER_PATHS=6;
let ACTIVE_CONFIG=Object.assign({},MONSTER_CONFIG);
const $=i=>document.getElementById(i);
const LG={'.':0,'#':1,c:2,'~':3,f:4,x:0x2C,h:0x2F,E:0x15,S:0x22,B:0x16,R:0x17,G:0x18,Y:0x19,b:0x64,r:0x65,g:0x66,y:0x67,w:0x68,z:0x69,k:0x6A,u:0x6B,',':0x0B,':':0x2D,i:0x0C,'^':0x12,v:0x0D,'<':0x14,'>':0x13,t:0x21,o:0x2A,'@':0x29,p:0x2E,n:0x1E,N:0x1F,'=':0x23,a:0x25,A:0x26};
const LEVELS=(window.CC_LEVELS||[]).slice();
const MSG={spider:'Chip died to a spider.',spiral:'Chip died to a spiral thing.',teeth:'Chip died to the teeth monster.'};
const BASE={spider:0x40,spiral:0x44,teeth:0x54},LD={U:0,L:1,D:2,R:3};

const MONSTER_FAMILY={bug:{base:0x40,defaultSpeed:MONSTER_CONFIG.spiderMoveMs,ai:true,water:false,fire:false},fireball:{base:0x44,defaultSpeed:MONSTER_CONFIG.spiralMoveMs,ai:false,water:false,fire:true},ball:{base:0x48,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false},tank:{base:0x4C,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false},glider:{base:0x50,defaultSpeed:MONSTER_CONFIG.gliderMoveMs,ai:false,water:true,fire:false},teeth:{base:0x54,defaultSpeed:MONSTER_CONFIG.teethMoveMs,ai:true,water:false,fire:false},walker:{base:0x5C,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false},paramecium:{base:0x60,defaultSpeed:MONSTER_CONFIG.genericMonsterMoveMs,ai:false,water:false,fire:false}};
const MONSTER_TILE_FAMILY=id=>T.monsterForTile?T.monsterForTile(id):(
  id>=0x40&&id<=0x43?{kind:'bug',base:0x40}:id>=0x44&&id<=0x47?{kind:'fireball',base:0x44}:
  id>=0x48&&id<=0x4B?{kind:'ball',base:0x48}:id>=0x4C&&id<=0x4F?{kind:'tank',base:0x4C}:
  id>=0x50&&id<=0x53?{kind:'glider',base:0x50}:id>=0x54&&id<=0x57?{kind:'teeth',base:0x54}:
  id>=0x5C&&id<=0x5F?{kind:'walker',base:0x5C}:id>=0x60&&id<=0x63?{kind:'paramecium',base:0x60}:null);
const KD={KeyW:0,ArrowUp:0,KeyA:1,ArrowLeft:1,KeyS:2,ArrowDown:2,KeyD:3,ArrowRight:3};
const SL=[['c',0x64],['r',0x65],['g',0x66],['y',0x67],['w',0x68],['z',0x69],['k',0x6A],['u',0x6B]];
const world=$('world'),app=$('app'),msgEl=$('msg'),invEl=$('inv');
let S=2,lv=0,total=0,tries=1,L,W,H,g,cells,chip,mons,blocks,act,inv,left,time,acc,state,hint,gt=0,held=[],buf=null,wLast='',sig='',custom=false,hintMode='none',hintOffAt=0,hiddenDirtActivated=false,waterFlashes=[];
// Large-map renderer: keep the complete map in memory, but instantiate only the game view
// plus a 15-tile guard band. The original 32px atlas artwork and camera math are retained.
const GAME_VIEW_WORLD_PX=292,RENDER_BUFFER_TILES=15;
let tileLayer=null,actorLayer=null,tilePool=[],tileBounds=null;
const inb=(x,y)=>x>=0&&y>=0&&x<W&&y<H;
const F=id=>{const b=T[id]||T[0],r=L&&L.rules&&L.rules[String(id)];return r?Object.assign({},b,r):b};
const TH=id=>F(id).th|0;
const blockAt=(x,y)=>blocks.find(b=>b.x===x&&b.y===y);
const monsterAt=(x,y)=>mons.find(m=>m.x===x&&m.y===y);
function actor(o){return Object.assign({ox:o.x,oy:o.y,d:2,t0:0,dur:0,fx:0,sid:-1,last:'',vx:o.x,vy:o.y},o)}
function normalizeLevel(data){
  const source=(data&&typeof data==='object')?data:{},d=Object.assign({},source);
  if(Array.isArray(d.tiles)&&d.width&&d.height){d.width|=0;d.height|=0;d.title=d.title||'CUSTOM LEVEL';d.timeLimit=Number.isFinite(+d.timeLimit)?+d.timeLimit:200;d.hint=typeof d.hint==='string'?d.hint:'';d.hintSettings=d.hintSettings&&typeof d.hintSettings==='object'?d.hintSettings:{};d.hintSettings.triggerTileId=Number.isInteger(d.hintSettings.triggerTileId)?d.hintSettings.triggerTileId:0x2F;d.hintSettings.offDelayMs=Math.max(0,Math.min(60000,Number(d.hintSettings.offDelayMs)||5000));d.hiddenDirtSettings=d.hiddenDirtSettings&&typeof d.hiddenDirtSettings==='object'?d.hiddenDirtSettings:{};d.hiddenDirtSettings.triggerTileId=Number.isInteger(d.hiddenDirtSettings.triggerTileId)?d.hiddenDirtSettings.triggerTileId:0x24;d.hiddenDirtSettings.oncePerMap=d.hiddenDirtSettings.oncePerMap!==false;d.hiddenDirt=Array.isArray(d.hiddenDirt)?d.hiddenDirt.map(p=>({x:p.x|0,y:p.y|0,underTile:Number.isInteger(p.underTile)?p.underTile:null})).filter(p=>p.x>=0&&p.y>=0&&p.x<d.width&&p.y<d.height):[];d.actors=Array.isArray(d.actors)?d.actors:[];d.actors=d.actors.map(a=>{const x=JSON.parse(JSON.stringify(a||{}));const tid=Number.isInteger(x.tileId)?x.tileId:null;const mk=tid!=null?(T[tid]?.monsterKind||''):'';const rawPath=Array.isArray(x.path)?x.path:[];let wp=Array.isArray(x.waypointPaths)?x.waypointPaths.slice(0,MAX_GLIDER_PATHS):[];if(!wp.length&&rawPath.length)wp=[rawPath];while(wp.length<MAX_GLIDER_PATHS)wp.push([]);x.waypointPaths=wp;x.pathSlot=Math.max(0,Math.min(MAX_GLIDER_PATHS-1,Number(x.pathSlot??x.railPathSlot)||0));x.path=wp[x.pathSlot]||[];x.pathBehavior=(x.pathBehavior==='loop'||x.pathBehavior==='sequential')?x.pathBehavior:((x.type==='glider'||mk==='glider'||x.type==='monster')?'sequential':'loop');x.loopFromStart=x.loopFromStart===true;x.continuousEndBehavior=x.continuousEndBehavior==='stay'?'stay':'return';x.pathPaused=x.pathPaused===true;x.buttonBehavior=x.buttonBehavior==='station'?'station':'freeze';const defaultButtonTrigger=x.type==='monster'?'none':(mk==='glider'?'tan':'none');x.buttonTrigger=['none','tan','red','both'].includes(x.buttonTrigger)?x.buttonTrigger:defaultButtonTrigger;x.stationOverrideActive=x.stationOverrideActive===true;x.stationResumeState=null;if(x.type==='glider'||mk==='glider'){let rp=Array.isArray(x.railPaths)?x.railPaths.slice(0,MAX_GLIDER_PATHS):wp.map(p=>p.slice());while(rp.length<MAX_GLIDER_PATHS)rp.push([]);x.railPaths=rp;x.railPathSlot=x.pathSlot;x.path=rp[x.pathSlot]||[];x.pathMode='rail'}return x});d.rules=d.rules&&typeof d.rules==='object'?d.rules:{};d.monsterSettings=d.monsterSettings&&typeof d.monsterSettings==='object'?d.monsterSettings:(d.settings&&d.settings.monsters&&typeof d.settings.monsters==='object'?d.settings.monsters:{});return d}
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
      if(kind==='glider')tileId=0x50+(a.direction??2),kind='glider';
      if(kind==='teeth')tileId=0x54+(a.direction??2),kind='teeth';
      const fam=MONSTER_TILE_FAMILY(tileId);
      if(!fam)continue;
      const def=MONSTER_FAMILY[fam.kind]||MONSTER_FAMILY.teeth;const defaultSpeed=fam.kind==='bug'?ACTIVE_CONFIG.spiderMoveMs:fam.kind==='fireball'?ACTIVE_CONFIG.spiralMoveMs:fam.kind==='teeth'?ACTIVE_CONFIG.teethMoveMs:ACTIVE_CONFIG.genericMonsterMoveMs;
      const p=Array.isArray(a.path)?a.path:[];
      const isSpider = a.type==='spider' || fam.kind==='bug';
      const isGlider=fam.kind==='glider';
      const pathSlot=Math.max(0,Math.min(MAX_GLIDER_PATHS-1,Number(a.pathSlot??a.railPathSlot)||0));
      let waypointPaths=Array.isArray(a.waypointPaths)?a.waypointPaths.slice(0,MAX_GLIDER_PATHS):[];if(!waypointPaths.length&&p.length)waypointPaths=[p];while(waypointPaths.length<MAX_GLIDER_PATHS)waypointPaths.push([]);
      const railPaths=isGlider?(Array.isArray(a.railPaths)?a.railPaths.slice(0,MAX_GLIDER_PATHS):waypointPaths.map(q=>q.slice())):[];while(isGlider&&railPaths.length<MAX_GLIDER_PATHS)railPaths.push([]);
      const activePathList=isGlider?railPaths:waypointPaths;const activeAuthoredPath=activePathList[pathSlot]||[];
      mons.push(actor({id:a.id||fam.kind+'-'+mons.length,k:fam.kind,tileId:fam.base, x:a.x|0,y:a.y|0,d:a.direction??((tileId-fam.base)&3),variant:a.variant||'red',speed:Math.max(100,Math.min(2000,Number(a.speed)||(isGlider?ACTIVE_CONFIG.gliderMoveMs:defaultSpeed))),loop:pathToLoop(activeAuthoredPath),path:activeAuthoredPath,li:0,next:gt+1200+mons.length*180,aiChase:a.aiChase??(isSpider||def.ai),pathMode:a.pathMode||(isGlider?'rail':isSpider?'ai':'loop'),activePathSlot:null,customMonster:a.type==='monster',pathBehavior:(a.pathBehavior==='loop'||a.pathBehavior==='sequential')?a.pathBehavior:((isGlider||a.type==='monster')?'sequential':'loop'),loopFromStart:a.loopFromStart===true,continuousEndBehavior:a.continuousEndBehavior==='stay'?'stay':'return',pathStarted:false,pathWaiting:false,pathPaused:false,buttonBehavior:a.buttonBehavior==='station'?'station':'freeze',buttonTrigger:['none','tan','red','both'].includes(a.buttonTrigger)?a.buttonTrigger:(a.type==='monster'?'none':(isGlider?'tan':'none')),stationOverrideActive:false,stationResumeState:null,stationStopPending:false,stationTargetIndex:-1,multiPathEnabled: a.multiPathEnabled===true || a.type==='monster' || isGlider,visionRange:Math.max(1,Number(a.visionRange)||ACTIVE_CONFIG.defaultVisionTiles),focusLoseDistanceTiles:Math.max(1,Number(a.focusLoseDistanceTiles)||ACTIVE_CONFIG.focusLoseDistanceTiles),neverLoseFocus:a.neverLoseFocus===1||a.neverLoseFocus===true,focusMs:Math.max(250,Math.min(60000,Number(a.focusMs)||ACTIVE_CONFIG.teethFocusMs)),mode:isGlider?'station':'path',focusUntil:0,hasFocused:false,returnIndex:0,waypointPaths, pathSlot, railPaths,railPathSlot:pathSlot,railNextIndex:0,railActive:false,pathDirection:1,pathSlotPos:0,railPhase:'forward',railCycleStarted:false}));
    }
  }
  // Palette-placed dirt-block tiles are also real movable blocks. Keep the saved tile as their floor underneath until they move.
  for(let i=0;i<g.length;i++)if(g[i]===0x0A){const x=i%W,y=(i/W)|0;if(!blockAt(x,y)){g[i]=0;blocks.push(actor({x,y,d:2,id:`tile-block-${i}`,fd:-1,auto:0,speed:500,underTile:0,hidden:false}));}}
  if(!chip)chip=actor({x:1,y:1,d:2,ready:gt,fd:-1,auto:0,speed:500,id:'chip',variant:'default'});
  // Hidden dirt is an overlay: its underlying tile remains walkable/unchanged until the red trigger fires.
  for(const p of data.hiddenDirt||[]){const i=p.y*W+p.x;if(i>=0&&i<g.length&&!Number.isInteger(p.underTile))p.underTile=g[i]}
  time=Math.max(0,Math.floor(+data.timeLimit||200));acc=0;state='play';hint='';hintMode='none';hintOffAt=0;held=[];buf=null;sig='';wLast='';msgEl.className='';
  world.textContent='';
  tileLayer=document.createElement('div');tileLayer.className='game-layer tile-layer';
  actorLayer=document.createElement('div');actorLayer.className='game-layer actor-layer';
  world.append(tileLayer,actorLayer);cells=new Map();tilePool=[];tileBounds=null;
  act=[chip,...mons,...blocks];
}
function load(n){if(LEVELS[n])loadData(LEVELS[n],n,false)}
function cameraClamp(v,n){return n*32<=GAME_VIEW_WORLD_PX?(n*32-GAME_VIEW_WORLD_PX)/2:Math.max(0,Math.min(n*32-GAME_VIEW_WORLD_PX,v))}
function cameraOrigin(){return {x:cameraClamp((chip.vx+.5)*32-144,W),y:cameraClamp((chip.vy+.5)*32-144,H)}}
function desiredTileBounds(){
  const cam=cameraOrigin(),minVisibleX=Math.floor(cam.x/32),maxVisibleX=Math.floor((cam.x+GAME_VIEW_WORLD_PX-1)/32),minVisibleY=Math.floor(cam.y/32),maxVisibleY=Math.floor((cam.y+GAME_VIEW_WORLD_PX-1)/32);
  return {minX:Math.max(0,minVisibleX-RENDER_BUFFER_TILES),maxX:Math.min(W-1,maxVisibleX+RENDER_BUFFER_TILES),minY:Math.max(0,minVisibleY-RENDER_BUFFER_TILES),maxY:Math.min(H-1,maxVisibleY+RENDER_BUFFER_TILES)}
}
function sameOrContains(a,b){return !!a&&a.minX<=b.minX&&a.maxX>=b.maxX&&a.minY<=b.minY&&a.maxY>=b.maxY}
function setTileVisual(e,id){
  if(id>=0x40){
    CC.setTile(e,0);let s=e.firstElementChild;if(!s){s=document.createElement('div');e.append(s)}CC.setTile(s,id)
  }else{if(e.firstElementChild)e.firstElementChild.remove();CC.setTile(e,id)}
}
function refreshVisibleTiles(force=false){
  if(!tileLayer||!g||!W||!H)return;
  const b=desiredTileBounds();if(!force&&sameOrContains(tileBounds,b))return;
  const want=new Set();
  for(let y=b.minY;y<=b.maxY;y++)for(let x=b.minX;x<=b.maxX;x++){
    const i=y*W+x;want.add(i);let e=cells.get(i);if(!e){e=tilePool.pop()||document.createElement('div');e.className='tile-instance';cells.set(i,e);tileLayer.append(e)}
    e.style.left=(x*32*S)+'px';e.style.top=(y*32*S)+'px';setTileVisual(e,g[i]);
  }
  for(const [i,e] of cells){if(!want.has(i)){cells.delete(i);e.remove();tilePool.push(e)}}
  tileBounds=b;
}
function paint(i){const e=cells.get(i);if(!e)return;setTileVisual(e,g[i])}
function sk(o){
  let id=o.fx;
  if(!id){
    if(o===chip)id=(F(g[o.y*W+o.x]).water?0x3C:0x6C)+o.d;
    else if(o.k==='spider')id=0x40+(o.d&3);
    else if(o.k==='spiral')id=0x44+(o.d&3);
    else if(o.k==='glider')id=0x50+(o.d&3);
    else if(o.k==='teeth')id=0x54+(o.d&3);
    else if(o.k){const fam=MONSTER_TILE_FAMILY(o.tileId||0x40);id=(fam?fam.base:(o.tileId||0x40))+(o.d&3)}
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
function safeLanded(d){
  // The movement commit happens before landed(). Optional game features are not
  // allowed to throw an exception that disables Chip's future controls.
  try{landed(d)}catch(err){
    console.error('[Chip movement recovered from post-move error]',err);
    chip.fd=-1;chip.auto=0;
  }
}
function move(d){
  const c=chip,i0=c.y*W+c.x,x=c.x+DX[d],y=c.y+DY[d];c.d=d;if(!inb(x,y)||(TH(g[i0])>>d&1))return false;
  const id=g[y*W+x];if(TH(id)>>((d+2)&3)&1)return false;
  const b=blockAt(x,y);if(b&&!push(b,d))return false;
  if(!enter(id,y*W+x))return false;
  if(g[i0]===0x2E){g[i0]=1;paint(i0)}
  c.ox=c.x;c.oy=c.y;c.x=x;c.y=y;c.t0=gt;c.dur=ANIM;safeLanded(d);return true
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
  if(id===0x24||id===0x27)togglePathMonsters(id);
  if(id===0x23||id===0x24||id===0x27||id===0x28)activateButton(id);
  if(id===0x29)tele();
  if(f.ice&&!inv.k){let nd=d,m=TH(id);if(m)for(let s=0;s<4;s++)if(!(m>>s&1)&&s!==((d+2)&3)){nd=s;break}c.fd=nd}
  else if(f.force!=null&&!inv.u)c.fd=f.force<0?(Math.random()*4)|0:f.force;
  if(c.fd>=0)c.auto=gt+AUTO;hit()
}
function nearestStationIndex(m){
  const n=W*H,start=m.y*W+m.x;
  if(g[start]===GLIDER_STATION_TILE)return start;
  const q=new Int32Array(n),seen=new Uint8Array(n);let head=0,tail=0;q[tail++]=start;seen[start]=1;
  while(head<tail){const cur=q[head++],cx=cur%W,cy=(cur/W)|0;for(let d=0;d<4;d++){
    const x=cx+DX[d],y=cy+DY[d];if(!inb(x,y))continue;const j=y*W+x;if(seen[j])continue;
    if(j!==start&&g[j]===GLIDER_STATION_TILE)return j;
    if(monsterPass(m,g[j])){seen[j]=1;q[tail++]=j}
  }}
  return -1;
}
function requestStationStop(m){
  const target=nearestStationIndex(m);
  if(target<0){
    // No station exists/reachable: keep the path state untouched rather than freezing unexpectedly.
    m.stationStopPending=false;m.stationTargetIndex=-1;return false;
  }
  m.stationStopPending=true;m.stationTargetIndex=target;m.pathPaused=false;m.pathWaiting=false;m.railActive=true;m.mode='rail';return true;
}
const ROUTE_CHUNK_TILES=()=>Math.max(8,Math.min(64,Number(ACTIVE_CONFIG.pathRouteChunkTiles)||32));
const ROUTE_MARGIN_TILES=()=>Math.max(4,Math.min(20,Number(ACTIVE_CONFIG.pathRouteMarginTiles)||10));
const ROUTE_MAX_STEPS=()=>Math.max(32,Math.min(256,Number(ACTIVE_CONFIG.pathRouteMaxSteps)||128));
function localRouteDirections(m,goalX,goalY){
  const sx=m.x,sy=m.y;
  if(sx===goalX&&sy===goalY)return [];
  const minX=Math.max(0,Math.min(sx,goalX)-ROUTE_MARGIN_TILES()),maxX=Math.min(W-1,Math.max(sx,goalX)+ROUTE_MARGIN_TILES());
  const minY=Math.max(0,Math.min(sy,goalY)-ROUTE_MARGIN_TILES()),maxY=Math.min(H-1,Math.max(sy,goalY)+ROUTE_MARGIN_TILES());
  const ww=maxX-minX+1,hh=maxY-minY+1,size=ww*hh;
  // Compact per-route typed arrays. Unlike the old implementation, allocation is
  // proportional to one short waypoint segment, never to the 992x992 map.
  const gScore=new Int16Array(size);gScore.fill(32767);
  const parent=new Int32Array(size);parent.fill(-1);
  const closed=new Uint8Array(size);
  const heapNode=new Int32Array(size),heapF=new Int32Array(size),heapPos=new Int32Array(size);heapPos.fill(-1);
  let heapSize=0;
  const h=(x,y)=>Math.abs(x-goalX)+Math.abs(y-goalY);
  const swap=(a,b)=>{const na=heapNode[a],nb=heapNode[b],fa=heapF[a];heapNode[a]=nb;heapF[a]=heapF[b];heapNode[b]=na;heapF[b]=fa;heapPos[nb]=a;heapPos[na]=b};
  const pushNode=(n,f)=>{let i=heapSize++;heapNode[i]=n;heapF[i]=f;heapPos[n]=i;while(i>0){const parentI=(i-1)>>1;if(heapF[parentI]<=heapF[i])break;swap(parentI,i);i=parentI}};
  const decrease=(n,f)=>{let i=heapPos[n];if(i<0){pushNode(n,f);return}if(f>=heapF[i])return;heapF[i]=f;while(i>0){const parentI=(i-1)>>1;if(heapF[parentI]<=heapF[i])break;swap(parentI,i);i=parentI}};
  const popNode=()=>{if(!heapSize)return -1;const out=heapNode[0],last=--heapSize;if(last>=0){heapNode[0]=heapNode[last];heapF[0]=heapF[last];heapPos[heapNode[0]]=0;let i=0;while(true){const l=i*2+1,r=l+1;let best=i;if(l<heapSize&&heapF[l]<heapF[best])best=l;if(r<heapSize&&heapF[r]<heapF[best])best=r;if(best===i)break;swap(i,best);i=best}}heapPos[out]=-2;return out};
  const sxL=sx-minX,syL=sy-minY,gx=goalX-minX,gy=goalY-minY,start=syL*ww+sxL,target=gy*ww+gx;
  if(start<0||target<0||start>=size||target>=size)return null;
  gScore[start]=0;pushNode(start,h(sx,sy));
  while(heapSize){
    const cur=popNode();if(cur<0)break;if(closed[cur])continue;closed[cur]=1;if(cur===target)break;
    const cx=cur%ww,cy=(cur/ww)|0,nc=gScore[cur]+1;
    for(let d=0;d<4;d++){
      const nx=cx+DX[d],ny=cy+DY[d];if(nx<0||nx>=ww||ny<0||ny>=hh)continue;
      const ni=ny*ww+nx;if(closed[ni])continue;
      const wx=nx+minX,wy=ny+minY,gi=wy*W+wx;
      if(!monsterPass(m,g[gi]))continue;
      if(gi!==goalY*W+goalX && nc>=gScore[ni])continue;
      if(nc>=gScore[ni])continue;
      gScore[ni]=nc;parent[ni]=cur;decrease(ni,nc+h(wx,wy));
    }
  }
  if(start!==target&&parent[target]<0)return null;
  const dirs=[];let j=target,guard=0;
  while(j!==start&&parent[j]>=0&&guard++<ROUTE_MAX_STEPS()){
    const prev=parent[j],px=prev%ww,py=(prev/ww)|0,cx=j%ww,cy=(j/ww)|0;
    const dd=DX.findIndex((_,d)=>px+DX[d]===cx&&py+DY[d]===cy);if(dd<0)return null;dirs.push(dd);j=prev;
  }
  if(j!==start)return null;dirs.reverse();return dirs;
}
function chooseRouteGoal(m,target){
  const dx=target.x-m.x,dy=target.y-m.y,dist=Math.abs(dx)+Math.abs(dy);
  if(dist<=ROUTE_CHUNK_TILES())return {x:target.x,y:target.y};
  const ratio=ROUTE_CHUNK_TILES()/dist;
  let gx=Math.round(m.x+dx*ratio),gy=Math.round(m.y+dy*ratio);
  gx=Math.max(0,Math.min(W-1,gx));gy=Math.max(0,Math.min(H-1,gy));
  if(gx===m.x&&gy===m.y){if(Math.abs(dx)>=Math.abs(dy))gx+=dx>0?1:-1;else gy+=dy>0?1:-1}
  return {x:Math.max(0,Math.min(W-1,gx)),y:Math.max(0,Math.min(H-1,gy))};
}
function naturalRouteStep(m,target){
  // Authored paths are traversed in cached short segments. The route is calculated
  // once for a segment and its directions are consumed one tile at a time, instead
  // of running a full-map A* search on every monster movement. This is the key large-
  // map optimization and never moves m.x/m.y directly to a waypoint.
  if(!target||!Number.isInteger(target.x)||!Number.isInteger(target.y))return -1;
  if(m.x===target.x&&m.y===target.y){m.routeDirs=null;m.routePos=0;return -1;}
  const targetChanged=m.routeTargetX!==target.x||m.routeTargetY!==target.y;
  if(targetChanged){m.routeTargetX=target.x;m.routeTargetY=target.y;m.routeDirs=null;m.routePos=0;m.routeGoalX=null;m.routeGoalY=null;}
  if(Array.isArray(m.routeDirs)&&m.routePos<m.routeDirs.length){
    const d=m.routeDirs[m.routePos];
    if(canM(m,d))return d;
    m.routeDirs=null;m.routePos=0;
  }
  if(m.routeGoalX!==m.x||m.routeGoalY!==m.y||!Array.isArray(m.routeDirs)||m.routePos>=m.routeDirs.length){
    const goal=chooseRouteGoal(m,target);
    const dirs=localRouteDirections(m,goal.x,goal.y);
    m.routeGoalX=goal.x;m.routeGoalY=goal.y;m.routeDirs=dirs||[];m.routePos=0;
    if(!dirs||!dirs.length){
      // Cheap fallback for an obstructed chunk: choose one legal step that reduces
      // Manhattan distance. The next update retries the local route from there.
      const choices=[];if(Math.abs(target.x-m.x)>=Math.abs(target.y-m.y)){choices.push(target.x>m.x?3:1);choices.push(target.y>m.y?2:0)}else{choices.push(target.y>m.y?2:0);choices.push(target.x>m.x?3:1)}
      for(const d of choices)if(canM(m,d)){m.routeDirs=[d];m.routePos=0;break}
    }
  }
  if(Array.isArray(m.routeDirs)&&m.routePos<m.routeDirs.length){const d=m.routeDirs[m.routePos];if(canM(m,d))return d;}
  m.routeDirs=null;m.routePos=0;return -1;
}
function stationStopStep(m){
  if(!m.stationStopPending)return null;
  const idx=m.y*W+m.x;
  if(idx===m.stationTargetIndex || g[idx]===GLIDER_STATION_TILE){
    // Preserve the current tile's normal movement animation on station arrival;
    // clearing duration here makes a monster visually snap onto the station.
    m.stationStopPending=false;m.stationTargetIndex=-1;m.railActive=false;m.pathWaiting=true;m.mode='station';m.next=Infinity;return -1;
  }
  const target=m.stationTargetIndex;if(target<0||target>=W*H){m.stationStopPending=false;return null;}
  const tx=target%W,ty=(target/W)|0;return naturalRouteStep(m,{x:tx,y:ty});
}
function startNextConfiguredPath(m){
  const paths=actorPathStore(m);const slots=configuredPathSlots(paths);if(!slots.length)return false;
  let pos=0;
  if(m.pathStarted){const cur=slots.indexOf(Number(m.pathSlot));if(cur>=0&&m.pathWaiting)pos=cur+1<slots.length?cur+1:0;else if(cur>=0)return false;}
  return startPathRoute(m,paths,pos);
}
function saveStationResumeState(m){
  m.stationResumeState={pathStarted:m.pathStarted===true,pathWaiting:m.pathWaiting===true,pathPaused:m.pathPaused===true,railActive:m.railActive===true,pathSlot:Number(m.activePathSlot??m.pathSlot)||0,pathSlotPos:Number(m.pathSlotPos)||0,railCurrentIndex:Number(m.railCurrentIndex)||0,railNextIndex:Number(m.railNextIndex??-1),li:Number(m.li)||0,pathDirection:Number(m.pathDirection)||1,railPhase:m.railPhase||'forward',railCycleStarted:m.railCycleStarted===true,continuousEndBehavior:m.continuousEndBehavior==='stay'?'stay':'return',singleWaypointHomeX:m.singleWaypointHomeX,singleWaypointHomeY:m.singleWaypointHomeY,singleWaypointPhase:m.singleWaypointPhase,mode:m.mode||'rail'};
}
function resumeContinuousRoute(m){
  const st=m.stationResumeState,paths=actorPathStore(m),slots=configuredPathSlots(paths);
  if(!st||!slots.length){m.stationOverrideActive=false;m.stationStopPending=false;m.stationTargetIndex=-1;m.pathWaiting=false;m.mode='rail';return false;}
  let slot=slots.includes(st.pathSlot)?st.pathSlot:slots[0];
  // The path number is runtime route state only. Never move the actor to the first waypoint.
  let pos=slots.indexOf(slot);
  m.pathStarted=st.pathStarted;
  m.pathWaiting=false;
  m.pathPaused=false;
  m.railActive=true;
  m.activePathSlot=slot;
  m.pathSlot=slot;
  m.pathSlotPos=pos>=0?pos:st.pathSlotPos;
  m.railCurrentIndex=slot;
  m.railNextIndex=slots[pos+1]??-1;
  m.pathDirection=st.pathDirection||1;
  m.railPhase=st.railPhase||'forward';
  m.railCycleStarted=st.railCycleStarted===true;
  m.continuousEndBehavior=st.continuousEndBehavior==='stay'?'stay':'return';
  m.finalPathHold=false;
  m.li=Math.max(0,Math.min((paths[slot]||[]).length-1,Number(st.li)||0));
  m.path=(paths[slot]||[]).slice();
  m.singleWaypointHomeX=st.singleWaypointHomeX;m.singleWaypointHomeY=st.singleWaypointHomeY;m.singleWaypointPhase=st.singleWaypointPhase;
  m.stationStopPending=false;m.stationTargetIndex=-1;m.stationOverrideActive=false;m.mode='rail';m.t0=gt;m.dur=0;m.next=gt+Math.max(1,Number(m.speed)||450);
  return true;
}
function beginContinuousStationOverride(m){
  const paths=actorPathStore(m);if(!configuredPathSlots(paths).length)return false;
  saveStationResumeState(m);
  m.stationOverrideActive=true;
  if(!requestStationStop(m)){m.stationOverrideActive=false;return false;}
  m.pathPaused=false;m.mode='rail';m.t0=gt;m.dur=0;m.next=gt+Math.max(1,Number(m.speed)||450);
  return true;
}
function buttonTriggerMatches(m,id){const t=m?.buttonTrigger||'none';if(t==='tan')return id===0x27;if(t==='red')return id===0x24;if(t==='both')return id===0x24||id===0x27;return false}
function togglePathMonsters(buttonId){
  // Continuous mode remains waypoint-driven, but when explicitly configured to
  // 'Continue to nearest station' the button immediately interrupts the loop,
  // sends the monster to the nearest 0x2B station, and holds it there until the
  // same button is pressed again. The saved waypoint state is then restored.
  for(const m of mons.filter(m=>pathActor(m)&&buttonTriggerMatches(m,buttonId))){
    if(m.pathBehavior==='loop'){
      if(m.finalPathHold)continue;
      if(m.buttonBehavior==='station'){
        if(m.stationOverrideActive){resumeContinuousRoute(m);continue;}
        if(!m.pathStarted&&!m.pathWaiting&&!m.pathPaused){startNextConfiguredPath(m);continue;}
        beginContinuousStationOverride(m);
        continue;
      }
      if(!m.pathStarted&&!m.pathWaiting&&!m.pathPaused){startNextConfiguredPath(m);continue;}
      if(m.pathPaused){
        m.pathPaused=false;m.stationStopPending=false;m.stationTargetIndex=-1;m.t0=gt;m.dur=0;m.next=gt+Math.max(1,Number(m.speed)||450);
      }
      continue;
    }
    // Sequential mode: choose between exact freeze/resume and nearest-station routing.
    if(!m.pathStarted&&!m.pathWaiting&&!m.pathPaused){startNextConfiguredPath(m);continue;}
    if(m.buttonBehavior==='station'){
      if(m.pathWaiting){startNextConfiguredPath(m)}
      else if(!m.stationStopPending){requestStationStop(m)}
      continue;
    }
    m.pathPaused=!m.pathPaused;
    if(m.pathPaused){
      m.stationStopPending=false;m.stationTargetIndex=-1;m.ox=m.x;m.oy=m.y;m.t0=gt;m.dur=0;m.next=Infinity;
    }else{
      m.t0=gt;m.dur=0;m.next=gt+Math.max(1,Number(m.speed)||450);
    }
  }
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
function pump(){
  if(state!=='play'||gt<chip.ready)return;
  if(chip.fd>=0){
    const f=F(g[chip.y*W+chip.x]);
    // Only suppress keyboard steering while the current tile actually requires
    // automatic movement. Clear stale fd state on every ordinary floor tile.
    if(f.ice||f.force!=null)return;
    chip.fd=-1;chip.auto=0;
  }
  const d=held.length?held[held.length-1]:(buf&&gt-buf.t<250?buf.d:-1);if(d<0)return;buf=null;
  let moved=false;
  try{moved=move(d)!==false}catch(err){
    console.error('[Chip movement recovered]',err);
    chip.fd=-1;chip.auto=0;
    moved=false;
  }
  chip.ready=gt+(moved?MOVE_MS:120);
}
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
  // Visible block elements are materialized by the windowed renderer; hidden/off-screen
  // actors never require DOM nodes just because they exist in the map data.
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
function boundedAStarStep(m,targetX,targetY,maxCost,passFn){
  if(!inb(targetX,targetY))return -1;
  const dx0=targetX-m.x,dy0=targetY-m.y;
  if(dx0===0&&dy0===0)return -1;
  if(Math.abs(dx0)+Math.abs(dy0)>maxCost)return -1;
  // Search only the square surrounding the monster by maxCost tiles. This keeps A*
  // independent of a 992x992 map's total cell count while preserving the old step limits.
  const r=Math.max(1,maxCost|0),side=r*2+1,size=side*side,gs=new Int16Array(size),par=new Int32Array(size),closed=new Uint8Array(size),open=[];
  gs.fill(32767);par.fill(-1);
  const lx0=r,ly0=r,goalX=lx0+dx0,goalY=ly0+dy0;
  if(goalX<0||goalX>=side||goalY<0||goalY>=side)return -1;
  const start=ly0*side+lx0,target=goalY*side+goalX;
  gs[start]=0;open.push(start);
  while(open.length){
    let bi=0,bf=1e9;
    for(let k=0;k<open.length;k++){
      const li=open[k],cx=li%side,cy=(li/side)|0,gc=gs[li],wx=m.x+(cx-r),wy=m.y+(cy-r);
      const f=gc+Math.abs(wx-targetX)+Math.abs(wy-targetY);
      if(f<bf){bf=f;bi=k}
    }
    const cur=open.splice(bi,1)[0];
    if(cur===target)break;
    if(closed[cur])continue;closed[cur]=1;
    const cx=cur%side,cy=(cur/side)|0,nc=gs[cur]+1;
    for(let d=0;d<4;d++){
      const nx=cx+DX[d],ny=cy+DY[d];if(nx<0||nx>=side||ny<0||ny>=side)continue;
      const ni=ny*side+nx;if(closed[ni]||nc>=gs[ni])continue;
      const wx=m.x+(nx-r),wy=m.y+(ny-r);
      if(!inb(wx,wy))continue;
      const globalIndex=wy*W+wx;
      if(globalIndex!==target && !passFn(wx,wy,g[globalIndex]))continue;
      gs[ni]=nc;par[ni]=cur;if(!open.includes(ni))open.push(ni);
    }
  }
  if(par[target]<0||gs[target]>maxCost)return -1;
  let j=target;while(par[j]>=0&&par[j]!==start)j=par[j];
  const tx=m.x+(j%side-r),ty=m.y+((j/side)|0)-r;
  return DX.findIndex((_,d)=>m.x+DX[d]===tx&&m.y+DY[d]===ty);
}
function chaseTo(m,targetX,targetY,maxCost=20){return boundedAStarStep(m,targetX,targetY,maxCost,(x,y,id)=>monsterPass(m,id));}
function spiderChase(m){
  // Same restored A* behavior as before, but the search is bounded to the 14-step
  // neighborhood so large maps do not allocate million-cell arrays for each monster step.
  const dx=Math.abs(chip.x-m.x),dy=Math.abs(chip.y-m.y);if(dx+dy>ACTIVE_CONFIG.spiderAggroTiles)return -1;
  return boundedAStarStep(m,chip.x,chip.y,ACTIVE_CONFIG.spiderMaxPathTiles,(x,y,id)=>spiderPass(id));
}
function chase(m,targetX=chip.x,targetY=chip.y){return chaseTo(m,targetX,targetY,ACTIVE_CONFIG.monsterMaxPathTiles)}
function configuredPathSlots(paths){
  const out=[];if(!Array.isArray(paths))return out;
  for(let i=0;i<Math.min(MAX_GLIDER_PATHS,paths.length);i++)if(Array.isArray(paths[i])&&paths[i].length)out.push(i);
  return out;
}
function pathActor(m){
  if(!m)return false;
  const hasPaths=configuredPathSlots(actorPathStore(m)).length>0;
  // Gliders and custom tile-linked monsters only enter the shared authored-path
  // controller when they actually have a path. Without path data, a custom spider
  // can still use its normal Spider A* AI instead of becoming permanently frozen.
  return hasPaths&&(m.pathMode==='loop'||m.pathMode==='rail'||m.pathMode==='path');
}
function actorPathStore(m){return m.k==='glider'?(m.railPaths||[]):(m.waypointPaths||[])}
function startPathRoute(m,paths,slotPos=0){
  const slots=configuredPathSlots(paths);if(!slots.length)return false;
  const pos=Math.max(0,Math.min(slots.length-1,slotPos)),slot=slots[pos],p=paths[slot]||[];if(!p.length)return false;
  const sameSlot=Number(m.pathSlot)===slot && m.pathStarted;
  if(p.length===1 && slots.length===1 && !sameSlot){
    // A one-waypoint continuous route still needs somewhere to travel back to.
    // Remember the monster's real starting cell and shuttle naturally between it and the waypoint.
    m.singleWaypointHomeX=m.x;m.singleWaypointHomeY=m.y;m.singleWaypointPhase='toWaypoint';
  }
  // Selecting/starting a path changes route state only; the monster stays at its real current cell.
  m.pathStarted=true;m.pathWaiting=false;m.pathDirection=1;m.pathSlotPos=pos;m.activePathSlot=slot;m.pathSlot=slot;m.railCurrentIndex=slot;m.railNextIndex=slots[pos+1]??-1;m.railPhase='forward';m.li=0;m.path=p.slice();m.railActive=true;m.mode='rail';m.stationStopPending=false;m.stationTargetIndex=-1;return true;
}
function restartPathLoop(m,paths){return startPathRoute(m,paths,0)}
function finishControlledPath(m,paths){
  if(m.stationStopPending)return;
  const slots=configuredPathSlots(paths),pos=slots.indexOf(Number(m.pathSlot));if(!slots.length||pos<0)return;
  const p=paths[m.pathSlot]||[],atEnd=p.length===0||m.li>=p.length-1;
  if(m.pathBehavior==='sequential'){
    if(!atEnd)return;
    m.railActive=false;m.pathWaiting=true;m.mode='station';m.pathDirection=1;m.railPhase='forward';return;
  }
  if(!atEnd)return;
  if(m.railPhase==='forward'){
    if(pos<slots.length-1){const slot=slots[pos+1],pp=paths[slot]||[];m.activePathSlot=slot;m.pathSlot=slot;m.pathSlotPos=pos+1;m.railCurrentIndex=slot;m.railNextIndex=slots[pos+2]??-1;m.path=pp.slice();m.li=0;m.mode='rail';return;}
    if(m.continuousEndBehavior==='stay'){
      // The monster has already been moved one tile toward the final waypoint.
      // Preserve that movement animation so it arrives visually instead of snapping.
      m.finalPathHold=true;m.railActive=false;m.pathWaiting=true;m.pathPaused=false;m.mode='final';m.stationStopPending=false;m.stationTargetIndex=-1;m.next=Infinity;
      // Do not reset m.t0/m.dur here: stepMon() already assigned the normal
      // per-tile animation before calling finishControlledPath().
      return;
    }
    m.finalPathHold=false;
    if(m.loopFromStart){
      // Optional simple loop mode: after the final configured path, restart Path 1
      // from the monster's real current cell. No teleporting; the next step naturally
      // pathfinds toward Path 1's first waypoint.
      return startPathRoute(m,paths,0);
    }
    m.railPhase='return';m.pathDirection=-1;
    if(p.length>1){m.li=p.length-2;m.path=p.slice();m.mode='rail';return;}
    if(pos>0){const prev=slots[pos-1],pp=paths[prev]||[];m.activePathSlot=prev;m.pathSlot=prev;m.pathSlotPos=pos-1;m.railCurrentIndex=prev;m.path=pp.slice();m.li=Math.max(0,pp.length-1);m.mode='rail';return;}
    return restartPathLoop(m,paths);
  }
  if(m.li>0){m.li--;return;}
  if(pos>0){const prev=slots[pos-1],pp=paths[prev]||[];m.activePathSlot=prev;m.pathSlot=prev;m.pathSlotPos=pos-1;m.railCurrentIndex=prev;m.path=pp.slice();m.li=Math.max(0,pp.length-1);m.mode='rail';return;}
  return restartPathLoop(m,paths);
}
function controlledPathStep(m){
  if(m.finalPathHold)return -1;
  // A continuous authored path starts automatically from the monster's actual
  // position. Sequential/button-controlled paths still wait for their trigger.
  if(m.stationStopPending){const stationStep=stationStopStep(m);if(stationStep!==null)return stationStep;}
  const paths=actorPathStore(m),slots=configuredPathSlots(paths);if(!slots.length)return -1;
  if(!m.pathStarted && m.pathBehavior==='loop' && !m.pathPaused && !m.pathWaiting){
    if(!startPathRoute(m,paths,0))return -1;
  }
  if(!m.pathStarted||m.pathWaiting||!m.railActive)return -1;
  let slot=Number(m.activePathSlot??m.pathSlot);if(!slots.includes(slot)){slot=slots[0];m.activePathSlot=slot;m.pathSlot=slot;m.pathSlotPos=0}
  let p=paths[slot]||[];if(!p.length)return -1;

  // A single configured path with a single waypoint is a valid continuous loop.
  // Shuttle between the monster's real starting cell and that waypoint instead of
  // repeatedly reaching the same endpoint and entering a zero-step loop.
  if(m.pathBehavior==='loop' && m.continuousEndBehavior!=='stay' && slots.length===1 && p.length===1){
    const wp=p[0],homeX=Number.isInteger(m.singleWaypointHomeX)?m.singleWaypointHomeX:m.x,homeY=Number.isInteger(m.singleWaypointHomeY)?m.singleWaypointHomeY:m.y;
    let target=m.singleWaypointPhase==='toHome'?{x:homeX,y:homeY}:wp;
    if(m.x===target.x&&m.y===target.y){
      if(m.singleWaypointPhase==='toHome'){
        m.singleWaypointPhase='toWaypoint';
        target=wp;
      }else{
        m.singleWaypointPhase='toHome';
        target={x:homeX,y:homeY};
      }
    }
    if(m.x===target.x&&m.y===target.y)return -1;
    return naturalRouteStep(m,target);
  }

  if(m.li<0||m.li>=p.length)m.li=0;
  let target=p[m.li];
  if(m.x===target.x&&m.y===target.y){
    if(m.railPhase==='return'){
      if(m.li>0)m.li--;
      else if(m.pathSlotPos>0){m.pathSlotPos--;m.activePathSlot=slots[m.pathSlotPos];m.pathSlot=m.activePathSlot;m.railCurrentIndex=m.pathSlot;p=paths[m.pathSlot]||[];m.path=p.slice();m.li=Math.max(0,p.length-1)}
      else return restartPathLoop(m,paths)?controlledPathStep(m):-1;
    }else if(m.li<p.length-1)m.li++;
    else {finishControlledPath(m,paths);if(m.pathWaiting||!m.railActive)return -1;p=paths[m.pathSlot]||[];target=p[m.li]}
    target=(m.path||paths[m.pathSlot]||[])[m.li];
  }
  if(!target)return -1;
  m.path=paths[m.pathSlot]||[];
  let d=naturalRouteStep(m,target);
  if(d<0){const dx=target.x-m.x,dy=target.y-m.y;if(Math.abs(dx)+Math.abs(dy)===1)d=DX.findIndex((_,q)=>m.x+DX[q]===target.x&&m.y+DY[q]===target.y)}
  return d;
}
function activatePathTrigger(){
  const limit=Math.min(MAX_GLIDER_PATHS,Number(ACTIVE_CONFIG.maxGliderPaths)||MAX_GLIDER_PATHS);
  for(const m of mons){
    if(!pathActor(m))continue;
    const paths=actorPathStore(m),slots=configuredPathSlots(paths).filter(i=>i<limit);if(!slots.length)continue;
    if(m.pathBehavior==='sequential'){
      let nextPos=0;
      if(m.pathStarted){const cur=slots.indexOf(Number(m.pathSlot));if(cur<0)nextPos=0;else if(m.pathWaiting)nextPos=cur+1<slots.length?cur+1:0;else continue}
      if(startPathRoute(m,paths,nextPos)){m.railStation=GLIDER_STATION_TILE;m.railActive=true;m.mode='rail'}
    }else if(!m.pathStarted||m.pathWaiting){if(startPathRoute(m,paths,0)){m.railStation=GLIDER_STATION_TILE;m.railActive=true;m.mode='rail'}}
  }
}
function activateGliderRailTrigger(){activatePathTrigger()}
function followPathCycle(m,paths){if(!Array.isArray(paths)||!paths.length)return -1;if(!m.pathStarted)startPathRoute(m,paths,0);return controlledPathStep(m)}
function followPath(m){
  const p=m.path||[];if(!p.length)return -1;let li=Number.isInteger(m.li)?m.li:0;if(li<0||li>=p.length)li=0;let target=p[li];
  if(m.x===target.x&&m.y===target.y){li=(li+1)%p.length;m.li=li;target=p[li]}else m.li=li;
  let d=naturalRouteStep(m,target);
  if(d<0){const dx=target.x-m.x,dy=target.y-m.y;if(Math.abs(dx)+Math.abs(dy)===1)d=DX.findIndex((_,q)=>m.x+DX[q]===target.x&&m.y+DY[q]===target.y)}
  return d;
}
function followRailPath(m){return controlledPathStep(m)}
function finishGliderPath(m){if(pathActor(m))finishControlledPath(m,actorPathStore(m))}
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
  const paths=m.waypointPaths||[];const slots=configuredPathSlots(paths);if(!slots.length)return -1;
  let bestSlot=slots[0],bestIdx=0,bestD=1e9;
  for(const slot of slots){const p=paths[slot]||[];for(let i=0;i<p.length;i++){const q=p[i],dd=Math.abs(q.x-m.x)+Math.abs(q.y-m.y);if(dd<bestD){bestD=dd;bestSlot=slot;bestIdx=i}}}
  const pos=Math.max(0,slots.indexOf(bestSlot));m.activePathSlot=bestSlot;m.pathSlot=bestSlot;m.pathSlotPos=pos;m.pathDirection=1;m.path=paths[bestSlot].slice();m.li=bestIdx;
  const q=m.path[bestIdx],d=naturalRouteStep(m,q);
  if(m.x===q.x&&m.y===q.y){m.mode='path';m.li=bestIdx;return m.multiPathEnabled?followPathCycle(m,paths):followPath(m)}
  m.returnIndex=bestIdx;return d;
}
function destroyMonster(m,reason){
  if(!m||m.dead)return;
  m.dead=true;
  m.path=[];m.loop='';m.waypointPaths=[];m.railPaths=[];m.railActive=false;m.pathStarted=false;m.activePathSlot=null;m.pathWaiting=false;m.railPhase='forward';
  mons=mons.filter(o=>o!==m);
  act=act.filter(o=>o!==m);
  if(L&&Array.isArray(L.actors))L.actors=L.actors.filter(a=>a.id!==m.id);
  if(m.el)m.el.remove();
}
function handleMonsterBombCollision(m){
  if(!m||m.dead)return true;
  const i=m.y*W+m.x;if(g[i]!==0x2A)return false;
  // Only the single bomb on the monster's occupied tile is consumed. No chain reaction.
  g[i]=0x00;paint(i);destroyMonster(m,'bomb');return true;
}
function stepMon(m){
  const fam=MONSTER_FAMILY[m.k]||MONSTER_FAMILY.bug; m.next=gt+(m.speed||fam.defaultSpeed);
  let d=-1,pathDriven=false;
  const hasAuthoredPath=pathActor(m);
  // Any path-capable monster can use the same authored waypoint controller as a Glider.
  // The original Spider A* remains the default until authored paths are explicitly enabled.
  if(hasAuthoredPath && m.pathPaused){m.next=Infinity;return}
  if(m.k==='teeth'&&m.aiChase&&hasAuthoredPath){
    const visible=hasVision(m);
    if(visible){m.hasFocused=true;m.focusUntil=m.neverLoseFocus?Number.POSITIVE_INFINITY:gt+(m.focusMs||ACTIVE_CONFIG.teethFocusMs);}
    const cheb=Math.max(Math.abs(chip.x-m.x),Math.abs(chip.y-m.y));
    const focusActive=m.hasFocused && (m.neverLoseFocus || (gt<m.focusUntil && cheb<=m.focusLoseDistanceTiles));
    if(focusActive){m.mode='chase';d=chaseTo(m,chip.x,chip.y,ACTIVE_CONFIG.monsterMaxPathTiles)}
    else {
      if(m.mode==='chase')m.mode='return';
      if(m.mode==='return')d=returnToPath(m);
      else {d=controlledPathStep(m);pathDriven=true;}
      if(d>=0)pathDriven=true;
    }
  }
  else if(hasAuthoredPath){d=controlledPathStep(m);pathDriven=true}
  else if(m.k==='bug'&&(!hasAuthoredPath||m.pathMode!=='loop')){d=spiderChase(m);if(d<0||!canSpider(m,d)){d=-1;for(const q of [1,0,3,2]){const e=(m.d+q)&3;if(canSpider(m,e)){d=e;break}}}}
  else if(m.k==='teeth'&&m.aiChase){
    const visible=hasVision(m);
    if(visible){m.hasFocused=true;m.focusUntil=m.neverLoseFocus?Number.POSITIVE_INFINITY:gt+(m.focusMs||ACTIVE_CONFIG.teethFocusMs);}
    const cheb=Math.max(Math.abs(chip.x-m.x),Math.abs(chip.y-m.y));
    const focusActive=m.hasFocused && (m.neverLoseFocus || (gt<m.focusUntil && cheb<=m.focusLoseDistanceTiles));
    if(focusActive){m.mode='chase';d=chaseTo(m,chip.x,chip.y,ACTIVE_CONFIG.monsterMaxPathTiles)}
    else {if(m.mode==='chase')m.mode='return';if(m.mode==='return'||m.mode==='path')d=returnToPath(m);else d=followPathCycle(m,m.waypointPaths||[]);}
  }
  else if(m.aiChase){d=focusChase(m);if(d<0&&m.pathMode==='loop')d=returnToPath(m)}
  else if(m.pathMode==='loop'){d=m.multiPathEnabled?followPathCycle(m,m.waypointPaths||[]):followPath(m)}
  if(!canM(m,d))return;
  m.d=d;m.ox=m.x;m.oy=m.y;m.x+=DX[d];m.y+=DY[d];m.t0=gt;m.dur=Math.min(m.speed||fam.defaultSpeed,300);m.sid=-1;
  if(handleMonsterBombCollision(m))return;
  // Consume exactly one cached route direction after the movement has actually committed.
  // This avoids recomputing A* for every tile while still allowing a blocked/dynamic step
  // to invalidate and rebuild the short route on the next monster tick.
  if(pathDriven&&Array.isArray(m.routeDirs)&&m.routePos<m.routeDirs.length)m.routePos++;
  if(hasAuthoredPath&&pathDriven){if(m.stationStopPending){stationStopStep(m)}else finishControlledPath(m,actorPathStore(m));}
}
function hit(){for(const m of mons)if(m.x===chip.x&&m.y===chip.y)return die(MSG[m.k]||'Chip died to a monster.')}
/* ---------- state / UI ---------- */
function show(t,c){msgEl.innerHTML=t;msgEl.className='on '+(c||'')}
function die(m,fx){state='dead';if(fx)chip.fx=fx;show('<b>'+m+'</b><br><br>Press <kbd>Enter</kbd> to try again','bad')}
function win(){state='win';const tb=time*10,lb=Math.round(((lv<0?0:lv)+1)*500*Math.pow(.8,tries-1));total+=tb+lb;show('<b>Level complete!</b><br>Time bonus '+tb+' · Level bonus '+lb+'<br>Score '+total+'<br><br>Press <kbd>Enter</kbd>'+(custom?' to play again':(lv+1<LEVELS.length?' for the next level':' to play again')),'good')}
function hud(){const s=[lv,time,left,hint,Object.values(inv).join(),custom].join('|');if(s===sig)return;sig=s;$('lv').textContent=custom?'CUS':String(lv+1).padStart(3,'0');$('tm').textContent=String(time).padStart(3,'0');$('ch').textContent=String(left).padStart(3,'0');$('hint').textContent=hint;for(const e of invEl.children){const v=inv[e.k];e.style.opacity=v?1:.2;e.lastChild.textContent=v>1?v:''}}
function render(){
  refreshVisibleTiles();
  const sc=32*S;
  for(const o of act){
    const visible=tileBounds&&o.x>=tileBounds.minX&&o.x<=tileBounds.maxX&&o.y>=tileBounds.minY&&o.y<=tileBounds.maxY;
    if(!visible){if(o.el){o.el.remove();o.el=null}continue}
    if(!o.el){o.el=document.createElement('div');o.el.className='a';actorLayer.append(o.el);o.ox=o.x;o.oy=o.y;o.t0=gt;o.dur=0;o.last='';}
    let x=o.x,y=o.y;if(o.dur){const a=Math.min(1,(gt-o.t0)/o.dur);x=o.ox+(o.x-o.ox)*a;y=o.oy+(o.y-o.oy)*a}o.vx=x;o.vy=y;sk(o);const s='translate3d('+x*sc+'px,'+y*sc+'px,0)';if(s!==o.last){o.last=s;o.el.style.transform=s}
  }
  const cam=cameraOrigin(),s='translate3d('+(-cam.x*S)+'px,'+(-cam.y*S)+'px,0)';if(s!==wLast){wLast=s;if(tileLayer)tileLayer.style.transform=s;if(actorLayer)actorLayer.style.transform=s}
}
function update(dt){if(state!=='play')return;acc+=dt;while(acc>=1000){acc-=1000;if(--time<=0){time=0;return die('Chip ran out of time.',0x33)}}const c=chip;
  if(c.fd>=0&&gt>=c.auto){
    const d=c.fd;c.auto=gt+AUTO;
    try{if(!move(d)&&F(g[c.y*W+c.x]).ice)c.fd=c.d=(d+2)&3}catch(err){
      console.error('[Chip auto-movement recovered]',err);c.fd=-1;c.auto=0;
    }
  }
  // Keep Chip's movement/input independent from optional block, monster, hint and
  // collision subsystems. A failure in one extension must not stop future movement.
  try{pump()}catch(err){console.error('[Chip input pump recovered]',err);c.fd=-1;c.auto=0;c.ready=gt}
  try{pumpBlocks()}catch(err){console.error('[Block system recovered]',err)}
  try{processWaterConversions()}catch(err){console.error('[Water conversion recovered]',err)}
  try{for(const m of [...mons])if(state==='play'&&gt>=m.next&&!m.dead)stepMon(m)}catch(err){console.error('[Monster system recovered]',err)}
  try{if(hintMode==='question'&&hintOffAt>0&&gt>=hintOffAt){hint='';hintMode='none';hintOffAt=0}}catch(err){console.error('[Hint system recovered]',err)}
  try{if(state==='play')hit()}catch(err){console.error('[Collision system recovered]',err)}
}
let last=0,prev=0,frames=0,fpsT=0;
function loop(t){requestAnimationFrame(loop);const d=t-last;if(d<FT-2)return;last=t-d%FT;const dt=Math.min(100,t-prev);prev=t;if(state!=='pause')gt+=dt;update(dt);render();hud();frames++;if(t-fpsT>=1000){$('fps').textContent=frames+' FPS';frames=0;fpsT=t}}
function fit(){S=Math.max(1,Math.min(4,Math.floor(Math.min(innerWidth/470,innerHeight/335))));app.style.setProperty('--s',S);if(W&&H){refreshVisibleTiles(true);wLast='';}}
async function importJSONFile(file){try{const text=await file.text(),data=JSON.parse(text),level=Array.isArray(data.levels)?data.levels[0]:data;if(!level)throw new Error('No level found.');loadData(level,-1,true)}catch(err){alert('Could not import level JSON.\n\n'+err.message)}}
addEventListener('keydown',e=>{const c=e.code;if(c in KD){e.preventDefault();const d=KD[c];if(!held.includes(d)){held.push(d);if(gt<chip.ready)buf={d,t:gt}}pump();return}if(c==='KeyP'||c==='Space'){e.preventDefault();if(state==='play'){state='pause';show('<b>PAUSED</b><br>Press P to resume')}else if(state==='pause'){state='play';msgEl.className=''}}else if(c==='KeyR'){tries++;custom?loadData(L,-1,true):load(lv)}else if(c==='KeyE'){window.location.href='editor.html'}else if(c==='KeyI'){$('levelFile').click()}else if(c==='Enter'){if(state==='win'){tries=1;if(custom)loadData(L,-1,true);else if(lv+1<LEVELS.length)load(lv+1);else{total=0;load(0)}}else if(state==='dead'){tries++;custom?loadData(L,-1,true):load(lv)}}else if(/^Digit[1-9]$/.test(c)&&LEVELS[+c[5]-1]){tries=1;total=0;load(+c[5]-1)}});
addEventListener('keyup',e=>{if(e.code in KD)held=held.filter(d=>d!==KD[e.code])});addEventListener('blur',()=>{held=[]});
$('levelFile').addEventListener('change',e=>{const f=e.target.files[0];if(f)importJSONFile(f);e.target.value=''})
SL.forEach(([k,id])=>{const s=document.createElement('div'),t=document.createElement('div');s.className='s';s.k=k;CC.setTile(t,id);s.append(t,document.createElement('i'));invEl.append(s)});
fit();addEventListener('resize',fit);let pending=null;try{pending=localStorage.getItem('ccPendingLevel')}catch(e){}if(pending){try{const p=JSON.parse(pending);try{localStorage.removeItem('ccPendingLevel')}catch(e){}loadData(p,-1,true)}catch(e){try{localStorage.removeItem('ccPendingLevel')}catch(x){}load(0)}}else load(0);requestAnimationFrame(loop);
})();
