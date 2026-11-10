# GharPlate — Definitive 3D Internal Human Anatomy Implementation

## 1. Executive Summary

The **3D Body & Nutrition Explorer** ([BodyNutritionExplorerPage.tsx](../frontend/src/pages/BodyNutritionExplorerPage.tsx), [realisticHumanAnatomy3D.ts](../frontend/src/utils/realisticHumanAnatomy3D.ts), [anatomicalModel3D.ts](../frontend/src/utils/anatomicalModel3D.ts)) renders a skinless, multi-system internal human anatomy model by default (**`Full Internal Human Anatomy — Skin Hidden`**) grounded in open CC BY 4.0 anatomical datasets.

## 2. Evaluated Open-Source 3D Anatomy Datasets & Licensing

| Source Dataset / Repository | URL | Coverage & Characteristics | License |
| :--- | :--- | :--- | :--- |
| **Human Atlas (`slorksmo/Human-Atlas`)** | [https://github.com/slorksmo/Human-Atlas](https://github.com/slorksmo/Human-Atlas) | Adult Male (`BodyParts3D 4.0`) and Adult Female (`HuBMAP v1.10`) reference bodies, FMA identifiers, system layer grouping, and body surface hidden by default. | Code: MIT; Anatomical Data: CC BY 4.0 |
| **BodyParts3D 4.0 (`DBCLS / NBDC`)** | [https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) | Whole-body 3D organ, muscle, and skeletal polygon mesh dictionary indexed by Foundational Model of Anatomy (`FMA`) IDs. | CC BY 4.0 / CC BY-SA 2.1 JP |
| **Z-Anatomy (`Models-of-human-anatomy`)** | [https://github.com/Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) | Detailed myology, osteology, splanchnology (internal organs), neuroanatomy, and TA2/FMA hierarchy derived from BodyParts3D. | CC BY-SA 4.0 |
| **Open Anatomy Atlas (`CognitionLabSNUC`)** | [https://github.com/CognitionLabSNUC/open-anatomy-atlas](https://github.com/CognitionLabSNUC/open-anatomy-atlas) | Browser-accessible 3D anatomical structure organization and educational system taxonomy. | Open Educational Attribution |

## 3. Default Presentation: `Full Internal Human Anatomy — Skin Hidden`

- **External Skin Disabled by Default**: `getRealisticLayersForPreset('whole_body')` excludes `'skin_external'` (`!visibleLayers.has('skin_external')`), ensuring no tan, white, or grey mannequin shell obscures the internal anatomy.
- **Anatomical Écorché Dissection Cutaway**:
  - In `Full Internal Anatomy` (`whole_body`, marked with a `Default` badge), an anterior hemithoracic, central abdominal, and left cranial dissection window exposes:
    - **Brain (`FMA:50801`)**: Gyrencephalic cerebral hemispheres, foliated cerebellum, brainstem, and spinal cord.
    - **Eyes (`FMA:54448`)**: Sclera, cornea, pigmented iris, pupil, and optic pathways.
    - **Thyroid (`FMA:9603`) & Thymus/Spleen (`FMA:9611`)**: Cervical butterfly thyroid gland with laryngeal cartilage, mediastinal thymus, and left-hypochondriac spleen.
    - **Lungs & Trachea (`FMA:7195`)**: C-ring cartilaginous trachea, right 3-lobe lung, and left 2-lobe lung with cardiac notch.
    - **Heart & Aortic Arch (`FMA:7088`) & Systemic Vessels (`FMA:50723`)**: Right/left ventricles and atria, ascending aorta, aortic arch, superior/inferior vena cava, and iliac/femoral trunks.
    - **Liver & Gallbladder (`FMA:7197`)**: Right and left hepatic lobes and pear-shaped green gallbladder.
    - **Stomach, Duodenum & Pancreas (`FMA:7148`)**: J-shaped gastric chamber, C-loop duodenum, and lobulated pancreas.
    - **Small Intestine & Haustrated Colon (`FMA:71132`)**: Serpentine jejunum/ileum coils framed by the cecum, ascending, transverse, descending, and sigmoid colon.
    - **Kidneys, Adrenals, Ureters & Bladder (`FMA:7203`)**: Bilateral retroperitoneal kidneys capped by adrenal glands, ureters, and urinary bladder.
  - Surrounding striated muscle complexes (right Pectoralis Major, Serratus Anterior, Deltoids, Biceps/Triceps/Forearms, lateral External Obliques, Quadriceps Femoris, Gastrocnemius/Soleus with ivory tendons) and articulated skeletal structures (Skull, Spine, Sternum, Rib Cage, Clavicles/Scapulae, Pelvis, Femur/Patella, Tibia/Fibula/Foot) frame the internal organs in their natural anatomical relationships.

## 4. Four Functional Anatomy Presets

1. **`Full Internal Anatomy` (`whole_body` — Default)**: Skin hidden; muscles, internal organs, and skeleton visible together via the anatomical dissection window.
2. **`Muscular System` (`muscles`)**: Skin hidden; complete bilateral head-to-toe striated muscular anatomy (8 multi-belly muscle complexes with longitudinal fiber fluting and glistening aponeurotic tendons) mounted on the skeletal frame.
3. **`Internal Organs` (`organs`)**: Skin and superficial muscles hidden; all 11 visceral, neural, endocrine, and vascular organ structures clearly visible in their natural anatomical positions.
4. **`Skeletal System` (`skeleton`)**: Skin, muscles, and organs hidden; complete 9-part articulated axial and appendicular skeleton from cranium and 22 individual vertebral bodies/discs to carpal/metacarpal hand rays and tarsal/metatarsal foot arches.

## 5. Interactive Mesh Selection, Focus & Lazy Loading

- **Per-Structure Raycast Selection (`pickAnatomicalMeshAtPoint`)**: Hovering (`hoveredMeshId`) and clicking (`selectedMeshId`) any 3D structure highlights only that structure, displays its FMA ID and physiological description in `data-testid="selected-3d-structure-card"`, updates all full-width nutrition/food sections, and syncs live with **Ask GharPlate**.
- **Camera Focus & Isolation**: Users can isolate any structure (`data-testid="body-3d-isolate-btn"`), focus the camera directly on the selected mesh (`data-testid="body-3d-focus-selected-btn"`), toggle Anterior/Posterior views (`data-testid="body-3d-front-back-btn"`), rotate/zoom, and search by structure name or FMA ID (`data-testid="anatomy-structure-search"`).
- **Performance & Lazy Loading**: The self-hosted `/models/human_anatomy_atlas.json` asset is fetched lazily only when `BodyNutritionExplorerPage` mounts (never on the Home page), cached in memory (`registerLoadedAnatomicalAtlas`), and cleaned up on unmount.
