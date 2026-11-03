import { useState, useSyncExternalStore } from 'react'
import { CalendarCheck, CalendarPlus } from 'lucide-react'
import { addToPlan, isInPlan, removeFromPlan, subscribeFamilyPlan, type PinnedItem, type PlanSource } from '../../utils/familyPlan'

interface AddToPlanButtonProps {
  item: Omit<PinnedItem, 'addedAt'>
  from: PlanSource
  contentId: string
}

/**
 * 우리집 일정에 담기(달력+, 담기면 달력✓). 지도 학원의 '내 시간표에 추가'와 같은 아이콘이고,
 * 하트·별은 관심 저장에 쓴다. 저장소와 이벤트는 familyPlan 몫이고, 버튼은 저장이 확인된 상태만 보여준다.
 */
export default function AddToPlanButton({ item, from, contentId }: AddToPlanButtonProps) {
  const inPlan = useSyncExternalStore(subscribeFamilyPlan, () => isInPlan(item.id), () => false)
  const [failed, setFailed] = useState(false)
  const label = inPlan ? '우리집 일정에 있어요' : '우리집 일정에 담기'

  return (
    <>
      <button
        type="button"
        className="worry-action add-to-plan__button"
        data-testid="add-to-plan-button"
        data-plan-id={item.id}
        aria-label={`${item.title}: ${label}`}
        aria-pressed={inPlan}
        title={label}
        onClick={() => {
          const saved = isInPlan(item.id)
            ? removeFromPlan(item.id)
            : addToPlan(item, { from, contentId })
          setFailed(!saved)
        }}
      >
        {inPlan ? <CalendarCheck size={20} aria-hidden="true" /> : <CalendarPlus size={20} aria-hidden="true" />}
      </button>
      {failed ? <p className="add-to-plan__status" role="status">저장하지 못했어요</p> : null}
    </>
  )
}
