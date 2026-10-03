import { FACE_KIND, buildHeadCloud, gradient, headSDF, maskSDF } from './headModel'

/** Builds the head cloud off the main thread so the Orb never stutters. */
self.onmessage = (e: MessageEvent<{ total: number }>) => {
  const cloud = buildHeadCloud(e.data.total)
  const segs: number[] = []
  const ts: number[] = []
  const kinds: number[] = []
  const normals: number[] = []
  const normalAt = (p: number[], kind: number) => gradient(kind === FACE_KIND.mask || kind === FACE_KIND.maskEdge ? maskSDF : headSDF, p[0], p[1], p[2])
  for (const tr of cloud.traces) {
    const n = tr.points.length
    for (let i = 1; i < n; i++) {
      const a = tr.points[i - 1]
      const b = tr.points[i]
      segs.push(a[0], a[1], a[2], b[0], b[1], b[2])
      ts.push((i - 1) / (n - 1), i / (n - 1))
      kinds.push(tr.kind, tr.kind)
      normals.push(...normalAt(a, tr.kind), ...normalAt(b, tr.kind))
    }
  }
  const msg = {
    position: cloud.position,
    normal: cloud.normal,
    kind: cloud.kind,
    weight: cloud.weight,
    traceSegments: new Float32Array(segs),
    traceT: new Float32Array(ts),
    traceKind: new Float32Array(kinds),
    traceNormal: new Float32Array(normals),
  }
  ;(self as unknown as Worker).postMessage(msg, [
    msg.position.buffer,
    msg.normal.buffer,
    msg.kind.buffer,
    msg.weight.buffer,
    msg.traceSegments.buffer,
    msg.traceT.buffer,
    msg.traceKind.buffer,
    msg.traceNormal.buffer,
  ])
}
