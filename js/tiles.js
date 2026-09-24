/* Chip's Challenge tile catalogue: the 112 original CC1 tile ids (0x00-0x6F).
   Atlas = 416x512, 32px cells.  Opaque tiles 0x00-0x3F: column = id>>4, row = id&15.
   Sprites 0x40-0x6F: colour art in columns 4-6 (+3 = white copy, +6 = luminance mask), row = (id-64)&15. */
(()=>{
const N='empty,wall,ic chip,water,fire,invisible wall,thin wall N,thin wall W,thin wall S,thin wall E,dirt block,dirt,ice,force floor S,'
+'clone block N,clone block W,clone block S,clone block E,force floor N,force floor E,force floor W,exit,cyan door,red door,green door,yellow door,'
+'ice corner NW,ice corner NE,ice corner SE,ice corner SW,fake blue wall,real blue wall,unused,thief,socket,green button,red button,toggle wall closed,'
+'toggle wall open,brown button,blue button,teleport,bomb,trap,hidden wall,gravel,popup wall,hint,thin wall SE,clone machine,random force floor,'
+'drowned chip,burned chip,burned chip 2,unused,unused,unused,chip in exit,exit anim 1,exit anim 2,chip swimming N,chip swimming W,chip swimming S,chip swimming E';
const n=N.split(','),D=['N','W','S','E'];
for(const m of ['bug','fireball','ball','tank','glider','teeth','unused sprite','walker','paramecium'])for(const d of D)n.push(m+' '+d);
n.push('cyan key','red key','green key','yellow key','flippers','fire boots','ice skates','suction boots','chip N','chip W','chip S','chip E');
const T=n.map((name,id)=>({id,name,c:id<64?id>>4:4+((id-64)>>4),r:id<64?id&15:(id-64)&15,mask:id>=64}));
const on=(k,a)=>a.forEach(i=>T[i][k]=true),rng=(a,b)=>Array.from({length:b-a+1},(_,i)=>a+i);
on('wall',[1,5,0x1F,0x25,0x2C,0x31]);              // solid for Chip (invisible / real-blue / closed toggle / clone machine)
on('walk',[0,3,4,0x0B,0x0C,0x0D,0x12,0x13,0x14,0x32,0x15,0x1E,0x21,0x23,0x24,0x26,0x27,0x28,0x29,0x2A,0x2B,0x2D,0x2E,0x2F,6,7,8,9,0x30,0x1A,0x1B,0x1C,0x1D]);
const MONSTER_IDS=[...rng(0x40,0x4F),...rng(0x50,0x57),...rng(0x5C,0x63)];
on('danger',[3,4,0x2A,...MONSTER_IDS]);              // water/fire (unless boots), bomb, every CC1 monster sprite
on('water',[3]);on('fire',[4]);on('destructible',[0x1E,0x0B]);on('ice',[0x0C,0x1A,0x1B,0x1C,0x1D]);
on('item',[2,...rng(0x64,0x6B)]);on('monster',MONSTER_IDS);on('block',[0x0A,0x0E,0x0F,0x10,0x11]);on('button',[0x23,0x24,0x27,0x28]);
[6,7,8,9,0x30,0x1A,0x1B,0x1C,0x1D].forEach((id,i)=>T[id].th=[1,2,4,8,12,3,9,12,6][i]);   // blocked sides: N=1 W=2 S=4 E=8
T[0x0D].force=2;T[0x12].force=0;T[0x13].force=3;T[0x14].force=1;T[0x32].force=-1;      // dir index, -1 = random
['c','r','g','y'].forEach((k,i)=>T[0x16+i].door=k);

const MF={
  bug:{base:0x40,name:'Bug',defaultSpeed:450,ai:false,immuneWater:false,immuneFire:false},
  fireball:{base:0x44,name:'Fireball',defaultSpeed:300,ai:false,immuneWater:false,immuneFire:true},
  ball:{base:0x48,name:'Pink ball',defaultSpeed:500,ai:false,immuneWater:false,immuneFire:false},
  tank:{base:0x4C,name:'Tank',defaultSpeed:500,ai:false,immuneWater:false,immuneFire:false},
  glider:{base:0x50,name:'Glider',defaultSpeed:450,ai:false,immuneWater:true,immuneFire:false},
  teeth:{base:0x54,name:'Teeth',defaultSpeed:400,ai:true,immuneWater:false,immuneFire:false},
  walker:{base:0x5C,name:'Walker',defaultSpeed:450,ai:false,immuneWater:false,immuneFire:false},
  paramecium:{base:0x60,name:'Paramecium',defaultSpeed:450,ai:false,immuneWater:false,immuneFire:false}
};
const monsterForTile=id=>{
  if(id>=0x40&&id<=0x43)return {kind:'bug',base:0x40};
  if(id>=0x44&&id<=0x47)return {kind:'fireball',base:0x44};
  if(id>=0x48&&id<=0x4B)return {kind:'ball',base:0x48};
  if(id>=0x4C&&id<=0x4F)return {kind:'tank',base:0x4C};
  if(id>=0x50&&id<=0x53)return {kind:'glider',base:0x50};
  if(id>=0x54&&id<=0x57)return {kind:'teeth',base:0x54};
  if(id>=0x5C&&id<=0x5F)return {kind:'walker',base:0x5C};
  if(id>=0x60&&id<=0x63)return {kind:'paramecium',base:0x60};
  return null;
};
Object.entries(MF).forEach(([k,v])=>{for(let d=0;d<4;d++)T[v.base+d].monsterKind=k;});
T.monsterForTile=monsterForTile;
T.MONSTER_FAMILIES=MF;
window.CC={TILES:T,setTile(el,id){const t=T[id];el.classList.add('t');el.classList.toggle('m',t.mask);el.style.setProperty('--c',t.c);el.style.setProperty('--r',t.r)}};
})();
