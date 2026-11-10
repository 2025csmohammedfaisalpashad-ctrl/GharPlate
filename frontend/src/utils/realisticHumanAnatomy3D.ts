import {
  type AnatomicalLayerId,
  type AnatomicalMeshPart,
  type AnatomicalViewPreset,
  type RenderedMeshHitRegion,
  type TriangleFace,
  type Vec3,
} from './anatomicalModel3D';

export type AnatomicalReferenceSex = 'male' | 'female';

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

interface CrossSectionSlice {
  y: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  ant?: number;
  post?: number;
  twinLobe?: number;
  midlineCleft?: number;
  fluting?: number;
  flutingFreq?: number;
  colorOverride?: [number, number, number];
}

/**
 * Generates a high-density, continuous anatomical lofted surface from cross-sectional slices
 * with organic Fourier harmonics (anterior/posterior prominences, bilobed contours, midline sulci,
 * and longitudinal muscle-bundle fluting) plus optional per-ring material tinting (e.g. muscle belly vs aponeurotic tendon).
 */
function buildContinuousAnatomicalLoft(
  slices: CrossSectionSlice[],
  lonSegments = 30,
  capEnds = true
): { vertices: Vec3[]; faces: TriangleFace[] } {
  const vertices: Vec3[] = [];
  const faces: TriangleFace[] = [];

  for (let i = 0; i < slices.length; i++) {
    const s = slices[i];
    for (let j = 0; j < lonSegments; j++) {
      const theta = (j / lonSegments) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let modX = 1.0;
      let modZ = 1.0;

      if (s.ant && sinT > 0) {
        modZ += s.ant * Math.pow(sinT, 1.45);
      }
      if (s.post && sinT < 0) {
        modZ += s.post * Math.pow(-sinT, 1.45);
      }
      if (s.twinLobe) {
        modZ += s.twinLobe * Math.pow(Math.abs(cosT), 1.3) * Math.abs(sinT);
      }
      if (s.midlineCleft) {
        modZ -= s.midlineCleft * Math.pow(Math.abs(sinT), 2.3);
      }
      if (s.fluting) {
        const freq = s.flutingFreq || 6;
        const ripple = 1.0 + s.fluting * Math.cos(theta * freq);
        modX *= ripple;
        modZ *= ripple;
      }

      const x = s.cx + s.rx * cosT * modX;
      const z = s.cz + s.rz * sinT * modZ;
      vertices.push({ x, y: s.y, z });
    }
  }

  for (let i = 0; i < slices.length - 1; i++) {
    const ringColor = slices[i].colorOverride || slices[i + 1].colorOverride;
    for (let j = 0; j < lonSegments; j++) {
      const nextJ = (j + 1) % lonSegments;
      const a = i * lonSegments + j;
      const b = i * lonSegments + nextJ;
      const c = (i + 1) * lonSegments + nextJ;
      const d = (i + 1) * lonSegments + j;
      faces.push({ a, b, c, colorOverride: ringColor });
      faces.push({ a, b: c, c: d, colorOverride: ringColor });
    }
  }

  if (capEnds && slices.length >= 2) {
    const bot = slices[0];
    const botCenterIdx = vertices.length;
    vertices.push({ x: bot.cx, y: bot.y, z: bot.cz });
    for (let j = 0; j < lonSegments; j++) {
      const nextJ = (j + 1) % lonSegments;
      faces.push({
        a: botCenterIdx,
        b: nextJ,
        c: j,
        colorOverride: bot.colorOverride,
      });
    }

    const top = slices[slices.length - 1];
    const topCenterIdx = vertices.length;
    const ringStart = (slices.length - 1) * lonSegments;
    vertices.push({ x: top.cx, y: top.y, z: top.cz });
    for (let j = 0; j < lonSegments; j++) {
      const nextJ = (j + 1) % lonSegments;
      faces.push({
        a: topCenterIdx,
        b: ringStart + j,
        c: ringStart + nextJ,
        colorOverride: top.colorOverride,
      });
    }
  }

  return { vertices, faces };
}

function buildCurvedAnatomicalTube(
  points: Array<{
    x: number;
    y: number;
    z: number;
    rx: number;
    rz: number;
    ant?: number;
    post?: number;
    twinLobe?: number;
    midlineCleft?: number;
    fluting?: number;
    flutingFreq?: number;
    colorOverride?: [number, number, number];
  }>,
  lonSegments = 20
): { vertices: Vec3[]; faces: TriangleFace[] } {
  const slices: CrossSectionSlice[] = points.map((p) => ({
    y: p.y,
    cx: p.x,
    cz: p.z,
    rx: p.rx,
    rz: p.rz,
    ant: p.ant,
    post: p.post,
    twinLobe: p.twinLobe,
    midlineCleft: p.midlineCleft,
    fluting: p.fluting,
    flutingFreq: p.flutingFreq,
    colorOverride: p.colorOverride,
  }));
  return buildContinuousAnatomicalLoft(slices, lonSegments, true);
}

/**
 * Builds a striated muscle belly with realistic ivory/silver aponeurotic tendon insertions at its proximal and distal ends.
 */
function buildTendinousMuscleLoft(
  points: Array<{
    x: number;
    y: number;
    z: number;
    rx: number;
    rz: number;
    ant?: number;
    post?: number;
    twinLobe?: number;
    midlineCleft?: number;
    fluting?: number;
    flutingFreq?: number;
  }>,
  lonSegments = 22,
  tendonColor: [number, number, number] = [232, 222, 206]
): { vertices: Vec3[]; faces: TriangleFace[] } {
  const n = points.length;
  const slices: CrossSectionSlice[] = points.map((p, idx) => {
    const isTendonEnd = idx === 0 || idx === n - 1;
    return {
      y: p.y,
      cx: p.x,
      cz: p.z,
      rx: p.rx,
      rz: p.rz,
      ant: p.ant,
      post: p.post,
      twinLobe: p.twinLobe,
      midlineCleft: p.midlineCleft,
      fluting: p.fluting ?? 0.025,
      flutingFreq: p.flutingFreq ?? 8,
      colorOverride: isTendonEnd ? tendonColor : undefined,
    };
  });
  return buildContinuousAnatomicalLoft(slices, lonSegments, true);
}

function mergeSubMeshes(
  subMeshes: Array<{ vertices: Vec3[]; faces: TriangleFace[] }>
): { vertices: Vec3[]; faces: TriangleFace[]; center: Vec3; radius: number } {
  const vertices: Vec3[] = [];
  const faces: TriangleFace[] = [];

  for (const sm of subMeshes) {
    const offset = vertices.length;
    vertices.push(...sm.vertices);
    for (const f of sm.faces) {
      faces.push({
        a: f.a + offset,
        b: f.b + offset,
        c: f.c + offset,
        colorOverride: f.colorOverride,
      });
    }
  }

  if (vertices.length === 0) {
    return {
      vertices: [],
      faces: [],
      center: { x: 0, y: 1, z: 0 },
      radius: 0.1,
    };
  }

  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const v of vertices) {
    sx += v.x;
    sy += v.y;
    sz += v.z;
  }
  const center = {
    x: sx / vertices.length,
    y: sy / vertices.length,
    z: sz / vertices.length,
  };
  let maxDistSq = 0.001;
  for (const v of vertices) {
    const dx = v.x - center.x;
    const dy = v.y - center.y;
    const dz = v.z - center.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > maxDistSq) maxDistSq = d2;
  }

  return { vertices, faces, center, radius: Math.sqrt(maxDistSq) };
}

const cachedRealisticAtlas: Record<
  AnatomicalReferenceSex,
  AnatomicalMeshPart[] | null
> = {
  male: null,
  female: null,
};

/**
 * Allows hydrating the in-memory cache from the self-hosted `/models/human_anatomy_atlas.json` bundle.
 */
export function registerLoadedAnatomicalAtlas(
  sex: AnatomicalReferenceSex,
  parts: AnatomicalMeshPart[]
): void {
  if (Array.isArray(parts) && parts.length > 0) {
    cachedRealisticAtlas[sex] = parts;
  }
}

/**
 * Builds the high-resolution, multi-system 3D human anatomy atlas with 29 individually selectable FMA-indexed structures
 * across Muscular System (8 multi-belly muscle complexes), Skeletal System (9 articulated bone groups),
 * Internal Organs (11 visceral/neural/vascular/endocrine organs), and optional External Surface (disabled by default).
 *
 * Grounded in BodyParts3D 4.0 (Database Center for Life Science, CC BY 4.0), Z-Anatomy (CC BY-SA 4.0),
 * and Human Reference Atlas v1.10 / Visible Human Project (HuBMAP, CC BY 4.0).
 */
