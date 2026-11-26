import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export default function GapDialog({ title, children, onClose, hint }: {
  title: string
  children: ReactNode
  onClose: () => void
  hint?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    node.showModal()
    const viewport = window.visualViewport
    const fit = () => {
      if (!viewport) return
      node.style.setProperty('--gap-visual-height', viewport.height + 'px')
      node.style.setProperty('--gap-keyboard', Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) + 'px')
    }
    viewport?.addEventListener('resize', fit)
    viewport?.addEventListener('scroll', fit)
    fit()
    return () => {
      viewport?.removeEventListener('resize', fit)
      viewport?.removeEventListener('scroll', fit)
      if (node.open) node.close()
    }
  }, [])
  return <dialog ref={dialog} className="gap-dialog" aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose() }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="gap-sheet">
      <div className="gap-handle" aria-hidden="true" />
      <header>
        <div>{hint && <p>{hint}</p>}<h2 id={id}>{title}</h2></div>
        <button type="button" aria-label="닫기" onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      {children}
    </section>
  </dialog>
}
