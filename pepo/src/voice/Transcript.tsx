import { AnimatePresence, motion } from 'framer-motion'
import { ease } from '../core/tokens'

/**
 * Semantic transcription of the user's words. Only the latest few words
 * are fully lit; older ones recede and eventually fall off the left edge.
 */
export function Transcript({ text }: { text: string | null }) {
  const words = text ? text.split(/\s+/).filter(Boolean) : []
  const fresh = 5

  return (
    <div className="transcript" aria-live="polite">
      <AnimatePresence>
        {text && (
          <motion.p
            key="transcript"
            initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -4, filter: 'blur(4px)', transition: { duration: 0.8 } }}
            transition={{ duration: 0.4, ease: ease.out }}
          >
            <span className="transcript-quote">“</span>
            {words.map((w, i) => (
              <motion.span
                key={`${i}-${w}`}
                className={i < words.length - fresh ? 'is-old' : ''}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
              >
                {w}{' '}
              </motion.span>
            ))}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}
