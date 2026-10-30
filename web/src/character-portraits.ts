import * as THREE from 'three';
import {ROSTER,buildRig} from './characters';
/** One-time real rig thumbnails, using the existing context (no second mobile WebGL context). */
export function characterPortraits(renderer:THREE.WebGLRenderer):Map<string,string>{
 const result=new Map<string,string>(),size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio();
 const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
 const target=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
 const camera=new THREE.PerspectiveCamera(28,1,.1,10);camera.position.set(2,1.7,3.7);camera.lookAt(0,1,0);
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x697566,2.5));const key=new THREE.DirectionalLight(0xffefd5,2.6);key.position.set(3,5,4);scene.add(key);
 try{
  renderer.setRenderTarget(null);renderer.setPixelRatio(1);renderer.setSize(144,144,false);renderer.setScissorTest(false);renderer.setClearColor(0x25352f,1);
  for(const spec of ROSTER){const rig=buildRig(spec);scene.add(rig.root);renderer.render(scene,camera);result.set(spec.id,renderer.domElement.toDataURL('image/png'));scene.remove(rig.root);rig.root.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}
 }finally{renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.setClearColor(clear,alpha);renderer.setRenderTarget(target);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);}
 return result;
}
