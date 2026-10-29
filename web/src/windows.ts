import * as THREE from 'three';

/** World size of one repeating window bay and one floor band, in metres. */
export const BAY_M = 3.2;
export const FLOOR_M = 3.1;
/** First glazed floor starts above the shopfront, matching the facade overlay. */
export const WINDOW_BASE_M = 3.45;

let cached: THREE.MeshStandardMaterial | undefined;

/**
 * A single tileable floor of glazing, drawn as a texture instead of geometry.
 *
 * Per-window quads cost roughly 7x the triangles of the walls themselves at
 * city-block density, so the whole facade band is one quad per wall with a
 * repeating UV; alpha testing keeps it in the opaque pass (no sorting).
 * The quad is coplanar with the wall and wins the depth test via polygonOffset,
 * which makes it independent of footprint winding and of courtyard holes.
 */
export function windowBandMaterial(): THREE.MeshStandardMaterial {
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable for window band');
  ctx.clearRect(0, 0, size, size);

  const inset = 10;
  const top = 20;
  const bottom = size - 14;

  // Glass. Kept dark and low-contrast so a whole block does not read as a grid.
  ctx.fillStyle = '#536c70';
  ctx.fillRect(inset, top, size - inset * 2, bottom - top);
  // Slight vertical sheen so flat-shaded walls do not look like cardboard.
  const sheen = ctx.createLinearGradient(0, top, 0, bottom);
  sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = sheen;
  ctx.fillRect(inset, top, size - inset * 2, bottom - top);

  // Lintel and sill span the full tile so consecutive floors read as a band.
  ctx.fillStyle = '#b9b3a6';
  ctx.fillRect(0, top - 4, size, 3);
  ctx.fillRect(0, bottom, size, 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;

  cached = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.55,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return cached;
}