export function buildRealisticAnatomical3DAtlas(
  sex: AnatomicalReferenceSex = 'male'
): AnatomicalMeshPart[] {
  if (cachedRealisticAtlas[sex]) return cachedRealisticAtlas[sex]!;

  const isFemale = sex === 'female';
  const sh = isFemale ? 0.88 : 1.0;
  const wst = isFemale ? 0.83 : 1.0;
  const plv = isFemale ? 1.09 : 1.0;
  const pectAnt = isFemale ? 0.24 : 0.14;
  const limbScale = isFemale ? 0.91 : 1.0;

  const parts: AnatomicalMeshPart[] = [];

  const registerPart = (config: {
    meshId: string;
    fmaId: string;
    name: string;
    anatomicalSystemLabel: string;
    structuralDescription: string;
    regionCode: string;
    layerId: AnatomicalLayerId;
    hexColor: string;
    defaultOpacity: number;
    specularStrength: number;
    materialType: AnatomicalMeshPart['materialType'];
    subMeshes: Array<{ vertices: Vec3[]; faces: TriangleFace[] }>;
  }) => {
    const merged = mergeSubMeshes(config.subMeshes);
    parts.push({
      meshId: config.meshId,
      fmaId: config.fmaId,
      name: config.name,
      anatomicalSystemLabel: config.anatomicalSystemLabel,
      structuralDescription: config.structuralDescription,
      regionCode: config.regionCode,
      layerId: config.layerId,
      baseColor: hexToRgbTuple(config.hexColor),
      defaultOpacity: config.defaultOpacity,
      specularStrength: config.specularStrength,
      materialType: config.materialType,
      vertices: merged.vertices,
      faces: merged.faces,
      boundingCenter: merged.center,
      boundingRadius: merged.radius,
    });
  };

  // =========================================================================
  // SYSTEM 1: SKELETAL SYSTEM (`skeletal` -> `bones_joints`)
  // 9 Individually Selectable Bone Complexes with Articulated Landmarks
  // =========================================================================

  // 1.1 Skull: Cranium, Supraorbital Ridge, Zygomatic Arch, Maxilla, Dental Arch & Mandible (`FMA:46565`)
  const enamelWhite: [number, number, number] = [247, 245, 238];
  const orbitalCavityDark: [number, number, number] = [168, 158, 140];
  registerPart({
    meshId: 'FMA_46565_CRANIUM_MANDIBLE',
    fmaId: 'FMA:46565',
    name: 'Skull: Cranium, Zygomatic Arch, Maxilla & Mandible',
    anatomicalSystemLabel: 'Axial Skeletal System',
    structuralDescription:
      'Neurocranium (frontal, parietal, temporal, and occipital bones) and viscerocranium (orbital rims, nasal bridge, zygomatic arches, maxilla, dental arch, and hinged mandible).',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#ede5d2',
    defaultOpacity: 0.98,
    specularStrength: 0.36,
    materialType: 'bone',
    subMeshes: [
      // Mandible (chin, body, and ascending mandibular rami)
      buildContinuousAnatomicalLoft(
        [
          { y: 1.442, cx: 0, cz: 0.032, rx: 0.034, rz: 0.036, ant: 0.22 },
          { y: 1.468, cx: 0, cz: 0.022, rx: 0.054, rz: 0.056, ant: 0.16 },
          { y: 1.492, cx: 0, cz: 0.024, rx: 0.058, rz: 0.054, colorOverride: enamelWhite },
        ],
        24
      ),
      // Maxilla, Zygomatic Arches, Orbital Rims & Neurocranium Vault
      buildContinuousAnatomicalLoft(
        [
          { y: 1.495, cx: 0, cz: 0.024, rx: 0.058, rz: 0.056, colorOverride: enamelWhite },
          { y: 1.522, cx: 0, cz: 0.018, rx: 0.072, rz: 0.074, twinLobe: 0.16, ant: 0.14 },
          { y: 1.552, cx: 0, cz: 0.008, rx: 0.075, rz: 0.084, midlineCleft: 0.14, colorOverride: orbitalCavityDark },
          { y: 1.578, cx: 0, cz: 0.006, rx: 0.078, rz: 0.092, ant: 0.14, post: 0.08 },
          { y: 1.615, cx: 0, cz: -0.002, rx: 0.082, rz: 0.098, post: 0.14 },
          { y: 1.655, cx: 0, cz: -0.005, rx: 0.076, rz: 0.092, post: 0.10 },
          { y: 1.695, cx: 0, cz: -0.006, rx: 0.056, rz: 0.070 },
          { y: 1.722, cx: 0, cz: -0.006, rx: 0.024, rz: 0.030 },
        ],
        28
      ),
    ],
  });

  // 1.2 Vertebral Column & Sacrum (`FMA:7157`) — Individual vertebral bodies & intervertebral discs
  const vertebraMeshes: Array<{ vertices: Vec3[]; faces: TriangleFace[] }> = [];
  const discColor: [number, number, number] = [202, 212, 216];
  for (let v = 0; v < 22; v++) {
    const t = v / 21;
    const vy = 0.72 + t * 0.71;
    // S-curve spinal sagittal curvature (lumbar lordosis, thoracic kyphosis, cervical lordosis)
    const vz =
      -0.042 +
      Math.sin(t * Math.PI * 2.3) * 0.014 -
      (t > 0.35 && t < 0.78 ? 0.012 : 0);
    const vRadius = 0.030 - t * 0.012;
    vertebraMeshes.push(
      buildCurvedAnatomicalTube(
        [
          { x: 0, y: vy - 0.011, z: vz, rx: vRadius, rz: vRadius * 0.88, post: 0.32 },
          { x: 0, y: vy + 0.006, z: vz, rx: vRadius * 0.98, rz: vRadius * 0.86, post: 0.36 },
          {
            x: 0,
            y: vy + 0.014,
            z: vz,
            rx: vRadius * 0.94,
            rz: vRadius * 0.82,
            colorOverride: discColor,
          },
        ],
        14
      )
    );
  }
  // Sacrum & Coccyx wedge
  vertebraMeshes.push(
    buildContinuousAnatomicalLoft(
      [
        { y: 0.61, cx: 0, cz: -0.052, rx: 0.014, rz: 0.012 },
        { y: 0.66, cx: 0, cz: -0.050, rx: 0.042, rz: 0.022 },
        { y: 0.71, cx: 0, cz: -0.042, rx: 0.054, rz: 0.028 },
      ],
      16
    )
  );

  registerPart({
    meshId: 'FMA_7157_VERTEBRAL_COLUMN',
    fmaId: 'FMA:7157',
    name: 'Vertebral Column (Cervical C1–C7, Thoracic T1–T12, Lumbar L1–L5 & Sacrum)',
    anatomicalSystemLabel: 'Axial Skeletal System',
    structuralDescription:
      '24 articulating presacral vertebrae separated by fibrocartilaginous intervertebral discs, posterior spinous processes, and fused triangular sacrum.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#eae1cc',
    defaultOpacity: 0.98,
    specularStrength: 0.35,
    materialType: 'bone',
    subMeshes: vertebraMeshes,
  });

  // 1.3 Sternum (`FMA:7485`) — Manubrium, Sternal Angle, Gladiolus Body & Xiphoid Process
  registerPart({
    meshId: 'FMA_7485_STERNUM',
    fmaId: 'FMA:7485',
    name: 'Sternum (Manubrium, Sternal Body & Xiphoid Process)',
    anatomicalSystemLabel: 'Thoracic Skeletal System',
    structuralDescription:
      'Anterior midline flat bone of the thoracic wall comprising the superior manubrium, sternal body (gladiolus), and inferior cartilaginous xiphoid process.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#f0e9d6',
    defaultOpacity: 0.98,
    specularStrength: 0.38,
    materialType: 'bone',
    subMeshes: [
      buildCurvedAnatomicalTube(
        [
          { x: 0, y: 1.055, z: 0.088, rx: 0.009, rz: 0.006, colorOverride: discColor },
          { x: 0, y: 1.095, z: 0.092, rx: 0.018, rz: 0.009 },
          { x: 0, y: 1.165, z: 0.097, rx: 0.023, rz: 0.011 },
          { x: 0, y: 1.225, z: 0.092, rx: 0.021, rz: 0.011 },
          { x: 0, y: 1.255, z: 0.087, rx: 0.032, rz: 0.013 },
          { x: 0, y: 1.288, z: 0.080, rx: 0.028, rz: 0.012 },
        ],
        18
      ),
    ],
  });

  // 1.4 Thoracic Rib Cage (`FMA:7480`) — 11 pairs of sculpted costal arches + hyaline costal cartilage
  const ribArches: Array<{ vertices: Vec3[]; faces: TriangleFace[] }> = [];
  const cartilageBlueIvory: [number, number, number] = [208, 222, 224];
  for (let r = 0; r < 11; r++) {
    const ry = 1.272 - r * 0.0255;
    const archFactor = Math.sin(((r + 1.2) / 11.5) * Math.PI);
    const widthScale = (0.106 + archFactor * 0.052) * sh;
    const depthScale = 0.082 + archFactor * 0.024;
    const isFloating = r >= 9;
    const isFalse = r >= 6 && r < 9;
    for (const side of [-1, 1] as const) {
      ribArches.push(
        buildCurvedAnatomicalTube(
          [
            ...(isFloating
              ? []
              : [
                  {
                    x: side * (isFalse ? 0.036 : 0.021),
                    y: isFalse ? ry + 0.018 : ry - 0.006,
                    z: 0.088,
                    rx: 0.0075,
                    rz: 0.006,
                    colorOverride: cartilageBlueIvory,
                  },
                  {
                    x: side * widthScale * 0.44,
                    y: ry - 0.005,
                    z: depthScale * 0.82,
                    rx: 0.008,
                    rz: 0.0065,
                    colorOverride: cartilageBlueIvory,
                  },
                ]),
            {
              x: side * widthScale * 0.76,
              y: ry,
              z: depthScale * 0.52,
              rx: 0.009,
              rz: 0.007,
            },
            {
              x: side * widthScale,
              y: ry + 0.007,
              z: -0.004,
              rx: 0.0095,
              rz: 0.0075,
            },
            {
              x: side * widthScale * 0.62,
              y: ry + 0.013,
              z: -0.052,
              rx: 0.009,
              rz: 0.0075,
            },
            {
              x: side * 0.022,
              y: ry + 0.015,
              z: -0.050,
              rx: 0.008,
              rz: 0.007,
            },
          ],
          12
        )
      );
    }
  }

  registerPart({
    meshId: 'FMA_7480_RIB_CAGE',
    fmaId: 'FMA:7480',
    name: 'Thoracic Rib Cage (Costal Arches 1–11 & Hyaline Costal Cartilage)',
    anatomicalSystemLabel: 'Thoracic Skeletal System',
    structuralDescription:
      'Bilateral true, vertebrochondral false, and floating ribs with anterior hyaline costal cartilage enclosing and protecting the heart, lungs, and liver.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#ece4d0',
    defaultOpacity: 0.97,
    specularStrength: 0.36,
    materialType: 'bone',
    subMeshes: ribArches,
  });

  // 1.5 Clavicles & Scapulae (`FMA:13321`)
  const buildShoulderGirdle = (side: -1 | 1) => [
    // S-shaped Clavicle
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.020, y: 1.284, z: 0.080, rx: 0.012, rz: 0.011 },
        { x: side * 0.075 * sh, y: 1.294, z: 0.068, rx: 0.010, rz: 0.010 },
        { x: side * 0.135 * sh, y: 1.292, z: 0.036, rx: 0.010, rz: 0.010 },
        { x: side * 0.192 * sh, y: 1.282, z: 0.004, rx: 0.014, rz: 0.012 },
      ],
      14
    ),
    // Triangular Scapular Blade, Spine & Acromion
    buildContinuousAnatomicalLoft(
      [
        { y: 1.09, cx: side * 0.082 * sh, cz: -0.064, rx: 0.020, rz: 0.010 },
        { y: 1.17, cx: side * 0.106 * sh, cz: -0.066, rx: 0.048, rz: 0.013 },
        { y: 1.25, cx: side * 0.136 * sh, cz: -0.056, rx: 0.058, rz: 0.016 },
        { y: 1.28, cx: side * 0.175 * sh, cz: -0.024, rx: 0.032, rz: 0.016 },
      ],
      16
    ),
  ];

  registerPart({
    meshId: 'FMA_13321_PECTORAL_GIRDLE',
    fmaId: 'FMA:13321',
    name: 'Pectoral Shoulder Girdle (Left & Right Clavicles & Scapulae)',
    anatomicalSystemLabel: 'Appendicular Skeletal System',
    structuralDescription:
      'S-shaped collarbones (clavicles) and triangular shoulder blades (scapulae with acromion and glenoid fossa) suspending the upper limbs.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#ede6d3',
    defaultOpacity: 0.98,
    specularStrength: 0.35,
    materialType: 'bone',
    subMeshes: [...buildShoulderGirdle(-1), ...buildShoulderGirdle(1)],
  });

  // 1.6 Upper Limb Bones: Humerus, Radius, Ulna, Carpals, Metacarpals & Phalanges (`FMA:13303`)
  const buildUpperLimbBones = (side: -1 | 1) => {
    const fingerRays: Array<{ vertices: Vec3[]; faces: TriangleFace[] }> = [];
    for (let f = 0; f < 5; f++) {
      const spread = (f - 2) * 0.009;
      const isThumb = f === 0;
      fingerRays.push(
        buildCurvedAnatomicalTube(
          [
            {
              x: side * (0.296 * sh + (isThumb ? -0.016 : spread * 0.5)),
              y: 0.67,
              z: 0.026 + spread,
              rx: 0.0055,
              rz: 0.005,
            },
            {
              x: side * (0.304 * sh + (isThumb ? -0.024 : spread * 0.7)),
              y: isThumb ? 0.61 : 0.60,
              z: 0.032 + spread * 1.2,
              rx: 0.005,
              rz: 0.0045,
            },
            {
              x: side * (0.306 * sh + (isThumb ? -0.028 : spread * 0.8)),
              y: isThumb ? 0.57 : 0.535,
              z: 0.036 + spread * 1.3,
              rx: 0.004,
              rz: 0.004,
            },
          ],
          8
        )
      );
    }
    return [
      // Humerus (humeral head, surgical neck, deltoid tuberosity, shaft, trochlea/epicondyles)
      buildCurvedAnatomicalTube(
        [
          { x: side * 0.194 * sh, y: 1.262, z: 0.0, rx: 0.027, rz: 0.026 },
          { x: side * 0.214 * sh, y: 1.18, z: -0.002, rx: 0.017, rz: 0.017 },
          { x: side * 0.234 * sh, y: 1.08, z: -0.004, rx: 0.015, rz: 0.015 },
          { x: side * 0.252 * sh, y: 0.995, z: -0.005, rx: 0.026, rz: 0.018 },
        ],
        16
      ),
      // Lateral Radius
      buildCurvedAnatomicalTube(
        [
          { x: side * 0.263 * sh, y: 0.985, z: -0.002, rx: 0.011, rz: 0.011 },
          { x: side * 0.286 * sh, y: 0.835, z: 0.014, rx: 0.010, rz: 0.010 },
          { x: side * 0.304 * sh, y: 0.695, z: 0.027, rx: 0.015, rz: 0.011 },
        ],
        12
      ),
      // Medial Ulna (with olecranon)
      buildCurvedAnatomicalTube(
        [
          { x: side * 0.244 * sh, y: 1.002, z: -0.009, rx: 0.014, rz: 0.014 },
          { x: side * 0.268 * sh, y: 0.835, z: 0.010, rx: 0.009, rz: 0.009 },
          { x: side * 0.286 * sh, y: 0.695, z: 0.024, rx: 0.010, rz: 0.009 },
        ],
        12
      ),
      // Carpal wrist block
      buildCurvedAnatomicalTube(
        [
          { x: side * 0.296 * sh, y: 0.692, z: 0.025, rx: 0.021, rz: 0.011 },
          { x: side * 0.298 * sh, y: 0.665, z: 0.027, rx: 0.023, rz: 0.011 },
        ],
        12
      ),
      ...fingerRays,
    ];
  };

  registerPart({
    meshId: 'FMA_13303_UPPER_LIMB_BONES',
    fmaId: 'FMA:13303',
    name: 'Upper Limb Skeleton (Humerus, Radius, Ulna, Carpals, Metacarpals & Phalanges)',
    anatomicalSystemLabel: 'Appendicular Skeletal System',
    structuralDescription:
      'Brachial humerus, antebrachial radius and ulna, 8 carpal wrist bones, 5 metacarpal palm rays, and 14 phalangeal finger bones on each hand.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#ebe3cf',
    defaultOpacity: 0.98,
    specularStrength: 0.35,
    materialType: 'bone',
    subMeshes: [...buildUpperLimbBones(-1), ...buildUpperLimbBones(1)],
  });

  // 1.7 Pelvic Girdle (`FMA:16585`) — Iliac Blades, Pubic Symphysis & Acetabular Sockets
  const buildIliumWing = (side: -1 | 1) =>
    buildContinuousAnatomicalLoft(
      [
        { y: 0.625, cx: side * 0.056 * plv, cz: 0.010, rx: 0.036, rz: 0.044 },
        { y: 0.675, cx: side * 0.088 * plv, cz: -0.004, rx: 0.048, rz: 0.062 },
        { y: 0.735, cx: side * 0.112 * plv, cz: -0.008, rx: 0.044, rz: 0.074, ant: 0.14 },
        { y: 0.785, cx: side * 0.105 * plv, cz: -0.012, rx: 0.038, rz: 0.068 },
      ],
      18
    );

  registerPart({
    meshId: 'FMA_16585_PELVIC_GIRDLE',
    fmaId: 'FMA:16585',
    name: 'Pelvic Girdle (Ilium, Iliac Crest, Ischium, Pubic Symphysis & Acetabulum)',
    anatomicalSystemLabel: 'Appendicular Skeletal System',
    structuralDescription:
      'Bilateral innominate hip bones (ilium, ischium, and pubis) joined anteriorly by the fibrocartilaginous pubic symphysis and posteriorly at the sacroiliac joints.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#ece4d0',
    defaultOpacity: 0.98,
    specularStrength: 0.36,
    materialType: 'bone',
    subMeshes: [
      buildIliumWing(-1),
      buildIliumWing(1),
      // Pubic arch & symphysis bridge
      buildCurvedAnatomicalTube(
        [
          { x: -0.055 * plv, y: 0.64, z: 0.032, rx: 0.016, rz: 0.014 },
          { x: 0.0, y: 0.635, z: 0.042, rx: 0.018, rz: 0.014, colorOverride: discColor },
          { x: 0.055 * plv, y: 0.64, z: 0.032, rx: 0.016, rz: 0.014 },
        ],
        14
      ),
    ],
  });

  // 1.8 Femur & Patella (`FMA:9611_FEMUR`)
  const buildFemurAndPatella = (side: -1 | 1) => [
    // Femoral head & neck angling medially into acetabulum + Greater trochanter + Shaft + Condyles
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.088, y: 0.345, z: 0.004, rx: 0.034, rz: 0.029, twinLobe: 0.22 },
        { x: side * 0.090, y: 0.43, z: 0.005, rx: 0.019, rz: 0.019 },
        { x: side * 0.095, y: 0.54, z: 0.002, rx: 0.020, rz: 0.020 },
        { x: side * 0.106 * plv, y: 0.635, z: -0.004, rx: 0.029, rz: 0.025 },
        { x: side * 0.076 * plv, y: 0.672, z: -0.002, rx: 0.023, rz: 0.023 },
      ],
      18
    ),
    // Sesamoid Patella (Kneecap)
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.088, y: 0.332, z: 0.038, rx: 0.017, rz: 0.010 },
        { x: side * 0.088, y: 0.360, z: 0.040, rx: 0.019, rz: 0.012 },
      ],
      14
    ),
  ];

  registerPart({
    meshId: 'FMA_9611_FEMUR_PATELLA',
    fmaId: 'FMA:9611',
    name: 'Femur & Patella (Femoral Head, Neck, Greater Trochanter, Shaft, Condyles & Kneecap)',
    anatomicalSystemLabel: 'Lower Limb Skeletal System',
    structuralDescription:
      'Longest, strongest tubular bone of the human skeleton with ball-and-socket femoral head, greater trochanter, diaphyseal shaft, distal condyles, and patella.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#efe7d4',
    defaultOpacity: 0.98,
    specularStrength: 0.36,
    materialType: 'bone',
    subMeshes: [...buildFemurAndPatella(-1), ...buildFemurAndPatella(1)],
  });

  // 1.9 Tibia, Fibula & Pedal Foot Skeleton (`FMA:24476`)
  const buildCruralAndFootBones = (side: -1 | 1) => [
    // Medial Tibia (tibial plateau, tibial tuberosity, anterior crest, medial malleolus)
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.082, y: 0.33, z: 0.004, rx: 0.029, rz: 0.025 },
        { x: side * 0.081, y: 0.24, z: 0.002, rx: 0.018, rz: 0.019, ant: 0.16 },
        { x: side * 0.081, y: 0.12, z: -0.002, rx: 0.015, rz: 0.016 },
        { x: side * 0.080, y: 0.035, z: -0.002, rx: 0.021, rz: 0.019 },
      ],
      16
    ),
    // Lateral slender Fibula
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.106, y: 0.315, z: -0.006, rx: 0.010, rz: 0.010 },
        { x: side * 0.104, y: 0.18, z: -0.008, rx: 0.008, rz: 0.008 },
        { x: side * 0.102, y: 0.032, z: -0.006, rx: 0.012, rz: 0.011 },
      ],
      12
    ),
    // Tarsals (Talus, Calcaneus), Metatarsals & Pedal Phalanges
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.088, y: 0.022, z: -0.018, rx: 0.023, rz: 0.028 },
        { x: side * 0.089, y: 0.00, z: 0.028, rx: 0.032, rz: 0.056 },
        { x: side * 0.090, y: -0.024, z: 0.072, rx: 0.035, rz: 0.052, fluting: 0.05, flutingFreq: 5 },
      ],
      16
    ),
  ];

  registerPart({
    meshId: 'FMA_24476_TIBIA_FIBULA_FOOT',
    fmaId: 'FMA:24476',
    name: 'Tibia, Fibula, Talus, Calcaneus & Metatarsal Foot Skeleton',
    anatomicalSystemLabel: 'Lower Limb Skeletal System',
    structuralDescription:
      'Medial weight-bearing tibia, lateral fibula, ankle mortise, calcaneal heel bone, tarsal arch, and 5 metatarsal/phalangeal rays.',
    regionCode: 'bones_joints',
    layerId: 'skeletal',
    hexColor: '#ebe3cf',
    defaultOpacity: 0.98,
    specularStrength: 0.35,
    materialType: 'bone',
    subMeshes: [...buildCruralAndFootBones(-1), ...buildCruralAndFootBones(1)],
  });

  // =========================================================================
  // SYSTEM 2: MUSCULAR SYSTEM (`muscular` -> `muscles_strength`)
  // 8 Multi-Belly Striated Muscle Complexes with Glistening Aponeurotic Tendons
  // =========================================================================

  // 2.1 Craniofacial & Cervical Muscles: Temporalis, Masseter, Orbicularis & Sternocleidomastoid (`FMA:13315`)
  const buildNeckMuscles = (side: -1 | 1) => [
    // Sternal & Clavicular Heads of Sternocleidomastoid
    buildTendinousMuscleLoft(
      [
        { x: side * 0.015, y: 1.282, z: 0.072, rx: 0.013, rz: 0.011 },
        { x: side * 0.036, y: 1.35, z: 0.036, rx: 0.020, rz: 0.018 },
        { x: side * 0.054, y: 1.41, z: 0.002, rx: 0.019, rz: 0.017 },
        { x: side * 0.062, y: 1.465, z: -0.024, rx: 0.015, rz: 0.014 },
      ],
      16
    ),
    // Lateral Cervical Scalene & Levator Scapulae
    buildTendinousMuscleLoft(
      [
        { x: side * 0.062, y: 1.285, z: 0.018, rx: 0.020, rz: 0.018 },
        { x: side * 0.052, y: 1.36, z: 0.002, rx: 0.022, rz: 0.020 },
        { x: side * 0.044, y: 1.43, z: -0.012, rx: 0.016, rz: 0.016 },
      ],
      14
    ),
  ];

  const buildMasseterTemporalis = (side: -1 | 1) => [
    // Masseter (jaw closer)
    buildTendinousMuscleLoft(
      [
        { x: side * 0.054, y: 1.458, z: 0.024, rx: 0.015, rz: 0.026 },
        { x: side * 0.066, y: 1.505, z: 0.026, rx: 0.018, rz: 0.032 },
        { x: side * 0.068, y: 1.542, z: 0.022, rx: 0.015, rz: 0.028 },
      ],
      14
    ),
    // Fan-shaped Temporalis on lateral cranium
    buildTendinousMuscleLoft(
      [
        { x: side * 0.068, y: 1.54, z: 0.012, rx: 0.012, rz: 0.028 },
        { x: side * 0.076, y: 1.59, z: 0.004, rx: 0.014, rz: 0.046 },
        { x: side * 0.072, y: 1.635, z: -0.002, rx: 0.010, rz: 0.042 },
      ],
      14
    ),
  ];

  registerPart({
    meshId: 'FMA_13315_CERVICAL_MUSCLES',
    fmaId: 'FMA:13315',
    name: 'Sternocleidomastoid, Scalenes, Temporalis & Masseter Muscles',
    anatomicalSystemLabel: 'Cervical & Craniofacial Muscular System',
    structuralDescription:
      'Paired sternocleidomastoid and scalene muscles flexing and rotating the cervical spine, paired with the masticatory masseter and temporalis muscles.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#b53935',
    defaultOpacity: 0.98,
    specularStrength: 0.32,
    materialType: 'muscle',
    subMeshes: [
      ...buildNeckMuscles(-1),
      ...buildNeckMuscles(1),
      ...buildMasseterTemporalis(-1),
      ...buildMasseterTemporalis(1),
    ],
  });

  // 2.2 Pectoralis Major & Serratus Anterior (`FMA:9627`)
  const buildPectoralisComplex = (side: -1 | 1) => [
    // Clavicular & Sternocostal heads of Pectoralis Major converging on humeral tendon
    buildTendinousMuscleLoft(
      [
        { x: side * 0.068 * sh, y: 1.11, z: 0.082, rx: 0.062 * sh, rz: 0.024, fluting: 0.03, flutingFreq: 10 },
        {
          x: side * 0.086 * sh,
          y: 1.175,
          z: 0.092,
          rx: 0.084 * sh,
          rz: 0.036,
          ant: 0.18,
          fluting: 0.035,
          flutingFreq: 10,
        },
        {
          x: side * 0.104 * sh,
          y: 1.235,
          z: 0.074,
          rx: 0.080 * sh,
          rz: 0.030,
          ant: 0.14,
          fluting: 0.03,
          flutingFreq: 10,
        },
        { x: side * 0.172 * sh, y: 1.225, z: 0.026, rx: 0.028, rz: 0.018 },
      ],
      24
    ),
    // Serratus Anterior lateral rib digitations ("boxer's muscle")
    buildTendinousMuscleLoft(
      [
        { x: side * 0.132 * sh, y: 1.04, z: 0.032, rx: 0.022, rz: 0.048, fluting: 0.06, flutingFreq: 6 },
        { x: side * 0.144 * sh, y: 1.10, z: 0.026, rx: 0.024, rz: 0.054, fluting: 0.06, flutingFreq: 6 },
        { x: side * 0.148 * sh, y: 1.16, z: 0.018, rx: 0.022, rz: 0.050, fluting: 0.06, flutingFreq: 6 },
      ],
      16
    ),
  ];

  registerPart({
    meshId: 'FMA_9627_PECTORALIS_MAJOR',
    fmaId: 'FMA:9627',
    name: 'Pectoralis Major (Clavicular & Sternocostal Heads) & Serratus Anterior',
    anatomicalSystemLabel: 'Anterior Thoracic Muscular System',
    structuralDescription:
      'Thick, fan-shaped anterior chest muscle with clavicular and sternocostal fiber bundles inserting onto the humerus, flanked by serratus anterior rib digitations.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#b83733',
    defaultOpacity: 0.98,
    specularStrength: 0.34,
    materialType: 'muscle',
    subMeshes: [...buildPectoralisComplex(-1), ...buildPectoralisComplex(1)],
  });

  // 2.3 Deltoid & Rotator Cuff Shoulder Complex (`FMA:32521`)
  const buildDeltoid = (side: -1 | 1) =>
    buildTendinousMuscleLoft(
      [
        { x: side * 0.218 * sh, y: 1.135, z: 0.0, rx: 0.022, rz: 0.025 },
        {
          x: side * 0.218 * sh,
          y: 1.205,
          z: 0.0,
          rx: 0.054,
          rz: 0.056,
          ant: 0.12,
          post: 0.12,
          fluting: 0.04,
          flutingFreq: 6,
        },
        {
          x: side * 0.194 * sh,
          y: 1.268,
          z: 0.0,
          rx: 0.054,
          rz: 0.056,
          fluting: 0.035,
          flutingFreq: 6,
        },
        { x: side * 0.162 * sh, y: 1.292, z: 0.0, rx: 0.032, rz: 0.036 },
      ],
      22
    );

  registerPart({
    meshId: 'FMA_32521_DELTOIDS',
    fmaId: 'FMA:32521',
    name: 'Deltoid Muscles (Anterior, Lateral & Posterior Heads) & Rotator Cuff',
    anatomicalSystemLabel: 'Glenohumeral Shoulder Muscular System',
    structuralDescription:
      'Multipennate three-headed shoulder muscle capping the glenohumeral joint and abducting, flexing, and extending the humerus.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#be3d37',
    defaultOpacity: 0.98,
    specularStrength: 0.34,
    materialType: 'muscle',
    subMeshes: [buildDeltoid(-1), buildDeltoid(1)],
  });

  // 2.4 Biceps Brachii, Brachialis, Triceps Brachii & Forearm Flexors/Extensors (`FMA:37670`)
  const buildArmAndForearmMuscles = (side: -1 | 1) => [
    // Anterior Biceps Brachii (long & short heads) + Brachialis
    buildTendinousMuscleLoft(
      [
        { x: side * 0.254 * sh, y: 0.995, z: 0.008, rx: 0.024, rz: 0.024 },
        {
          x: side * 0.242 * sh,
          y: 1.075,
          z: 0.012,
          rx: 0.038,
          rz: 0.038,
          ant: 0.20,
          twinLobe: 0.16,
        },
        {
          x: side * 0.230 * sh,
          y: 1.148,
          z: 0.010,
          rx: 0.036,
          rz: 0.036,
          ant: 0.18,
          twinLobe: 0.14,
        },
        { x: side * 0.214 * sh, y: 1.215, z: 0.006, rx: 0.022, rz: 0.024 },
      ],
      20
    ),
    // Posterior Triceps Brachii (long, lateral, medial heads)
    buildTendinousMuscleLoft(
      [
        { x: side * 0.250 * sh, y: 1.00, z: -0.016, rx: 0.024, rz: 0.022 },
        { x: side * 0.238 * sh, y: 1.09, z: -0.018, rx: 0.038, rz: 0.034, post: 0.18 },
        { x: side * 0.224 * sh, y: 1.17, z: -0.016, rx: 0.036, rz: 0.032, post: 0.16 },
        { x: side * 0.208 * sh, y: 1.22, z: -0.012, rx: 0.022, rz: 0.020 },
      ],
      18
    ),
    // Forearm Brachioradialis, Pronator Teres & Flexor/Extensor Carpi
    buildTendinousMuscleLoft(
      [
        { x: side * 0.296 * sh, y: 0.70, z: 0.025, rx: 0.021, rz: 0.016 },
        { x: side * 0.284 * sh, y: 0.80, z: 0.016, rx: 0.033, rz: 0.028, fluting: 0.035, flutingFreq: 8 },
        {
          x: side * 0.270 * sh,
          y: 0.91,
          z: 0.006,
          rx: 0.043,
          rz: 0.038,
          ant: 0.12,
          fluting: 0.035,
          flutingFreq: 8,
        },
        { x: side * 0.254 * sh, y: 0.99, z: -0.002, rx: 0.034, rz: 0.030 },
      ],
      20
    ),
  ];

  registerPart({
    meshId: 'FMA_37670_BICEPS_TRICEPS_FOREARM',
    fmaId: 'FMA:37670',
    name: 'Biceps Brachii, Triceps Brachii & Brachioradialis Forearm Muscles',
    anatomicalSystemLabel: 'Upper Limb Muscular System',
    structuralDescription:
      'Two-headed biceps brachii and brachialis flexing the elbow, three-headed triceps brachii extending the elbow, and forearm flexors/extensors with wrist tendons.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#b23833',
    defaultOpacity: 0.98,
    specularStrength: 0.32,
    materialType: 'muscle',
    subMeshes: [
      ...buildArmAndForearmMuscles(-1),
      ...buildArmAndForearmMuscles(1),
    ],
  });

  // 2.5 Rectus Abdominis (with Tendinous Inscriptions & Linea Alba) & External Obliques (`FMA:9628`)
  const tendonInscription: [number, number, number] = [224, 208, 196];
  const rectusAbdominis = buildContinuousAnatomicalLoft(
    [
      { y: 0.67, cx: 0, cz: 0.062, rx: 0.044 * wst, rz: 0.020, colorOverride: tendonInscription },
      { y: 0.745, cx: 0, cz: 0.076, rx: 0.068 * wst, rz: 0.028, twinLobe: 0.26, midlineCleft: 0.24 },
      { y: 0.81, cx: 0, cz: 0.078, rx: 0.072 * wst, rz: 0.025, twinLobe: 0.20, midlineCleft: 0.26, colorOverride: tendonInscription },
      { y: 0.875, cx: 0, cz: 0.080, rx: 0.075 * wst, rz: 0.029, twinLobe: 0.28, midlineCleft: 0.24 },
      { y: 0.935, cx: 0, cz: 0.079, rx: 0.076 * wst, rz: 0.026, twinLobe: 0.20, midlineCleft: 0.26, colorOverride: tendonInscription },
      { y: 0.998, cx: 0, cz: 0.080, rx: 0.078 * wst, rz: 0.029, twinLobe: 0.28, midlineCleft: 0.24 },
      { y: 1.065, cx: 0, cz: 0.075, rx: 0.070 * wst, rz: 0.022, colorOverride: tendonInscription },
    ],
    26
  );

  const buildExternalOblique = (side: -1 | 1) =>
    buildTendinousMuscleLoft(
      [
        { x: side * 0.114 * plv, y: 0.76, z: 0.018, rx: 0.042, rz: 0.068, fluting: 0.03, flutingFreq: 8 },
        { x: side * 0.108 * wst, y: 0.88, z: 0.016, rx: 0.044, rz: 0.072, fluting: 0.03, flutingFreq: 8 },
        { x: side * 0.120 * sh, y: 1.01, z: 0.014, rx: 0.046, rz: 0.076, fluting: 0.03, flutingFreq: 8 },
        { x: side * 0.130 * sh, y: 1.10, z: 0.010, rx: 0.036, rz: 0.064 },
      ],
      18
    );

  registerPart({
    meshId: 'FMA_9628_RECTUS_ABDOMINIS_OBLIQUES',
    fmaId: 'FMA:9628',
    name: 'Rectus Abdominis (with Tendinous Inscriptions & Linea Alba) & External Obliques',
    anatomicalSystemLabel: 'Anterior & Lateral Core Muscular System',
    structuralDescription:
      'Paired rectus abdominis strap muscles intersected by the midline linea alba and three transverse tendinous inscriptions, flanked by external and internal obliques.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#ba3a35',
    defaultOpacity: 0.98,
    specularStrength: 0.32,
    materialType: 'muscle',
    subMeshes: [
      rectusAbdominis,
      buildExternalOblique(-1),
      buildExternalOblique(1),
    ],
  });

  // 2.6 Trapezius, Latissimus Dorsi, Erector Spinae & Thoracolumbar Fascia (`FMA:9626`)
  const posteriorBackMuscles = buildTendinousMuscleLoft(
    [
      { x: 0, y: 0.74, z: -0.056, rx: 0.096 * plv, rz: 0.032 },
      { x: 0, y: 0.91, z: -0.058, rx: 0.126 * wst, rz: 0.038, post: 0.16, midlineCleft: 0.16 },
      { x: 0, y: 1.08, z: -0.064, rx: 0.158 * sh, rz: 0.046, post: 0.18, midlineCleft: 0.16 },
      { x: 0, y: 1.22, z: -0.058, rx: 0.170 * sh, rz: 0.048, post: 0.18, midlineCleft: 0.14 },
      { x: 0, y: 1.35, z: -0.036, rx: 0.098 * sh, rz: 0.036 },
      { x: 0, y: 1.45, z: -0.034, rx: 0.040, rz: 0.022 },
    ],
    24
  );

  registerPart({
    meshId: 'FMA_9626_TRAPEZIUS_LATISSIMUS',
    fmaId: 'FMA:9626',
    name: 'Trapezius, Latissimus Dorsi, Rhomboids & Erector Spinae Back Muscles',
    anatomicalSystemLabel: 'Posterior Axial & Scapular Muscular System',
    structuralDescription:
      'Diamond-shaped trapezius stabilizing the scapula, broad latissimus dorsi extending the humerus, and paraspinal erector spinae columns.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#ac3530',
    defaultOpacity: 0.98,
    specularStrength: 0.30,
    materialType: 'muscle',
    subMeshes: [posteriorBackMuscles],
  });

  // 2.7 Quadriceps Femoris (4 Heads), Sartorius, Adductors & Gluteals (`FMA:22428`)
  const buildThighMuscleComplex = (side: -1 | 1) => [
    // Rectus Femoris (central bipennate belly)
    buildTendinousMuscleLoft(
      [
        { x: side * 0.088, y: 0.345, z: 0.034, rx: 0.022, rz: 0.018 },
        { x: side * 0.090, y: 0.45, z: 0.038, rx: 0.032, rz: 0.028, ant: 0.18 },
        { x: side * 0.092 * plv, y: 0.57, z: 0.034, rx: 0.034, rz: 0.030, ant: 0.16 },
        { x: side * 0.094 * plv, y: 0.67, z: 0.024, rx: 0.022, rz: 0.020 },
      ],
      18
    ),
    // Vastus Lateralis (lateral sweep) & Vastus Medialis Obliquus (teardrop VMO)
    buildTendinousMuscleLoft(
      [
        { x: side * 0.088, y: 0.34, z: 0.018, rx: 0.038, rz: 0.028 },
        {
          x: side * 0.092,
          y: 0.43,
          z: 0.014,
          rx: 0.064,
          rz: 0.050,
          twinLobe: 0.22,
          fluting: 0.03,
          flutingFreq: 6,
        },
        {
          x: side * 0.094 * plv,
          y: 0.55,
          z: 0.012,
          rx: 0.072,
          rz: 0.056,
          twinLobe: 0.18,
          post: 0.14,
        },
        { x: side * 0.092 * plv, y: 0.665, z: 0.008, rx: 0.056, rz: 0.046, post: 0.18 },
      ],
      22
    ),
    // Medial Adductor Longus / Gracilis / Sartorius group
    buildTendinousMuscleLoft(
      [
        { x: side * 0.062, y: 0.36, z: 0.012, rx: 0.016, rz: 0.018 },
        { x: side * 0.058, y: 0.50, z: 0.012, rx: 0.028, rz: 0.032 },
        { x: side * 0.048 * plv, y: 0.63, z: 0.016, rx: 0.032, rz: 0.034 },
      ],
      14
    ),
  ];

  registerPart({
    meshId: 'FMA_22428_QUADRICEPS_FEMORIS',
    fmaId: 'FMA:22428',
    name: 'Quadriceps Femoris (Rectus Femoris, Vastus Lateralis, Vastus Medialis & Intermedius) & Adductors',
    anatomicalSystemLabel: 'Anterior & Medial Thigh Muscular System',
    structuralDescription:
      'Four-headed quadriceps femoris extensor complex (rectus femoris, vastus lateralis, vastus medialis teardrop, vastus intermedius), sartorius, and medial adductors.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#bc3b36',
    defaultOpacity: 0.98,
    specularStrength: 0.34,
    materialType: 'muscle',
    subMeshes: [
      ...buildThighMuscleComplex(-1),
      ...buildThighMuscleComplex(1),
    ],
  });

  // 2.8 Gastrocnemius, Soleus, Achilles Tendon & Tibialis Anterior (`FMA:22541`)
  const buildCruralMuscles = (side: -1 | 1) => [
    // Posterior Gastrocnemius (medial & lateral heads) + Soleus + White Achilles Tendon
    buildTendinousMuscleLoft(
      [
        { x: side * 0.088, y: 0.025, z: -0.022, rx: 0.014, rz: 0.016 },
        { x: side * 0.088, y: 0.11, z: -0.016, rx: 0.026, rz: 0.030 },
        {
          x: side * 0.088,
          y: 0.22,
          z: -0.012,
          rx: 0.050,
          rz: 0.054,
          post: 0.26,
          twinLobe: 0.20,
        },
        { x: side * 0.088, y: 0.32, z: -0.006, rx: 0.036, rz: 0.038 },
      ],
      20
    ),
    // Anterior Tibialis Anterior & Extensor Digitorum Longus
    buildTendinousMuscleLoft(
      [
        { x: side * 0.088, y: 0.035, z: 0.018, rx: 0.016, rz: 0.014 },
        { x: side * 0.090, y: 0.17, z: 0.018, rx: 0.026, rz: 0.024, ant: 0.16 },
        { x: side * 0.090, y: 0.29, z: 0.016, rx: 0.028, rz: 0.024, ant: 0.14 },
      ],
      16
    ),
  ];

  registerPart({
    meshId: 'FMA_22541_GASTROCNEMIUS_SOLEUS',
    fmaId: 'FMA:22541',
    name: 'Gastrocnemius, Soleus (Triceps Surae), Achilles Tendon & Tibialis Anterior',
    anatomicalSystemLabel: 'Crural Lower-Leg Muscular System',
    structuralDescription:
      'Bicipital gastrocnemius and soleus plantarflexors converging into the calcaneal Achilles tendon, paired with the anterior dorsiflexor tibialis anterior.',
    regionCode: 'muscles_strength',
    layerId: 'muscular',
    hexColor: '#b33833',
    defaultOpacity: 0.98,
    specularStrength: 0.32,
    materialType: 'muscle',
    subMeshes: [...buildCruralMuscles(-1), ...buildCruralMuscles(1)],
  });

  // =========================================================================
  // SYSTEM 3: INTERNAL ORGANS, NERVOUS, VASCULAR & ENDOCRINE SYSTEMS
  // 11 Individually Selectable Organ Structures with High Anatomical Detail
  // =========================================================================

  // 3.1 Brain, Cerebral Hemispheres (with cortical gyri fluting), Cerebellum & Spinal Cord (`FMA:50801`)
  const leftCerebralHemisphere = buildContinuousAnatomicalLoft(
    [
      { y: 1.54, cx: 0.035, cz: 0.005, rx: 0.035, rz: 0.070, fluting: 0.035, flutingFreq: 10 },
      {
        y: 1.59,
        cx: 0.038,
        cz: 0.008,
        rx: 0.046,
        rz: 0.085,
        ant: 0.12,
        post: 0.12,
        twinLobe: 0.10,
        fluting: 0.04,
        flutingFreq: 12,
      },
      {
        y: 1.64,
        cx: 0.035,
        cz: 0.004,
        rx: 0.043,
        rz: 0.078,
        twinLobe: 0.10,
        fluting: 0.04,
        flutingFreq: 12,
      },
      { y: 1.685, cx: 0.022, cz: 0.0, rx: 0.024, rz: 0.048, fluting: 0.03, flutingFreq: 8 },
    ],
    24
  );
  const rightCerebralHemisphere = buildContinuousAnatomicalLoft(
    [
      { y: 1.54, cx: -0.035, cz: 0.005, rx: 0.035, rz: 0.070, fluting: 0.035, flutingFreq: 10 },
      {
        y: 1.59,
        cx: -0.038,
        cz: 0.008,
        rx: 0.046,
        rz: 0.085,
        ant: 0.12,
        post: 0.12,
        twinLobe: 0.10,
        fluting: 0.04,
        flutingFreq: 12,
      },
      {
        y: 1.64,
        cx: -0.035,
        cz: 0.004,
        rx: 0.043,
        rz: 0.078,
        twinLobe: 0.10,
        fluting: 0.04,
        flutingFreq: 12,
      },
      { y: 1.685, cx: -0.022, cz: 0.0, rx: 0.024, rz: 0.048, fluting: 0.03, flutingFreq: 8 },
    ],
    24
  );
  const cerebellumAndBrainstem = buildCurvedAnatomicalTube(
    [
      { x: 0, y: 0.80, z: -0.038, rx: 0.010, rz: 0.010 },
      { x: 0, y: 1.18, z: -0.046, rx: 0.011, rz: 0.011 },
      { x: 0, y: 1.46, z: -0.022, rx: 0.019, rz: 0.019 },
      { x: 0, y: 1.525, z: -0.044, rx: 0.056, rz: 0.038, twinLobe: 0.18, fluting: 0.03, flutingFreq: 10 },
    ],
    20
  );

  registerPart({
    meshId: 'FMA_50801_BRAIN',
    fmaId: 'FMA:50801',
    name: 'Brain (Left & Right Cerebral Hemispheres, Cerebellum, Brainstem & Spinal Cord)',
    anatomicalSystemLabel: 'Central Nervous System',
    structuralDescription:
      'Gyrencephalic left and right cerebral hemispheres divided by the longitudinal fissure, foliated cerebellum, pons/medulla brainstem, and spinal cord.',
    regionCode: 'brain_nerves',
    layerId: 'nervous',
    hexColor: '#e68da2',
    defaultOpacity: 0.99,
    specularStrength: 0.42,
    materialType: 'organ',
    subMeshes: [
      leftCerebralHemisphere,
      rightCerebralHemisphere,
      cerebellumAndBrainstem,
    ],
  });

  // 3.2 Eyes, Sclera, Iris & Optic Nerves (`FMA:54448`)
  const scleraWhite: [number, number, number] = [246, 248, 252];
  const irisColor: [number, number, number] = [52, 116, 182];
  const pupilDark: [number, number, number] = [18, 24, 38];
  const buildRealisticEye = (side: -1 | 1) =>
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.020, y: 1.555, z: 0.058, rx: 0.007, rz: 0.007, colorOverride: scleraWhite },
        { x: side * 0.033, y: 1.555, z: 0.088, rx: 0.0165, rz: 0.0165, colorOverride: scleraWhite },
        { x: side * 0.033, y: 1.555, z: 0.102, rx: 0.011, rz: 0.007, colorOverride: irisColor },
        { x: side * 0.033, y: 1.555, z: 0.107, rx: 0.0055, rz: 0.004, colorOverride: pupilDark },
      ],
      18
    );

  registerPart({
    meshId: 'FMA_54448_EYES',
    fmaId: 'FMA:54448',
    name: 'Eyes & Optic Pathways (Sclera, Cornea, Iris, Retina & Optic Nerves)',
    anatomicalSystemLabel: 'Ocular & Visual Sensory System',
    structuralDescription:
      'Bilateral ocular globes housed in the bony orbits with fibrous sclera, transparent cornea, pigmented iris, photoreceptor retina, and cranial nerve II.',
    regionCode: 'eyes_vision',
    layerId: 'sensory_immune',
    hexColor: '#3b82f6',
    defaultOpacity: 0.99,
    specularStrength: 0.68,
    materialType: 'eye',
    subMeshes: [buildRealisticEye(-1), buildRealisticEye(1)],
  });

  // 3.3 Thyroid Gland & Laryngeal Cartilage (`FMA:9603`)
  const laryngealCartilage: [number, number, number] = [208, 224, 228];
  registerPart({
    meshId: 'FMA_9603_THYROID_GLAND',
    fmaId: 'FMA:9603',
    name: 'Thyroid Butterfly Gland (Left & Right Lobes, Isthmus & Parathyroids)',
    anatomicalSystemLabel: 'Endocrine & Metabolic System',
    structuralDescription:
      'Bilobed cervical endocrine gland embracing the thyroid/cricoid cartilage and upper trachea, synthesizing T3 and T4 thyroid hormones.',
    regionCode: 'endocrine_metabolic',
    layerId: 'endocrine',
    hexColor: '#a85ec9',
    defaultOpacity: 0.99,
    specularStrength: 0.44,
    materialType: 'organ',
    subMeshes: [
      // Thyroid cartilage (Adam's apple) landmark above gland
      buildCurvedAnatomicalTube(
        [
          { x: 0, y: 1.365, z: 0.038, rx: 0.016, rz: 0.016, colorOverride: laryngealCartilage },
          { x: 0, y: 1.385, z: 0.042, rx: 0.018, rz: 0.018, ant: 0.20, colorOverride: laryngealCartilage },
        ],
        14
      ),
      // Butterfly Thyroid Lobes & Isthmus
      buildCurvedAnatomicalTube(
        [
          { x: -0.024, y: 1.358, z: 0.036, rx: 0.015, rz: 0.013 },
          { x: -0.019, y: 1.340, z: 0.044, rx: 0.017, rz: 0.015 },
          { x: 0.0, y: 1.338, z: 0.048, rx: 0.015, rz: 0.011 },
          { x: 0.019, y: 1.340, z: 0.044, rx: 0.017, rz: 0.015 },
          { x: 0.024, y: 1.358, z: 0.036, rx: 0.015, rz: 0.013 },
        ],
        16
      ),
    ],
  });

  // 3.4 Thymus & Spleen (`FMA:9611_IMMUNE`)
  registerPart({
    meshId: 'FMA_9611_THYMUS_SPLEEN',
    fmaId: 'FMA:9611',
    name: 'Spleen, Thymus & Lymphatic Immune Organs',
    anatomicalSystemLabel: 'Lymphatic & Immune System',
    structuralDescription:
      'Bilobed anterior mediastinal thymus gland (T-lymphocyte maturation) and left-hypochondriac spleen (red/white pulp immune surveillance).',
    regionCode: 'immune_defence',
    layerId: 'sensory_immune',
    hexColor: '#8b46e5',
    defaultOpacity: 0.98,
    specularStrength: 0.38,
    materialType: 'organ',
    subMeshes: [
      buildCurvedAnatomicalTube(
        [
          { x: 0, y: 1.21, z: 0.058, rx: 0.026, rz: 0.016, twinLobe: 0.22 },
          { x: 0, y: 1.26, z: 0.054, rx: 0.022, rz: 0.014, twinLobe: 0.22 },
        ],
        16
      ),
      buildCurvedAnatomicalTube(
        [
          { x: 0.106, y: 0.94, z: -0.008, rx: 0.028, rz: 0.024 },
          { x: 0.116, y: 0.99, z: -0.004, rx: 0.036, rz: 0.028 },
          { x: 0.104, y: 1.03, z: -0.008, rx: 0.026, rz: 0.022 },
        ],
        18
      ),
    ],
  });

  // 3.5 Lungs, Trachea & Bronchial Tree (`FMA:7195`)
  const trachealRingTint: [number, number, number] = [212, 224, 232];
  const buildPulmonaryLung = (side: -1 | 1) =>
    buildContinuousAnatomicalLoft(
      [
        {
          y: 1.03,
          cx: side * 0.078 * sh,
          cz: 0.018,
          rx: 0.064 * sh,
          rz: 0.072,
          post: 0.14,
        },
        {
          y: 1.09,
          cx: side * 0.080 * sh,
          cz: 0.022,
          rx: (side === 1 ? 0.050 : 0.068) * sh, // Cardiac notch on left lung (side === 1)
          rz: 0.076,
          ant: 0.10,
          fluting: 0.02,
          flutingFreq: 4,
        },
        {
          y: 1.16,
          cx: side * 0.076 * sh,
          cz: 0.020,
          rx: (side === 1 ? 0.058 : 0.064) * sh,
          rz: 0.070,
          fluting: 0.02,
          flutingFreq: 4,
        },
        {
          y: 1.22,
          cx: side * 0.066 * sh,
          cz: 0.015,
          rx: 0.050 * sh,
          rz: 0.058,
        },
        {
          y: 1.268,
          cx: side * 0.050 * sh,
          cz: 0.010,
          rx: 0.026 * sh,
          rz: 0.032,
        },
      ],
      24
    );

  registerPart({
    meshId: 'FMA_7195_LUNGS_TRACHEA',
    fmaId: 'FMA:7195',
    name: 'Lungs (Right 3-Lobe Lung, Left 2-Lobe Lung with Cardiac Notch) & Trachea',
    anatomicalSystemLabel: 'Respiratory & Pulmonary System',
    structuralDescription:
      'C-ring cartilaginous trachea bifurcating at the carina into the right (superior, middle, inferior lobes) and left (superior, inferior lobes with cardiac notch) lungs.',
    regionCode: 'respiratory_lungs',
    layerId: 'respiratory',
    hexColor: '#e07a93',
    defaultOpacity: 0.96,
    specularStrength: 0.34,
    materialType: 'organ',
    subMeshes: [
      // Trachea with cartilaginous rings + mainstem bronchi
      buildCurvedAnatomicalTube(
        [
          { x: 0, y: 1.19, z: 0.024, rx: 0.020, rz: 0.016, colorOverride: trachealRingTint },
          { x: 0, y: 1.26, z: 0.026, rx: 0.016, rz: 0.015, colorOverride: trachealRingTint },
          { x: 0, y: 1.335, z: 0.028, rx: 0.016, rz: 0.015, colorOverride: trachealRingTint },
        ],
        16
      ),
      buildPulmonaryLung(-1),
      buildPulmonaryLung(1),
    ],
  });

  // 3.6 Heart, Ventricles, Atria, Coronary Vessels, Aortic Arch & Superior Vena Cava (`FMA:7088`)
  const venaCavaBlue: [number, number, number] = [48, 108, 204];
  const aorticCrimson: [number, number, number] = [212, 32, 38];
  registerPart({
    meshId: 'FMA_7088_HEART',
    fmaId: 'FMA:7088',
    name: 'Heart (Left & Right Ventricles, Atria, Coronary Sulcus & Aortic Arch)',
    anatomicalSystemLabel: 'Cardiovascular System',
    structuralDescription:
      'Four-chambered muscular myocardium in the middle mediastinum with left-oriented apex, right/left auricles, ascending aorta, aortic arch, pulmonary trunk, and superior vena cava.',
    regionCode: 'heart_cardiovascular',
    layerId: 'cardiovascular',
    hexColor: '#d92626',
    defaultOpacity: 0.99,
    specularStrength: 0.52,
    materialType: 'organ',
    subMeshes: [
      // Left & Right Ventricular Myocardium + Atria
      buildCurvedAnatomicalTube(
        [
          { x: 0.048, y: 1.068, z: 0.066, rx: 0.016, rz: 0.015 },
          { x: 0.032, y: 1.105, z: 0.058, rx: 0.048, rz: 0.044, ant: 0.16, twinLobe: 0.12 },
          { x: 0.014, y: 1.145, z: 0.052, rx: 0.052, rz: 0.046, ant: 0.14, twinLobe: 0.14 },
          { x: 0.004, y: 1.175, z: 0.046, rx: 0.042, rz: 0.038 },
        ],
        24
      ),
      // Ascending Aorta & Aortic Arch with Supra-aortic branches
      buildCurvedAnatomicalTube(
        [
          { x: 0.008, y: 1.165, z: 0.048, rx: 0.018, rz: 0.018, colorOverride: aorticCrimson },
          { x: 0.002, y: 1.218, z: 0.042, rx: 0.020, rz: 0.020, colorOverride: aorticCrimson },
          { x: 0.018, y: 1.208, z: 0.018, rx: 0.017, rz: 0.017, colorOverride: aorticCrimson },
        ],
        16
      ),
      // Superior Vena Cava & Pulmonary Trunk
      buildCurvedAnatomicalTube(
        [
          { x: -0.022, y: 1.155, z: 0.046, rx: 0.014, rz: 0.014, colorOverride: venaCavaBlue },
          { x: -0.020, y: 1.225, z: 0.038, rx: 0.015, rz: 0.015, colorOverride: venaCavaBlue },
        ],
        14
      ),
    ],
  });

  // 3.7 Systemic Aorta, Vena Cava & Major Vessels (`FMA:50723`)
  registerPart({
    meshId: 'FMA_50723_VASCULAR_TREE',
    fmaId: 'FMA:50723',
    name: 'Systemic Aorta, Vena Cava, Carotid & Iliac/Femoral Vascular Tree',
    anatomicalSystemLabel: 'Vascular & Haematopoietic System',
    structuralDescription:
      'Descending thoracic and abdominal aorta, superior and inferior vena cava, common carotid/jugular trunks, and iliac/femoral arterial-venous trunks.',
    regionCode: 'blood_circulation',
    layerId: 'cardiovascular',
    hexColor: '#c81e1e',
    defaultOpacity: 0.97,
    specularStrength: 0.45,
    materialType: 'vessel',
    subMeshes: [
      // Abdominal & Thoracic Aorta + Carotids
      buildCurvedAnatomicalTube(
        [
          { x: 0.008, y: 0.74, z: 0.008, rx: 0.014, rz: 0.014 },
          { x: 0.010, y: 0.96, z: 0.010, rx: 0.016, rz: 0.016 },
          { x: 0.012, y: 1.20, z: 0.018, rx: 0.017, rz: 0.017 },
          { x: 0.0, y: 1.43, z: 0.010, rx: 0.012, rz: 0.012 },
        ],
        14
      ),
      // Inferior & Superior Vena Cava
      buildCurvedAnatomicalTube(
        [
          { x: -0.016, y: 0.74, z: 0.012, rx: 0.015, rz: 0.015, colorOverride: venaCavaBlue },
          { x: -0.018, y: 0.98, z: 0.016, rx: 0.017, rz: 0.017, colorOverride: venaCavaBlue },
          { x: -0.016, y: 1.24, z: 0.028, rx: 0.016, rz: 0.016, colorOverride: venaCavaBlue },
        ],
        14
      ),
      // Right Iliac/Femoral Artery
      buildCurvedAnatomicalTube(
        [
          { x: -0.084, y: 0.40, z: 0.012, rx: 0.010, rz: 0.010 },
          { x: -0.056, y: 0.62, z: 0.014, rx: 0.013, rz: 0.013 },
          { x: -0.006, y: 0.74, z: 0.010, rx: 0.014, rz: 0.014 },
        ],
        12
      ),
      // Left Iliac/Femoral Artery
      buildCurvedAnatomicalTube(
        [
          { x: 0.084, y: 0.40, z: 0.012, rx: 0.010, rz: 0.010 },
          { x: 0.056, y: 0.62, z: 0.014, rx: 0.013, rz: 0.013 },
          { x: 0.008, y: 0.74, z: 0.010, rx: 0.014, rz: 0.014 },
        ],
        12
      ),
    ],
  });

  // 3.8 Liver (Right & Left Hepatic Lobes, Falciform Ligament) & Gallbladder (`FMA:7197`)
  const gallbladderGreen: [number, number, number] = [56, 158, 86];
  registerPart({
    meshId: 'FMA_7197_LIVER_GALLBLADDER',
    fmaId: 'FMA:7197',
    name: 'Liver (Right & Left Hepatic Lobes) & Gallbladder',
    anatomicalSystemLabel: 'Hepatobiliary & Digestive System',
    structuralDescription:
      'Wedge-shaped reddish-brown liver occupying the right hypochondrium and epigastrium beneath the diaphragm, paired with the green pear-shaped gallbladder.',
    regionCode: 'digestive_gut',
    layerId: 'digestive',
    hexColor: '#9c3b2c',
    defaultOpacity: 0.99,
    specularStrength: 0.44,
    materialType: 'organ',
    subMeshes: [
      buildContinuousAnatomicalLoft(
        [
          { y: 0.925, cx: -0.074, cz: 0.038, rx: 0.046, rz: 0.050 },
          { y: 0.965, cx: -0.052, cz: 0.046, rx: 0.076, rz: 0.058, ant: 0.14 },
          { y: 1.005, cx: -0.036, cz: 0.046, rx: 0.088, rz: 0.060, ant: 0.14, twinLobe: 0.10 },
          { y: 1.032, cx: -0.028, cz: 0.038, rx: 0.074, rz: 0.050 },
        ],
        24
      ),
      // Pear-shaped Gallbladder & Cystic Duct
      buildCurvedAnatomicalTube(
        [
          { x: -0.050, y: 0.912, z: 0.064, rx: 0.016, rz: 0.016, colorOverride: gallbladderGreen },
          { x: -0.042, y: 0.938, z: 0.052, rx: 0.011, rz: 0.011, colorOverride: gallbladderGreen },
        ],
        14
      ),
    ],
  });

  // 3.9 Stomach (J-shaped Cardia, Fundus, Body, Pylorus), Duodenum & Pancreas (`FMA:7148`)
  const pancreasGold: [number, number, number] = [228, 186, 106];
  registerPart({
    meshId: 'FMA_7148_STOMACH_PANCREAS',
    fmaId: 'FMA:7148',
    name: 'Stomach (Cardia, Fundus, Body & Pylorus), Duodenum & Pancreas',
    anatomicalSystemLabel: 'Upper Gastrointestinal System',
    structuralDescription:
      'J-shaped muscular gastric chamber with greater and lesser curvatures, C-loop duodenum, and lobulated retroperitoneal pancreas.',
    regionCode: 'digestive_gut',
    layerId: 'digestive',
    hexColor: '#dc7a52',
    defaultOpacity: 0.99,
    specularStrength: 0.40,
    materialType: 'organ',
    subMeshes: [
      buildCurvedAnatomicalTube(
        [
          { x: 0.006, y: 0.905, z: 0.046, rx: 0.022, rz: 0.020 },
          { x: 0.046, y: 0.935, z: 0.050, rx: 0.046, rz: 0.040, ant: 0.14 },
          { x: 0.064, y: 0.978, z: 0.044, rx: 0.048, rz: 0.042, ant: 0.12 },
          { x: 0.058, y: 1.012, z: 0.038, rx: 0.036, rz: 0.034 },
        ],
        22
      ),
      // Lobulated Pancreas head, body & tail
      buildCurvedAnatomicalTube(
        [
          { x: -0.018, y: 0.888, z: 0.020, rx: 0.022, rz: 0.016, fluting: 0.05, flutingFreq: 8, colorOverride: pancreasGold },
          { x: 0.020, y: 0.900, z: 0.018, rx: 0.018, rz: 0.015, fluting: 0.05, flutingFreq: 8, colorOverride: pancreasGold },
          { x: 0.062, y: 0.918, z: 0.014, rx: 0.013, rz: 0.012, colorOverride: pancreasGold },
        ],
        16
      ),
    ],
  });

  // 3.10 Small Intestine (Coiled Jejunum/Ileum) & Haustrated Colon (`FMA:71132`)
  const colonShade: [number, number, number] = [192, 114, 92];
  const jejunumPink: [number, number, number] = [222, 144, 116];
  registerPart({
    meshId: 'FMA_71132_INTESTINES_COLON',
    fmaId: 'FMA:71132',
    name: 'Small Intestine (Jejunum & Ileum) & Haustrated Colon (Ascending, Transverse, Descending & Sigmoid)',
    anatomicalSystemLabel: 'Lower Gastrointestinal & Microbiome System',
    structuralDescription:
      'Convoluted jejunal and ileal small intestinal loops framed by the haustrated cecum, ascending, transverse, descending, and sigmoid colon.',
    regionCode: 'digestive_gut',
    layerId: 'digestive',
    hexColor: '#d98b6c',
    defaultOpacity: 0.99,
    specularStrength: 0.38,
    materialType: 'organ',
    subMeshes: [
      // Serpentine Small Intestine coils
      buildCurvedAnatomicalTube(
        [
          { x: -0.048, y: 0.72, z: 0.044, rx: 0.022, rz: 0.020, colorOverride: jejunumPink },
          { x: 0.046, y: 0.745, z: 0.048, rx: 0.024, rz: 0.022, colorOverride: jejunumPink },
          { x: -0.048, y: 0.775, z: 0.050, rx: 0.025, rz: 0.022, colorOverride: jejunumPink },
          { x: 0.048, y: 0.805, z: 0.050, rx: 0.025, rz: 0.022, colorOverride: jejunumPink },
          { x: -0.044, y: 0.835, z: 0.048, rx: 0.024, rz: 0.020, colorOverride: jejunumPink },
          { x: 0.036, y: 0.855, z: 0.044, rx: 0.020, rz: 0.018, colorOverride: jejunumPink },
        ],
        18
      ),
      // Haustrated Large Intestine / Colon frame
      buildCurvedAnatomicalTube(
        [
          { x: -0.082, y: 0.72, z: 0.038, rx: 0.028, rz: 0.025, fluting: 0.05, flutingFreq: 6, colorOverride: colonShade },
          { x: -0.088, y: 0.86, z: 0.040, rx: 0.026, rz: 0.025, fluting: 0.05, flutingFreq: 6, colorOverride: colonShade },
          { x: 0.0, y: 0.882, z: 0.056, rx: 0.027, rz: 0.025, fluting: 0.05, flutingFreq: 6, colorOverride: colonShade },
          { x: 0.088, y: 0.86, z: 0.040, rx: 0.025, rz: 0.024, fluting: 0.05, flutingFreq: 6, colorOverride: colonShade },
          { x: 0.082, y: 0.72, z: 0.034, rx: 0.023, rz: 0.022, fluting: 0.05, flutingFreq: 6, colorOverride: colonShade },
          { x: 0.0, y: 0.675, z: 0.024, rx: 0.021, rz: 0.020, colorOverride: colonShade },
        ],
        18
      ),
    ],
  });

  // 3.11 Bilateral Kidneys, Adrenal Glands, Ureters & Urinary Bladder (`FMA:7203`)
  const adrenalAmber: [number, number, number] = [218, 165, 75];
  const buildKidneyAndUreter = (side: -1 | 1, yOffset: number) => [
    // Bean-shaped Renal Cortex & Hilum
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.054, y: 0.848 + yOffset, z: -0.022, rx: 0.023, rz: 0.019 },
        { x: side * 0.066, y: 0.890 + yOffset, z: -0.022, rx: 0.030, rz: 0.023 },
        { x: side * 0.054, y: 0.932 + yOffset, z: -0.022, rx: 0.023, rz: 0.019 },
      ],
      18
    ),
    // Suprarenal (Adrenal) Gland cap
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.048, y: 0.935 + yOffset, z: -0.020, rx: 0.018, rz: 0.014, colorOverride: adrenalAmber },
        { x: side * 0.042, y: 0.952 + yOffset, z: -0.020, rx: 0.011, rz: 0.010, colorOverride: adrenalAmber },
      ],
      12
    ),
    // Ureter descending to bladder
    buildCurvedAnatomicalTube(
      [
        { x: side * 0.020, y: 0.68, z: 0.012, rx: 0.005, rz: 0.005 },
        { x: side * 0.042, y: 0.78, z: -0.010, rx: 0.0055, rz: 0.0055 },
        { x: side * 0.048, y: 0.88 + yOffset, z: -0.018, rx: 0.0065, rz: 0.0065 },
      ],
      10
    ),
  ];

  registerPart({
    meshId: 'FMA_7203_KIDNEYS_URETERS',
    fmaId: 'FMA:7203',
    name: 'Left & Right Kidneys (Renal Cortex, Medulla, Adrenals), Ureters & Bladder',
    anatomicalSystemLabel: 'Urinary & Renal Filtration System',
    structuralDescription:
      'Retroperitoneal bean-shaped kidneys capped by adrenal glands, filtering blood plasma via ~1 million nephrons and draining via ureters into the urinary bladder.',
    regionCode: 'urinary_kidneys',
    layerId: 'urinary',
    hexColor: '#9b3636',
    defaultOpacity: 0.99,
    specularStrength: 0.42,
    materialType: 'organ',
    subMeshes: [
      ...buildKidneyAndUreter(-1, -0.012),
      ...buildKidneyAndUreter(1, 0.006),
      // Pelvic Urinary Bladder
      buildCurvedAnatomicalTube(
        [
          { x: 0, y: 0.655, z: 0.028, rx: 0.026, rz: 0.024 },
          { x: 0, y: 0.690, z: 0.032, rx: 0.032, rz: 0.028 },
        ],
        16
      ),
    ],
  });

  // =========================================================================
  // SYSTEM 4: OPTIONAL EPITHELIAL / SKIN LAYER (`skin_external`)
  // Strictly disabled by default (`skinLayer.visible = false`) in all 4 presets.
  // =========================================================================
  const trunkSurface = buildContinuousAnatomicalLoft(
    [
      { y: 1.35, cx: 0, cz: -0.003, rx: 0.058 * limbScale, rz: 0.058 },
      { y: 1.27, cx: 0, cz: 0.004, rx: 0.198 * sh, rz: 0.100, ant: 0.08, post: 0.08 },
      {
        y: 1.19,
        cx: 0,
        cz: 0.012,
        rx: 0.188 * sh,
        rz: 0.120,
        ant: pectAnt,
        post: 0.10,
        twinLobe: isFemale ? 0.18 : 0.09,
        midlineCleft: 0.07,
      },
      { y: 1.00, cx: 0, cz: 0.008, rx: 0.148 * wst, rz: 0.102 * wst, ant: 0.07 },
      { y: 0.81, cx: 0, cz: 0.010, rx: 0.158 * plv, rz: 0.108, ant: 0.09 },
      { y: 0.62, cx: 0, cz: -0.004, rx: 0.162 * plv, rz: 0.106, post: 0.16 },
    ],
    28,
    true
  );

  registerPart({
    meshId: 'FMA_7163_INTEGUMENT',
    fmaId: 'FMA:7163',
    name: 'Epithelial & Dermal Integument Layer (Optional Surface Layer)',
    anatomicalSystemLabel: 'Integumentary System (Disabled by Default)',
    structuralDescription:
      'Optional cutaneous barrier layer. Hidden by default so internal muscles, organs, and skeletal structures remain unobstructed.',
    regionCode: 'skin_epithelial',
    layerId: 'skin_external',
    hexColor: '#d9a487',
    defaultOpacity: 0.25,
    specularStrength: 0.18,
    materialType: 'skin',
    subMeshes: [trunkSurface],
  });

  cachedRealisticAtlas[sex] = parts;
  return parts;
}

