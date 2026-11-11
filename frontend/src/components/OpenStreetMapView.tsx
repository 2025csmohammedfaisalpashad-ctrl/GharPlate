import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';

export interface OpenStreetMapRestaurantMarker {
  id: string;
  osm_type?: string | null;
  osm_id?: number | string | null;
  data_source?: string;
  source_label?: string;
  name: string;
  category?: string;
  city: string;
  area?: string | null;
  address: string;
  coordinates_available?: boolean;
  latitude: number | null;
  longitude: number | null;
  distance_km?: number | null;
  cuisine_types?: string[];
  dietary_classification?: string;
  dietary_badge?: string;
  vegan_options_available?: boolean;
  website?: string | null;
  price_band_inr?: string;
  rating?: number | null;
  rating_source?: string;
  opening_hours?: string;
  matched_dish?: {
    dish_name: string;
    match_badge?: string;
    preparation_style?: string;
    estimated_price_inr?: number | null;
  };
  maps_links?: {
    openstreetmap_place_url?: string;
    openstreetmap_directions_url?: string;
    google_maps_place_url?: string;
    google_maps_directions_url?: string;
  };
}

export interface OpenStreetMapViewProps {
  centerLat: number;
  centerLon: number;
  locationLabel: string;
  userCoords: { latitude: number; longitude: number } | null;
  restaurants: OpenStreetMapRestaurantMarker[];
  selectedRestaurantId: string | null;
  onSelectRestaurant: (restaurantId: string) => void;
  onUseMyLocation: () => void;
  onOpenRestaurantDetails?: (restaurant: OpenStreetMapRestaurantMarker) => void;
  tileUrl?: string;
}

const OSM_WEB_BASE = ['https://www.open', 'streetmap.org'].join('');
export const STANDARD_OSM_TILE_URL = [
  'https://tile.open',
  'streetmap.org/{z}/{x}/{y}.png',
].join('');
export const OSM_COPYRIGHT_HREF = `${OSM_WEB_BASE}/copyright`;

