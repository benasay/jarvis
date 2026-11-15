import { useEffect, useState } from 'react'
import { useStore } from '../store'
import {
  useHistory,
  titleOf,
  removeConversation,
  continueConversation,
  type Conversation,
} from '../lib/history'

/**
 * The archive: past conversations, on a quiet drawer.
 *
 * Deliberately not a chat log. The list is one line per conversation — when,
 * and what was asked — and opening one shows the exchange as plain reading
 * text, with what you said set small above each answer rather than in a
 * bubble opposite it.
 *
 * H opens and closes it; Escape closes it without also standing him down.
 */

const when = (t: number) => {
  const d = new Date(t)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function History() {
  const phase = useStore((s) => s.phase)
  const list = useHistory((s) => s.list)
  const [open, setOpen] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)

  const ready = phase !== 'offline' && phase !== 'boot'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'Escape' && open) {
        // Captured ahead of the app's handler, which would stand him down.
        e.stopImmediatePropagation()
        e.preventDefault()
        if (viewing) setViewing(null)
        else setOpen(false)
        return
      }
      if (e.key !== 'h' || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (!ready) return
      e.preventDefault()
      setViewing(null)
      setOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, viewing, ready])

  if (!open || !ready) return null

  const shown: Conversation | undefined = viewing
    ? list.find((c) => c.id === viewing)
    : undefined

  return (
    <aside className="archive" aria-label="Past conversations">
      {shown ? (
        <>
          <header className="archive-head">
            <button className="archive-link" onClick={() => setViewing(null)}>
              ‹ archive
            </button>
            <span className="archive-dim">{when(shown.startedAt)}</span>
          </header>
          <div className="archive-body">
            {shown.turns
              .filter((t) => t.text.trim())
              .map((t, i) => (
                <p key={i} className={t.role === 'user' ? 'archive-asked' : 'archive-answer'}>
                  {t.text}
                </p>
              ))}
          </div>
          <footer className="archive-foot">
            <button
              className="archive-link"
              onClick={() => {
                continueConversation(shown.id)
                setOpen(false)
                setViewing(null)
                useStore.getState().setCaption('Continuing — speak or type.')
              }}
            >
              continue
            </button>
            <button
              className="archive-link archive-dim"
              onClick={() => {
                removeConversation(shown.id)
                setViewing(null)
              }}
            >
              delete
            </button>
          </footer>
        </>
      ) : (
        <>
          <header className="archive-head">
            <span>archive</span>
            <span className="archive-dim">H to close</span>
          </header>
          <div className="archive-body">
            {list.length === 0 && <p className="archive-dim">Nothing yet.</p>}
            {list.map((c) => (
              <button key={c.id} className="archive-row" onClick={() => setViewing(c.id)}>
                <span className="archive-when">{when(c.updatedAt)}</span>
                <span className="archive-title">{titleOf(c)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
