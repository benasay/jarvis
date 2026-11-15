import { create } from 'zustand'
import { useStore, type Turn } from '../store'

/**
 * Past conversations, kept on this machine.
 *
 * The bridge holds a conversation only for as long as its socket lives and
 * writes nothing down, so a reload used to take everything said with it. This
 * keeps a plain copy of each exchange in localStorage — nothing leaves the
 * browser — so it can be read back later and picked up again.
 *
 * It listens to the store rather than being called from the turn loop, so no
 * code path that produces a turn has to remember to save it.
 */

export type SavedTurn = { role: Turn['role']; text: string }

export type Conversation = {
  id: string
  startedAt: number
  updatedAt: number
  turns: SavedTurn[]
}

const KEY = 'jarvis.history'
/** Oldest conversations fall off past this. */
const MAX_CONVERSATIONS = 60
/** Silence this long means the next thing said starts a new conversation. */
const NEW_AFTER_MS = 30 * 60 * 1000
/** How much of an old conversation is handed back when it is continued. */
const CONTEXT_CHARS = 8000

function load(): Conversation[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

export const useHistory = create<{ list: Conversation[] }>(() => ({ list: load() }))

/** The conversation new turns are being added to. */
let current: Conversation | null = null
/** Store turn id → position in `current.turns`, so a streaming answer updates
 *  its own entry instead of appending a new one per token. */
let index = new Map<string, number>()
/** Every store turn already filed somewhere, so a turn from a conversation
 *  that has since been closed is not filed again into the next one. */
const seen = new Set<string>()
/** Transcript to hand the model with the next prompt, after Continue. */
let pendingContext: string | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

function save() {
  const others = useHistory.getState().list.filter((c) => c.id !== current?.id)
  const list = (current && current.turns.length ? [current, ...others] : others)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS)
    .map((c) => ({ ...c, turns: [...c.turns] }))
  useHistory.setState({ list })
  // Storage can be full or refused. Shed the oldest and try again rather than
  // losing the conversation that is happening now.
  for (let keep = list.length; ; keep = Math.floor(keep / 2)) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, keep)))
      return
    } catch {
      if (keep === 0) return
    }
  }
}

function sync(turns: Turn[]) {
  let changed = false
  for (const t of turns) {
    const at = index.get(t.id)
    if (at !== undefined && current) {
      if (current.turns[at].text !== t.text) {
        current.turns[at].text = t.text
        changed = true
      }
      continue
    }
    if (seen.has(t.id)) continue
    seen.add(t.id)
    const now = Date.now()
    if (!current || now - current.updatedAt > NEW_AFTER_MS) {
      current = { id: crypto.randomUUID(), startedAt: now, updatedAt: now, turns: [] }
      index = new Map()
    }
    index.set(t.id, current.turns.length)
    current.turns.push({ role: t.role, text: t.text })
    changed = true
  }
  if (!changed || !current) return
  current.updatedAt = Date.now()
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, 400)
}

useStore.subscribe((s, prev) => {
  if (s.turns !== prev.turns) sync(s.turns)
})

/** What a conversation is called in the list: the first thing that was asked. */
export function titleOf(c: Conversation): string {
  return c.turns.find((t) => t.role === 'user')?.text.trim() || 'Untitled'
}

export function removeConversation(id: string) {
  if (current?.id === id) {
    current = null
    index = new Map()
    pendingContext = null
  }
  useHistory.setState({ list: useHistory.getState().list.filter((c) => c.id !== id) })
  save()
}

/**
 * Pick an old conversation back up. New turns are added to it, and its
 * transcript rides along with the next prompt — the agent session it happened
 * in is long gone, so that is the only way he can know what was said.
 */
export function continueConversation(id: string) {
  const c = useHistory.getState().list.find((x) => x.id === id)
  if (!c) return
  current = { ...c, turns: [...c.turns], updatedAt: Date.now() }
  index = new Map()
  const transcript = c.turns
    .filter((t) => t.text.trim())
    .map((t) => `${t.role === 'user' ? 'User' : 'Jarvis'}: ${t.text.trim()}`)
    .join('\n')
    .slice(-CONTEXT_CHARS)
  pendingContext =
    '[We are continuing an earlier conversation. Its transcript follows for ' +
    'context only — do not read it back or summarise it, just carry on from it.]\n' +
    transcript +
    '\n[End of the earlier conversation. What I am saying now:]\n'
}

/** The pending transcript, once. Empty when nothing is being continued. */
export function takeContext(): string {
  const c = pendingContext ?? ''
  pendingContext = null
  return c
}
