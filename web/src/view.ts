/** Match Taipei's orthographic viewing scale without altering metre-based map data. */
export function viewHeight(aspect:number,coarse:boolean,zoom=1):number {
  const a=Number.isFinite(aspect)&&aspect>0?aspect:1;
  const z=Number.isFinite(zoom)&&zoom>0?zoom:1;
  return 2*(coarse&&a<1?Math.max(22,16/a)*.62:22)/z;
}

/** Close domestic inspection: at least 6 m horizontal framing on portrait screens.
 * Independent of street zoom so closing inspection restores the player's zoom. */
export function roomViewHeight(aspect:number):number {
  const a=Number.isFinite(aspect)&&aspect>0?aspect:1;
  return Math.max(8,6/a);
}

/** Street camera height for the (40, y, 40) offset: zooming in also lowers the pitch so facades,
 * signs and door plates read; zoomed out keeps the classic 56 m top-down framing. */
export function cameraHeight(zoom:number):number {
  const z=Number.isFinite(zoom)?zoom:1;
  const t=Math.max(0,Math.min(1,(z-1)/1.2));
  return 56-t*24;
}
/** Default street zoom: a bit closer than the old 1.0 so lanes read on first entry. */
export const DEFAULT_STREET_ZOOM=1.35;