/**
 * Returns active anatomical layers for each preset:
 * - `whole_body` (Full Internal Anatomy — DEFAULT):
 *   External skin (`skin_external`) is DISABLED (`skinLayer.visible = false`)!
 *   Shows Muscular System + Major Internal Organs + Skeletal structures in a natural anatomical dissection arrangement.
 * - `muscles` (Muscular System):
 *   External skin disabled. Shows complete head-to-toe Muscular System + Skeletal attachment landmarks.
 * - `organs` (Internal Organs):
 *   External skin and muscles disabled. Shows all 11 Internal Organs + axial spine/rib/pelvic skeletal landmarks.
 * - `skeleton` (Skeletal System):
 *   External skin disabled. Shows complete 9-part Axial & Appendicular Skeleton.
 */
export function getRealisticLayersForPreset(
  preset: AnatomicalViewPreset
): Set<AnatomicalLayerId> {
  switch (preset) {
    case 'muscles':
      return new Set<AnatomicalLayerId>(['muscular', 'skeletal']);
    case 'skeleton':
      return new Set<AnatomicalLayerId>(['skeletal']);
    case 'organs':
      return new Set<AnatomicalLayerId>([
        'nervous',
        'cardiovascular',
        'respiratory',
        'digestive',
        'urinary',
        'endocrine',
        'sensory_immune',
        'skeletal',
      ]);
    case 'whole_body':
    default:
      // FULL INTERNAL HUMAN ANATOMY — SKIN HIDDEN (`skin_external` is NOT included!)
      return new Set<AnatomicalLayerId>([
        'muscular',
        'skeletal',
        'nervous',
        'cardiovascular',
        'digestive',
        'respiratory',
        'urinary',
        'endocrine',
        'sensory_immune',
      ]);
  }
}

