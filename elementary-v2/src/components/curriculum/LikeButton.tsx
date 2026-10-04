import { ThumbsUp } from 'lucide-react'
import React from 'react'

interface LikeButtonProps {
  liked: boolean
  count: number
  label: string
  onClick: () => void
  size?: 'small' | 'large'
}

/** 따봉 하나 (decision C-1). The count is everyone's; the fill is this browser's. */
const LikeButton: React.FC<LikeButtonProps> = ({ liked, count, label, onClick, size = 'small' }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={liked}
    aria-label={`${label} 따봉${liked ? ' 취소' : ''}, 현재 ${count}개`}
    data-testid="like-button"
    className={`inline-flex flex-none items-center gap-1 rounded-full border font-semibold transition-colors ${size === 'large' ? 'h-10 px-4 text-sm' : 'h-8 px-2.5 text-xs'} ${liked ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
  >
    <ThumbsUp size={size === 'large' ? 17 : 14} fill={liked ? 'currentColor' : 'none'} aria-hidden="true" />
    {count.toLocaleString()}
  </button>
)

export default LikeButton
