/**
 * Decodes PEPO's avatar asset: the FATHI point-cloud artwork, baked by
 * scripts/build-fathi.mjs. Units are FATHI's own: crown ≈ +1.0, shoulders
 * ≈ -1.9, face looking down +z with shallow depth.
 */

export interface HeadCloud {
  /** xyz per particle. */
  position: Float32Array
  weight: Float32Array
  /** 0 = cool line work (face, neck, shoulders), 1 = warm (the mask). */
  warm: Float32Array
  /** Strand segments: two xyz endpoints each. */
  traceSegments: Float32Array
  traceStrength: Float32Array
  traceProgress: Float32Array
  traceWarm: Float32Array
}

/**
 * @param total particles wanted. Fewer than the asset holds selects an even,
 * weight-biased subset (phones); more repeats points as faint dust.
 */
export function decodeFathi(buffer: ArrayBuffer, total: number): HeadCloud {
  const dv = new DataView(buffer)
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
  if (magic !== 'PFA4') throw new Error('avatar asset: bad magic')
  const n = dv.getUint32(4, true)
  const segs = dv.getUint32(8, true)
  const Q = dv.getFloat32(12, true)

  const srcPos = new Float32Array(n * 3)
  const srcW = new Float32Array(n)
  const srcWarm = new Float32Array(n)
  let o = 16
  for (let i = 0; i < n; i++) {
    srcPos[i * 3] = dv.getInt16(o, true) / Q
    srcPos[i * 3 + 1] = dv.getInt16(o + 2, true) / Q
    srcPos[i * 3 + 2] = dv.getInt16(o + 4, true) / Q
    srcW[i] = dv.getUint8(o + 6) / 255
    srcWarm[i] = dv.getUint8(o + 7) / 255
    o += 8
  }

  // Choose which source points to draw: all of them, or a weight-biased subset.
  const order: number[] = []
  if (total >= n) for (let i = 0; i < n; i++) order.push(i)
  else {
    const keep = total / n
    for (let i = 0; i < n && order.length < total; i++) {
      const h = (Math.imul(i + 7, 2246822519) >>> 0) / 4294967296
      if (h < keep * (0.7 + 0.6 * srcW[i])) order.push(i)
    }
  }
  const position = new Float32Array(total * 3)
  const weight = new Float32Array(total)
  const warm = new Float32Array(total)
  for (let k = 0; k < total; k++) {
    const extra = k >= order.length
    const i = order[extra ? (k * 7919) % order.length : k]
    position.set(srcPos.subarray(i * 3, i * 3 + 3), k * 3)
    weight[k] = extra ? 0 : srcW[i]
    warm[k] = srcWarm[i]
  }

  const traceSegments = new Float32Array(segs * 6)
  const traceStrength = new Float32Array(segs * 2)
  const traceProgress = new Float32Array(segs * 2)
  const traceWarm = new Float32Array(segs * 2)
  for (let s = 0; s < segs; s++) {
    for (let k = 0; k < 6; k++) traceSegments[s * 6 + k] = dv.getInt16(o + k * 2, true) / Q
    traceStrength[s * 2] = dv.getUint8(o + 12) / 255
    traceStrength[s * 2 + 1] = dv.getUint8(o + 13) / 255
    traceProgress[s * 2] = dv.getUint8(o + 14) / 255
    traceProgress[s * 2 + 1] = dv.getUint8(o + 15) / 255
    traceWarm[s * 2] = traceWarm[s * 2 + 1] = dv.getUint8(o + 16)
    o += 18
  }
  return { position, weight, warm, traceSegments, traceStrength, traceProgress, traceWarm }
}
