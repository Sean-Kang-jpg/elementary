import { useCallback } from 'react'
import { useAppContext } from '../../contexts/AppContext'
import type { Apartment } from '../../types'
import ApartmentMarker from './ApartmentMarker'

interface ApartmentMarkerManagerProps {
  map: NaverMap
}

export default function ApartmentMarkerManager({ map }: ApartmentMarkerManagerProps) {
  const { state, dispatch } = useAppContext()
  const { apartments, selectedApartment, selectedSchool } = state

  const selectApartment = useCallback((apartment: Apartment) => {
    dispatch({ type: 'SET_SELECTED_APARTMENT', payload: apartment })
  }, [dispatch])

  if (!selectedSchool) return null

  return (
    <>
      {apartments.length > 0 && (
        <div className="pointer-events-none absolute right-3 top-20 z-10 inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white/95 px-2.5 py-2 text-[11px] font-medium text-gray-600 shadow-sm">
          <span className="h-2 w-2 rounded-full bg-teal-600" aria-hidden="true" />
          100세대 미만
        </div>
      )}
      {apartments.map((apartment) => (
        <ApartmentMarker
          key={apartment.id}
          apartment={apartment}
          map={map}
          selected={selectedApartment?.id === apartment.id}
          onClick={selectApartment}
        />
      ))}
    </>
  )
}
