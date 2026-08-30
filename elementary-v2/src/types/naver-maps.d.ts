declare global {
  interface Window {
    naver: {
      maps: {
        Map: new (mapDiv: HTMLElement, mapOptions?: MapOptions) => NaverMap;
        LatLng: new (lat: number, lng: number) => LatLng;
        Marker: new (options: MarkerOptions) => Marker;
        InfoWindow: new (options: InfoWindowOptions) => InfoWindow;
        Event: {
          addListener: (instance: unknown, eventName: string, handler: (...args: unknown[]) => void) => unknown;
          removeListener: (listener: unknown) => void;
        };
        Point: new (x: number, y: number) => Point;
        Size: new (width: number, height: number) => Size;
        Icon: new (url: string, size?: Size, anchor?: Point) => Icon;
        MarkerClustering: new (options: ClusteringOptions) => MarkerClustering;
        LatLngBounds: new (southwest: LatLng, northeast: LatLng) => Bounds;
        Position: { TOP_RIGHT: string };
        ZoomControlStyle: { SMALL: string };
      };
    };
  }

  interface MapOptions {
    center?: LatLng;
    zoom?: number;
    mapTypeId?: string;
    minZoom?: number;
    maxZoom?: number;
    zoomControl?: boolean;
    zoomControlOptions?: {
      position: string;
      style: string;
    };
    mapTypeControl?: boolean;
    scaleControl?: boolean;
    logoControl?: boolean;
    mapDataControl?: boolean;
    tileDuration?: number;
  }

  interface LatLng {
    lat(): number;
    lng(): number;
    equals(other: LatLng): boolean;
  }

  interface Point {
    x: number;
    y: number;
  }

  interface Size {
    width: number;
    height: number;
  }

  interface Icon {
    url: string;
    size?: Size;
    scaledSize?: Size;
    anchor?: Point;
  }

  interface NaverMap {
    setCenter(latlng: LatLng): void;
    getCenter(): LatLng;
    setZoom(zoom: number): void;
    getZoom(): number;
    getBounds(): Bounds;
    panTo(latlng: LatLng): void;
    panBy(offset: Point): void;
    fitBounds(bounds: Bounds, margin?: { top: number; right: number; bottom: number; left: number }): void;
    destroy(): void;
  }

  interface Bounds {
    extend(latlng: LatLng): void;
    getCenter(): LatLng;
    getNE(): LatLng;
    getSW(): LatLng;
  }

  interface MarkerOptions {
    position: LatLng;
    map?: NaverMap;
    icon?: Icon | HtmlMarkerIcon | string;
    title?: string;
    cursor?: string;
    clickable?: boolean;
    draggable?: boolean;
    visible?: boolean;
    zIndex?: number;
  }

  interface HtmlMarkerIcon {
    content: string;
    anchor?: Point;
  }

  interface Marker {
    setPosition(latlng: LatLng): void;
    getPosition(): LatLng;
    setMap(map: NaverMap | null): void;
    getMap(): NaverMap | null;
    setVisible(visible: boolean): void;
    getVisible(): boolean;
    setIcon(icon: Icon | HtmlMarkerIcon | string): void;
    setTitle(title: string): void;
    setZIndex(zIndex: number): void;
    destroy(): void;
  }

  interface InfoWindowOptions {
    content: string | HTMLElement;
    position?: LatLng;
    pixelOffset?: Point;
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    anchorSize?: Size;
    anchorSkew?: boolean;
    anchorColor?: string;
    maxWidth?: number;
  }

  interface InfoWindow {
    open(map: NaverMap, anchor?: Marker): void;
    close(): void;
    getContent(): string | HTMLElement;
    setContent(content: string | HTMLElement): void;
    getPosition(): LatLng;
    setPosition(position: LatLng): void;
  }

  interface ClusteringOptions {
    minClusterSize?: number;
    maxZoom?: number;
    map?: NaverMap;
    markers?: Marker[];
    averageCenter?: boolean;
    gridSize?: number;
    icons?: Icon[];
    indexGenerator?: number[];
    stylingFunction?: (clusterMarker: unknown, count: number) => void;
  }

  interface MarkerClustering {
    setMap(map: NaverMap | null): void;
    addMarker(marker: Marker): void;
    removeMarker(marker: Marker): void;
    addMarkers(markers: Marker[]): void;
    removeMarkers(markers: Marker[]): void;
    clearMarkers(): void;
    redraw(): void;
    destroy(): void;
  }
}

declare global {
  const naver: Window['naver'];
}

export {};
