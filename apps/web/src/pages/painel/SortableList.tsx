import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import styles from './SortableList.module.css'

// Lista que reordena arrastando pela alça ⠿ (mouse, dedo ou teclado:
// foco na alça, espaço, setas, espaço). Devolve a nova ordem dos ids.
// O conteúdo de cada linha chega pronto (children) e não é redesenhado
// durante o arrasto — só a moldura se move. Com 500 itens isso pesa.

export function SortableList({
  ids,
  onReorder,
  className,
  children,
}: {
  ids: number[]
  onReorder: (ids: number[]) => void
  className?: string
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  // O site rola "suave" (scroll-behavior: smooth), e isso anula a rolagem
  // automática do arrasto — cada passinho é cancelado pelo seguinte e a
  // página não sai do lugar. Durante o arrasto a rolagem fica instantânea.
  const html = document.documentElement
  const start = () => (html.style.scrollBehavior = 'auto')
  const restore = () => (html.style.scrollBehavior = '')

  const end = ({ active, over }: DragEndEvent) => {
    restore()
    if (!over || active.id === over.id) return
    onReorder(arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id))))
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={{ threshold: { x: 0, y: 0.2 }, acceleration: 70 }}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={restore}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={className}>{children}</ul>
      </SortableContext>
    </DndContext>
  )
}

export function SortableItem({
  id,
  label,
  className,
  children,
}: {
  id: number
  label: string
  className?: string
  children: ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  const handle = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      className={styles.handle}
      aria-label={`Arrastar ${label} para mudar a ordem`}
      {...attributes}
      {...listeners}
    >
      <svg viewBox="0 0 12 20" aria-hidden="true">
        {[4, 10, 16].map(y => (
          <g key={y}>
            <circle cx="3" cy={y} r="1.4" />
            <circle cx="9" cy={y} r="1.4" />
          </g>
        ))}
      </svg>
    </button>
  )
  return (
    <li
      ref={setNodeRef}
      className={`${className ?? ''} ${isDragging ? styles.dragging : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {handle}
      {children}
    </li>
  )
}
