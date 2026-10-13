import type { MapTopic } from './mapTopics'

export type MapLayer = 'apartments' | 'care' | 'activity'
export type MapLayers = Record<MapLayer, boolean>
export const DEFAULT_MAP_LAYERS: MapLayers = { apartments: true, care: false, activity: false }

// Topics choose detail content, not an exclusive map layer. Opening a topic
// enables its related layer without hiding the other information the user chose.
export function layersForTopic(layers: MapLayers, topic: MapTopic): MapLayers {
  const layer = topic === 'assignment' ? 'apartments' : topic === 'school' ? null : topic
  return layer ? { ...layers, [layer]: true } : layers
}

export function setMapLayer(layers: MapLayers, layer: MapLayer, enabled: boolean): MapLayers {
  return { ...layers, [layer]: enabled }
}
