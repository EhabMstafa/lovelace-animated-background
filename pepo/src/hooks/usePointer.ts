/**
 * A single, shared, normalised pointer position (-1..1 on each axis),
 * read imperatively by animation loops. No React state, no re-renders.
 */
const pointer = { x: 0, y: 0 }
let attached = false

function attach() {
  if (attached || typeof window === 'undefined') return
  attached = true
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1
    },
    { passive: true },
  )
}

export function getPointer() {
  attach()
  return pointer
}
