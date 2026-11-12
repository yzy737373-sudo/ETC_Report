/* Offline scene. Geometry and state animations are explanatory, not measurements. */+(function(){
'use strict';
const T=window.THREE,A=window.SCENE_ASSETS||{},$=id=>document.getElementById(id);
const state={chapter:0,playing:false,time:0,scenario:'normal',factors:{face:true,plate:true,etc:true},labels:true,exploded:false,auto:false};
const names=['现场全景','三因子通行','ETC现状','三色灯改造'];
const durations=[8,27,19,25];
const cases={
  normal:{name:'正常通信',power:true,network:'strong',signal:'strong',tag:true,interaction:true,detail:'供电与网络正常，检测到车载标签，ETC交互完成。'},
  network:{name:'网络未连通',power:true,network:'none',signal:'strong',tag:true,interaction:false,detail:'本例模拟设备有电、标签信号可接收，但网络未连通，对应指示灯熄灭。'},
  networkWeak:{name:'网络连接弱',power:true,network:'weak',signal:'strong',tag:true,interaction:false,detail:'本例模拟设备有电且可接收标签信号，但网络连接较弱，对应蓝色指示灯闪烁。'},
  noTag:{name:'未检测到标签',power:true,network:'strong',signal:'none',tag:false,interaction:false,detail:'本例模拟供电与网络正常，但尚未检测到车载标签。'},
  weak:{name:'接收信号偏弱',power:true,network:'strong',signal:'weak',tag:true,interaction:false,detail:'本例模拟已经检测到标签，但接收信号偏弱，交互未完成。'},
  pending:{name:'交互未完成',power:true,network:'strong',signal:'none',tag:true,interaction:false,detail:'本例模拟供电与网络正常，但ETC交互未完成，对应黄色接收信号灯熄灭。'},
  off:{name:'设备故障断电',power:false,network:'none',signal:'none',tag:false,interaction:false,detail:'本例模拟设备故障并断电，各功能均未进入工作状态，指示灯熄灭。'}
};
let renderer,scene,camera,root,antenna,vehicle,leftGate,rightGate,wheels=[],lamps=[],pcb,cover;
let width=1,height=1,elapsed=0,previous=performance.now(),cameraTween=null,drag=null,renderCount=0;
let orbit={target:new T.Vector3(-.2,1.5,3.0),yaw:.15,pitch:.18,radius:25};
const raycaster=new T.Raycaster(),pointer=new T.Vector2(),hitTargets=[],labelDefs=[];
const labels=[];
const staticBatches=new Map(), geoCache=new Map();
let gateAngle=0,carZ=-14,frameHidden=false,foliageMats=null;
const views={
 home:{pos:[6.0,3.3,-17.5],target:[-.4,1.9,2.5]},
 entry:{pos:[6.0,3.8,-14.5],target:[-1.4,1.15,-2]},
 antenna:{pos:[-4.12,3.40,-1.35],target:[-4.65,3.58,-.22]},
 face:{pos:[-3.6,2.25,-5.7],target:[-5.55,1.65,-2.65]},
 plate:{pos:[-2.55,2.35,-3.55],target:[-4.38,1.45,-.18]},
 bird:{pos:[-8.7,22,-17],target:[0,.2,1.0]}
};
const ease=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const v=(x,y,z)=>new T.Vector3(x,y,z);
let rngSeed=31023;function rand(){rngSeed=(Math.imul(1664525,rngSeed)+1013904223)|0;return (rngSeed>>>0)/4294967296;}
function material(color,roughness=.6,metalness=0){return new T.MeshStandardMaterial({color,roughness,metalness});}
const M={
 stone:material('#c6c6be',.9),cladding:material('#c6c5b8',.88),concrete:material('#a6a79f',.91),
 white:material('#dde1dc',.57,.15),dark:material('#333f44',.45,.55),steel:material('#8f9b9d',.3,.83),
 chrome:material('#cbd5d6',.18,.94),motor:material('#909b9d',.45,.64),slot:material('#34434a',.8,.2),
 blue:material('#1d5594',.5,.22),rubber:material('#171c1e',.95),black:material('#111a20',.35,.3),
 roof:material('#343b3e',.83,.1),bark:material('#655e4e',.95),asphalt:material('#afb5b2',.9),
 glass:new T.MeshPhysicalMaterial({color:'#5791ad',metalness:.42,roughness:.24,clearcoat:.8}),
 window:new T.MeshPhysicalMaterial({color:'#263e4b',metalness:.5,roughness:.17,clearcoat:1}),
 paint:new T.MeshPhysicalMaterial({color:'#1e2a31',metalness:.72,roughness:.2,clearcoat:1,clearcoatRoughness:.12}),
 antenna:material('#efeee6',.48,.13),trim:material('#c6c9c7',.43,.3),pcb:material('#1c6551',.72,.2),
 brass:material('#b59a57',.35,.7),screen:material('#081c25',.19,.22),red:material('#9f3d35',.5,.25)
};
function canvasTexture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;}
function imgTexture(key,repeat){if(!A[key])return null;const texture=new T.TextureLoader().load(A[key]);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;if(repeat){texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(...repeat);}return texture;}
function textTexture(text,{bg='transparent',fg='#e5eeee',size=60,w=512,h=128,vertical=false,weight=500}={}){return canvasTexture(w,h,(c)=>{if(bg!=='transparent'){c.fillStyle=bg;c.fillRect(0,0,w,h);}c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font=`${weight} ${size}px "Microsoft YaHei",sans-serif`;if(vertical){const chars=[...text],step=Math.min(size*1.4,h/(chars.length+.5));chars.forEach((ch,i)=>c.fillText(ch,w/2,step*(i+.75)));}else{c.fillText(text,w/2,h/2,w*.94);}});}
function textPlane(group,text,w,h,x,y,z,options={},rotation=0){const tex=textTexture(text,options);tex.wrapS=T.RepeatWrapping;tex.repeat.x=-1;tex.offset.x=1;const m=new T.MeshBasicMaterial({map:tex,transparent:options.bg===undefined||options.bg==='transparent',side:T.DoubleSide,depthWrite:false});const mesh=new T.Mesh(new T.PlaneGeometry(w,h),m);mesh.position.set(x,y,z);mesh.rotation.y=rotation;group.add(mesh);return mesh;}
function unit(kind){if(!geoCache.has(kind)){geoCache.set(kind,kind==='box'?new T.BoxGeometry(1,1,1):kind==='cylinder'?new T.CylinderGeometry(1,1,1,16):kind==='sphere'?new T.SphereGeometry(1,12,8):kind==='leaf'?new T.PlaneGeometry(1,1):null);}return geoCache.get(kind);}
function batched(kind,mat,pos,scale,rot){const key=kind+mat.uuid;if(!staticBatches.has(key))staticBatches.set(key,{geo:unit(kind),mat,matrices:[]});const ob=new T.Object3D();ob.position.set(...pos);ob.scale.set(...scale);if(rot)ob.rotation.set(...rot);ob.updateMatrix();staticBatches.get(key).matrices.push(ob.matrix.clone());}
function box(g,w,h,d,mat,x,y,z,rot=null){if(g===root){batched('box',mat,[x,y,z],[w,h,d],rot);return null;}const mesh=new T.Mesh(unit('box'),mat);mesh.scale.set(w,h,d);mesh.position.set(x,y,z);if(rot)mesh.rotation.set(...rot);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
function cyl(g,r,h,mat,x,y,z,rot=null,r2=r){if(g===root&&r===r2){batched('cylinder',mat,[x,y,z],[r,h,r],rot);return null;}const mesh=new T.Mesh(r===r2?unit('cylinder'):new T.CylinderGeometry(r2,r,h,24),mat);if(r===r2)mesh.scale.set(r,h,r);mesh.position.set(x,y,z);if(rot)mesh.rotation.set(...rot);mesh.castShadow=mesh.receiveShadow=true;g.add(mesh);return mesh;}
function sphere(g,r,mat,x,y,z,scale=null){if(g===root){batched('sphere',mat,[x,y,z],scale?[r*scale[0],r*scale[1],r*scale[2]]:[r,r,r]);return;}const m=new T.Mesh(unit('sphere'),mat);m.scale.set(...(scale?[r*scale[0],r*scale[1],r*scale[2]]:[r,r,r]));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m;}
function rod(g,a,b,r,mat){const aa=v(...a),bb=v(...b),mid=aa.clone().add(bb).multiplyScalar(.5),len=aa.distanceTo(bb),q=new T.Quaternion().setFromUnitVectors(v(0,1,0),bb.clone().sub(aa).normalize());if(g===root){const ob=new T.Object3D();ob.position.copy(mid);ob.scale.set(r,len,r);ob.quaternion.copy(q);ob.updateMatrix();const key='cylinder'+mat.uuid;if(!staticBatches.has(key))staticBatches.set(key,{geo:unit('cylinder'),mat,matrices:[]});staticBatches.get(key).matrices.push(ob.matrix.clone());return;}const m=cyl(g,r,len,mat,mid.x,mid.y,mid.z);m.quaternion.copy(q);return m;}
function rounded(g,w,h,d,rad,mat,x,y,z){const key=`r${w},${h},${d},${rad}`;let geometry=geoCache.get(key);if(!geometry){const s=new T.Shape();const a=-w/2,b=-h/2;s.moveTo(a+rad,b);s.lineTo(a+w-rad,b);s.quadraticCurveTo(a+w,b,a+w,b+rad);s.lineTo(a+w,b+h-rad);s.quadraticCurveTo(a+w,b+h,a+w-rad,b+h);s.lineTo(a+rad,b+h);s.quadraticCurveTo(a,b+h,a,b+h-rad);s.lineTo(a,b+rad);s.quadraticCurveTo(a,b,a+rad,b);geometry=new T.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelThickness:Math.min(.012,d*.2),bevelSize:Math.min(.012,rad*.35),bevelSegments:2,steps:1,curveSegments:5});geometry.translate(0,0,-d/2);geoCache.set(key,geometry);}const m=new T.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;g.add(m);return m;}
function flushBatches(){for(const b of staticBatches.values()){const mesh=new T.InstancedMesh(b.geo,b.mat,b.matrices.length);b.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}staticBatches.clear();}
function tube(g,points,r,mat){const curve=new T.CatmullRomCurve3(points.map(p=>v(...p)));const m=new T.Mesh(new T.TubeGeometry(curve,28,r,8,false),mat);m.castShadow=true;g.add(m);return m;}
function targetHit(g,pos,size,id){const mesh=new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({visible:false}));mesh.position.set(...pos);mesh.userData.target=id;g.add(mesh);hitTargets.push(mesh);}
function label(id,title,position,kind='device'){labelDefs.push({id,title,position:v(...position),kind});}
function buildGround(){
 const texture=canvasTexture(1024,1024,(c,w,h)=>{c.fillStyle='#adafa9';c.fillRect(0,0,w,h);for(let r=0;r<4;r++)for(let col=0;col<3;col++){const rr=170+Math.round(rand()*8);c.fillStyle=`rgb(${rr+2},${rr+3},${rr})`;c.fillRect(col*w/3+1,r*h/4+1,w/3-2,h/4-2);}for(let k=0;k<18000;k++){const a=rand()*.12;c.fillStyle=`rgba(${rand()>.5?'240,243,236':'42,48,45'},${a})`;c.fillRect(rand()*w,rand()*h,rand()*3+1,rand()*2+1);}c.strokeStyle='#777f7d';c.lineWidth=1;for(let x=0;x<=w;x+=w/3){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<=h;y+=h/4){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}});
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(36,36);const grain=imgTexture('ground',[45,50]);const mat=new T.MeshStandardMaterial({map:texture,roughness:.96,color:'#e1e1d9',bumpMap:grain||texture,bumpScale:.012});const plane=new T.Mesh(new T.PlaneGeometry(85,95),mat);plane.rotation.x=-Math.PI/2;plane.position.set(0,-.035,13);plane.receiveShadow=true;root.add(plane);
 // Narrow worn lane markings, kept subtle like the photographs.
 const yellow=material('#b5a16f',.94);for(let z=-13;z<9;z+=1.65){box(root,.075,.008,.8,yellow,-4.1,0,z);}box(root,8.9,.008,.07,material('#c7c9b4',.9),0,.003,-1.4);
}
function buildArchitecture(){
 const stone=imgTexture('stone',[4,5]);if(stone)M.cladding.map=stone;
 const glass=imgTexture('glass');if(glass){M.glass.map=glass;M.glass.color.set('#b8d1df');M.glass.roughness=.32;}
 const facadeZ=34.5,H=16.3;
 box(root,53,H,7.5,M.cladding,0,H/2,facadeZ+3.2);
 // Long glass facade, with a shallow central curve and deep stone columns.
 for(let ix=0;ix<14;ix++){
   const x=-24.05+ix*3.7;const recess=Math.abs(x)<12?-.55*Math.cos(x/12*Math.PI/2):.08;
   box(root,3.62,15.35,.08,M.glass,x,7.78,facadeZ-.66+recess);
   for(let dx of [-1.84,-.61,.62,1.84])box(root,.042,15.5,.1,M.steel,x+dx,7.8,facadeZ-.73+recess);
 }
 for(let y=.07;y<15.7;y+=1.82)box(root,52,.045,.15,M.steel,0,y,facadeZ-.84);
 for(const x of [-23,-17.8,-12.6,-7.4,-2.2,3,8.2,13.4,18.6,23.8]){
   cyl(root,.36,16.4,M.cladding,x,8.2,facadeZ-1.7);
   cyl(root,.48,.18,M.cladding,x,.09,facadeZ-1.7);
 }
 box(root,53,.55,.8,M.cladding,0,16.8,facadeZ-1.7);
 box(root,53,.42,.8,M.cladding,0,16.2,facadeZ+2.6);
 for(let x=-24;x<26;x+=5.2)box(root,.48,.34,4.9,M.cladding,x,16.65,facadeZ+.44);
 // Solid wings and floor joints.
 for(const x of [-26.5,26.5]){box(root,3.1,16.9,7.7,M.cladding,x,8.45,facadeZ+3);for(let j=1;j<14;j++)box(root,3.12,.025,.03,M.concrete,x,j*1.2,facadeZ-.88);}
 // Entrance canopy, glass mullions and shallow steps.
 const canopy=material('#8ca3a8',.24,.6);
 box(root,19,.15,4.3,canopy,0,3.4,31.5);for(let x=-9.5;x<=9.5;x+=1.5){rod(root,[x,3.39,29.4],[x,3.39,33.6],.04,M.steel);rod(root,[x,3.39,29.4],[x,5.0,33.5],.025,M.steel);}
 for(let x=-8;x<=8;x+=2){box(root,1.84,2.8,.12,M.window,x,1.45,33.25);box(root,.055,2.9,.18,M.chrome,x-.95,1.45,33.12);}
 for(let step=0;step<4;step++)box(root,15+step*1.6,.12,1.5,M.concrete,0,.06+step*.12,28.4+step*.7);
 // Low landscaped beds separating the entry forecourt from the building.
 box(root,13,.25,4.1,M.cladding,-15,.1,23);box(root,12,.25,4.1,M.cladding,15,.1,23);
 hedge(-15,23,12.6,3.7,.85);hedge(15,23,11.6,3.7,.85);
}
const leafMats=[material('#5b733a',.95),material('#63743b',.95),material('#7c7c37',.95),material('#a68f36',.95),material('#b0993d',.95),material('#be9d40',.95),material('#6a512e',.96)];
function hedge(x,z,w,d,h){for(let i=0;i<Math.ceil(w*d*4);i++){const px=x+(rand()-.5)*w,pz=z+(rand()-.5)*d;const mat=leafMats[Math.floor(rand()*3)];sphere(root,.22+rand()*.22,mat,px,h*.5+rand()*.2,pz,[1,.85,1]);}}
function tree(x,z,h=8){
 const top=h*.7;rod(root,[x,0,z],[x+.1,top,z],.15,M.bark);
 for(let i=0;i<7;i++){const angle=i*2.4,len=.9+rand()*1.1;rod(root,[x,top*.7,z],[x+Math.cos(angle)*len,top+.3+rand(),z+Math.sin(angle)*len],.055,M.bark);}
 if(!foliageMats){foliageMats=['foliage-autumn','foliage-green'].map(key=>new T.MeshStandardMaterial({map:imgTexture(key),alphaTest:.36,side:T.DoubleSide,roughness:1,color:key==='foliage-autumn'?'#dad2b3':'#bec9a2'}));}
 // Smaller overlapping leaf clusters give the photographed autumn crowns a less regular outline.
 for(let i=0;i<96;i++){
   const angle=rand()*Math.PI*2,u=rand()*2-1,r=Math.cbrt(rand()),horizontal=Math.sqrt(1-u*u)*r;
   const px=x+Math.cos(angle)*horizontal*2.15,pz=z+Math.sin(angle)*horizontal*2.05,yy=top+.45+u*r*1.95,size=.72+rand()*.85;
   const mat=foliageMats[i%6===0?1:0];
   for(let cross=0;cross<2;cross++)batched('leaf',mat,[px,yy,pz],[size,size*(.85+rand()*.3),1],[0,angle+cross*Math.PI/2,(rand()-.5)*.35]);
 }
}
function buildLandscape(){
 hedge(-10.5,-.1,8.3,2.2,.7);hedge(9.9,4.5,5.7,2.3,.8);
 for(let i=0;i<15;i++)tree(-20+Math.floor(i/5)*3.1,2+(i%5)*6,6.8+rand()*2);
 for(let i=0;i<7;i++)tree(13+(i%2)*3.5,7+i*3.8,7+rand()*2);
 // Stone sign, kept as a textured feature without adding an invented unit name.
 const b=new T.Group();b.position.set(-9.7,1.48,.6);root.add(b);
 const stoneMat=M.stone.clone();const raw=imgTexture('monument');if(raw){stoneMat.map=raw;stoneMat.color.set('#c4b9a9');}
 rounded(b,5.2,2.9,.7,.16,stoneMat,0,0,0);
 if(!raw)textPlane(b,'园 区',2.1,.9,-.3,.12,-.371,{fg:'#ac8b3a',size:105,w:512,h:256});
 // Flagpoles with small cloth folds.
 const red=material('#b63836',.85),flagblue=material('#285a95',.8);
 for(let i=0;i<3;i++){
   const x=-9.1+i*.85,z=5.2;cyl(root,.04,12-i*.5,M.chrome,x,6-i*.25,z);sphere(root,.08,M.chrome,x,12-i*.5,z);
   const geom=new T.PlaneGeometry(1.6,.85,12,5);const p=geom.attributes.position;for(let k=0;k<p.count;k++)p.setZ(k,Math.sin(p.getX(k)*5)*.08+.06*p.getX(k));geom.computeVertexNormals();const flag=new T.Mesh(geom,i===1?red:flagblue);flag.material.side=T.DoubleSide;flag.position.set(x+.8,11.1-i*.5,z);root.add(flag);
 }
}
function buildFences(){
 // White and blue pedestrian barriers.
 function fence(a,b){const aa=v(...a),bb=v(...b),len=aa.distanceTo(bb),dir=bb.clone().sub(aa).normalize();for(let y of [.2,.86])rod(root,[aa.x,y,aa.z],[bb.x,y,bb.z],.024,M.white);const count=Math.ceil(len/.24);for(let i=0;i<=count;i++){const p=aa.clone().addScaledVector(dir,len*i/count);rod(root,[p.x,.2,p.z],[p.x,.84,p.z],.014,i%2?M.blue:M.white);}for(let i=0;i<=Math.ceil(len/1.9);i++){const p=aa.clone().addScaledVector(dir,len*i/Math.ceil(len/1.9));box(root,.11,1.03,.11,M.white,p.x,.515,p.z);box(root,.14,.07,.14,M.white,p.x,1.035,p.z);box(root,.08,.02,.08,M.chrome,p.x,1.085,p.z);box(root,.21,.1,.21,M.dark,p.x,.05,p.z);}}
 fence([-5.3,0,-3.6],[-5.3,0,.5]);fence([-5.3,0,-3.6],[-10.7,0,-3.6]);fence([5.15,0,-1.6],[8.2,0,-1.6]);fence([5.15,0,-1.6],[5.15,0,-5.6]);
 // Steel palisade and retractable gate behind the left entry equipment.
 for(let x=-24;x<-5.5;x+=.28){cyl(root,.018,1.85,M.chrome,x,.94,1.1);sphere(root,.025,M.chrome,x,1.885,1.1);}for(let y of [.25,1.45])rod(root,[-24,y,1.1],[-5.5,y,1.1],.025,M.steel);
 for(let i=0;i<24;i++){const x=-16.6+i*.43;rod(root,[x,.2,.2],[x+.43,1.6,.2],.028,M.chrome);rod(root,[x,1.6,.2],[x+.43,.2,.2],.028,M.chrome);rod(root,[x,.2,.2],[x,1.6,.2],.022,M.steel);sphere(root,.045,M.chrome,x+.21,.9,.17);if(i%2===0)cyl(root,.055,.08,M.rubber,x,.09,.17,[0,0,Math.PI/2]);}
}
function buildBollards(){
 for(let i=0;i<3;i++){
   const z=-5.1+i*1.25,x=5.3;
   cyl(root,.23,.08,M.steel,x,.04,z,null,.18);
   cyl(root,.19,.69,M.steel,x,.41,z,null,.085);
   cyl(root,.09,.11,M.chrome,x,.81,z);sphere(root,.105,M.chrome,x,.93,z);
   const ring=new T.Mesh(new T.TorusGeometry(.062,.009,6,24),M.chrome);ring.position.set(x,.62,z-.12);root.add(ring);
   if(i<2){const pts=[];for(let j=0;j<=12;j++)pts.push([x,.68-.18*Math.sin(j/12*Math.PI),z+j/12*1.25]);tube(root,pts,.008,M.dark);}
 }
}
function buildGuardhouse(){
 const g=new T.Group();g.position.set(7.45,0,2.7);root.add(g);const w=4.5,d=4.3;
 box(g,w,.18,d,M.concrete,0,.09,0);box(g,w,2.95,d,M.roof,0,1.6,0);
 // Front and side glazing, inset in the dark metal frame.
 const faceMat=M.window.clone();faceMat.color.set('#47616a');faceMat.roughness=.22;faceMat.map=imgTexture('guard');
 box(g,3.8,1.65,.05,faceMat,0,1.86,-2.18);box(g,.06,1.65,3.45,faceMat,-2.29,1.86,0);
 for(let x of [-2,-.75,.65,2])box(g,.08,1.86,.1,M.dark,x,1.82,-2.24);
 for(let y of [.94,2.68])box(g,4.12,.095,.12,M.dark,0,y,-2.24);
 box(g,4.9,.2,4.85,M.dark,.05,3.16,-.2);box(g,5.3,.12,2.3,M.dark,.15,3.1,-2.6);
 // Dark door and handle; roof-mounted floodlight.
 box(g,1.0,2.45,.07,M.window,1.52,1.4,-2.26);rod(g,[1.87,1.05,-2.33],[1.87,1.42,-2.33],.025,M.chrome);
 box(g,.46,.28,.24,M.dark,-1.4,3.54,-1.4,[.2,0,0]);box(g,.34,.17,.018,M.white,-1.4,3.54,-1.54,[.2,0,0]);
 const umbrella=new T.Group();umbrella.position.set(7.8,0,-2);root.add(umbrella);cyl(umbrella,.035,2.8,M.dark,0,1.4,0);
 const geo=new T.ConeGeometry(2.75,.52,8,1,true);const canopy=new T.Mesh(geo,new T.MeshStandardMaterial({color:'#747d83',side:T.DoubleSide,roughness:1}));canopy.position.y=2.74;canopy.rotation.y=Math.PI/8;canopy.castShadow=true;umbrella.add(canopy);
 for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8;rod(umbrella,[0,3.0,0],[2.75*Math.cos(a),2.48,2.75*Math.sin(a)],.016,M.dark);}
 for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8;const r=2.75;rod(umbrella,[r*Math.cos(a),2.48,r*Math.sin(a)],[r*Math.cos(a+Math.PI/4),2.48,r*Math.sin(a+Math.PI/4)],.018,M.roof);}
 // Generic, non-identifying guard figure.
 const navy=material('#273f50',.8);for(let i=0;i<2;i++){const h=new T.Group();h.position.set(6.65+i*1.65,0,-.55-i*.2);root.add(h);cyl(h,.085,.75,navy,-.11,.49,0);cyl(h,.085,.75,navy,.11,.49,0);box(h,.43,.54,.24,navy,0,1.12,0);sphere(h,.125,material('#b29c86',.8),0,1.6,0,[.8,1.08,1]);cyl(h,.145,.06,navy,0,1.73,0);rod(h,[-.25,1.36,0],[-.3,.84,-.05],.055,navy);rod(h,[.25,1.36,0],[.3,.84,-.05],.055,navy);box(h,.15,.07,.29,M.black,-.1,.06,-.04);box(h,.15,.07,.29,M.black,.1,.06,-.04);}
}
function buildGates(){
 const hazard=canvasTexture(1024,64,(c,w,h)=>{c.fillStyle='#e9a526';c.fillRect(0,0,w,h);c.fillStyle='#fae9a6';for(let x=-60;x<w;x+=95){c.beginPath();c.moveTo(x,0);c.lineTo(x+38,0);c.lineTo(x+100,h);c.lineTo(x+62,h);c.fill();}c.fillStyle='#b9aa75';c.fillRect(0,h-6,w,6);});hazard.wrapS=T.RepeatWrapping;hazard.repeat.x=2;
 const stripe=new T.MeshStandardMaterial({map:hazard,roughness:.5,metalness:.3});
 function side(sign){
   const x=sign*4.7;
   const base=new T.Group();base.position.set(x,0,0);root.add(base);
   rounded(base,.86,.12,.95,.15,M.steel,0,.06,0);rounded(base,.5,1.62,.58,.035,M.motor,0,.96,0);
   box(base,.48,.12,.61,M.motor,0,1.83,0);box(base,.36,1.35,.018,M.motor,0,.98,-.304);
   for(let i=0;i<4;i++){box(base,.19,.015,.014,M.slot,0,1.5-i*.065,-.32);box(base,.2,.014,.008,M.white,0,1.508-i*.065,-.328);}
   for(let i=0;i<5;i++)box(base,.16,.015,.014,M.slot,0,.54-i*.054,-.322);
   cyl(base,.12,.05,M.dark,-sign*.28,1.47,0,[0,0,Math.PI/2]);
   const arm=new T.Group();arm.position.set(-sign*.27,1.47,0);base.add(arm);
   const len=4.43,dir=-sign;
   box(arm,len,.14,.14,M.white,dir*len/2,0,0);box(arm,len,.095,.012,stripe,dir*len/2,.008,-.083);
   box(arm,len,.07,.095,M.dark,dir*len/2,-1.04,0);box(arm,len,.027,.015,M.red,dir*len/2,-1.02,-.058);
   for(let i=0;i<20;i++){const xx=dir*(.12+i*.216);box(arm,.043,.94,.045,M.steel,xx,-.53,0);box(arm,.017,.94,.01,M.chrome,xx-.016,-.53,-.029);}
   box(arm,.045,1.35,.045,M.dark,dir*(len-.06),-.72,0);
   for(let i=0;i<4;i++)cyl(arm,.016,.025,M.chrome,dir*(.2+i*1.18),0,-.101,[Math.PI/2,0,0]);
   return arm;
 }
 leftGate=side(-1);rightGate=side(1);
 label('gate','三项全部匹配才开闸',[.4,2.0,0]);targetHit(root,[0,1,0],[8.5,1.6,.5],'gate');
}
function buildFaceTerminal(){
 const g=new T.Group();g.position.set(-5.55,0,-2.7);root.add(g);
 box(g,.18,2.35,.18,M.dark,0,1.175,0);box(g,.32,.09,.4,M.dark,0,.045,0);
 const beaconMat=new T.MeshPhysicalMaterial({color:'#e0a233',roughness:.24,metalness:.12,transparent:true,opacity:.85,clearcoat:.7});
 cyl(g,.13,.07,M.dark,0,2.4,0);cyl(g,.105,.2,beaconMat,0,2.535,0,null,.09);sphere(g,.092,beaconMat,0,2.64,0,[1,.55,1]);
 const banner=textTexture('驾驶员请刷脸',{bg:'#285ba1',fg:'#f4f6ef',vertical:true,size:55,w:180,h:1200});
 banner.wrapS=T.RepeatWrapping;banner.repeat.x=-1;banner.offset.x=1;const bm=new T.MeshStandardMaterial({map:banner,roughness:.77});box(g,.185,1.85,.014,bm,0,1.16,-.104);
 const terminal=new T.Group();terminal.position.set(.14,1.6,-.09);terminal.rotation.y=-.15;g.add(terminal);
 rounded(terminal,.26,.51,.085,.027,M.dark,0,0,0);rounded(terminal,.224,.43,.012,.018,M.screen,0,-.01,-.054);
 cyl(terminal,.028,.012,M.black,0,.144,-.07,[Math.PI/2,0,0]);cyl(terminal,.016,.015,M.window,0,.144,-.08,[Math.PI/2,0,0]);
 for(const x of [-.075,.075])cyl(terminal,.008,.008,M.trim,x,.14,-.075,[Math.PI/2,0,0]);
 box(terminal,.29,.035,.16,M.black,0,.275,-.05,[.15,0,0]);box(terminal,.025,.2,.16,M.black,-.143,.19,-.05);
 textPlane(terminal,'人脸核验',.17,.05,0,-.164,-.069,{fg:'#82a59f',size:40,w:512,h:128});
 textPlane(g,'刷脸认证',.28,.1,.13,1.15,-.17,{bg:'#e9eeeb',fg:'#29414f',size:38,w:512,h:180});
 targetHit(root,[-5.4,1.6,-2.7],[.5,.7,.55],'face');label('face','人脸核验',[-5.55,2.88,-2.7]);
}
function buildPlateCamera(){
 const g=new T.Group();g.position.set(4.7,0,-.37);root.add(g);
 rounded(g,.4,1.91,.38,.015,M.dark,0,.99,0);box(g,.334,1.8,.014,M.black,0,1.0,-.21);
 cyl(g,.083,.035,M.chrome,0,1.68,-.23,[Math.PI/2,0,0]);cyl(g,.064,.04,M.black,0,1.68,-.255,[Math.PI/2,0,0]);cyl(g,.038,.043,M.window,0,1.68,-.281,[Math.PI/2,0,0]);
 const text=canvasTexture(256,512,(c,w,h)=>{c.fillStyle='#0e1820';c.fillRect(0,0,w,h);c.textAlign='center';c.font='30px Microsoft YaHei';c.fillStyle='#5e9d70';c.fillText('车辆识别',w/2,85);c.fillStyle='#ce8e53';c.fillText('安全通行',w/2,155);c.font='21px Microsoft YaHei';c.fillStyle='#728b9d';c.fillText('核验后通行',w/2,210);c.fillStyle='#396f95';c.beginPath();c.arc(w/2,355,34,0,Math.PI*2);c.strokeStyle='#396f95';c.lineWidth=3;c.stroke();});
 box(g,.28,.77,.008,new T.MeshStandardMaterial({map:text,roughness:.45}),0,1.05,-.228);
 for(let x=-.09;x<=.09;x+=.06)for(let y=.38;y<.52;y+=.04)box(g,.025,.018,.005,M.white,x,y,-.229);
 // The right-side column is retained as a site feature. User confirmed that
 // the left vehicle barrier is the license plate recognition point.
 const left=new T.Group();left.position.set(-4.37,0,-.20);root.add(left);
 rounded(left,.22,1.72,.20,.018,M.dark,0,.96,0);box(left,.19,1.62,.014,M.black,0,.96,-.116);
 cyl(left,.051,.02,M.chrome,0,1.59,-.132,[Math.PI/2,0,0]);cyl(left,.039,.026,M.black,0,1.59,-.15,[Math.PI/2,0,0]);cyl(left,.023,.03,M.window,0,1.59,-.168,[Math.PI/2,0,0]);
 for(let i=0;i<3;i++)box(left,.04,.008,.008,M.white,-.055+i*.055,1.43,-.128);
 textPlane(left,'车辆识别',.15,.035,0,1.22,-.137,{fg:'#81a3a4',size:40,w:512,h:128});
 targetHit(root,[-4.37,1.35,-.2],[.32,1.1,.45],'plate');label('plate','车牌识别 · 左侧闸机',[-4.35,2.07,-.2]);
}
function buildAntenna(){
 const pole=new T.Group();pole.position.set(-4.65,0,.15);root.add(pole);
 cyl(pole,.065,3.83,M.dark,0,1.915,0);sphere(pole,.076,M.chrome,0,3.9,0);
 for(let y of [3.34,3.55]){cyl(pole,.072,.025,M.steel,0,y,0);box(pole,.145,.05,.075,M.steel,0,y,-.07);for(let x of [-.06,.06]){rod(pole,[x,y,-.1],[x,y,-.22],.008,M.chrome);cyl(pole,.014,.014,M.chrome,x,y,-.226,[Math.PI/2,0,0]);}}
 const support=new T.Group();support.position.set(0,3.49,-.1);pole.add(support);support.rotation.y=-.17;
 box(support,.13,.19,.025,M.steel,0,0,-.065);box(support,.12,.06,.18,M.steel,0,.03,-.14,[.28,0,0]);
 for(let x of [-.045,.045])for(let y of [-.06,.06])cyl(support,.012,.025,M.chrome,x,y,-.087,[Math.PI/2,0,0]);
 antenna=new T.Group();antenna.position.set(0,.09,-.29);support.add(antenna);
 rounded(antenna,.427,.422,.072,.032,M.trim,0,0,.012);
 rounded(antenna,.417,.412,.045,.03,M.antenna,0,0,-.019);
 cover=new T.Group();antenna.add(cover);
 rounded(cover,.395,.391,.017,.026,M.antenna,0,0,-.052);
 const panelMap=imgTexture('antenna');
 if(panelMap){const panel=new T.Mesh(new T.PlaneGeometry(.37,.367),new T.MeshStandardMaterial({map:panelMap,roughness:.54,color:'#fffdf4'}));panel.rotation.y=Math.PI;panel.position.z=-.064;cover.add(panel);}else{
   for(let r of [.10,.155]){const ring=new T.Mesh(new T.TorusGeometry(r,.0016,5,90),M.trim);ring.position.z=-.063;cover.add(ring);}
 }
 // Rear mounting screws and bottom connector sockets.
 for(let x of [-.17,.17])for(let y of [-.17,.17])cyl(antenna,.006,.008,M.steel,x,y,.053,[Math.PI/2,0,0]);
 for(let i=0;i<3;i++){const x=-.11+i*.1;cyl(antenna,.018,.025,M.chrome,x,-.222,.006);cyl(antenna,.013,.038,M.black,x,-.247,.006);}
 tube(pole,[[-.060,3.33,-.399],[-.068,3.0,-.28],[-.070,2.65,-.13],[-.068,2.2,-.038],[-.068,1.5,-.026],[-.068,.9,-.025],[-.067,.15,-.025]],.006,M.rubber);
 tube(pole,[[.038,3.33,-.382],[.030,3.0,-.26],[.014,2.65,-.125],[.002,2.2,-.080],[.000,1.5,-.073],[.001,.9,-.072],[.002,.15,-.072]],.006,M.rubber);
 tube(pole,[[.137,3.33,-.365],[.115,3.0,-.255],[.090,2.65,-.12],[.070,2.2,-.040],[.068,1.5,-.026],[.067,.9,-.025],[.066,.15,-.025]],.005,M.rubber);
 for(let i=0;i<3;i++){
   const group=new T.Group();group.position.set(.151,.115-i*.083,-.073);cover.add(group);group.visible=false;
   const rim=new T.Mesh(new T.TorusGeometry(.0105,.0022,8,24),M.steel);group.add(rim);
   const colors=['#51b875','#4a99df','#e2b443'];
   const lm=new T.MeshStandardMaterial({color:colors[i],roughness:.2,metalness:.05,emissive:colors[i],emissiveIntensity:0});
   const lens=new T.Mesh(new T.SphereGeometry(.0087,16,12),lm);lens.scale.z=.45;lens.position.z=-.001;group.add(lens);
   const haloTex=canvasTexture(64,64,(c,w,h)=>{const grad=c.createRadialGradient(32,32,0,32,32,32);grad.addColorStop(0,colors[i]+'d0');grad.addColorStop(.3,colors[i]+'65');grad.addColorStop(1,colors[i]+'00');c.fillStyle=grad;c.fillRect(0,0,w,h);});
   const halo=new T.Sprite(new T.SpriteMaterial({map:haloTex,transparent:true,depthWrite:false}));halo.scale.set(.037,.037,1);halo.position.z=-.004;group.add(halo);lamps.push({group,mat:lm,halo});
 }
 pcb=new T.Group();antenna.add(pcb);pcb.visible=false;
 box(pcb,.338,.325,.009,M.pcb,0,0,-.032);
 for(let x of [-.14,.14])for(let y of [-.135,.135])cyl(pcb,.006,.014,M.brass,x,y,-.042,[Math.PI/2,0,0]);
 rounded(pcb,.061,.061,.008,.004,M.black,-.035,.01,-.047);
 for(let row=0;row<10;row++){box(pcb,.004,.002,.007,M.chrome,-.07,.033-row*.005,-.047);box(pcb,.004,.002,.007,M.chrome,.0,.033-row*.005,-.047);}
 for(let i=0;i<10;i++){box(pcb,.024,.009,.005,M.black,.06,.12-i*.025,-.043);box(pcb,.008,.01,.007,M.chrome,.039,.12-i*.025,-.043);box(pcb,.008,.01,.007,M.chrome,.081,.12-i*.025,-.043);}
 for(let i=0;i<3;i++){box(pcb,.045,.018,.025,M.blue,-.09+i*.07,-.12,-.048);for(let j=0;j<2;j++)cyl(pcb,.004,.008,M.chrome,-.101+i*.07+j*.022,-.12,-.065,[Math.PI/2,0,0]);}
 for(let i=0;i<18;i++){const x=-.13+rand()*.26,y=-.11+rand()*.23;box(pcb,.016,.003,.002,M.brass,x,y,-.04);}
 targetHit(root,[-4.65,3.58,-.25],[.63,.61,.65],'antenna');label('antenna','ETC天线 · 本项目改造对象',[-4.65,4.2,.1]);
}
function buildVehicle(){
 vehicle=new T.Group();root.add(vehicle);vehicle.position.set(-1.8,0,-14);
 rounded(vehicle,1.86,.55,4.45,.18,M.paint,0,.69,0);
 rounded(vehicle,1.91,.23,4.32,.10,M.paint,0,.48,0);
 rounded(vehicle,1.81,.16,1.27,.09,M.paint,0,1.01,1.49);
 rounded(vehicle,1.79,.15,.9,.07,M.paint,0,.98,-1.67);
 // Cabin silhouette, with dark glazing and a sculpted roof.
 const profile=[[-1.36,1.0,.85],[-.78,1.52,.76],[.66,1.51,.75],[1.27,1.02,.84]];
 const points=[],indices=[];
 for(const [z,y,x] of profile){points.push(-x,y,z,x,y,z);}
 for(let i=0;i<profile.length-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));geometry.setIndex(indices);geometry.computeVertexNormals();const windshield=new T.Mesh(geometry,M.window);windshield.material.side=T.DoubleSide;windshield.castShadow=true;vehicle.add(windshield);
 rounded(vehicle,1.48,.075,1.47,.05,M.paint,0,1.535,-.065);
 for(let sign of [-1,1]){
   const verts=[];for(const [z,y,x] of profile)verts.push(sign*x,y,z,sign*.875,.99,z);
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();const win=new T.Mesh(geo,M.window);vehicle.add(win);
   for(let i=0;i<profile.length-1;i++){const p=profile[i],n=profile[i+1];rod(vehicle,[sign*p[2],p[1],p[0]],[sign*n[2],n[1],n[0]],.018,M.chrome);}
   rod(vehicle,[sign*.86,.985,-1.37],[sign*.86,.985,1.3],.018,M.chrome);
   box(vehicle,.025,.48,.065,M.paint,sign*.81,1.25,-.16,[0,0,sign*.08]);
   box(vehicle,.08,.035,.14,M.chrome,sign*.938,.91,.45);box(vehicle,.08,.035,.14,M.chrome,sign*.938,.91,-.81);
   rounded(vehicle,.22,.13,.26,.04,M.paint,sign*1.015,1.08,.89);
   rod(vehicle,[sign*.94,.7,-2.05],[sign*.94,.7,2.05],.011,M.chrome);
 }
 for(let x of [-.94,.94])for(let z of [-1.46,1.46]){
   const axle=new T.Group();axle.position.set(x,.355,z);axle.rotation.z=Math.PI/2;vehicle.add(axle);
   const wheel=new T.Group();axle.add(wheel);wheels.push(wheel);
   cyl(wheel,.332,.21,M.rubber,0,0,0);cyl(wheel,.248,.226,M.chrome,0,0,0);cyl(wheel,.207,.232,M.dark,0,0,0);cyl(wheel,.066,.245,M.chrome,0,0,0);
   for(let k=0;k<10;k++){const a=k*Math.PI/5;rod(wheel,[Math.cos(a)*.05,-Math.sign(x)*.125,Math.sin(a)*.05],[Math.cos(a+.06)*.228,-Math.sign(x)*.125,Math.sin(a+.06)*.228],.012,M.chrome);}
 }
 const whiteLight=new T.MeshStandardMaterial({color:'#eff2de',emissive:'#f7f7d6',emissiveIntensity:.7,roughness:.2});
 for(let x of [-.62,.62]){rounded(vehicle,.44,.12,.035,.035,whiteLight,x,.85,2.245);rounded(vehicle,.47,.1,.03,.024,new T.MeshStandardMaterial({color:'#a92727',emissive:'#a91616',emissiveIntensity:.35}),x,.88,-2.248);}
 box(vehicle,.65,.21,.04,M.black,0,.66,2.245);for(let x=-.29;x<.31;x+=.055)box(vehicle,.011,.17,.017,M.chrome,x,.66,2.27);
 box(vehicle,1.7,.035,.05,M.chrome,0,.45,2.21);box(vehicle,1.65,.035,.05,M.chrome,0,.45,-2.21);
 const plate=textTexture('演示 0001',{bg:'#275c91',fg:'#f1f6f5',size:45,w:512,h:160});plate.wrapS=T.RepeatWrapping;plate.repeat.x=-1;plate.offset.x=1;const plateM=new T.MeshStandardMaterial({map:plate,roughness:.55});box(vehicle,.41,.13,.012,plateM,0,.63,-2.27);box(vehicle,.41,.13,.012,plateM,0,.52,2.265);
 cyl(vehicle,.044,.3,M.steel,-.61,.38,-2.13,[Math.PI/2,0,0]);cyl(vehicle,.044,.3,M.steel,.61,.38,-2.13,[Math.PI/2,0,0]);
 // Driver and onboard tag are diagrammatic; no real face or identifier is used.
 sphere(vehicle,.105,material('#a3907d',.85),-.42,1.23,.44,[.85,1.1,.9]);box(vehicle,.3,.34,.25,M.dark,-.42,.99,.3);
 const tag=rounded(vehicle,.11,.07,.022,.007,M.white,-.22,1.31,1.03);tag.rotation.x=-.5;
 targetHit(vehicle,[0,.85,0],[2.1,1.7,4.8],'vehicle');
}
function buildLighting(){
 scene.background=new T.Color('#a8c9e2');scene.fog=new T.Fog('#b7d0df',45,110);
 const hemi=new T.HemisphereLight('#e4f0fa','#a9a99d',1.6);scene.add(hemi);
 const sun=new T.DirectionalLight('#fff2d9',3.3);sun.position.set(20,35,-18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-35;sun.shadow.camera.right=35;sun.shadow.camera.top=40;sun.shadow.camera.bottom=-35;sun.shadow.camera.near=1;sun.shadow.camera.far=95;sun.shadow.bias=-.0001;sun.shadow.normalBias=.04;sun.target.position.set(0,0,8);scene.add(sun,sun.target);
 const env=canvasTexture(1024,512,(c,w,h)=>{const grad=c.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#b4d7ed');grad.addColorStop(.46,'#d2e6f1');grad.addColorStop(.53,'#bdc0b4');grad.addColorStop(1,'#8a8d86');c.fillStyle=grad;c.fillRect(0,0,w,h);c.fillStyle='#e8ece9';for(let i=0;i<24;i++)c.fillRect(i*45,210+rand()*30,18,75+rand()*20);c.fillStyle='#f7f3dc';c.fillRect(140,80,90,60);});
 env.mapping=T.EquirectangularReflectionMapping;const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(env).texture;env.dispose();pmrem.dispose();
}
function mergeChildren(group){
 const batches=new Map();
 for(const m of [...group.children]){
   if(!m.isMesh||Array.isArray(m.material)||m.userData.target)continue;
   m.updateMatrix();const geom=(m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone());geom.applyMatrix4(m.matrix);
   const key=m.material.uuid;if(!batches.has(key))batches.set(key,{mat:m.material,items:[]});batches.get(key).items.push(geom);group.remove(m);
 }
 for(const {mat,items} of batches.values()){
   const geom=new T.BufferGeometry();for(const attribute of ['position','normal','uv']){
     const size=attribute==='uv'?2:3;const length=items.reduce((n,g)=>n+(g.attributes[attribute]?.array.length||g.attributes.position.count*size),0);const arr=new Float32Array(length);let offset=0;
     for(const g of items){const a=g.attributes[attribute];if(a)arr.set(a.array,offset);offset+=(a?.array.length||g.attributes.position.count*size);}geom.setAttribute(attribute,new T.BufferAttribute(arr,size));
   }geom.computeBoundingSphere();const mesh=new T.Mesh(geom,mat);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);items.forEach(g=>g.dispose());
 }
}
let relationLines=[],pulses=[];
function buildRelations(){
 const colors=[0x5c9fbc,0xd1ad64,0x68a88a];
 for(let i=0;i<3;i++){
   const geom=new T.BufferGeometry().setFromPoints([v(0,0,0),v(1,1,1)]);const line=new T.Line(geom,new T.LineDashedMaterial({color:colors[i],transparent:true,opacity:.65,dashSize:.16,gapSize:.12,depthTest:false}));line.computeLineDistances();line.visible=false;scene.add(line);relationLines.push(line);
   const pulse=sphere(scene,.042,new T.MeshBasicMaterial({color:colors[i]}),0,0,0);pulse.visible=false;pulses.push(pulse);
 }
}
function currentFactorStatuses(){
 const t=state.time,thresholds={plate:5,face:8,etc:11},out={};
 for(const [key,time] of Object.entries(thresholds))out[key]=state.chapter===1?(t>=time?(state.factors[key]?'pass':'fail'):(t>=time-2?'scanning':'pending')):'pending';
 return out;
}
function factorRows(statuses={face:'pending',plate:'pending',etc:'pending'}){const defs=[['face','01','人脸核验'],['plate','02','车牌识别'],['etc','03','ETC匹配']];return defs.map(([key,num,title])=>`<div class="factor" data-factor="${key}" data-status="${statuses[key]}"><span class="fnum">${num}</span><strong>${title}</strong><span class="fstate">${{pass:'匹配成功',fail:'未通过',scanning:'正在核验',pending:'待核验'}[statuses[key]]}</span></div>`).join('');}
function casesHTML(){return '<div class="case-list" aria-label="选择模拟设备状态">'+Object.entries(cases).map(([key,c])=>`<button data-case="${key}" class="${state.scenario===key?'active':''}" aria-pressed="${state.scenario===key}">${c.name}</button>`).join('')+'</div>';}
function lampRows(){return `<div class="lamps"><div class="lamp-row" data-lamp="0" style="--lamp:#51b875"><i class="dot"></i><strong>电源 · 绿</strong><span>—</span></div><div class="lamp-row" data-lamp="1" style="--lamp:#4a99df"><i class="dot"></i><strong>网络连接 · 蓝</strong><span>—</span></div><div class="lamp-row" data-lamp="2" style="--lamp:#e2b443"><i class="dot"></i><strong>接收信号 · 黄</strong><span>—</span></div></div>`;}
function renderPanel(){
 const testingOpen=$('panel').querySelector('.factor-testing')?.open||false;let html='';
 if(state.chapter===0){html=`<div class="kicker">现场空间与设备</div><h2>同一入口，三项联合核验</h2><p>以照片中的来车方向进入。人脸、车牌和ETC必须全部匹配成功，系统才允许道闸开启。</p>${factorRows()}<div class="rule">点击场景中的标注，可以走近设备观察；也可以直接开始完整的进门演示。</div><button class="mainbutton" data-action="start">开始进门演示 →</button><p class="smallnote">场景按照片参照建模，尺寸为近似比例；未覆盖的建筑细节作了简化。</p>`;}
 if(state.chapter===1){html=`<div class="kicker">三个结果 · 一个放行条件</div><h2>三因子全部通过才开闸</h2><p>演示车辆驶近入口，逐项显示核验结果；任何一项未通过，道闸保持关闭。</p><div id="factor-rows">${factorRows(currentFactorStatuses())}</div><div class="logic-result" id="logic-result">等待车辆进入核验位置</div><details class="factor-testing"><summary>演示某一因子不通过</summary><div class="factor-switches">${[['face','人脸'],['plate','车牌'],['etc','ETC']].map(([key,n])=>`<button data-toggle="${key}" class="${state.factors[key]?'':'bad'}" aria-pressed="${state.factors[key]}">${n}${state.factors[key]?' ✓':' ×'}</button>`).join('')}</div></details><button class="mainbutton secondary" data-action="focus-etc">拉近看ETC现状 →</button><p class="smallnote">为便于讲解，核验结果分步展示；该顺序不代表实际系统的采集时序。车牌、人员与通行事件均为演示内容。</p>`;}
 if(state.chapter===2){html=`<div class="kicker">现有成品设备 · 外观观察</div><h2>状态不同，外观看起来相同</h2><p>没有本地状态指示灯时，现场人员仅看天线外观，难以直观判断联网、标签检测和交互结果。</p>${casesHTML()}<div class="status-note" id="case-description">${cases[state.scenario].detail}</div><div class="rule">观察天线正面：切换模拟状态，外观不会给出对应提示，仍需结合后台信息核查。</div><button class="mainbutton" data-action="upgrade">查看三色灯改造 →</button><p class="smallnote">这些是用于解释需求的模拟工况，并非试点故障记录。</p>`;}
 if(state.chapter===3){html=`<div class="kicker">拟改造效果 · 自主电路模块</div><h2>让关键设备状态看得见</h2><p>在现有天线外壳增加三色灯，分别提示供电、网络连接与接收信号状态。</p>${casesHTML()}${lampRows()}<div class="status-note" id="case-description">${cases[state.scenario].detail}</div><button class="mainbutton secondary" data-action="explode">${state.exploded?'合上外壳':'查看模块结构示意'}</button><p class="smallnote" id="lamp-definition">绿＝电源，蓝＝网络，黄＝接收信号。常亮表示正常；蓝灯闪烁表示网络连接弱，黄灯闪烁表示信号偏弱；网络未连通、交互未完成或设备故障断电时，相应指示灯熄灭。</p><p class="smallnote">灯态和结构为方案示意，不替代完整授权核查。</p>`;}
 $('panel').innerHTML=html;
 if(testingOpen&&$('panel').querySelector('.factor-testing'))$('panel').querySelector('.factor-testing').open=true;
 $('panel').querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',()=>action(b.dataset.action)));
 $('panel').querySelectorAll('[data-case]').forEach(b=>b.addEventListener('click',()=>setScenario(b.dataset.case,true)));
 $('panel').querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',()=>{const key=b.dataset.toggle;state.factors[key]=!state.factors[key];state.time=12.8;state.playing=false;carZ=-3.85;gateAngle=0;renderPanel();updateUI();}));
 updateLampsUI();
}
function action(name){if(name==='start'){setChapter(1,true);state.auto=true;}if(name==='focus-etc')setChapter(2,false);if(name==='upgrade')setChapter(3,false);if(name==='explode'){state.exploded=!state.exploded;pcb.visible=state.exploded;goView(state.exploded?{pos:[-3.6,4.12,-2.15],target:[-4.69,3.56,-.32]}:views.antenna,1.8);renderPanel();toast(state.exploded?'结构为拟研发安装示意，非现有实物内部电路':'已返回外观与灯态演示');}}
function setScenario(key,manual=false){if(!cases[key])return;state.scenario=key;if(manual)state.playing=false;renderPanel();updateUI();}
function setChapter(chapter,play=false){
 state.chapter=chapter;state.time=0;state.playing=play;state.exploded=false;state.scenario='normal';pcb.visible=false;
 if(chapter===0){carZ=-14;gateAngle=0;goView(views.home,2.5);}else if(chapter===1){carZ=-14;gateAngle=0;goView(views.entry,2.8);}else{carZ=-3.85;gateAngle=0;goView(views.antenna,3.2);}
 const content=[['SCENE 01 / 园区入口','从现场，理解通行方案','以现场照片为参照搭建的三维场景。点击设备，查看它在三因子通行中的作用。'],['SCENE 02 / 三因子联合核验','人、车、ETC，缺一不可','三个核验结果共同构成放行条件。可切换不通过情形，观察道闸保持关闭。'],['SCENE 03 / 现状观察','走近天线，状态依然不可见','切换模拟工况，观察现有成品天线的外观。'],['SCENE 04 / 拟改造效果','让电源、网络与信号可见','相同工况下，观察新增三色灯提供的设备状态线索。']][chapter];
 $('eyebrow').textContent=content[0];$('headline').textContent=content[1];$('intro').textContent=content[2];
 document.querySelectorAll('nav [data-chapter]').forEach(b=>b.classList.toggle('active',Number(b.dataset.chapter)===chapter));
 $('step-caption').hidden=true;renderPanel();updateUI();
}
function updateUI(){
 $('chapter-name').textContent=names[state.chapter];$('play-state').textContent=state.playing?'正在按讲解顺序播放':state.chapter===0?'可自由观察，或开始播放':'已暂停 · 可自由观察 / 切换情形';
 $('play').setAttribute('aria-label',state.playing?'暂停讲解':'播放讲解');$('play').innerHTML=state.playing?'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>':'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l14-8z"/></svg>';
 const ts=currentFactorStatuses();for(const [key,s] of Object.entries(ts)){const el=document.querySelector(`[data-factor="${key}"]`);if(el&&state.chapter===1){el.dataset.status=s;el.querySelector('.fstate').textContent={pass:'匹配成功',fail:'未通过',scanning:'正在核验',pending:'待核验'}[s];}}
 const logic=$('logic-result');if(logic){const all=Object.values(state.factors).every(Boolean);logic.style.color=state.time>=11&&!all?'#b2473f':'#137d73';logic.textContent=state.time<4?'车辆正在驶近入口':state.time<11?'正在等待三个核验结果':!all?'存在未通过项，道闸保持关闭':state.time<14?'三项匹配成功，满足放行条件':state.time<17?'全部通过，正在开闸':state.time<24?'允许通行，车辆进入园区':'车辆已通过，演示结束';}
 document.querySelectorAll('.track i span').forEach((el,i)=>el.style.width=(i<state.chapter?100:i===state.chapter?clamp(state.time/durations[i]*100,0,100):0)+'%');
 updateLampsUI();document.body.dataset.chapter=String(state.chapter);document.body.dataset.scenario=state.scenario;document.body.dataset.gate=Object.values(state.factors).every(Boolean)&&state.chapter===1&&state.time>=14?'allowed':'closed';
}
function lampValues(){const c=cases[state.scenario];return [{on:c.power,blink:false,text:c.power?'供电正常':'故障断电 · 熄灭'},{on:c.power&&c.network!=='none',blink:c.power&&c.network==='weak',text:!c.power?'未工作':c.network==='none'?'未连通 · 熄灭':c.network==='weak'?'连接弱 · 闪烁':'连接正常'},{on:c.power&&c.signal!=='none',blink:c.power&&c.signal==='weak',text:!c.power?'未工作':c.signal==='none'?(c.tag?'交互未完成 · 熄灭':'未检出信号 · 熄灭'):c.signal==='weak'?'偏弱 · 闪烁':'信号正常'}];}
function updateLampsUI(){const values=lampValues();document.querySelectorAll('[data-lamp]').forEach(el=>{const s=values[Number(el.dataset.lamp)];el.dataset.on=String(s.on);el.dataset.blink=String(s.blink);el.querySelector('span:last-child').textContent=s.text;});}
function caption(title,text){const el=$('step-caption');el.hidden=false;el.innerHTML=`<strong>${title}</strong>${text}`;}
function updateSimulation(dt){
 if(state.playing){state.time+=dt;if(state.time>=durations[state.chapter]){if(state.auto&&state.chapter<3){setChapter(state.chapter+1,true);}else{state.playing=false;state.time=durations[state.chapter];if(state.chapter===3){state.scenario='normal';renderPanel();}updateUI();}}}
 if(state.chapter===1){
   const t=state.time,all=Object.values(state.factors).every(Boolean);let target=-14;if(t<4)target=T.MathUtils.lerp(-14,-3.85,ease(clamp(t/4,0,1)));else target=-3.85;if(t>=18&&all)target=T.MathUtils.lerp(-3.85,9.5,ease(clamp((t-18)/7,0,1)));
   const movement=target-carZ;carZ=target;wheels.forEach(w=>w.rotation.y+=movement/.33);
   let open=0;if(all&&t>=14)open=t<17?ease((t-14)/3):t<25?1:1-ease(clamp((t-25)/2,0,1));gateAngle=open*Math.PI*.465;
   if(t<4)caption('车辆驶近入口','在入口位置核验人脸、车牌与ETC，三个结果共同决定是否放行。');
   else if(t<7)caption('车牌识别','读取车辆车牌，参与通行授权匹配。');
   else if(t<10)caption('人脸核验','核验驾驶员人脸，参与通行授权匹配。');
   else if(t<14)caption('ETC匹配','核对车载标签；三项必须全部匹配成功。');
   else if(!all)caption('放行条件未满足','至少一项未通过，车辆停留在闸前，道闸保持关闭。');
   else if(t<18)caption('全部通过 · 允许开闸','人脸、车牌和ETC三个匹配结果全部通过，开启道闸。');
   else caption('车辆进入园区','道闸放行依据是三因子联合核验结果。');
 }else if(state.chapter>=2){
   if(state.playing){const sequence=['normal','network','networkWeak','noTag','weak','pending','off'];const i=Math.min(sequence.length-1,Math.floor(state.time/(durations[state.chapter]/sequence.length)));if(state.scenario!==sequence[i]){state.scenario=sequence[i];renderPanel();}}
   if(state.chapter===2)caption('现有设备 · 无本地状态指示',`当前模拟：${cases[state.scenario].name}。设备外观不能直接给出对应状态提示。`);
   else caption(state.exploded?'新增电路模块 · 结构示意':'拟改造效果 · 三色灯状态提示',state.exploded?'新增板卡位置和元件仅用于表达方案，实际电路与装配需研发验证。':state.scenario==='pending'?'交互未完成时，对应接收信号灯熄灭；完整授权判定仍需由系统核查。':state.scenario==='networkWeak'?'网络连接较弱时，蓝色网络指示灯闪烁。':'电源、网络与接收信号各有对应提示，为现场判断提供线索。');
 }
 if(vehicle){vehicle.position.z=carZ;vehicle.visible=state.chapter===1;}
 if(leftGate){leftGate.rotation.z=gateAngle;rightGate.rotation.z=-gateAngle;}
 if(cover){cover.position.x=T.MathUtils.damp(cover.position.x,state.exploded?-.37:0,7,dt);cover.position.z=T.MathUtils.damp(cover.position.z,state.exploded?-.20:0,7,dt);}
 const vals=lampValues();for(let i=0;i<lamps.length;i++){const l=lamps[i],s=vals[i];l.group.visible=state.chapter===3;const on=s.on&&(!s.blink||Math.sin(elapsed*7)>0);l.mat.emissiveIntensity=on?1.8:0;l.mat.color.set(on?['#51b875','#4a99df','#e2b443'][i]:['#345840','#374e65','#6a593a'][i]);l.halo.visible=on;}
 const statuses=currentFactorStatuses();const keys=['face','plate','etc'];const ends=[[-5.4,1.75,-2.78],[-4.37,1.59,-.38],[-4.65,3.58,-.3]],targets=[[-2.22,1.27,carZ+.44],[-1.8,.7,carZ+2.25],[-2.02,1.31,carZ+1.03]];
 relationLines.forEach((line,i)=>{const show=state.chapter===1&&state.time>3&&state.time<17;line.visible=show;pulses[i].visible=show&&statuses[keys[i]]!=='pending';if(!show)return;const a=root.localToWorld(v(...ends[i])),b=root.localToWorld(v(...targets[i]));line.geometry.setFromPoints([a,b]);line.computeLineDistances();line.material.opacity=statuses[keys[i]]==='pending'?.18:.62;line.material.color.set(statuses[keys[i]]==='fail'?'#c56f62':['#5c9fbc','#d1ad64','#68a88a'][i]);pulses[i].position.lerpVectors(a,b,(elapsed*.55+i*.3)%1);});
}
function goView(view,duration=2){cameraTween={fromPos:camera.position.clone(),fromTarget:orbit.target.clone(),pos:v(...view.pos).multiply(v(-1,1,1)),target:v(...view.target).multiply(v(-1,1,1)),start:performance.now(),duration};}
function orbitFromCamera(){const diff=camera.position.clone().sub(orbit.target);orbit.radius=diff.length();orbit.pitch=Math.asin(diff.y/orbit.radius);orbit.yaw=Math.atan2(diff.x,diff.z);}
function applyOrbit(){const r=orbit.radius,cp=Math.cos(orbit.pitch);camera.position.set(orbit.target.x+Math.sin(orbit.yaw)*cp*r,orbit.target.y+Math.sin(orbit.pitch)*r,orbit.target.z+Math.cos(orbit.yaw)*cp*r);camera.lookAt(orbit.target);}
function updateCamera(dt){if(cameraTween){const t=cameraTween;const progress=clamp((performance.now()-t.start)/(t.duration*1000),0,1),a=ease(progress);camera.position.lerpVectors(t.fromPos,t.pos,a);orbit.target.lerpVectors(t.fromTarget,t.target,a);camera.lookAt(orbit.target);orbitFromCamera();if(progress>=1)cameraTween=null;}}
function makeLabels(){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('leaders');$('annotations').appendChild(svg);
 for(const def of labelDefs){const button=document.createElement('button');button.className='device-label';button.innerHTML=`<em>${def.id==='antenna'?'改造对象':'设备'}</em>${def.title}`;button.setAttribute('aria-label','查看'+def.title);button.addEventListener('click',()=>selectDevice(def.id));$('annotations').appendChild(button);const leader=document.createElementNS('http://www.w3.org/2000/svg','line');leader.setAttribute('stroke','#6e919f');leader.setAttribute('stroke-width','1');svg.appendChild(leader);const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('r','2.5');dot.setAttribute('fill','#4e7d93');svg.appendChild(dot);labels.push({...def,button,leader,dot});}
 ['电源','网络连接','接收信号'].forEach((name,i)=>{const button=document.createElement('button');button.className='device-label led';button.innerHTML=name+'<small>拟新增</small>';button.addEventListener('click',()=>toast(['电源：有电时常亮，故障断电时熄灭（演示定义）','网络：连接正常时常亮，连接弱时闪烁，未连通时熄灭（演示定义）','信号：正常时常亮，偏弱时闪烁，未检出或交互未完成时熄灭（演示定义）'][i]));$('annotations').appendChild(button);labels.push({id:'lamp'+i,kind:'led',i,button});});
}
function updateLabels(){
 for(const l of labels){let show=state.labels;if(l.kind==='led'){show=show&&state.chapter===3&&!state.exploded;}else{show=show&&state.chapter<=1;}
   const p=l.kind==='led'?lamps[l.i].group.getWorldPosition(new T.Vector3()):root.localToWorld(l.position.clone());const ndc=p.clone().project(camera);show=show&&ndc.z<1&&ndc.z>-1&&Math.abs(ndc.x)<.98&&Math.abs(ndc.y)<.98;
   l.button.style.display=show?'block':'none';if(l.leader){l.leader.style.display=l.dot.style.display=show?'block':'none';}if(show){const px=(ndc.x*.5+.5)*width,py=(-ndc.y*.5+.5)*height;const offsets={face:[-85,12],plate:[76,24],antenna:[-36,-12],gate:[105,-5]};const off=l.kind==='led'?[45,0]:(offsets[l.id]||[0,0]);const lx=clamp(px+off[0],100,width-100),ly=py+off[1];l.button.style.left=lx+'px';l.button.style.top=ly+'px';if(l.leader){l.leader.setAttribute('x1',String(px));l.leader.setAttribute('y1',String(py));l.leader.setAttribute('x2',String(lx));l.leader.setAttribute('y2',String(ly));l.dot.setAttribute('cx',String(px));l.dot.setAttribute('cy',String(py));}}
 }
}
function selectDevice(id){if(id==='antenna'){setChapter(2,false);return;}if(id==='face'){goView(views.face,2);toast('刷脸终端：参与驾驶员身份核验');}if(id==='plate'){goView(views.plate,2);toast('车牌识别设备：参与车辆授权匹配');}if(id==='gate'){goView(views.entry,2);toast('道闸只在三个匹配结果全部通过后开启');}if(id==='vehicle'){goView(views.entry,2);}}
function toast(text){$('toast').textContent=text;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4200);}
function onPointerDown(e){if(e.target!==renderer.domElement)return;cameraTween=null;orbitFromCamera();drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,moved:false};renderer.domElement.setPointerCapture(e.pointerId);}
function onPointerMove(e){if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>4)drag.moved=true;if(drag.button===2||e.shiftKey){const dir=new T.Vector3();camera.getWorldDirection(dir);const right=dir.clone().cross(camera.up).normalize();orbit.target.addScaledVector(right,-dx*orbit.radius*.0012);orbit.target.y+=dy*orbit.radius*.0012;orbit.target.y=clamp(orbit.target.y,.1,18);}else{orbit.yaw-=dx*.004;orbit.pitch=clamp(orbit.pitch+dy*.004,-.03,1.35);}drag.x=e.clientX;drag.y=e.clientY;applyOrbit();}
function onPointerUp(e){if(drag&&!drag.moved&&drag.button===0){const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-((e.clientY-rect.top)/rect.height)*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(hitTargets,false);if(hits[0])selectDevice(hits[0].object.userData.target);}drag=null;}
function setupControls(){
 renderer.domElement.addEventListener('pointerdown',onPointerDown);renderer.domElement.addEventListener('pointermove',onPointerMove);renderer.domElement.addEventListener('pointerup',onPointerUp);renderer.domElement.addEventListener('pointercancel',()=>drag=null);renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();cameraTween=null;orbitFromCamera();orbit.radius=clamp(orbit.radius*Math.exp(e.deltaY*.001),.45,65);applyOrbit();},{passive:false});
 document.querySelectorAll('nav [data-chapter]').forEach(b=>b.addEventListener('click',()=>{state.auto=false;setChapter(Number(b.dataset.chapter),false);}));
 $('play').addEventListener('click',()=>{if(state.chapter===0&&!state.playing){state.auto=true;setChapter(1,true);}else{if(state.time>=durations[state.chapter])state.time=0;state.playing=!state.playing;updateUI();}});
 $('restart').addEventListener('click',()=>setChapter(state.chapter,true));$('step').addEventListener('click',()=>{state.auto=false;state.playing=false;if(state.chapter===0){setChapter(1,false);state.time=4;}else if(state.chapter===1){const stops=[4,5.5,8.5,11.5,17.8,22,26.8];state.time=stops.find(t=>t>state.time+.1)??0;}else{const keys=Object.keys(cases);setScenario(keys[(keys.indexOf(state.scenario)+1)%keys.length],true);}updateUI();});$('next').addEventListener('click',()=>{state.auto=false;setChapter((state.chapter+1)%4,false);});
 $('home-view').addEventListener('click',()=>{goView(state.chapter>=2?views.antenna:state.chapter===1?views.entry:views.home,1.8);});$('bird-view').addEventListener('click',()=>goView(views.bird,2.2));
 $('hide-labels').addEventListener('click',()=>{state.labels=!state.labels;$('hide-labels').textContent=state.labels?'隐藏标注':'显示标注';});
 $('fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>toast('可使用浏览器全屏模式汇报'));else document.exitFullscreen?.();});
 document.addEventListener('keydown',e=>{if($('gallery').classList.contains('open')){if(e.key==='Escape')closeGallery();return;}if(e.target.matches('input,textarea,select'))return;if(e.code==='Space'){e.preventDefault();$('play').click();}if(e.key==='ArrowRight')$('next').click();if(e.key==='ArrowLeft')setChapter(Math.max(0,state.chapter-1),false);if(e.key==='Escape'){state.playing=false;updateUI();}});
}
function setupGallery(){
 const photos=[['ref-05','入口全景'],['ref-06','入口斜侧'],['ref-10','刷脸终端'],['ref-12','岗亭与右侧立柱'],['ref-01','天线正面'],['ref-02','天线支架']];
 $('photo-thumbs').innerHTML=photos.map(([key,title])=>`<button data-photo="${key}">${title}</button>`).join('');
 function pick(key){$('gallery-image').src=A[key]||'';$('photo-thumbs').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.photo===key));}
 $('photo-thumbs').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>pick(b.dataset.photo)));
 $('photos').addEventListener('click',()=>{state.playing=false;updateUI();$('gallery').classList.add('open');pick(state.chapter>=2?'ref-01':'ref-05');$('close-gallery').focus();});$('close-gallery').addEventListener('click',closeGallery);$('error-photo').addEventListener('click',()=>$('photos').click());
}
function closeGallery(){$('gallery').classList.remove('open');$('photos').focus();}
function resize(){const rect=$('stage').getBoundingClientRect();width=rect.width;height=rect.height;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);}
function frame(now){const dt=Math.min(.5,(now-previous)/1000);previous=now;elapsed+=dt;updateSimulation(dt);updateCamera(dt);scene.updateMatrixWorld();updateLabels();if(renderCount%8===0){updateUI();document.body.dataset.frames=String(renderCount);document.body.dataset.cameraDistance=orbit.radius.toFixed(2);document.body.dataset.gateAngle=(gateAngle*180/Math.PI).toFixed(1);}renderer.render(scene,camera);renderCount++;requestAnimationFrame(frame);}
function init(){
 setupGallery();
 try{
   renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.92;renderer.outputColorSpace=T.SRGBColorSpace;
   $('stage').prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','可拖动旋转和滚轮缩放的园区入口三维场景');
   scene=new T.Scene();root=new T.Group();root.scale.x=-1;scene.add(root);camera=new T.PerspectiveCamera(43,1,.012,180);camera.position.copy(v(...views.home.pos).multiply(v(-1,1,1)));orbit.target.copy(v(...views.home.target).multiply(v(-1,1,1)));camera.lookAt(orbit.target);orbitFromCamera();
   buildLighting();buildGround();buildArchitecture();buildLandscape();buildFences();buildBollards();buildGuardhouse();buildGates();buildFaceTerminal();buildPlateCamera();buildAntenna();buildVehicle();buildRelations();flushBatches();
   mergeChildren(vehicle);wheels.forEach(w=>mergeChildren(w));mergeChildren(leftGate);mergeChildren(rightGate);
   makeLabels();setupControls();new ResizeObserver(resize).observe($('stage'));resize();renderPanel();updateUI();
   setTimeout(()=>$('loading').style.display='none',500);requestAnimationFrame(frame);
   window.ETCDemo={getState:()=>({...state,carZ,gateAngle,renderCount,renderInfo:renderer.info.render,threeVersion:T.REVISION}),setChapter,setScenario,setFactor:(key,val)=>{state.factors[key]=val;state.time=12.8;state.playing=false;updateUI();renderPanel();},goView,views};
 }catch(e){console.error(e);$('loading').style.display='none';$('error').style.display='block';$('error-detail').textContent=e.message;}
}
init();
})();
