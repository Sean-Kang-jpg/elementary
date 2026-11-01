import { useState, useSyncExternalStore } from 'react'
import { addToPlan, isInPlan, removeFromPlan, subscribeFamilyPlan, type PinnedItem, type PlanSource } from '../../utils/familyPlan'

interface AddToPlanButtonProps {
  item: Omit<PinnedItem, 'addedAt'>
  from: PlanSource
  contentId: string
}

/** Storage and events belong to familyPlan; the button reflects confirmed stored state. */
export default function AddToPlanButton({ item, from, contentId }: AddToPlanButtonProps) {
  const inPlan = useSyncExternalStore(subscribeFamilyPlan, () => isInPlan(item.id), () => false)
  const [failed, setFailed] = useState(false)
  const label = inPlan ? '일정에 있어요 ✓' : '내 일정에 넣기'

  return (
    <div className="add-to-plan">
      <button
        type="button"
        className="add-to-plan__button"
        data-testid="add-to-plan-button"
        data-plan-id={item.id}
        aria-label={`${item.title}: ${label}`}
        aria-pressed={inPlan}
        onClick={() => {
          const saved = isInPlan(item.id)
            ? removeFromPlan(item.id)
            : addToPlan(item, { from, contentId })
          setFailed(!saved)
        }}
      >
        {label}
      </button>
      {failed ? <p className="add-to-plan__status" role="status">저장하지 못했어요</p> : null}
    </div>
  )
}