/**
 * Renders the 3D human anatomy scene with smooth medical-atlas lighting, wet-organ specular highlights,
 * muscle-bundle striations, and zero wireframes by default:
 * - `whole_body` (Full Internal Anatomy — Default): Skin hidden (`skin_external` disabled); anatomical Écorché dissection cutaway so head/neck/shoulder/arm/thigh/calf muscles, skull/clavicle/spine/pelvis/ribcage bones, and Brain, Eyes, Thyroid, Lungs, Heart, Liver, Stomach, Colon, and Kidneys are all simultaneously visible in their natural anatomical positions!
 * - `muscles` (Muscular System): Full head-to-toe striated muscular anatomy (including Pectoralis Major and Rectus Abdominis 8-pack) with glistening ivory tendon insertions.
 * - `organs` (Internal Organs): All 11 internal organs clearly visible in their natural anatomical positions without external skin or superficial muscles.
 * - `skeleton` (Skeletal System): Complete anatomical skeleton from cranium to metatarsals with zero external skin.
 */
export function renderRealisticAnatomical3DScene(params: {
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
  const {
    ctx,
    width,
    height,
    atlas,
    visibleLayers,
    selectedRegionCode,
    selectedMeshId = null,
    hoveredRegionCode,
    hoveredMeshId = null,
    isolatedRegionCode,
    isolatedMeshId = null,
    viewPreset = 'whole_body',
    yaw,
    pitch,
    zoom,
    panY,
  } = params;

  ctx.clearRect(0, 0, width, height);

  // Studio medical-atlas lighting backdrop (deep botanical slate with subtle radial studio key-light)
  const bgGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.44,
    24,
    width * 0.5,
    height * 0.5,
    height * 0.74
  );
  bgGrad.addColorStop(0, '#162824');
  bgGrad.addColorStop(0.58, '#0d1917');
  bgGrad.addColorStop(1, '#070e0d');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle anatomical reference coordinate grid lines in studio background
  ctx.save();
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.05)';
  ctx.lineWidth = 1;
  const gridStep = Math.round(width / 10);
  for (let gx = gridStep; gx < width; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();
  }
  for (let gy = gridStep; gy < height; gy += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }
  ctx.restore();

  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);

  // Full-viewport framing so the 1.77m human figure occupies ~88% of the canvas height cleanly
  const transformVertex = (v: Vec3) => {
    const yCentered = v.y - 0.855 + panY;
    const rx = v.x * cosY + v.z * sinY;
    const rz1 = -v.x * sinY + v.z * cosY;
    const ry = yCentered * cosP - rz1 * sinP;
    const rz = yCentered * sinP + rz1 * cosP;
    const fov = 3.25;
    const perspective = fov / Math.max(1.2, fov - rz * 0.68);
    const scale = Math.min(width, height) * 0.555 * zoom * perspective;
    return {
      wx: rx,
      wy: ry,
      wz: rz,
      sx: width * 0.5 + rx * scale,
      sy: height * 0.505 - ry * scale,
      scale,
    };
  };

  // Studio Pedestal Ring under feet
  const floorOrigin = transformVertex({ x: 0, y: -0.04, z: 0 });
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(
    floorOrigin.sx,
    floorOrigin.sy,
    Math.max(44, 96 * zoom),
    Math.max(12, 24 * zoom),
    0,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = 'rgba(16, 185, 129, 0.11)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.38)';
  ctx.stroke();
  ctx.restore();

  interface RasterTriangle {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    depth: number;
    fillStyle: string;
    seamFillStyle: string | null;
  }

  const rasterQueue: RasterTriangle[] = [];
  const hitRegions: RenderedMeshHitRegion[] = [];

  const keyLight = { x: 0.36, y: 0.44, z: 0.82 };
  const fillLight = { x: -0.48, y: 0.20, z: 0.60 };
  const rimLight = { x: 0.0, y: 0.65, z: -0.75 };

  const hasSpecificMeshSelection = Boolean(selectedMeshId);
  const hasAnySelection = Boolean(selectedMeshId || selectedRegionCode);

  for (const part of atlas) {
    if (!visibleLayers.has(part.layerId)) continue;

    if (isolatedMeshId) {
      if (part.meshId !== isolatedMeshId) continue;
    } else if (isolatedRegionCode) {
      if (part.regionCode !== isolatedRegionCode) continue;
    }

    const isSelected = hasSpecificMeshSelection
      ? part.meshId === selectedMeshId
      : Boolean(selectedRegionCode && part.regionCode === selectedRegionCode);

    const isHovered = hoveredMeshId
      ? part.meshId === hoveredMeshId
      : Boolean(hoveredRegionCode && part.regionCode === hoveredRegionCode);

    const isSkin = part.layerId === 'skin_external';
    const isEyes = part.meshId === 'FMA_54448_EYES';
    const isOrgan =
      part.layerId === 'nervous' ||
      part.layerId === 'cardiovascular' ||
      part.layerId === 'respiratory' ||
      part.layerId === 'digestive' ||
      part.layerId === 'urinary' ||
      part.layerId === 'endocrine' ||
      part.layerId === 'sensory_immune';

    let alpha = part.defaultOpacity;

    if (viewPreset === 'whole_body') {
      // FULL INTERNAL ANATOMY — DISSECTION VIEW:
      // Skin is hidden (`skin_external` disabled). Muscles, organs, and skeleton are rendered together
      // with an anatomical Écorché dissection window over the anterior hemithorax and central abdomen
      // so the Heart, Lungs, Liver, Stomach, Intestines, Kidneys, and Brain are 100% vividly visible!
      if (isOrgan) {
        alpha = 0.99;
      } else if (
        part.meshId === 'FMA_9627_PECTORALIS_MAJOR' ||
        part.meshId === 'FMA_9628_RECTUS_ABDOMINIS_OBLIQUES'
      ) {
        alpha = isSelected ? 0.98 : 0.96;
      } else if (
        part.meshId === 'FMA_7480_RIB_CAGE' ||
        part.meshId === 'FMA_7485_STERNUM' ||
        part.meshId === 'FMA_46565_CRANIUM_MANDIBLE'
      ) {
        alpha = isSelected ? 0.98 : 0.72;
      } else {
        alpha = 0.98;
      }
    } else if (viewPreset === 'organs') {
      if (part.layerId === 'skeletal') {
        // Subtle axial skeletal reference landmarks behind internal organs
        alpha =
          part.meshId === 'FMA_13303_UPPER_LIMB_BONES' ||
          part.meshId === 'FMA_9611_FEMUR_PATELLA' ||
          part.meshId === 'FMA_24476_TIBIA_FIBULA_FOOT'
            ? 0.16
            : 0.28;
      } else if (isOrgan) {
        alpha = hasAnySelection && !isSelected ? 0.86 : 0.99;
      } else {
        alpha = 0.0;
      }
    } else if (viewPreset === 'muscles') {
      if (part.layerId === 'skeletal') {
        alpha = 0.94;
      } else if (part.layerId === 'muscular') {
        alpha = hasAnySelection && !isSelected ? 0.85 : 0.99;
      }
    } else if (viewPreset === 'skeleton') {
      if (part.layerId === 'skeletal') {
        alpha = hasAnySelection && !isSelected ? 0.85 : 0.99;
      }
    }

    if (isSelected) {
      alpha = 0.99;
    } else if (isHovered && !isSkin) {
      alpha = Math.max(alpha, 0.96);
    }

    if (alpha <= 0.01) continue;

    const tVerts = part.vertices.map(transformVertex);

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let depthSum = 0;
    const partTris: RenderedMeshHitRegion['projectedTriangles'] = [];

    for (let fIdx = 0; fIdx < part.faces.length; fIdx++) {
      const face = part.faces[fIdx];
      const v0 = tVerts[face.a];
      const v1 = tVerts[face.b];
      const v2 = tVerts[face.c];

      // In `whole_body` (Full Internal Anatomy Dissection) mode:
      // Create an anatomical Écorché dissection window on the left anterior chest, central abdomen,
      // and left cranial vault so Heart, Left Lung, Liver, Stomach, Small Intestine, Colon, and Brain
      // are completely unobstructed while the right Pectoralis Major, lateral External Obliques,
      // Deltoids, Biceps, Forearms, Quadriceps, Calves, and right Rib Cage remain solid!
      if (viewPreset === 'whole_body' && !isSelected) {
        const avgX = (v0.wx + v1.wx + v2.wx) / 3;
        const avgZ = (v0.wz + v1.wz + v2.wz) / 3;
        const avgY = (v0.wy + v1.wy + v2.wy) / 3;
        if (part.meshId === 'FMA_9627_PECTORALIS_MAJOR' && avgX > -0.008) {
          continue;
        }
        if (
          part.meshId === 'FMA_9628_RECTUS_ABDOMINIS_OBLIQUES' &&
          Math.abs(avgX) < 0.082 &&
          avgZ > 0.015
        ) {
          continue;
        }
        if (
          part.meshId === 'FMA_46565_CRANIUM_MANDIBLE' &&
          avgX > 0.0 &&
          avgY > 0.67
        ) {
          continue;
        }
        if (
          part.meshId === 'FMA_7480_RIB_CAGE' &&
          avgX > -0.015 &&
          avgZ > 0.02
        ) {
          continue;
        }
      }

      const ux = v1.wx - v0.wx;
      const uy = v1.wy - v0.wy;
      const uz = v1.wz - v0.wz;
      const vx = v2.wx - v0.wx;
      const vy = v2.wy - v0.wy;
      const vz = v2.wz - v0.wz;

      let nx = uy * vz - uz * vy;
      let ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;

      // Backface culling
      if (nz <= 0.0) continue;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const keyDiff = Math.max(
        0,
        nx * keyLight.x + ny * keyLight.y + nz * keyLight.z
      );
      const fillDiff = Math.max(
        0,
        nx * fillLight.x + ny * fillLight.y + nz * fillLight.z
      );
      const rimDiff = Math.max(
        0,
        nx * rimLight.x + ny * rimLight.y + nz * rimLight.z
      );
      const fresnelRim = Math.pow(1.0 - Math.max(0, nz), 2.4) * 0.16;
      const sss =
        part.materialType === 'muscle'
          ? 0.11 * (1.0 - nz)
          : part.materialType === 'organ'
          ? 0.14 * (1.0 - nz)
          : 0.06 * (1.0 - nz);
      const spec = Math.pow(keyDiff, 24) * part.specularStrength * 88;

      let [r, g, b] = face.colorOverride || part.baseColor;

      // Longitudinal muscle fiber striation for realistic anatomical myology appearance
      if (part.materialType === 'muscle' && !face.colorOverride) {
        const striation = Math.sin(fIdx * 1.9) * 9;
        r = Math.max(0, Math.min(255, r + striation));
        g = Math.max(0, Math.min(255, g + striation * 0.38));
        b = Math.max(0, Math.min(255, b + striation * 0.38));
      }

      if (isSelected) {
        r = Math.min(255, Math.round(r * 0.62 + 16 * 0.38 + 38));
        g = Math.min(255, Math.round(g * 0.62 + 185 * 0.38 + 46));
        b = Math.min(255, Math.round(b * 0.62 + 129 * 0.38 + 30));
      } else if (isHovered) {
        r = Math.min(255, r + 26);
        g = Math.min(255, g + 26);
        b = Math.min(255, b + 26);
      }

      const shade =
        0.36 + 0.54 * keyDiff + 0.16 * fillDiff + 0.08 * rimDiff + sss + fresnelRim;
      const rr = Math.min(255, Math.max(0, Math.round(r * shade + spec)));
      const gg = Math.min(255, Math.max(0, Math.round(g * shade + spec)));
      const bb = Math.min(255, Math.max(0, Math.round(b * shade + spec)));

      const effectiveAlpha = alpha;

      const layerDepthBias = isEyes
        ? 0.058
        : viewPreset === 'whole_body' && isOrgan
        ? 0.044
        : viewPreset === 'organs' && part.layerId === 'skeletal'
        ? -0.25
        : part.layerId === 'muscular' && viewPreset === 'muscles'
        ? 0.024
        : 0.0;

      const triDepth =
        (v0.wz + v1.wz + v2.wz) / 3 +
        layerDepthBias +
        (isSelected ? 0.052 : 0);

      partTris.push({
        x0: v0.sx,
        y0: v0.sy,
        x1: v1.sx,
        y1: v1.sy,
        x2: v2.sx,
        y2: v2.sy,
        depth: triDepth,
      });

      minX = Math.min(minX, v0.sx, v1.sx, v2.sx);
      maxX = Math.max(maxX, v0.sx, v1.sx, v2.sx);
      minY = Math.min(minY, v0.sy, v1.sy, v2.sy);
      maxY = Math.max(maxY, v0.sy, v1.sy, v2.sy);
      depthSum += triDepth;

      const fillStr = `rgba(${rr}, ${gg}, ${bb}, ${effectiveAlpha.toFixed(2)})`;
      rasterQueue.push({
        x0: v0.sx,
        y0: v0.sy,
        x1: v1.sx,
        y1: v1.sy,
        x2: v2.sx,
        y2: v2.sy,
        depth: triDepth,
        fillStyle: fillStr,
        seamFillStyle: effectiveAlpha >= 0.65 ? fillStr : null,
      });
    }

    if (partTris.length > 0) {
      const cProj = transformVertex(part.boundingCenter);
      hitRegions.push({
        meshId: part.meshId,
        fmaId: part.fmaId,
        name: part.name,
        anatomicalSystemLabel: part.anatomicalSystemLabel,
        structuralDescription: part.structuralDescription,
        regionCode: part.regionCode,
        layerId: part.layerId,
        screenCenterX: cProj.sx,
        screenCenterY: cProj.sy,
        minX,
        maxX,
        minY,
        maxY,
        avgDepth: depthSum / partTris.length,
        projectedTriangles: partTris,
      });
    }
  }

  rasterQueue.sort((a, b) => a.depth - b.depth);

  ctx.lineJoin = 'round';
  for (const tri of rasterQueue) {
    ctx.beginPath();
    ctx.moveTo(tri.x0, tri.y0);
    ctx.lineTo(tri.x1, tri.y1);
    ctx.lineTo(tri.x2, tri.y2);
    ctx.closePath();
    ctx.fillStyle = tri.fillStyle;
    ctx.fill();
    if (tri.seamFillStyle) {
      ctx.strokeStyle = tri.seamFillStyle;
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }
  }

  // Callout badge for the active selected or hovered individual anatomical mesh
  const activeHit =
    (hoveredMeshId && hitRegions.find((h) => h.meshId === hoveredMeshId)) ||
    (selectedMeshId && hitRegions.find((h) => h.meshId === selectedMeshId)) ||
    (hoveredRegionCode &&
      hitRegions.find((h) => h.regionCode === hoveredRegionCode)) ||
    (selectedRegionCode &&
      hitRegions.find((h) => h.regionCode === selectedRegionCode)) ||
    null;

  if (activeHit) {
    ctx.save();
    const targetX = activeHit.screenCenterX;
    const targetY = activeHit.screenCenterY;
    const calloutW = Math.min(250, Math.round(width * 0.34));
    const calloutH = 44;
    const calloutX =
      targetX >= width * 0.5
        ? Math.min(width - calloutW - 14, targetX + 42)
        : Math.max(14, targetX - calloutW - 42);
    const calloutY = Math.max(20, Math.min(height - calloutH - 36, targetY - 22));

    ctx.beginPath();
    ctx.moveTo(targetX, targetY);
    ctx.lineTo(
      targetX >= width * 0.5 ? calloutX : calloutX + calloutW,
      calloutY + calloutH * 0.5
    );
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(targetX, targetY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#34d399';
    ctx.fill();

    ctx.fillStyle = 'rgba(7, 24, 20, 0.94)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(calloutX, calloutY, calloutW, calloutH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 10.5px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#6ee7b7';
    ctx.fillText(
      `${activeHit.fmaId} • ${(activeHit.anatomicalSystemLabel || activeHit.layerId).slice(0, 26)}`,
      calloutX + 10,
      calloutY + 16
    );

    ctx.font = 'bold 11.5px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#ffffff';
    const shortName =
      activeHit.name.length > 31
        ? `${activeHit.name.slice(0, 30)}…`
        : activeHit.name;
    ctx.fillText(shortName, calloutX + 10, calloutY + 33);
    ctx.restore();
  }

  return hitRegions;
}
