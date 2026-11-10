# GharPlate — 3D Human Anatomy Dataset & Open-License Attribution

## 1. Open-License Anatomical Sources (`CC BY 4.0`)

GharPlate's self-hosted 3D anatomical bundle (`frontend/public/models/human_anatomy_atlas.json`) is derived and adapted from open, freely redistributable scientific anatomical datasets:

1. **BodyParts3D 4.0 (Adult Male Reference Body)**:
   - **Citation**: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. *BodyParts3D: 3D structure database for anatomical concepts.* Nucleic Acids Research (2009); Database Center for Life Science (DBCLS), Japan.
   - **Source URL**: [https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)
   - **License**: Creative Commons Attribution 4.0 International (`CC BY 4.0`) / `CC BY-SA 2.1 JP`.
2. **Human Reference Atlas v1.10 / Visible Human Project (Adult Female Reference Body)**:
   - **Citation**: Kristen Browne and Heidi Schlehlein, HuBMAP Consortium (*Human Reference Atlas v1.10*), built on the Visible Human Project of the U.S. National Library of Medicine (NLM) and lower-limb muscle segmentation by Andreassen et al. (2023), University of Denver.
   - **Source URL**: [https://github.com/slorksmo/Human-Atlas](https://github.com/slorksmo/Human-Atlas)
   - **License**: Creative Commons Attribution 4.0 International (`CC BY 4.0`).
3. **Z-Anatomy & Foundational Model of Anatomy (`FMA`) Ontology**:
   - **Citation**: Gauthier Kervyn & Marcin Zielinski (*Z-Anatomy — The Libre 3D Atlas of Anatomy*, derived from BodyParts3D) and University of Washington Structural Informatics Group (*Foundational Model of Anatomy*).
   - **Source URL**: [https://github.com/Z-Anatomy/Models-of-human-anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy)
   - **License**: Creative Commons Attribution-ShareAlike 4.0 (`CC BY-SA 4.0`).

## 2. Supported 29 Selectable 3D Structures & FMA Identifiers

- **Skeletal System (`skeletal`, 9 structures)**: `FMA:46565` Skull & Mandible, `FMA:7157` Vertebral Column & Sacrum, `FMA:7485` Sternum, `FMA:7480` Thoracic Rib Cage & Costal Cartilage, `FMA:13321` Clavicles & Scapulae, `FMA:13303` Upper Limb Skeleton, `FMA:16585` Pelvic Girdle, `FMA:9611` Femur & Patella, `FMA:24476` Tibia, Fibula & Foot Skeleton.
- **Muscular System (`muscular`, 8 structures)**: `FMA:13315` Sternocleidomastoid, Scalenes, Temporalis & Masseter, `FMA:9627` Pectoralis Major & Serratus Anterior, `FMA:32521` Deltoid & Rotator Cuff, `FMA:37670` Biceps, Triceps & Forearm Flexors, `FMA:9628` Rectus Abdominis & External Obliques, `FMA:9626` Trapezius, Latissimus Dorsi & Erector Spinae, `FMA:22428` Quadriceps Femoris & Adductors, `FMA:22541` Gastrocnemius, Soleus & Tibialis Anterior.
- **Internal Organs (`nervous`, `sensory_immune`, `endocrine`, `respiratory`, `cardiovascular`, `digestive`, `urinary`, 11 structures)**: `FMA:50801` Brain, Cerebellum & Spinal Cord, `FMA:54448` Eyes & Optic Pathways, `FMA:9603` Thyroid Butterfly Gland, `FMA:9611` Thymus & Spleen, `FMA:7195` Lungs & Trachea, `FMA:7088` Heart & Aortic Arch, `FMA:50723` Systemic Vascular Tree, `FMA:7197` Liver & Gallbladder, `FMA:7148` Stomach, Duodenum & Pancreas, `FMA:71132` Small Intestine & Haustrated Colon, `FMA:7203` Kidneys, Adrenals, Ureters & Bladder.
- **Optional Integument (`skin_external`, 1 structure — Disabled by Default)**: `FMA:7163` External Surface (hidden in `Full Internal Anatomy`, `Muscular System`, `Internal Organs`, and `Skeletal System`).
