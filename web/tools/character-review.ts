import * as THREE from 'three';
import { ROSTER,buildRig,buildWeapon } from '../src/characters';
import {applyLocomotionJoints,applyMeleePose,resetRigJoints} from '../src/rig-motion';
import {meleePose} from '../src/melee-motion';
let pose='idle';
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(440,360);renderer.setClearColor(0x1b2c30);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const camera=new THREE.PerspectiveCamera(31,440/360,.1,20);camera.position.set(2.7,2.3,4.6);camera.lookAt(0,.95,0);
const records=ROSTER.map(spec=>{
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xf5f6ee,0x596763,2.3));
 const key=new THREE.DirectionalLight(0xfff1dc,3);key.position.set(3,5,4);scene.add(key);
 const rig=buildRig(spec);scene.add(rig.root);
 const ground=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.025,40),new THREE.MeshStandardMaterial({color:0x304842,roughness:1}));ground.position.y=-.02;scene.add(ground);
 const tool=buildWeapon('pipe');tool.position.set(0,-spec.height*.27+spec.height*.29*.52,.03);tool.rotation.x=Math.PI;rig.elbowR.add(tool);tool.visible=false;
 const card=document.createElement('section');card.className='card';const canvas=document.createElement('canvas');canvas.width=440;canvas.height=360;
 const caption=document.createElement('div');caption.className='caption';caption.innerHTML=`<b>${spec.name}</b><span>${spec.job}</span>`;card.append(canvas,caption);document.querySelector('main')!.append(card);
 return {spec,scene,rig,tool,canvas};
});
function render(){
 for(const {scene,rig,tool,canvas} of records){
  resetRigJoints(rig);rig.torso.rotation.set(0,0,0);rig.armL.rotation.set(0,0,.06);rig.armR.rotation.set(0,0,-.06);rig.legL.rotation.set(0,0,0);rig.legR.rotation.set(0,0,0);
  tool.visible=pose==='melee';
  if(pose==='walk'){rig.legL.rotation.x=.48;rig.legR.rotation.x=-.48;rig.armL.rotation.x=-.32;rig.armR.rotation.x=.32;applyLocomotionJoints(rig,Math.PI/2,true,true);}
  if(pose==='melee')applyMeleePose(rig,meleePose('blunt',.46),'right');
  renderer.render(scene,camera);canvas.getContext('2d')!.drawImage(renderer.domElement,0,0);
 }
 document.body.dataset.ready='true';document.body.dataset.pose=pose;
}
document.querySelectorAll<HTMLButtonElement>('[data-pose]').forEach(b=>b.onclick=()=>{pose=b.dataset.pose!;render();});render();
