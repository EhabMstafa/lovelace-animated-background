/**
 * A single, shared, normalised pointer position (-1..1 on each axis),
 * read imperatively by animation loops. No React state, no re-renders.
 */
const pointer = { x: 0, y: 0 }
let attached = false
let movedAt = -Infinity

function attach() {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
      movedAt = performance.now()
    },
    { passive: true },
  )
}

export function getPointer() {
  attach()
  return pointer
}

/** True while the pointer has moved in the last moment: attention, not a stare. */
export function pointerActive(windowMs = 1500) {
  attach()
  return performance.now() - movedAt < windowMs
}
