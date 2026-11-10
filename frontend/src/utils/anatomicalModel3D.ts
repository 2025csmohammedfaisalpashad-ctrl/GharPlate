import {
  buildRealisticAnatomical3DAtlas,
  getRealisticLayersForPreset,
  renderRealisticAnatomical3DScene,
  type AnatomicalReferenceSex,
} from './realisticHumanAnatomy3D';

export type { AnatomicalReferenceSex };

export type AnatomicalLayerId =
  | 'skin_external'
  | 'skeletal'
  | 'muscular'
  | 'nervous'
  | 'cardiovascular'
  | 'digestive'
  | 'respiratory'
  | 'urinary'
  | 'endocrine'
  | 'sensory_immune';

export type AnatomicalViewPreset =
  | 'whole_body'
  | 'muscles'
  | 'skeleton'
  | 'organs'
  | 'custom';

export interface AnatomicalLayerMeta {
  id: AnatomicalLayerId;
  order: number;
  label: string;
  shortLabel: string;
  defaultRegionCode: string;
  baseColor: string;
}

export const ANATOMICAL_LAYERS: AnatomicalLayerMeta[] = [
  {
    id: 'skin_external',
    order: 1,
    label: '1. External Body Surface',
    shortLabel: 'External Surface',
    defaultRegionCode: 'skin_epithelial',
    baseColor: '#d6a78a',
  },
  {
    id: 'skeletal',
    order: 2,
    label: '2. Skeletal System',
    shortLabel: 'Skeleton',
    defaultRegionCode: 'bones_joints',
    baseColor: '#e5dec9',
  },
  {
    id: 'muscular',
    order: 3,
    label: '3. Muscular System',
    shortLabel: 'Muscles',
    defaultRegionCode: 'muscles_strength',
    baseColor: '#b84a45',
  },
  {
    id: 'nervous',
    order: 4,
    label: '4. Brain & Nervous System',
    shortLabel: 'Brain & Nerves',
    defaultRegionCode: 'brain_nerves',
    baseColor: '#e295a8',
  },
  {
    id: 'cardiovascular',
    order: 5,
    label: '5. Cardiovascular & Vessels',
    shortLabel: 'Heart & Vessels',
    defaultRegionCode: 'heart_cardiovascular',
    baseColor: '#c82333',
  },
  {
    id: 'digestive',
    order: 6,
    label: '6. Digestive Organs',
    shortLabel: 'Digestive',
    defaultRegionCode: 'digestive_gut',
    baseColor: '#c97b53',
  },
  {
    id: 'respiratory',
    order: 7,
    label: '7. Respiratory System',
    shortLabel: 'Lungs & Airway',
    defaultRegionCode: 'respiratory_lungs',
    baseColor: '#d9788e',
  },
  {
    id: 'urinary',
    order: 8,
    label: '8. Urinary & Renal System',
    shortLabel: 'Kidneys',
    defaultRegionCode: 'urinary_kidneys',
    baseColor: '#8d3b3b',
  },
  {
    id: 'endocrine',
    order: 9,
    label: '9. Endocrine Glands',
    shortLabel: 'Endocrine',
    defaultRegionCode: 'endocrine_metabolic',
    baseColor: '#a875c2',
  },
  {
    id: 'sensory_immune',
    order: 10,
    label: '10. Eyes & Immune Organs',
    shortLabel: 'Eyes & Immune',
    defaultRegionCode: 'eyes_vision',
    baseColor: '#3b82f6',
  },
];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface TriangleFace {
  a: number;
  b: number;
  c: number;
  /** Optional per-face material tint or tendon/striation variation [r, g, b] */
  colorOverride?: [number, number, number];
}

export interface AnatomicalMeshPart {
  meshId: string;
  fmaId: string;
  name: string;
  anatomicalSystemLabel?: string;
  structuralDescription?: string;
  regionCode: string;
  layerId: AnatomicalLayerId;
  baseColor: [number, number, number];
  defaultOpacity: number;
  specularStrength: number;
  materialType?: 'skin' | 'muscle' | 'bone' | 'organ' | 'vessel' | 'eye';
  vertices: Vec3[];
  faces: TriangleFace[];
  boundingCenter: Vec3;
  boundingRadius: number;
}

