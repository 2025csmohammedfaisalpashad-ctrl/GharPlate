# 3D Anatomy Asset Licensing & Attribution (`ANATOMY_ASSET_ATTRIBUTION.md`)

## 1. Overview

GharPlate's **3D Human Body & Nutrition Explorer** (`/explore/body-nutrition`) uses self-hosted 3D anatomical meshes and Foundational Model of Anatomy (FMA) ontology mappings inspired by open-licensed anatomical reference projects. All assets and code included in GharPlate are open-source and free for educational and commercial software distribution with attribution.

---

## 2. Upstream Reference Projects & Licenses

### 2.1 BodyParts3D / Anatomography (Database Center for Life Science — DBCLS, Japan)
- **Source**: [BodyParts3D 4.0 / Anatomography](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)
- **Copyright Holder**: Database Center for Life Science (DBCLS), Research Organization of Information and Systems (ROIS), Japan.
- **License**: **Creative Commons Attribution 4.0 International (CC BY 4.0)** / **CC BY-SA 2.1 JP**
- **Citation**:
  > Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. *BodyParts3D: 3D structure database for anatomical concepts.* Nucleic Acids Research. 2009;37(Database issue):D782–D785. doi:10.1093/nar/gkn613.

### 2.2 Human Atlas (`ashemag/human-atlas`)
- **Repository**: [https://github.com/ashemag/human-atlas](https://github.com/ashemag/human-atlas)
- **Code License**: **MIT License**
- **Anatomy Data License**: **CC BY 4.0** (BodyParts3D 4.0 FMA-indexed meshes)
- **Usage in GharPlate**: Architectural reference for FMA ontology identifiers (`FMA:50801`, `FMA:54448`, `FMA:7088`, `FMA:7195`, `FMA:23881`, `FMA:30316`, `FMA:7148`, `FMA:7197`, `FMA:7203`, `FMA:9603`, `FMA:9670`, `FMA:7163`, `FMA:9673`), system-level grouping, directional + hemisphere shading, and raycast picking.

### 2.3 LearnAnatomy3D / Z-Anatomy
- **Website**: [https://learnanatomy3d.com/](https://learnanatomy3d.com/) • [https://www.z-anatomy.com/](https://www.z-anatomy.com/)
- **License**: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**
- **Usage in GharPlate**: UX reference for multi-layer system presets (`Whole Body`, `Internal Organs`, `Muscles`, `Skeleton`), layer visibility toggles, and structure isolation.

---

## 3. Local Manifest & Self-Hosted Mesh Generator

- **Local Reference Manifest**: `frontend/public/models/bodyparts3d_reference_manifest.json`
- **Local 3D Triangle-Mesh Generator & Raycaster**: `frontend/src/utils/anatomicalModel3D.ts`
- **In-App Attribution**: Displayed at the bottom of the 3D Human Body & Nutrition Explorer page (`/explore/body-nutrition`) and returned in the `asset_attribution` object of `GET /api/v1/explore/body-nutrition`.
