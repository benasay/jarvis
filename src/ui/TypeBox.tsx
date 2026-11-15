import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

/** The event the box hands a typed prompt to the app on. */
export const TYPED_EVENT = 'jarvis:typed'

/**
 * A place to type to him instead of speaking.
 *
 * Voice is the point of the interface, but not every prompt is something you
 * want to say out loud — a pasted paragraph, a quiet room, a muted microphone.
 * A typed prompt takes exactly the path a spoken one does, so he answers aloud
 * and on screen either way.
 *
 * `/` focuses the box and Escape leaves it. The app's single-key shortcuts
 * already ignore keystrokes aimed at an input, so typing "v" or a space here
 * types a letter rather than cycling the voice or opening the microphone.
 */
export function TypeBox() {
  const phase = useStore((s) => s.phase)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (phase === 'offline' || phase === 'boot') return null

  return (
    <form
      className="typebox"
      onSubmit={(e) => {
        e.preventDefault()
        const said = text.trim()
        if (!said) return
        setText('')
        window.dispatchEvent(new CustomEvent<string>(TYPED_EVENT, { detail: said }))
      }}
    >
      <input
        ref={input}
        className="typebox-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            e.currentTarget.blur()
          }
        }}
        placeholder="Type to JARVIS — press / to focus, Enter to send"
        aria-label="Type a message to JARVIS"
        autoComplete="off"
        spellCheck={false}
      />
    </form>
  )
}