export interface RenderedMeshHitRegion {
  meshId: string;
  fmaId: string;
  name: string;
  anatomicalSystemLabel?: string;
  structuralDescription?: string;
  regionCode: string;
  layerId: AnatomicalLayerId;
  screenCenterX: number;
  screenCenterY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  avgDepth: number;
  projectedTriangles: Array<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    depth: number;
  }>;
}

function pointInTriangle2D(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const dX = px - x2;
  const dY = py - y2;
  const dX21 = x2 - x1;
  const dY12 = y1 - y2;
  const D = dY12 * (x0 - x2) + dX21 * (y0 - y2);
  if (Math.abs(D) < 1e-5) return false;
  const s = dY12 * dX + dX21 * dY;
  const t = (y2 - y0) * dX + (x0 - x2) * dY;
  if (D < 0) return s <= 0 && t <= 0 && s + t >= D;
  return s >= 0 && t >= 0 && s + t <= D;
}

/**
 * Raycasts (2D projected triangle hit-test sorted front-to-back by depth) to select
 * the exact individual anatomical structure mesh under the cursor.
 * Prioritizes discrete anatomical structures (organs, muscles, bones, eyes) over the
 * enclosing skin envelope when both overlap at the click point.
 */
export function pickAnatomicalMeshAtPoint(
  canvasX: number,
  canvasY: number,
  hitRegions: RenderedMeshHitRegion[],
  preferInternalStructures = true
): RenderedMeshHitRegion | null {
  const candidates = [...hitRegions].sort((a, b) => {
    if (preferInternalStructures) {
      const aSkin = a.layerId === 'skin_external' ? 1 : 0;
      const bSkin = b.layerId === 'skin_external' ? 1 : 0;
      if (aSkin !== bSkin) return aSkin - bSkin;
    }
    return b.avgDepth - a.avgDepth;
  });

  // Pass 1: Exact triangle hit test sorted front-to-back
  for (const reg of candidates) {
    if (
      canvasX < reg.minX - 4 ||
      canvasX > reg.maxX + 4 ||
      canvasY < reg.minY - 4 ||
      canvasY > reg.maxY + 4
    ) {
      continue;
    }
    for (const tri of reg.projectedTriangles) {
      if (
        pointInTriangle2D(
          canvasX,
          canvasY,
          tri.x0,
          tri.y0,
          tri.x1,
          tri.y1,
          tri.x2,
          tri.y2
        )
      ) {
        return reg;
      }
    }
  }

  // Pass 2: Small tolerance around compact organs/structures
  for (const reg of candidates) {
    if (reg.layerId === 'skin_external') continue;
    if (
      canvasX >= reg.minX - 8 &&
      canvasX <= reg.maxX + 8 &&
      canvasY >= reg.minY - 8 &&
      canvasY <= reg.maxY + 8
    ) {
      return reg;
    }
  }

  return null;
}

export function getOrBuildAnatomical3DAtlas(
  sex: AnatomicalReferenceSex = 'male'
): AnatomicalMeshPart[] {
  return buildRealisticAnatomical3DAtlas(sex);
}

export function getActiveLayersForPreset(
  preset: AnatomicalViewPreset
): Set<AnatomicalLayerId> {
  return getRealisticLayersForPreset(preset);
}

export function renderAnatomical3DScene(params: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  atlas: AnatomicalMeshPart[];
  visibleLayers: Set<AnatomicalLayerId>;
  selectedRegionCode: string | null;
  selectedMeshId?: string | null;
  hoveredRegionCode: string | null;
  hoveredMeshId?: string | null;
  isolatedRegionCode: string | null;
  isolatedMeshId?: string | null;
  surfaceOpacity?: number;
  viewPreset?: AnatomicalViewPreset;
  yaw: number;
  pitch: number;
  zoom: number;
  panY: number;
}): RenderedMeshHitRegion[] {
  return renderRealisticAnatomical3DScene(params);
}