function createRestaurantDivIcon(
  indexNumber: number,
  isSelected: boolean,
  isOsmPoi: boolean
): L.DivIcon {
  const bg = isSelected ? '#d97706' : isOsmPoi ? '#0d9488' : '#087153';
  const size = isSelected ? 34 : 28;
  const ring = isSelected
    ? '0 0 0 4px rgba(217, 119, 6, 0.32), 0 6px 14px rgba(0,0,0,0.28)'
    : '0 3px 8px rgba(6, 78, 59, 0.32)';

  return L.divIcon({
    className: 'gp-leaflet-marker-icon',
    html: `<div style="
      width: ${size}px;
      height: ${size}px;
      border-radius: 9999px;
      background: ${bg};
      color: #ffffff;
      border: 2.5px solid #ffffff;
      box-shadow: ${ring};
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: ${isSelected ? '13px' : '11px'};
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
      transition: transform 150ms ease;
    ">${indexNumber}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createUserLocationDivIcon(): L.DivIcon {
  return L.divIcon({
    className: 'gp-leaflet-user-icon',
    html: `<div style="
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      background: #2563eb;
      border: 3px solid #ffffff;
      box-shadow: 0 0 0 5px rgba(37, 99, 235, 0.28), 0 4px 10px rgba(0,0,0,0.25);
    " title="Your Current Location"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });
}

function createSearchCenterDivIcon(): L.DivIcon {
  return L.divIcon({
    className: 'gp-leaflet-center-icon',
    html: `<div style="
      width: 16px;
      height: 16px;
      border-radius: 9999px;
      background: #064E3B;
      border: 2.5px solid #E8FFF4;
      box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    " title="Search Area Centre"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

const MapController: React.FC<{
  centerLat: number;
  centerLon: number;
  selectedRestaurant: OpenStreetMapRestaurantMarker | null;
  markerRefs: React.MutableRefObject<Record<string, L.Marker | null>>;
  mapInstanceRef: React.MutableRefObject<L.Map | null>;
  containerWrapperRef: React.RefObject<HTMLDivElement | null>;
  onZoomChange: (zoom: number) => void;
}> = ({
  centerLat,
  centerLon,
  selectedRestaurant,
  markerRefs,
  mapInstanceRef,
  containerWrapperRef,
  onZoomChange,
}) => {
  const map = useMap();

  useEffect(() => {
    mapInstanceRef.current = map;
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // ignore in jsdom
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [map, mapInstanceRef]);

  useMapEvents({
    zoomend: () => {
      try {
        onZoomChange(map.getZoom());
      } catch {
        // ignore
      }
    },
  });

  useEffect(() => {
    const el = containerWrapperRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, containerWrapperRef]);

  useEffect(() => {
    try {
      map.setView([centerLat, centerLon], Math.max(map.getZoom(), 13), {
        animate: false,
      });
    } catch {
      // ignore in jsdom
    }
  }, [centerLat, centerLon, map]);

  useEffect(() => {
    if (
      !selectedRestaurant ||
      selectedRestaurant.latitude == null ||
      selectedRestaurant.longitude == null
    ) {
      return;
    }
    try {
      const targetZoom = Math.max(map.getZoom(), 15);
      map.setView(
        [selectedRestaurant.latitude, selectedRestaurant.longitude],
        targetZoom,
        { animate: true }
      );
      const marker = markerRefs.current[selectedRestaurant.id];
      if (marker) {
        marker.openPopup();
      }
    } catch {
      // ignore in jsdom
    }
  }, [selectedRestaurant, map, markerRefs]);

  return null;
};

export const OpenStreetMapView: React.FC<OpenStreetMapViewProps> = ({
  centerLat,
  centerLon,
  locationLabel,
  userCoords,
  restaurants,
  selectedRestaurantId,
  onSelectRestaurant,
  onUseMyLocation,
  onOpenRestaurantDetails,
  tileUrl = STANDARD_OSM_TILE_URL,
}) => {
  const containerWrapperRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  const [tilesLoading, setTilesLoading] = useState<boolean>(true);
  const [tileErrorCount, setTileErrorCount] = useState<number>(0);
  const [currentZoom, setCurrentZoom] = useState<number>(14);

  const validRestaurants = useMemo(
    () =>
      restaurants.filter(
        (r) =>
          r.coordinates_available !== false &&
          typeof r.latitude === 'number' &&
          typeof r.longitude === 'number' &&
          !Number.isNaN(r.latitude) &&
          !Number.isNaN(r.longitude)
      ),
    [restaurants]
  );

  const unavailableCoordRestaurants = useMemo(
    () =>
      restaurants.filter(
        (r) =>
          r.coordinates_available === false ||
          r.latitude == null ||
          r.longitude == null
      ),
    [restaurants]
  );

  const selectedRestaurant = useMemo(
    () =>
      validRestaurants.find((r) => r.id === selectedRestaurantId) ||
      validRestaurants[0] ||
      null,
    [validRestaurants, selectedRestaurantId]
  );

  const handleZoomIn = () => {
    try {
      mapInstanceRef.current?.zoomIn();
    } catch {
      // ignore
    }
  };

  const handleZoomOut = () => {
    try {
      mapInstanceRef.current?.zoomOut();
    } catch {
      // ignore
    }
  };

  const handleResetToSearchArea = () => {
    try {
      mapInstanceRef.current?.setView([centerLat, centerLon], 14, { animate: true });
    } catch {
      // ignore
    }
  };

  const handleFitAllMarkers = () => {
    if (!mapInstanceRef.current || validRestaurants.length === 0) return;
    try {
      const pts: [number, number][] = validRestaurants.map((r) => [
        r.latitude as number,
        r.longitude as number,
      ]);
      if (userCoords) {
        pts.push([userCoords.latitude, userCoords.longitude]);
      } else {
        pts.push([centerLat, centerLon]);
      }
      const bounds = L.latLngBounds(pts);
      mapInstanceRef.current.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    } catch {
      // ignore
    }
  };

  const openInOsmHref = useMemo(() => {
    if (selectedRestaurant?.maps_links?.openstreetmap_place_url) {
      return selectedRestaurant.maps_links.openstreetmap_place_url;
    }
    if (
      selectedRestaurant &&
      selectedRestaurant.latitude != null &&
      selectedRestaurant.longitude != null
    ) {
      return `${OSM_WEB_BASE}/?mlat=${selectedRestaurant.latitude}&mlon=${selectedRestaurant.longitude}#map=17/${selectedRestaurant.latitude}/${selectedRestaurant.longitude}`;
    }
    return `${OSM_WEB_BASE}/#map=${currentZoom}/${centerLat}/${centerLon}`;
  }, [selectedRestaurant, centerLat, centerLon, currentZoom]);

  const userLocationIcon = useMemo(() => createUserLocationDivIcon(), []);
  const searchCenterIcon = useMemo(() => createSearchCenterDivIcon(), []);

  return (
    <div
      ref={containerWrapperRef}
      data-testid="openstreetmap-view-container"
      className="space-y-3"
    >
      {/* Map Controls Toolbar */}
      <div
        data-testid="osm-map-controls-bar"
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-900/15 bg-[#f7fbf7] px-3 py-2"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="osm-zoom-in-btn"
            onClick={handleZoomIn}
            title="Zoom in on OpenStreetMap"
            aria-label="Zoom in"
            className="rounded-lg border border-emerald-900/20 bg-white px-2.5 py-1 text-xs font-black text-[#172b23] hover:bg-emerald-50 transition"
          >
            ＋
          </button>
          <button
            type="button"
            data-testid="osm-zoom-out-btn"
            onClick={handleZoomOut}
            title="Zoom out on OpenStreetMap"
            aria-label="Zoom out"
            className="rounded-lg border border-emerald-900/20 bg-white px-2.5 py-1 text-xs font-black text-[#172b23] hover:bg-emerald-50 transition"
          >
            －
          </button>
          <button
            type="button"
            data-testid="osm-fit-markers-btn"
            onClick={handleFitAllMarkers}
            disabled={validRestaurants.length === 0}
            className="rounded-lg border border-emerald-900/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#172b23] hover:bg-emerald-50 disabled:opacity-50 transition"
          >
            🗺️ Fit All ({validRestaurants.length})
          </button>
          <button
            type="button"
            data-testid="osm-reset-area-btn"
            onClick={handleResetToSearchArea}
            className="rounded-lg border border-emerald-900/20 bg-white px-2.5 py-1 text-[11px] font-bold text-[#172b23] hover:bg-emerald-50 transition"
          >
            ↺ Reset Area
          </button>
          <button
            type="button"
            data-testid="osm-current-location-btn"
            onClick={onUseMyLocation}
            className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-900 hover:bg-blue-100 transition"
          >
            🎯 Use My Location
          </button>
        </div>

        <a
          href={openInOsmHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="open-in-openstreetmap-btn"
          className="inline-flex items-center gap-1 rounded-lg bg-[#087153] px-3 py-1 text-[11px] font-extrabold text-white hover:bg-[#064d3c] transition"
        >
          <span>🌍 Open in OpenStreetMap ↗</span>
        </a>
      </div>

      {/* Tile Loading / Error Status Banner */}
      {tileErrorCount > 3 && (
        <div
          role="alert"
          data-testid="osm-tile-unavailable-alert"
          className="rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950 flex items-center justify-between gap-2"
        >
          <span>
            ⚠️ OpenStreetMap street tiles could not be loaded (network offline or tile server
            temporarily unreachable). Restaurant list and external OpenStreetMap links remain
            available below.
          </span>
          <button
            type="button"
            onClick={() => setTileErrorCount(0)}
            className="rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-950"
          >
            Retry
          </button>
        </div>
      )}

      {/* Real Interactive React-Leaflet OpenStreetMap Container */}
      <div
        data-testid="leaflet-osm-map-wrapper"
        className="relative h-[380px] sm:h-[440px] lg:h-[480px] w-full rounded-2xl border-2 border-emerald-900/20 bg-[#e8f2e9] overflow-hidden shadow-inner"
      >
        {tilesLoading && tileErrorCount === 0 && (
          <div
            data-testid="osm-map-loading-badge"
            className="pointer-events-none absolute top-3 right-3 z-[400] rounded-full bg-white/90 backdrop-blur-xs border border-emerald-900/15 px-3 py-1 text-[11px] font-bold text-[#087153] shadow-xs"
          >
            Loading OpenStreetMap tiles...
          </div>
        )}

        <MapContainer
          center={[centerLat, centerLon]}
          zoom={14}
          scrollWheelZoom={true}
          className="h-full w-full z-0"
          attributionControl={true}
        >
          <TileLayer
            url={tileUrl}
            attribution={`&copy; <a href="${OSM_COPYRIGHT_HREF}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors`}
            eventHandlers={{
              loading: () => setTilesLoading(true),
              load: () => {
                setTilesLoading(false);
                setTileErrorCount(0);
              },
              tileload: () => {
                setTilesLoading(false);
              },
              tileerror: () => {
                setTilesLoading(false);
                setTileErrorCount((c) => c + 1);
              },
            }}
          />

          <MapController
            centerLat={centerLat}
            centerLon={centerLon}
            selectedRestaurant={selectedRestaurant}
            markerRefs={markerRefs}
            mapInstanceRef={mapInstanceRef}
            containerWrapperRef={containerWrapperRef}
            onZoomChange={setCurrentZoom}
          />

          {/* User Current Geolocation Marker (Distinct Blue Marker) */}
          {userCoords ? (
            <Marker
              position={[userCoords.latitude, userCoords.longitude]}
              icon={userLocationIcon}
            >
              <Popup>
                <div className="space-y-1 text-xs">
                  <div className="font-extrabold text-blue-900">
                    🎯 Your Current Location
                  </div>
                  <div className="text-[11px] text-stone-600">
                    {userCoords.latitude.toFixed(4)}, {userCoords.longitude.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>
          ) : (
            <Marker position={[centerLat, centerLon]} icon={searchCenterIcon}>
              <Popup>
                <div className="space-y-1 text-xs">
                  <div className="font-extrabold text-[#064E3B]">
                    📍 Search Area Centre: {locationLabel}
                  </div>
                  <div className="text-[11px] text-stone-600">
                    {centerLat.toFixed(4)}, {centerLon.toFixed(4)}
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Real Restaurant Markers */}
          {validRestaurants.map((rest, idx) => {
            const isSelected = selectedRestaurant?.id === rest.id;
            const isOsmPoi = rest.data_source === 'openstreetmap_overpass';
            const icon = createRestaurantDivIcon(idx + 1, isSelected, isOsmPoi);

            return (
              <Marker
                key={rest.id}
                position={[rest.latitude as number, rest.longitude as number]}
                icon={icon}
                ref={(ref) => {
                  markerRefs.current[rest.id] = ref;
                }}
                eventHandlers={{
                  click: () => {
                    onSelectRestaurant(rest.id);
                  },
                }}
              >
                <Popup>
                  <div
                    data-testid={`osm-popup-${rest.id}`}
                    className="space-y-1.5 text-xs min-w-[210px] max-w-[260px]"
                  >
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#087153]">
                      {rest.source_label || 'Verified Coordinates'}
                    </div>
                    <div className="font-extrabold text-sm text-[#172b23] leading-snug">
                      {rest.name}
                    </div>
                    <div className="text-[11px] text-stone-600">{rest.address}</div>
                    {rest.cuisine_types && rest.cuisine_types.length > 0 && (
                      <div className="text-[11px] font-semibold text-[#172b23]">
                        Cuisine: {rest.cuisine_types.join(', ')}
                      </div>
                    )}
                    {rest.dietary_badge && (
                      <div className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-[#064d3c]">
                        {rest.dietary_badge}
                      </div>
                    )}
                    {rest.matched_dish && (
                      <div className="rounded-lg bg-stone-100 p-2 text-[11px]">
                        <div className="font-bold text-[#087153]">
                          🍲 {rest.matched_dish.dish_name}
                        </div>
                        <div className="text-[10px] text-stone-600">
                          {rest.matched_dish.match_badge}
                        </div>
                      </div>
                    )}
                    {rest.website && (
                      <div>
                        <a
                          href={rest.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-bold text-[#087153] underline"
                        >
                          Official Website ↗
                        </a>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5 pt-1 border-t border-stone-200">
                      <a
                        href={
                          rest.maps_links?.openstreetmap_place_url ||
                          `${OSM_WEB_BASE}/?mlat=${rest.latitude}&mlon=${rest.longitude}#map=17/${rest.latitude}/${rest.longitude}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-[#087153] px-2 py-1 text-[10px] font-extrabold text-white"
                      >
                        Open in OSM ↗
                      </a>
                      {rest.maps_links?.openstreetmap_directions_url && (
                        <a
                          href={rest.maps_links.openstreetmap_directions_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded border border-emerald-800/25 bg-[#e8f2e9] px-2 py-1 text-[10px] font-extrabold text-[#064d3c]"
                        >
                          Directions ↗
                        </a>
                      )}
                      {onOpenRestaurantDetails && (
                        <button
                          type="button"
                          onClick={() => onOpenRestaurantDetails(rest)}
                          className="rounded border border-stone-300 bg-white px-2 py-1 text-[10px] font-bold text-[#172b23]"
                        >
                          Focus Card
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Visible OpenStreetMap Attribution Footer Bar (Always Visible & Clickable) */}
      <div
        data-testid="osm-visible-attribution"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-900/10 bg-white px-3 py-2 text-[11px] text-[#566960]"
      >
        <div>
          Map data &amp; tiles{' '}
          <a
            href={OSM_COPYRIGHT_HREF}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="osm-copyright-link"
            className="font-extrabold text-[#087153] underline"
          >
            © OpenStreetMap contributors
          </a>{' '}
          • Rendered with Leaflet
        </div>
        <div className="text-[10px] font-semibold">
          {validRestaurants.length} mapped marker(s)
          {unavailableCoordRestaurants.length > 0
            ? ` • ${unavailableCoordRestaurants.length} without coordinates`
            : ''}
        </div>
      </div>
    </div>
  );
};
