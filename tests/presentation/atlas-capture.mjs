// Test-only pixel comparison. Hide one real atlas instance without advancing the stage,
// controller, furnishing allocation, actor pose or clock. Always restore the exact matrix.
import * as THREE from 'three';

export function captureAtlasCell({scene,camera,renderer,cellIndex,columns,rows,viewport,read}){
  const mesh=scene.getObjectByName('street-accent-atlas');
  const offsets=mesh?.geometry.getAttribute('atlasOffset');
  const column=cellIndex%columns,row=rows-1-Math.floor(cellIndex/columns),matches=[];
  if(mesh?.isInstancedMesh&&offsets)for(let i=0;i<mesh.count;i++){
    const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
    if(offsets.getX(i)===column&&offsets.getY(i)===row&&matrix.determinant()!==0)matches.push({i,matrix});
  }
  if(matches.length!==1)throw new Error(`expected exactly one visible atlas cell ${cellIndex}, got ${matches.length}`);
  const {i,matrix}=matches[0];
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
  const world=mesh.matrixWorld.clone().multiply(matrix),xs=[],ys=[];
  for(const x of [-.5,.5])for(const y of [-.5,.5]){
    const point=new THREE.Vector3(x,y,0).applyMatrix4(world).project(camera);
    xs.push((point.x+1)*viewport.width/2);ys.push((1-point.y)*viewport.height/2);
  }
  const projected={l:Math.min(...xs),r:Math.max(...xs),t:Math.min(...ys),b:Math.max(...ys)};
  renderer.render(scene,camera);const shown=read();
  try{
    mesh.setMatrixAt(i,new THREE.Matrix4().makeScale(0,0,0));mesh.instanceMatrix.needsUpdate=true;
    renderer.render(scene,camera);
    return {shown,hidden:read(),projected};
  }finally{
    mesh.setMatrixAt(i,matrix);mesh.instanceMatrix.needsUpdate=true;renderer.render(scene,camera);
  }
}
