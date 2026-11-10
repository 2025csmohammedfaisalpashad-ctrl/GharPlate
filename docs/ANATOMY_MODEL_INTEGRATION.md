# GharPlate — 3D Internal Human Anatomy Model Integration

## 1. Root-Cause Audit & External Skin Removal (`skinLayer.visible = false`)

1. **Why the previous default view showed a skin-covered mannequin**:
   - Previously, `getRealisticLayersForPreset('whole_body')` included `'skin_external'` in the default active layer set (`visibleLayers`), and `renderRealisticAnatomical3DScene` rendered `FMA_7163_INTEGUMENT` over the internal anatomy.
2. **Correction Implemented**:
   - Removed `'skin_external'` from `getRealisticLayersForPreset('whole_body')` in [realisticHumanAnatomy3D.ts](../frontend/src/utils/realisticHumanAnatomy3D.ts) so `skinLayer.visible === false` (`!visibleLayers.has('skin_external')`) by default.
   - Renamed the default preset to **`Full Internal Anatomy`** (`whole_body`, with a `Default` badge `data-testid="anatomy-default-preset-badge"`) in [BodyNutritionExplorerPage.tsx](../frontend/src/pages/BodyNutritionExplorerPage.tsx).
   - Implemented an anatomical dissection cutaway window in `Full Internal Anatomy` mode: the left Pectoralis Major (`x > 0.015`) and central Rectus Abdominis (`|x| < 0.088`) are dissected open so the Heart (`FMA:7088`), Lungs (`FMA:7195`), Liver (`FMA:7197`), Stomach (`FMA:7148`), Small Intestine & Colon (`FMA:71132`), Kidneys (`FMA:7203`), Brain (`FMA:50801`), and Eyes (`FMA:54448`) are clearly visible in their natural internal anatomical positions alongside the right Pectoralis Major, lateral External Obliques, Deltoids, Biceps, Forearms, Quadriceps, Calves, and skeletal structures.

## 2. Self-Hosted Multi-System 3D Anatomy Bundle

- **Asset Path**: `frontend/public/models/human_anatomy_atlas.json` (served at `/models/human_anatomy_atlas.json` and bundled in `dist/models/human_anatomy_atlas.json`).
- **Engine & Loader**: [realisticHumanAnatomy3D.ts](../frontend/src/utils/realisticHumanAnatomy3D.ts), [anatomicalModel3D.ts](../frontend/src/utils/anatomicalModel3D.ts), and [BodyNutritionExplorerPage.tsx](../frontend/src/pages/BodyNutritionExplorerPage.tsx).
- **Coverage**:
  - **2 Reference Bodies**: Adult Male (`BodyParts3D 4.0 / DBCLS`, CC BY 4.0) and Adult Female (`HuBMAP Human Reference Atlas v1.10 / Visible Human Project`, CC BY 4.0), switchable via `data-testid="anatomy-sex-male"` and `data-testid="anatomy-sex-female"`.
  - **29 Individually Selectable 3D Structures (8,280 Triangles per body)** across 10 anatomical layers:
    - **Skeletal System (`skeletal`, 9 structures)**: `FMA:46565` Skull (Cranium, Zygomatic Arch, Maxilla & Mandible), `FMA:7157` Vertebral Column & Sacrum, `FMA:7485` Sternum, `FMA:7480` Thoracic Rib Cage & Costal Cartilage, `FMA:13321` Clavicles & Scapulae, `FMA:13303` Upper Limb Skeleton (Humerus, Radius, Ulna, Carpals & Metacarpals), `FMA:16585` Pelvic Girdle, `FMA:9611` Femur & Patella, `FMA:24476` Tibia, Fibula & Foot Skeleton.
    - **Muscular System (`muscular`, 8 structures)**: `FMA:13315` Temporalis, Masseter & Sternocleidomastoid, `FMA:9627` Pectoralis Major, `FMA:32521` Deltoid Muscles, `FMA:37670` Biceps Brachii, Triceps & Forearm Flexors, `FMA:9628` Rectus Abdominis (with Tendinous Inscriptions) & External Obliques, `FMA:9626` Trapezius & Latissimus Dorsi, `FMA:22428` Quadriceps Femoris, `FMA:22541` Gastrocnemius, Soleus & Achilles Tendon.
    - **Internal Organs (`nervous`, `sensory_immune`, `endocrine`, `respiratory`, `cardiovascular`, `digestive`, `urinary`, 11 structures)**: `FMA:50801` Brain, Cerebellum & Spinal Cord, `FMA:54448` Eyes (Sclera, Iris, Pupil, Retina & Optic Nerves), `FMA:9603` Thyroid Butterfly Gland, `FMA:9611` Thymus & Spleen, `FMA:7195` Lungs & Trachea, `FMA:7088` Heart & Aortic Arch, `FMA:50723` Systemic Aorta & Vena Cava, `FMA:7197` Liver & Gallbladder, `FMA:7148` Stomach, Duodenum & Pancreas, `FMA:71132` Small Intestine & Haustrated Colon, `FMA:7203` Left & Right Kidneys & Ureters.
    - **Optional External Skin Reference (`skin_external`, disabled by default)**: `FMA:7163`, hidden in all 4 presets unless explicitly toggled on in the Advanced Layers drawer.

## 3. Four Anatomical View Presets & Individual Structure Selection

1. **`Full Internal Anatomy` (`whole_body`, Default)**: External skin hidden (`skin_external` disabled); muscular structures visible, internal organs visible through the thoracic/abdominal dissection window, and skeletal landmarks visible.
2. **`Muscular System` (`muscles`)**: External skin hidden; complete bilateral head-to-toe striated muscular anatomy with ivory tendon insertions mounted on the skeletal frame.
3. **`Internal Organs` (`organs`)**: External skin and superficial muscles hidden; all 11 visceral organs clearly visible in their natural anatomical positions inside a subtle (`22%` opacity) skeletal reference frame.
4. **`Skeletal System` (`skeleton`)**: External skin, muscles, and organs hidden; complete 9-part axial and appendicular bone and costal cartilage geometry.
- **Individual Structure Selection**: Clicking any 3D triangle mesh (`pickAnatomicalMeshAtPoint`) or structure chip (`data-testid="anatomy-structure-chip-..."`) highlights **only that individual structure** (`selectedMeshId`), displays its FMA ID and structural description in `data-testid="selected-3d-structure-card"`, loads the mapped GharPlate nutrition region, and syncs live with **Ask GharPlate**.
