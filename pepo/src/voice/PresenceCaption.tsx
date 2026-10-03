import { AnimatePresence, motion } from 'framer-motion'
import { ease } from '../core/tokens'

/** The single line PEPO says. Silence is the default. */
export function PresenceCaption({ text }: { text: string | null }) {
  return (
    <div className="caption" aria-live="polite">
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            initial={{ opacity: 0, y: 4, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(6px)', transition: { duration: 0.9, ease: ease.inOut } }}
            transition={{ duration: 0.7, ease: ease.out }}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
