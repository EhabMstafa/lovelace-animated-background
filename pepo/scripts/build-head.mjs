/**
 * Converts the Lee Perry-Smith head scan into PEPO's compact head asset.
 *
 *   curl -O https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb
 *   node scripts/build-head.mjs LeePerrySmith.glb
 *
 * Model: "Lee Perry-Smith" head scan by Infinite-Realities (ir-ltd.net),
 * licensed CC BY 3.0. Output: src/presence/avatar/assets/head.bin
 *
 * Layout (little-endian):
 *   u32 vertexCount, u32 indexCount
 *   i16[vertexCount*3] positions in "face units" (× 1/8192)
 *   i8 [vertexCount*3] normals (× 1/127)
 *   u16[indexCount]    triangle indices
 *
 * Face units: y up, face looking down +z, crown ≈ +0.55, chin ≈ -0.5.
 */
import fs from 'fs'
import path from 'path'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const SCALE = 0.27
const CENTER_Y = 1.95

const src = process.argv[2]
const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/presence/avatar/assets/head.bin')
const buf = fs.readFileSync(src)

new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', (gltf) => {
  let mesh
  gltf.scene.traverse((o) => {
    if (o.isMesh) mesh = o
  })
  const g = mesh.geometry
  const pos = g.attributes.position
  const nrm = g.attributes.normal
  const idx = g.index
  const n = pos.count
  const m = idx.count
  const bytes = 8 + n * 6 + n * 3 + (n * 3) % 2 + m * 2
  const ab = new ArrayBuffer(bytes)
  const dv = new DataView(ab)
  dv.setUint32(0, n, true)
  dv.setUint32(4, m, true)
  let o = 8
  for (let i = 0; i < n; i++) {
    const p = [pos.getX(i) * SCALE, (pos.getY(i) - CENTER_Y) * SCALE, pos.getZ(i) * SCALE]
    for (const v of p) {
      dv.setInt16(o, Math.round(v * 8192), true)
      o += 2
    }
  }
  for (let i = 0; i < n; i++) {
    for (const v of [nrm.getX(i), nrm.getY(i), nrm.getZ(i)]) {
      dv.setInt8(o, Math.round(v * 127))
      o += 1
    }
  }
  o += (n * 3) % 2 // keep u16 alignment
  for (let i = 0; i < m; i++) {
    dv.setUint16(o, idx.getX(i), true)
    o += 2
  }
  fs.writeFileSync(out, Buffer.from(ab))
  console.log(`wrote ${out}: ${n} vertices, ${m / 3} triangles, ${bytes} bytes`)
})
