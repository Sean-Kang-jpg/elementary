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
