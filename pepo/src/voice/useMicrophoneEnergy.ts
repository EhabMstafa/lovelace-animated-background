import { useEffect } from 'react'
import { presence } from '../core/presence'

/**
 * While `active`, feeds microphone loudness (0..1) into `presence.energy`
 * so the Orb and the waveform can react to the user's voice.
 *
 * If the microphone is unavailable or permission is refused, a soft
 * speech-like envelope is synthesised instead so the visual language can
 * still be evaluated. PEPO's runtime may also push energy itself, in which
 * case pass `active={false}`.
 */
export function useMicrophoneEnergy(active: boolean) {
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null

    const simulate = () => {
      const start = performance.now()
      const tick = (now: number) => {
        const t = (now - start) / 1000
        // Syllables (~4 Hz) inside phrases (~0.4 Hz), never perfectly regular.
        const phrase = Math.max(0, Math.sin(t * 2.4 + 0.6)) ** 0.7
        const syllable = 0.55 + 0.45 * Math.sin(t * 25 + Math.sin(t * 7) * 2)
        presence.setEnergy(Math.min(1, phrase * syllable * 0.8 + Math.random() * 0.05))
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }

    const capture = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported')
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        if (cancelled) return
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.6
        ctx.createMediaStreamSource(stream).connect(analyser)
        const data = new Float32Array(analyser.fftSize)
        const tick = () => {
          analyser.getFloatTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
          const rms = Math.sqrt(sum / data.length)
          // Perceptual mapping: quiet speech still registers, shouting saturates.
          presence.setEnergy(Math.min(1, Math.max(0, (Math.log10(rms + 1e-4) + 2.6) / 1.9)))
          raf = requestAnimationFrame(tick)
        }
        tick()
      } catch {
        if (!cancelled) simulate()
      }
    }

    // Let the Orb lean in before audio begins (anticipation).
    const delay = window.setTimeout(capture, 160)

    return () => {
      cancelled = true
      window.clearTimeout(delay)
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
      presence.setEnergy(0)
    }
  }, [active])
}
