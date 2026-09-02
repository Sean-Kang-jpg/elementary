import { AlertCircle, RotateCcw } from 'lucide-react'
import React from 'react'

interface MapErrorBoundaryState {
  failed: boolean
}

export default class MapErrorBoundary extends React.Component<React.PropsWithChildren, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('지도 렌더링 실패:', error)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 px-6 text-center" role="alert">
        <div>
          <AlertCircle className="mx-auto text-amber-600" size={30} aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-gray-900">지도를 표시하지 못했습니다.</p>
          <button type="button" onClick={() => window.location.reload()} className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
            <RotateCcw size={16} aria-hidden="true" />
            다시 불러오기
          </button>
        </div>
      </div>
    )
  }
}
