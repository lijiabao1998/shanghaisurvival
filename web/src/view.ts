/** Match Taipei's orthographic viewing scale without altering metre-based map data. */
export function viewHeight(aspect:number,coarse:boolean,zoom=1):number {
  const a=Number.isFinite(aspect)&&aspect>0?aspect:1;
  const z=Number.isFinite(zoom)&&zoom>0?zoom:1;
  return 2*(coarse&&a<1?Math.max(22,16/a)*.62:22)/z;
}
