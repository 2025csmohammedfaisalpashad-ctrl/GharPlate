import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FoodImage } from '../components/UIWidgets';
import {
  clearAssistantEntityContext,
  publishAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import {
  ANATOMICAL_LAYERS,
  type AnatomicalLayerId,
  type AnatomicalMeshPart,
  type AnatomicalViewPreset,
  type RenderedMeshHitRegion,
  pickAnatomicalMeshAtPoint,
} from '../utils/anatomicalModel3D';
import {
  buildRealisticAnatomical3DAtlas as getOrBuildAnatomical3DAtlas,
  getRealisticLayersForPreset as getActiveLayersForPreset,
  registerLoadedAnatomicalAtlas,
  renderRealisticAnatomical3DScene as renderAnatomical3DScene,
  type AnatomicalReferenceSex,
} from '../utils/realisticHumanAnatomy3D';

interface BodyRegionSummary {
  id: number;
  code: string;
  name: string;
  anatomical_system: string;
  category: string;
  layer_id?: string;
  fma_id?: string;
  mesh_id?: string;
  display_order: number;
  short_summary: string;
  key_nutrients_summary: string[];
  camera_position: {
    theta?: number;
    phi?: number;
    zoom?: number;
    focus_y?: number;
  };
  mesh_coordinates: {
    cx: number;
    cy: number;
    cz: number;
    rx: number;
    ry: number;
    rz: number;
    color: string;
  };
  nutrient_count: number;
  verified_food_count: number;
  source_name: string;
  source_year: number;
  review_status?: string;
}

function detectCanvas3DSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const ctx2d = canvas.getContext('2d');
    return Boolean(ctx2d);
  } catch {
    return false;
  }
}

export const BodyNutritionExplorerPage: React.FC = () => {
  const { activeMember } = useHousehold();

  const [regions, setRegions] = useState<BodyRegionSummary[]>([]);
  const [initialPrompt, setInitialPrompt] = useState(
    'Select a body region to explore its nutritional needs.'
  );
  const [medicalDisclaimer, setMedicalDisclaimer] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [selectedMeshId, setSelectedMeshId] = useState<string | null>(null);
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [hoveredMeshId, setHoveredMeshId] = useState<string | null>(null);
  const [regionDetail, setRegionDetail] = useState<Record<string, any> | null>(null);
  const [relatedRecipes, setRelatedRecipes] = useState<Record<string, any>[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [dietFilter, setDietFilter] = useState<string>('');
  const [showAllFoodCards, setShowAllFoodCards] = useState<boolean>(true);

  // 3D Anatomical Atlas Mesh, Self-Hosted Asset Loader & Layer State
  const [referenceSex, setReferenceSex] = useState<AnatomicalReferenceSex>('male');
  const [atlasMeshes, setAtlasMeshes] = useState<AnatomicalMeshPart[]>(() =>
    getOrBuildAnatomical3DAtlas('male')
  );
  const [modelLoadProgress, setModelLoadProgress] = useState<number>(100);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [assetSourceBadge, setAssetSourceBadge] = useState<string>(
    '/models/human_anatomy_atlas.json (CC BY 4.0)'
  );
  const [viewMode, setViewMode] = useState<'3d' | '2d'>(() =>
    detectCanvas3DSupport() ? '3d' : '2d'
  );
  const [viewPreset, setViewPreset] = useState<AnatomicalViewPreset>('whole_body');
  const [visibleLayers, setVisibleLayers] = useState<Set<AnatomicalLayerId>>(() =>
    getActiveLayersForPreset('whole_body')
  );
  const [surfaceOpacity, setSurfaceOpacity] = useState<number>(0.25);
  const [layerMenuOpen, setLayerMenuOpen] = useState<boolean>(false);
  const [isolatedCode, setIsolatedCode] = useState<string | null>(null);
  const [isolatedMeshId, setIsolatedMeshId] = useState<string | null>(null);
  const [structureSearchQuery, setStructureSearchQuery] = useState<string>('');

  // 3D Camera State (framed so head, torso, arms, hands, legs & feet fill the viewport)
  const [yaw, setYaw] = useState<number>(0.16);
  const [pitch, setPitch] = useState<number>(0.04);
  const [zoom, setZoom] = useState<number>(1.08);
  const [panY, setPanY] = useState<number>(0.0);
  const [isBackView, setIsBackView] = useState<boolean>(false);

  // Confirmed Food Diary Logging state inside Explorer
  const [confirmingFoodSlug, setConfirmingFoodSlug] = useState<string | null>(null);
  const [logQty, setLogQty] = useState<string>('1');
  const [logMealCategory, setLogMealCategory] = useState<string>('lunch');
  const [logSuccessBanner, setLogSuccessBanner] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitRegionsRef = useRef<RenderedMeshHitRegion[]>([]);
  const autoSelectedInitialRef = useRef<boolean>(false);
  const dragRef = useRef<{
    active: boolean;
    lastX: number;
    lastY: number;
    moved: boolean;
  }>({
    active: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  });
  const pinchDistRef = useRef<number | null>(null);

  const loadSelfHostedAnatomyAtlas = useCallback(
    async (sex: AnatomicalReferenceSex) => {
      setModelLoadError(null);
      const localMeshes = getOrBuildAnatomical3DAtlas(sex);
      setAtlasMeshes(localMeshes);
      setModelLoadProgress(100);

      // Attempt lazy validation/hydration from self-hosted /models/human_anatomy_atlas.json when running in browser
      if (typeof window !== 'undefined' && typeof fetch === 'function') {
        try {
          const resp = await fetch('/models/human_anatomy_atlas.json');
          if (resp && resp.ok) {
            const payload = await resp.json();
            const bundledMeshes = payload?.models?.[sex];
            if (Array.isArray(bundledMeshes) && bundledMeshes.length > 0) {
              registerLoadedAnatomicalAtlas(sex, bundledMeshes);
              setAtlasMeshes(bundledMeshes);
              setAssetSourceBadge(
                payload?.attribution_short ||
                  '/models/human_anatomy_atlas.json (BodyParts3D 4.0 / HuBMAP CC BY 4.0)'
              );
            }
          }
        } catch {
          // Keep verified local atlas active without replacing with any degraded primitive
        }
      }
    },
    []
  );

  // Lazy-load 3D anatomical triangle-mesh atlas only when Body & Nutrition Explorer mounts
  useEffect(() => {
    void loadSelfHostedAnatomyAtlas(referenceSex);
    return () => {
      hitRegionsRef.current = [];
      clearAssistantEntityContext('/explore/body-nutrition');
    };
  }, [referenceSex, loadSelfHostedAnatomyAtlas]);

  const loadRegionDetail = useCallback(
    async (code: string, dietOverride?: string) => {
      setLoadingDetail(true);
      try {
        const detail = await api.getBodyNutritionRegionDetail(code, {
          member_id: activeMember?.id,
          dietary_preference:
            dietOverride !== undefined
              ? dietOverride || undefined
              : dietFilter || activeMember?.dietary_preference || undefined,
        });
        setRegionDetail(detail);
      } catch {
        // ignore
      } finally {
        setLoadingDetail(false);
      }
    },
    [activeMember?.id, activeMember?.dietary_preference, dietFilter]
  );

  // Load region catalog & recommended recipes from backend
  useEffect(() => {
    setLoadingList(true);
    api
      .getBodyNutritionRegions()
      .then((res) => {
        const regList: BodyRegionSummary[] = res.regions || [];
        setRegions(regList);
        if (res.initial_prompt) setInitialPrompt(res.initial_prompt);
        if (res.medical_disclaimer) setMedicalDisclaimer(res.medical_disclaimer);

        // When the full 10-region catalog loads in the live application, automatically load
        // Heart & Cardiovascular System (`FMA_7088_HEART`) so Level A and Level B full-width sections
        // are immediately populated without requiring an extra click.
        if (!autoSelectedInitialRef.current && regList.length >= 4) {
          autoSelectedInitialRef.current = true;
          const defaultReg =
            regList.find((r) => r.code === 'heart_cardiovascular') || regList[0];
          if (defaultReg) {
            setSelectedCode(defaultReg.code);
            setSelectedMeshId('FMA_7088_HEART');
            void loadRegionDetail(defaultReg.code);
          }
        }
      })
      .catch(() => null)
      .finally(() => setLoadingList(false));

    api
      .discoverRecipes({ member_id: activeMember?.id })
      .then((res) => {
        if (Array.isArray(res?.local_verified_recipes)) {
          setRelatedRecipes(res.local_verified_recipes);
        }
      })
      .catch(() => null);
  }, [activeMember?.id, loadRegionDetail]);

  const selectedMeshObject = useMemo(
    () =>
      (selectedMeshId && atlasMeshes.find((m) => m.meshId === selectedMeshId)) ||
      (selectedCode && atlasMeshes.find((m) => m.regionCode === selectedCode)) ||
      null,
    [atlasMeshes, selectedMeshId, selectedCode]
  );

  // Synchronize selected 3D anatomical structure live with Ask GharPlate AI Assistant
  useEffect(() => {
    if (!selectedCode && !regionDetail && !selectedMeshObject) {
      publishAssistantContext({
        page_type: 'body_region',
        route: '/explore/body-nutrition',
        selected_entity: null,
        selected_body_region: null,
      });
      return;
    }
    const summaryReg = regions.find((r) => r.code === selectedCode);
    const regionName =
      regionDetail?.name ||
      summaryReg?.name ||
      selectedMeshObject?.name ||
      selectedCode ||
      'Body Region';
    const structureLabel = selectedMeshObject
      ? `${selectedMeshObject.name} (${selectedMeshObject.fmaId})`
      : regionName;
    const system =
      selectedMeshObject?.anatomicalSystemLabel ||
      regionDetail?.anatomical_system ||
      summaryReg?.anatomical_system ||
      'Human Anatomical System';
    const shortSummary =
      selectedMeshObject?.structuralDescription ||
      regionDetail?.short_summary ||
      summaryReg?.short_summary ||
      null;

    publishAssistantContext({
      page_type: 'body_region',
      route: '/explore/body-nutrition',
      selected_entity: {
        type: 'body_region',
        id: selectedCode || selectedMeshObject?.regionCode || null,
        name: regionDetail?.name || summaryReg?.name || structureLabel,
        category: regionDetail?.category || summaryReg?.category || null,
        anatomical_system: system,
        summary: shortSummary,
      },
      selected_body_region: {
        code: selectedCode,
        name: regionName,
        anatomical_system: system,
        fma_id:
          selectedMeshObject?.fmaId ||
          regionDetail?.fma_id ||
          summaryReg?.fma_id ||
          null,
        key_nutrients_summary:
          regionDetail?.key_nutrients_summary ||
          summaryReg?.key_nutrients_summary ||
          [],
        source: regionDetail?.source || {
          name: summaryReg?.source_name || 'ICMR-NIN DGI 2024',
          year: summaryReg?.source_year || 2024,
        },
      },
    });
  }, [selectedCode, selectedMeshObject, regionDetail, regions]);

  const handleSelectRegion = useCallback(
    (code: string, explicitMeshId?: string | null) => {
      setSelectedCode(code);
      setConfirmingFoodSlug(null);

      const matchedMesh = explicitMeshId
        ? atlasMeshes.find((m) => m.meshId === explicitMeshId)
        : atlasMeshes.find((m) => m.regionCode === code);

      setSelectedMeshId(matchedMesh ? matchedMesh.meshId : explicitMeshId || null);

      if (matchedMesh && matchedMesh.layerId !== 'skin_external') {
        setVisibleLayers((prev) => {
          if (prev.has(matchedMesh.layerId)) return prev;
          const next = new Set(prev);
          next.add(matchedMesh.layerId);
          return next;
        });
      }

      const reg = regions.find((r) => r.code === code);
      if (reg?.camera_position) {
        if (typeof reg.camera_position.theta === 'number') {
          setYaw(reg.camera_position.theta + (isBackView ? Math.PI : 0));
        }
        if (typeof reg.camera_position.phi === 'number') {
          setPitch(reg.camera_position.phi);
        }
        if (typeof reg.camera_position.zoom === 'number') {
          setZoom(reg.camera_position.zoom);
        }
      }
      void loadRegionDetail(code);
    },
    [atlasMeshes, regions, isBackView, loadRegionDetail]
  );

  const handleSelectIndividualStructure = useCallback(
    (mesh: AnatomicalMeshPart) => {
      handleSelectRegion(mesh.regionCode, mesh.meshId);
    },
    [handleSelectRegion]
  );

  const handleSelectPreset = (preset: AnatomicalViewPreset) => {
    setViewPreset(preset);
    setIsolatedCode(null);
    setIsolatedMeshId(null);
    setVisibleLayers(getActiveLayersForPreset(preset));
    if (preset === 'whole_body') {
      // In Full Internal Anatomy (Default), keep skin hidden and show Heart / Internal Anatomy
      setSurfaceOpacity(0.25);
      handleSelectRegion('heart_cardiovascular', 'FMA_7088_HEART');
    } else if (preset === 'muscles') {
      handleSelectRegion('muscles_strength', 'FMA_9627_PECTORALIS_MAJOR');
    } else if (preset === 'skeleton') {
      handleSelectRegion('bones_joints', 'FMA_7480_RIB_CAGE');
    } else if (preset === 'organs') {
      handleSelectRegion('digestive_gut', 'FMA_7197_LIVER_GALLBLADDER');
    }
  };

  const handleToggleLayer = (layerId: AnatomicalLayerId) => {
    setViewPreset('custom');
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId) && next.size > 1) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  };

  const handleFocusSelectedStructure = () => {
    if (!selectedMeshObject) return;
    const cy = selectedMeshObject.boundingCenter.y;
    setPanY(Number((0.88 - cy).toFixed(2)));
    setZoom(1.38);
  };

  const handleResetView = () => {
    setYaw(0.16);
    setPitch(0.04);
    setZoom(1.08);
    setPanY(0.0);
    setIsBackView(false);
    setIsolatedCode(null);
    setIsolatedMeshId(null);
    setSurfaceOpacity(0.25);
    setViewPreset('whole_body');
    setVisibleLayers(getActiveLayersForPreset('whole_body'));
  };

  const handleToggleFrontBack = () => {
    setIsBackView((prev) => {
      const next = !prev;
      setYaw(next ? Math.PI : 0.16);
      return next;
    });
  };

  // Render 3D indexed triangle-mesh human anatomy scene
  useEffect(() => {
    if (viewMode !== '3d' || atlasMeshes.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) {
      setViewMode('2d');
      return;
    }

    const hitRegions = renderAnatomical3DScene({
      ctx,
      width: canvas.width,
      height: canvas.height,
      atlas: atlasMeshes,
      visibleLayers,
      selectedRegionCode: selectedCode,
      selectedMeshId,
      hoveredRegionCode: hoveredCode,
      hoveredMeshId,
      isolatedRegionCode: isolatedCode,
      isolatedMeshId,
      surfaceOpacity,
      viewPreset,
      yaw,
      pitch,
      zoom,
      panY,
    });
    hitRegionsRef.current = hitRegions;
  }, [
    viewMode,
    atlasMeshes,
    visibleLayers,
    selectedCode,
    selectedMeshId,
    hoveredCode,
    hoveredMeshId,
    isolatedCode,
    isolatedMeshId,
    surfaceOpacity,
    viewPreset,
    yaw,
    pitch,
    zoom,
    panY,
  ]);

  const findMeshAtClientPoint = (
    clientX: number,
    clientY: number
  ): RenderedMeshHitRegion | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(rect.width, 1);
    const scaleY = canvas.height / Math.max(rect.height, 1);
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    return pickAnatomicalMeshAtPoint(x, y, hitRegionsRef.current, true);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = {
      active: true,
      lastX: e.clientX,
      lastY: e.clientY,
      moved: false,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current.active) {
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        dragRef.current.moved = true;
      }
      setYaw((prev) => prev + dx * 0.012);
      setPitch((prev) => Math.max(-0.65, Math.min(0.65, prev + dy * 0.008)));
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      return;
    }
    const hit = findMeshAtClientPoint(e.clientX, e.clientY);
    setHoveredCode(hit ? hit.regionCode : null);
    setHoveredMeshId(hit ? hit.meshId : null);
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const wasMoved = dragRef.current.moved;
    dragRef.current.active = false;
    if (!wasMoved) {
      const hit = findMeshAtClientPoint(e.clientX, e.clientY);
      if (hit) {
        handleSelectRegion(hit.regionCode, hit.meshId);
      }
    }
  };

  // Pinch-to-zoom support on mobile touchscreens
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && pinchDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const delta = (dist - pinchDistRef.current) * 0.004;
      setZoom((z) =>
        Math.max(0.7, Math.min(2.1, Number((z + delta).toFixed(2))))
      );
      pinchDistRef.current = dist;
    }
  };

  const handleTouchEnd = () => {
    pinchDistRef.current = null;
  };

  const handleConfirmLogFoodFromExplorer = async (
    e: React.FormEvent,
    foodSlug: string,
    foodName: string
  ) => {
    e.preventDefault();
    const qty = Math.max(0.25, Number(logQty) || 1);
    await api.addDailyFoodLog({
      member_id: activeMember?.id,
      food_slug: foodSlug,
      quantity: qty,
      unit_name: 'standard_serving',
      meal_category: logMealCategory,
      notes: `Logged from 3D Body & Nutrition Explorer (${
        selectedMeshObject?.name || regionDetail?.name || 'Organ System'
      })`,
    });
    setConfirmingFoodSlug(null);
    setLogSuccessBanner(
      `Confirmed & logged ${qty} serving(s) of “${foodName}” to Today’s Food Diary (${logMealCategory.replace(
        '_',
        ' '
      )}).`
    );
  };

  const totalTrianglesCount = useMemo(
    () => atlasMeshes.reduce((acc, m) => acc + m.faces.length, 0),
    [atlasMeshes]
  );

  const filteredStructures = useMemo(() => {
    const q = structureSearchQuery.trim().toLowerCase();
    const visibleList = atlasMeshes.filter(
      (m) => visibleLayers.has(m.layerId) && m.layerId !== 'skin_external'
    );
    if (!q) return visibleList;
    return atlasMeshes.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.fmaId.toLowerCase().includes(q) ||
        (m.anatomicalSystemLabel || '').toLowerCase().includes(q) ||
        m.regionCode.toLowerCase().includes(q)
    );
  }, [atlasMeshes, visibleLayers, structureSearchQuery]);

  const activeRegionSummary = useMemo(
    () => regions.find((r) => r.code === selectedCode) || null,
    [regions, selectedCode]
  );

  const displayedFoods = useMemo(() => {
    const allFoods = regionDetail?.foods || [];
    return showAllFoodCards ? allFoods : allFoods.slice(0, 4);
  }, [regionDetail?.foods, showAllFoodCards]);

  return (
    <div data-testid="body-nutrition-explorer-page" className="space-y-8 animate-gp-reveal">
      {/* Immersive Light-Green Hero Header */}
      <section className="gp-hero-surface rounded-3xl p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-3xl space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#087153] px-3 py-0.5 text-xs font-extrabold text-white shadow-2xs">
              🧬 Default View: Full Internal Human Anatomy — Skin Hidden
            </span>
            <span
              data-testid="anatomy-asset-provenance-badge"
              className="rounded-full bg-white/90 border border-emerald-900/15 px-3 py-0.5 text-[11px] font-bold text-[#172b23]"
            >
              {assetSourceBadge} • {atlasMeshes.length} Selectable 3D Structures •{' '}
              {totalTrianglesCount.toLocaleString()} Triangles
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#172b23]">
            Explore How Indian Foods Support Every Body System
          </h1>
          <p
            data-testid="body-explorer-empty-prompt"
            className="text-xs sm:text-sm text-[#566960] leading-relaxed"
          >
            {initialPrompt} Inspect skinless human muscles, internal organs, and skeletal structures in their natural anatomical positions, then explore full-width key nutrients, verified IFCT 2017 Indian foods, and recommended recipes below.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            aria-label="Filter Body Region Foods by Diet"
            data-testid="body-explorer-diet-filter"
            value={dietFilter}
            onChange={(e) => {
              const nextDiet = e.target.value;
              setDietFilter(nextDiet);
              if (selectedCode) {
                void loadRegionDetail(selectedCode, nextDiet);
              }
            }}
            className="rounded-xl border border-emerald-900/20 bg-white px-3.5 py-2 font-bold text-[#172b23] shadow-2xs"
          >
            <option value="">
              Profile Default ({activeMember?.dietary_preference || 'All Diets'})
            </option>
            <option value="vegetarian">Vegetarian Only</option>
            <option value="vegan">Vegan Only</option>
            <option value="non_vegetarian">
              Include All (Veg, Egg &amp; Fish/Meat)
            </option>
          </select>

          <button
            type="button"
            data-testid="body-view-mode-toggle"
            onClick={() => setViewMode((m) => (m === '3d' ? '2d' : '3d'))}
            className="rounded-xl border border-emerald-900/20 bg-white px-3.5 py-2 font-extrabold text-[#172b23] hover:bg-[#e8f2e9] transition"
          >
            {viewMode === '3d'
              ? 'Switch to 2D Accessible Diagram'
              : 'Switch to 3D Anatomical Model'}
          </button>
        </div>
      </section>

      {logSuccessBanner && (
        <div
          data-testid="body-explorer-log-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-950"
        >
          <span>✓ {logSuccessBanner}</span>
          <Link
            to="/fitness/tracker"
            className="rounded-xl bg-[#087153] px-3.5 py-1.5 text-white"
          >
            View Daily Tracker →
          </Link>
        </div>
      )}

      {/* =========================================================================
          LEVEL A — TOP ANATOMY EXPLORATION AREA (BALANCED TWO-COLUMN STRUCTURE)
          Left (7 cols): Large 3D Internal Anatomy Viewer & Controls
          Right (5 cols): Selected Anatomy Information, Physiology & Nutrient Overview
          ========================================================================= */}
      <div
        data-testid="anatomy-exploration-level-a"
        className="grid gap-6 lg:grid-cols-12 items-stretch"
      >
        {/* LEFT COLUMN (7 Cols): LARGE 3D ANATOMY VIEWER */}
        <section className="lg:col-span-7 gp-surface-elevated rounded-3xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3.5">
            {/* Preset Selector & Male/Female Reference Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <div
                  data-testid="anatomy-preset-selector"
                  className="inline-flex flex-wrap rounded-2xl bg-[#e8f2e9] p-1 gap-1 border border-emerald-900/10"
                >
                  {(
                    [
                      {
                        id: 'whole_body',
                        label: 'Full Internal Anatomy',
                        isDefault: true,
                      },
                      {
                        id: 'muscles',
                        label: 'Muscular System',
                        isDefault: false,
                      },
                      {
                        id: 'organs',
                        label: 'Internal Organs',
                        isDefault: false,
                      },
                      {
                        id: 'skeleton',
                        label: 'Skeletal System',
                        isDefault: false,
                      },
                    ] as const
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`anatomy-preset-${preset.id}`}
                      onClick={() => handleSelectPreset(preset.id)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-extrabold transition ${
                        viewPreset === preset.id
                          ? 'bg-[#087153] text-white shadow-xs'
                          : 'text-[#172b23] hover:bg-white/80'
                      }`}
                    >
                      <span>{preset.label}</span>
                      {preset.isDefault && (
                        <span
                          data-testid="anatomy-default-preset-badge"
                          className={`rounded-full px-1.5 py-0.2 text-[9px] font-black uppercase ${
                            viewPreset === preset.id
                              ? 'bg-emerald-300 text-emerald-950'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          Default
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div
                  data-testid="anatomy-sex-selector"
                  className="inline-flex rounded-xl bg-[#e8f2e9] p-0.5 text-[11px] font-bold border border-emerald-900/10"
                >
                  <button
                    type="button"
                    data-testid="anatomy-sex-male"
                    onClick={() => setReferenceSex('male')}
                    className={`rounded-lg px-2.5 py-1 transition ${
                      referenceSex === 'male'
                        ? 'bg-[#064d3c] text-white font-extrabold'
                        : 'text-[#566960] hover:text-[#172b23]'
                    }`}
                  >
                    Male Ref
                  </button>
                  <button
                    type="button"
                    data-testid="anatomy-sex-female"
                    onClick={() => setReferenceSex('female')}
                    className={`rounded-lg px-2.5 py-1 transition ${
                      referenceSex === 'female'
                        ? 'bg-[#064d3c] text-white font-extrabold'
                        : 'text-[#566960] hover:text-[#172b23]'
                    }`}
                  >
                    Female Ref
                  </button>
                </div>
              </div>

              {/* Isolate + Layers Popover */}
              <div className="relative flex items-center gap-1.5">
                {(selectedMeshId || selectedCode) && (
                  <button
                    type="button"
                    data-testid="body-3d-isolate-btn"
                    onClick={() => {
                      if (isolatedMeshId || isolatedCode) {
                        setIsolatedMeshId(null);
                        setIsolatedCode(null);
                      } else if (selectedMeshId) {
                        setIsolatedMeshId(selectedMeshId);
                        setIsolatedCode(selectedCode);
                      } else {
                        setIsolatedCode(selectedCode);
                      }
                    }}
                    className={`rounded-xl border px-3 py-1.5 font-extrabold transition ${
                      isolatedMeshId || isolatedCode
                        ? 'border-amber-500 bg-amber-400 text-stone-950'
                        : 'border-emerald-900/15 bg-white text-[#172b23] hover:bg-[#e8f2e9]'
                    }`}
                  >
                    {isolatedMeshId || isolatedCode
                      ? 'Show All Structures'
                      : 'Isolate Selected'}
                  </button>
                )}

                <button
                  type="button"
                  data-testid="anatomy-layers-menu-trigger"
                  onClick={() => setLayerMenuOpen((o) => !o)}
                  className="rounded-xl border border-emerald-900/20 bg-white px-3 py-1.5 font-extrabold text-[#172b23] hover:bg-[#e8f2e9]"
                >
                  Layers ({visibleLayers.size}/10) ▾
                </button>

                {layerMenuOpen && (
                  <div
                    data-testid="anatomy-layers-popover"
                    className="absolute right-0 top-10 z-30 w-64 rounded-2xl border border-emerald-900/15 bg-white p-3 shadow-xl space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 pb-1.5 font-extrabold text-[#172b23]">
                      <span>Anatomical Layers (10)</span>
                      <button
                        type="button"
                        onClick={() => setLayerMenuOpen(false)}
                        className="text-stone-400 hover:text-stone-700"
                      >
                        ✕
                      </button>
                    </div>
                    {ANATOMICAL_LAYERS.map((layer) => {
                      const checked = visibleLayers.has(layer.id);
                      return (
                        <label
                          key={layer.id}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-[#e8f2e9]/60 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 font-semibold text-[#172b23]">
                            <input
                              type="checkbox"
                              data-testid={`layer-toggle-${layer.id}`}
                              checked={checked}
                              onChange={() => handleToggleLayer(layer.id)}
                              className="rounded border-stone-300 text-[#087153]"
                            />
                            <span>{layer.label}</span>
                          </span>
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: layer.baseColor }}
                          />
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Camera & Orientation Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-[#172b23]">
                  {viewMode === '3d'
                    ? `3D Internal Anatomy (${
                        isBackView ? 'Posterior / Back' : 'Anterior / Front'
                      })`
                    : '2D Accessible Anatomical Diagram'}
                </span>
                {(selectedMeshObject || selectedCode) && (
                  <span
                    data-testid="active-3d-mesh-badge"
                    className="rounded-full bg-[#064d3c] px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-100 max-w-[270px] truncate"
                  >
                    Selected:{' '}
                    {selectedMeshObject
                      ? `${selectedMeshObject.name.split('(')[0].trim()} (${
                          selectedMeshObject.fmaId
                        })`
                      : regionDetail?.name ||
                        activeRegionSummary?.name ||
                        selectedCode}
                  </span>
                )}
              </div>

              {viewMode === '3d' && (
                <div className="flex flex-wrap items-center gap-1">
                  {selectedMeshObject && (
                    <button
                      type="button"
                      data-testid="body-3d-focus-selected-btn"
                      onClick={handleFocusSelectedStructure}
                      className="rounded-lg border border-emerald-900/15 bg-[#e8f2e9] px-2.5 py-1 font-extrabold text-[#064d3c] hover:bg-emerald-200/70"
                      title="Focus Camera on Selected Structure"
                    >
                      ⌖ Focus
                    </button>
                  )}
                  <button
                    type="button"
                    data-testid="body-3d-rotate-left-btn"
                    onClick={() => setYaw((y) => y - 0.35)}
                    className="rounded-lg border border-emerald-900/15 bg-white px-2 py-1 font-bold text-[#172b23] hover:bg-[#e8f2e9]"
                    title="Rotate Left"
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    data-testid="body-3d-rotate-right-btn"
                    onClick={() => setYaw((y) => y + 0.35)}
                    className="rounded-lg border border-emerald-900/15 bg-white px-2 py-1 font-bold text-[#172b23] hover:bg-[#e8f2e9]"
                    title="Rotate Right"
                  >
                    ↻
                  </button>
                  <button
                    type="button"
                    data-testid="body-3d-zoom-in-btn"
                    onClick={() =>
                      setZoom((z) => Math.min(2.1, Number((z + 0.15).toFixed(2))))
                    }
                    className="rounded-lg border border-emerald-900/15 bg-white px-2 py-1 font-bold text-[#172b23] hover:bg-[#e8f2e9]"
                    title="Zoom In"
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    data-testid="body-3d-zoom-out-btn"
                    onClick={() =>
                      setZoom((z) => Math.max(0.7, Number((z - 0.15).toFixed(2))))
                    }
                    className="rounded-lg border border-emerald-900/15 bg-white px-2 py-1 font-bold text-[#172b23] hover:bg-[#e8f2e9]"
                    title="Zoom Out"
                  >
                    －
                  </button>
                  <button
                    type="button"
                    data-testid="body-3d-front-back-btn"
                    onClick={handleToggleFrontBack}
                    className="rounded-lg border border-emerald-900/15 bg-white px-2.5 py-1 font-bold text-[#172b23] hover:bg-[#e8f2e9]"
                  >
                    {isBackView ? 'Front View' : 'Back View'}
                  </button>
                  <button
                    type="button"
                    data-testid="body-3d-reset-view-btn"
                    onClick={handleResetView}
                    className="rounded-lg border border-emerald-900/15 bg-white px-2.5 py-1 font-extrabold text-[#087153] hover:bg-[#e8f2e9]"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* 3D Canvas Viewport */}
            {modelLoadError ? (
              <div
                data-testid="anatomy-model-error-state"
                className="flex h-[560px] flex-col items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-xs text-rose-900 space-y-3"
              >
                <div className="font-black text-sm">
                  Unable to load 3D Human Anatomy asset
                </div>
                <p>{modelLoadError}</p>
                <button
                  type="button"
                  data-testid="anatomy-model-retry-btn"
                  onClick={() => void loadSelfHostedAnatomyAtlas(referenceSex)}
                  className="rounded-xl bg-[#087153] px-4 py-2 font-extrabold text-white"
                >
                  Retry Loading 3D Model
                </button>
              </div>
            ) : modelLoadProgress < 100 ? (
              <div className="flex h-[560px] flex-col items-center justify-center rounded-2xl border border-stone-200 bg-stone-900 text-xs font-bold text-stone-200 space-y-2">
                <span>
                  Loading 3D Human Anatomical Mesh Atlas ({modelLoadProgress}%)...
                </span>
                <div className="h-2 w-48 overflow-hidden rounded-full bg-stone-700">
                  <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${modelLoadProgress}%` }}
                  />
                </div>
              </div>
            ) : viewMode === '3d' ? (
              <div className="relative overflow-hidden rounded-2xl border border-emerald-950/30 bg-[#0d1917] shadow-inner">
                <canvas
                  ref={canvasRef}
                  width={860}
                  height={920}
                  data-testid="body-3d-canvas"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onWheel={(e) => {
                    e.preventDefault();
                    setZoom((z) =>
                      Math.max(
                        0.7,
                        Math.min(2.1, z + (e.deltaY < 0 ? 0.1 : -0.1))
                      )
                    );
                  }}
                  className="w-full h-[520px] sm:h-[600px] cursor-grab active:cursor-grabbing touch-none block"
                />
                <div className="absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                  <span className="rounded-full bg-emerald-950/85 border border-emerald-500/40 px-3 py-1 text-[10px] font-extrabold tracking-wide text-emerald-300 uppercase">
                    {viewPreset === 'whole_body'
                      ? 'FULL INTERNAL ANATOMY (DEFAULT) • SKIN HIDDEN • MUSCLES + ORGANS + SKELETON'
                      : viewPreset === 'muscles'
                      ? 'MUSCULAR SYSTEM PRESET • SKIN HIDDEN • HEAD-TO-TOE STRIATED MYOLOGY'
                      : viewPreset === 'organs'
                      ? 'INTERNAL ORGANS PRESET • SKIN & MUSCLES HIDDEN • 11 VISCERAL ORGANS'
                      : 'SKELETAL SYSTEM PRESET • SKIN HIDDEN • AXIAL & APPENDICULAR BONE GEOMETRY'}
                  </span>
                </div>
                <div className="absolute bottom-2.5 left-3 right-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-emerald-100/80 pointer-events-none">
                  <span>
                    Drag to rotate • Scroll/pinch to zoom • Click any individual muscle, organ, or bone mesh
                  </span>
                  <span>
                    Zoom: {Math.round(zoom * 100)}% • Skin: Hidden
                  </span>
                </div>
              </div>
            ) : (
              /* 2D ACCESSIBLE SVG ANATOMICAL DIAGRAM FALLBACK */
              <div
                data-testid="body-2d-fallback-diagram"
                className="rounded-2xl border border-emerald-900/15 bg-[#f7fbf7] p-4 flex flex-col items-center"
              >
                <svg
                  viewBox="0 0 240 420"
                  className="w-full max-w-[280px] h-[420px]"
                  role="img"
                  aria-label="2D Interactive Human Body Nutrition Map"
                >
                  <g fill="#d8f0e1" stroke="#087153" strokeWidth="1.5">
                    <ellipse cx="120" cy="46" rx="24" ry="30" />
                    <rect x="110" y="75" width="20" height="16" rx="6" />
                    <path d="M80,92 Q120,86 160,92 L152,205 Q120,212 88,205 Z" />
                    <rect x="54" y="94" width="22" height="108" rx="11" />
                    <rect x="164" y="94" width="22" height="108" rx="11" />
                    <rect x="88" y="205" width="28" height="155" rx="13" />
                    <rect x="124" y="205" width="28" height="155" rx="13" />
                  </g>

                  {[
                    { code: 'brain_nerves', cx: 120, cy: 36, label: 'Brain' },
                    { code: 'eyes_vision', cx: 120, cy: 54, label: 'Eyes' },
                    {
                      code: 'endocrine_metabolic',
                      cx: 120,
                      cy: 82,
                      label: 'Thyroid',
                    },
                    { code: 'immune_defence', cx: 120, cy: 102, label: 'Thymus' },
                    {
                      code: 'respiratory_lungs',
                      cx: 102,
                      cy: 122,
                      label: 'Lungs',
                    },
                    {
                      code: 'heart_cardiovascular',
                      cx: 130,
                      cy: 126,
                      label: 'Heart',
                    },
                    {
                      code: 'blood_circulation',
                      cx: 120,
                      cy: 146,
                      label: 'Vessels',
                    },
                    {
                      code: 'muscles_strength',
                      cx: 175,
                      cy: 138,
                      label: 'Muscles',
                    },
                    { code: 'skin_epithelial', cx: 65, cy: 138, label: 'Skin' },
                    { code: 'digestive_gut', cx: 120, cy: 172, label: 'Gut' },
                    {
                      code: 'urinary_kidneys',
                      cx: 102,
                      cy: 186,
                      label: 'Kidneys',
                    },
                    { code: 'bones_joints', cx: 102, cy: 270, label: 'Bones' },
                  ].map((pt) => {
                    const isSel = selectedCode === pt.code;
                    return (
                      <g
                        key={pt.code}
                        onClick={() => handleSelectRegion(pt.code)}
                        className="cursor-pointer"
                        data-testid={`svg-hotspot-${pt.code}`}
                      >
                        <rect
                          x={pt.cx - 22}
                          y={pt.cy - 8}
                          width="44"
                          height="16"
                          rx="6"
                          fill={isSel ? '#064d3c' : '#087153'}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                        <text
                          x={pt.cx}
                          y={pt.cy + 3}
                          textAnchor="middle"
                          fontSize="7"
                          fontWeight="bold"
                          fill="#ffffff"
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* Structure Search & Individual 3D Mesh Inspector */}
          <div className="space-y-3 pt-1">
            <div className="rounded-2xl border border-emerald-900/12 bg-[#f1f6f1]/90 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#064d3c]">
                  Search &amp; Select Individual 3D Structures (
                  {filteredStructures.length})
                </span>
                <input
                  type="search"
                  data-testid="anatomy-structure-search"
                  value={structureSearchQuery}
                  onChange={(e) => setStructureSearchQuery(e.target.value)}
                  placeholder="Search muscle, bone, organ or FMA ID (e.g. Pectoralis, Heart, FMA:7088)..."
                  className="w-full sm:w-64 rounded-xl border border-emerald-900/20 bg-white px-2.5 py-1 text-xs text-[#172b23] placeholder:text-stone-400 focus:border-[#087153] focus:outline-none"
                />
              </div>

              <div
                data-testid="anatomy-individual-structures-list"
                className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1"
              >
                {filteredStructures.map((mesh) => {
                  const isMeshSelected = selectedMeshId === mesh.meshId;
                  const shortTitle = mesh.name.split('(')[0].trim();
                  return (
                    <button
                      key={mesh.meshId}
                      type="button"
                      data-testid={`anatomy-structure-chip-${mesh.meshId}`}
                      onClick={() => handleSelectIndividualStructure(mesh)}
                      onMouseEnter={() => {
                        setHoveredMeshId(mesh.meshId);
                        setHoveredCode(mesh.regionCode);
                      }}
                      onMouseLeave={() => {
                        setHoveredMeshId(null);
                        setHoveredCode(null);
                      }}
                      className={`rounded-xl px-2.5 py-1 text-[11px] font-bold transition flex items-center gap-1.5 ${
                        isMeshSelected
                          ? 'bg-[#064d3c] text-white shadow-2xs font-extrabold'
                          : 'border border-emerald-900/15 bg-white text-[#172b23] hover:border-[#087153] hover:bg-[#e8f2e9]'
                      }`}
                    >
                      <span className="font-mono text-[9px] opacity-75">
                        {mesh.fmaId}
                      </span>
                      <span>{shortTitle}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Keyboard-Accessible Anatomical Region System Selector Pills */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[#566960]">
                <span>Select Nutrition Body System ({regions.length} Systems)</span>
                <span className="text-[#087153] normal-case">
                  Synced live with Ask GharPlate AI &amp; Voice
                </span>
              </div>
              {loadingList ? (
                <div className="h-14 animate-pulse rounded-2xl bg-emerald-100/50" />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {regions.map((reg) => {
                    const active = selectedCode === reg.code;
                    return (
                      <button
                        key={reg.code}
                        type="button"
                        data-testid={`body-region-pill-${reg.code}`}
                        onClick={() => handleSelectRegion(reg.code)}
                        onMouseEnter={() => setHoveredCode(reg.code)}
                        onMouseLeave={() => setHoveredCode(null)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                          active
                            ? 'bg-[#087153] text-white shadow-2xs'
                            : 'border border-emerald-900/15 bg-white text-[#172b23] hover:bg-[#e8f2e9]'
                        }`}
                      >
                        {reg.category}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (5 Cols): SELECTED ANATOMY INFORMATION PANEL */}
        <section
          data-testid="selected-anatomy-info-panel"
          className="lg:col-span-5 flex flex-col justify-between space-y-5"
        >
          {!selectedCode && !regionDetail ? (
            <div className="gp-surface-elevated rounded-3xl p-8 sm:p-10 text-center space-y-4 h-full flex flex-col items-center justify-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d8f0e1] text-2xl">
                🧬
              </div>
              <h2 className="text-xl font-black text-[#172b23]">{initialPrompt}</h2>
              <p className="text-xs text-[#566960] max-w-md mx-auto leading-relaxed">
                Click or tap any individual 3D anatomical structure on the skinless internal model — such as Heart (`FMA:7088`), Brain (`FMA:50801`), Lungs (`FMA:7195`), Liver (`FMA:7197`), Stomach (`FMA:7148`), Kidneys (`FMA:7203`), Pectoralis Major (`FMA:9627`), Quadriceps (`FMA:22428`), or Thoracic Rib Cage (`FMA:7480`) — to inspect its physiological role and populate the full-width nutrition and Indian food sections below.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {regions.slice(0, 6).map((r) => (
                  <button
                    key={r.code}
                    type="button"
                    onClick={() => handleSelectRegion(r.code)}
                    className="rounded-xl border border-emerald-900/20 bg-[#e8f2e9] px-3.5 py-2 text-xs font-extrabold text-[#064d3c] hover:bg-[#d8f0e1]"
                  >
                    Explore {r.name} →
                  </button>
                ))}
              </div>
            </div>
          ) : loadingDetail && !regionDetail ? (
            <div className="h-96 animate-pulse rounded-3xl bg-emerald-100/50" />
          ) : (
            regionDetail && (
              <div
                data-testid="body-region-detail-panel"
                className="space-y-5 h-full flex flex-col justify-between"
              >
                {/* 1. Selected 3D Anatomical Structure Card */}
                {selectedMeshObject && (
                  <div
                    data-testid="selected-3d-structure-card"
                    className="rounded-3xl border border-emerald-400/50 bg-gradient-to-br from-[#064d3c] via-[#087153] to-[#064d3c] text-white p-6 shadow-md space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-emerald-300/20 border border-emerald-300/40 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-200">
                        SELECTED 3D ANATOMICAL STRUCTURE • {selectedMeshObject.fmaId}
                      </span>
                      <span className="text-[11px] font-bold text-emerald-100">
                        {selectedMeshObject.anatomicalSystemLabel}
                      </span>
                    </div>
                    <h3
                      data-testid="selected-3d-structure-name"
                      className="text-lg sm:text-xl font-black text-white leading-snug"
                    >
                      {selectedMeshObject.name}
                    </h3>
                    {selectedMeshObject.structuralDescription && (
                      <p className="text-xs text-emerald-50/90 leading-relaxed">
                        {selectedMeshObject.structuralDescription}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                      <button
                        type="button"
                        onClick={handleFocusSelectedStructure}
                        className="rounded-xl bg-white/15 hover:bg-white/25 px-3 py-1 font-bold text-white transition"
                      >
                        ⌖ Focus Camera on {selectedMeshObject.fmaId}
                      </button>
                      <a
                        href="#full-width-foods-anchor"
                        className="rounded-xl bg-amber-300 px-3 py-1 font-extrabold text-stone-950 hover:bg-amber-200 transition"
                      >
                        Jump to Verified Foods ({regionDetail.foods?.length || 0}) ↓
                      </a>
                    </div>
                  </div>
                )}

                {/* 2. Selected Body Region Physiology, Function & Nutrient Overview */}
                <div className="gp-surface-elevated rounded-3xl p-6 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-[#d8f0e1] px-3 py-0.5 text-xs font-extrabold text-[#064d3c]">
                            {regionDetail.anatomical_system}
                          </span>
                          {(selectedMeshObject?.fmaId || regionDetail.fma_id) && (
                            <span className="rounded-full bg-[#e8f2e9] px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#172b23]">
                              {selectedMeshObject?.fmaId || regionDetail.fma_id}
                            </span>
                          )}
                          {regionDetail.review_status && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold text-[#087153] border border-emerald-200">
                              ✓ {String(regionDetail.review_status).replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                        <h2
                          data-testid="selected-body-region-title"
                          className="mt-2 text-2xl font-black text-[#172b23]"
                        >
                          {regionDetail.name}
                        </h2>
                      </div>
                      {regionDetail.source && (
                        <a
                          href={regionDetail.source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-emerald-900/15 bg-[#e8f2e9] px-3 py-1.5 text-[11px] font-extrabold text-[#064d3c] hover:underline"
                        >
                          {regionDetail.source.organization} ({regionDetail.source.year}) ↗
                        </a>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-[#172b23] leading-relaxed">
                      {regionDetail.physiological_function}
                    </p>

                    <div className="rounded-2xl border border-emerald-900/15 bg-[#e8f2e9]/75 p-4 text-xs space-y-1.5">
                      <div className="font-extrabold text-[#064d3c]">
                        Evidence-Backed Indian Dietary Pattern Guidance:
                      </div>
                      <p className="text-[#172b23] leading-relaxed">
                        {regionDetail.nutrition_connection}{' '}
                        {regionDetail.dietary_pattern_guidance}
                      </p>
                      {regionDetail.hydration_connection && (
                        <p className="text-[#087153] font-bold pt-1">
                          💧 Hydration Link: {regionDetail.hydration_connection}
                        </p>
                      )}
                    </div>

                    {/* Nutrients Overview Snapshot */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-[#566960]">
                        <span>
                          Key Nutrients Overview ({regionDetail.nutrients?.length || 0})
                        </span>
                        <a
                          href="#full-width-nutrients-anchor"
                          className="text-[#087153] hover:underline normal-case"
                        >
                          See Full Nutrient Cards Below ↓
                        </a>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(regionDetail.nutrients || []).map((nut: any) => (
                          <span
                            key={`overview-pill-${nut.nutrient_code}`}
                            className="rounded-xl border border-emerald-900/15 bg-white px-3 py-1.5 text-xs font-extrabold text-[#064d3c] shadow-2xs"
                          >
                            ✓ {nut.nutrient_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats Footer inside Level A Right Panel */}
                  <div className="grid grid-cols-3 gap-2.5 pt-4 border-t border-emerald-900/10 text-center text-xs">
                    <div className="rounded-2xl bg-[#f1f6f1] p-2.5">
                      <div className="text-lg font-black text-[#087153]">
                        {regionDetail.nutrients?.length || 0}
                      </div>
                      <div className="text-[10px] font-bold text-[#566960]">
                        Key Nutrients
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#f1f6f1] p-2.5">
                      <div className="text-lg font-black text-[#087153]">
                        {regionDetail.foods?.length || 0}
                      </div>
                      <div className="text-[10px] font-bold text-[#566960]">
                        Verified Foods
                      </div>
                    </div>
                    <div className="rounded-2xl bg-[#f1f6f1] p-2.5">
                      <div className="text-lg font-black text-[#087153]">
                        {regionDetail.source?.year || 2024}
                      </div>
                      <div className="text-[10px] font-bold text-[#566960]">
                        ICMR-NIN DGI
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </section>
      </div>

      {/* =========================================================================
          LEVEL B — FULL-WIDTH NUTRITION, FOOD RECOMMENDATIONS, COMPARISON, RECIPES & EVIDENCE
          Spans 100% of GharPlate's content area from left edge to right edge!
          ========================================================================= */}
      {regionDetail && (
        <div
          data-testid="anatomy-full-width-level-b"
          className="w-full space-y-8 pt-2"
        >
          {/* 1. FULL-WIDTH KEY NUTRIENTS SECTION */}
          <section
            id="full-width-nutrients-anchor"
            data-testid="full-width-nutrients-section"
            className="w-full gp-surface-elevated rounded-3xl p-6 sm:p-8 space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/10 pb-4">
              <div>
                <span className="rounded-full bg-[#d8f0e1] px-3 py-0.5 text-[11px] font-extrabold text-[#064d3c] uppercase tracking-wider">
                  Full-Width Physiological Nutrient Matrix
                </span>
                <h2 className="mt-1.5 text-xl sm:text-2xl font-black text-[#172b23]">
                  Key Nutrients Supporting Normal {regionDetail.name} Function (
                  {regionDetail.nutrients?.length || 0})
                </h2>
                <p className="text-xs text-[#566960]">
                  These nutrients support normal physiological function according to reviewed ICMR-NIN Dietary Guidelines for Indians 2024.
                </p>
              </div>
              <span className="rounded-xl bg-[#e8f2e9] px-3.5 py-1.5 text-xs font-extrabold text-[#064d3c]">
                Body System: {regionDetail.anatomical_system}
              </span>
            </div>

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {(regionDetail.nutrients || []).map((nut: any) => (
                <div
                  key={nut.nutrient_code}
                  data-testid={`region-nutrient-card-${nut.nutrient_code}`}
                  className="gp-card-interactive rounded-2xl border border-emerald-900/15 bg-[#f7fbf7] p-5 text-xs flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm sm:text-base font-black text-[#064d3c]">
                        {nut.nutrient_name}
                      </strong>
                      <span className="shrink-0 rounded-full bg-[#d8f0e1] px-2.5 py-0.5 text-[10px] font-extrabold text-[#064d3c]">
                        {nut.evidence_grade}
                      </span>
                    </div>
                    <p className="text-[#172b23] leading-relaxed">
                      {nut.physiological_role}
                    </p>
                  </div>

                  <div className="space-y-1 border-t border-emerald-900/10 pt-2.5">
                    {nut.daily_reference_note && (
                      <div className="text-[11px] font-bold text-[#087153]">
                        RDA / Target: {nut.daily_reference_note}
                      </div>
                    )}
                    <div className="text-[10px] font-semibold text-[#566960]">
                      Source: {nut.source_name} ({nut.publication_year || 2024})
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 2. FULL-WIDTH VERIFIED INDIAN FOOD SOURCES & RECOMMENDATIONS */}
          <section
            id="full-width-foods-anchor"
            data-testid="full-width-foods-section"
            className="w-full gp-surface-elevated rounded-3xl p-6 sm:p-8 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-900/10 pb-4">
              <div>
                <span className="rounded-full bg-[#d8f0e1] px-3 py-0.5 text-[11px] font-extrabold text-[#064d3c] uppercase tracking-wider">
                  Verified IFCT 2017 &amp; ICMR-NIN 2024 Food Sources
                </span>
                <h2 className="mt-1.5 text-xl sm:text-2xl font-black text-[#172b23]">
                  Verified Indian Foods Supporting {regionDetail.name} (
                  {regionDetail.foods?.length || 0})
                </h2>
                <p className="text-xs text-[#566960]">
                  These foods contain nutrients that support normal physiological function. Values come directly from GharPlate’s verified IFCT 2017 database (unmeasured nutrients remain NULL).
                </p>
              </div>

              {(regionDetail.foods?.length || 0) > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllFoodCards((v) => !v)}
                  className="rounded-xl border border-emerald-900/20 bg-[#e8f2e9] px-4 py-2 text-xs font-extrabold text-[#064d3c] hover:bg-[#d8f0e1] transition"
                >
                  {showAllFoodCards
                    ? 'Show Top 4 Foods'
                    : `Show All ${regionDetail.foods.length} Verified Foods`}
                </button>
              )}
            </div>

            {/* Responsive Full-Width Food Grid: 3–4 Cards per Row on Desktop, 2 on Tablet, 1 on Mobile */}
            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayedFoods.map((food: any) => {
                const primaryVal =
                  food.nutrients_per_100?.[food.primary_nutrient_code];
                return (
                  <div
                    key={food.slug}
                    data-testid={`body-region-food-card-${food.slug}`}
                    className="gp-card-interactive rounded-3xl border border-emerald-900/15 bg-white overflow-hidden flex flex-col justify-between shadow-xs"
                  >
                    <div>
                      <div className="relative">
                        <FoodImage
                          src={food.image_url}
                          foodName={food.name_en}
                          foodSlug={food.slug}
                          categorySlug="whole-foods"
                          aspectClass="aspect-[16/10] w-full"
                        />
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                          <span className="rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-extrabold text-[#064d3c] shadow-2xs">
                            {food.is_vegetarian ? '🌿 Vegetarian' : '🍗 Non-Veg'}
                          </span>
                        </div>
                        <div className="absolute bottom-2.5 right-2.5">
                          <span className="rounded-full bg-[#064d3c]/90 px-2.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-xs">
                            {food.source_name} ({food.source_year})
                          </span>
                        </div>
                      </div>

                      <div className="p-4 space-y-2.5 text-xs">
                        <div>
                          <Link
                            to={`/foods/${food.slug}`}
                            className="block text-base font-black text-[#172b23] hover:text-[#087153] line-clamp-1"
                          >
                            {food.name_en}
                          </Link>
                          <div className="text-[11px] font-semibold text-[#566960]">
                            Serving: {food.standard_serving_name} (
                            {food.standard_serving_grams}g)
                          </div>
                        </div>

                        <p className="text-[#172b23] leading-relaxed line-clamp-3">
                          {food.relevance_explanation}
                        </p>

                        {food.preparation_or_serving_tip && (
                          <div className="rounded-xl bg-[#e8f2e9] border border-emerald-900/10 px-3 py-1.5 text-[11px] text-[#064d3c]">
                            <strong>Kitchen Tip:</strong>{' '}
                            {food.preparation_or_serving_tip}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-1.5 pt-1 text-[11px] font-mono">
                          <span className="rounded-lg bg-[#d8f0e1] border border-emerald-900/15 px-2.5 py-0.5 font-extrabold text-[#064d3c]">
                            {food.primary_nutrient_code.replace(/_/g, ' ')}:{' '}
                            {primaryVal !== null && primaryVal !== undefined
                              ? primaryVal
                              : 'NULL'}{' '}
                            / {food.default_basis}
                          </span>
                          <span className="rounded-lg bg-[#f1f6f1] border border-emerald-900/10 px-2 py-0.5 font-bold text-[#172b23]">
                            Protein: {food.nutrients_per_100?.protein_g ?? 'NULL'}g
                          </span>
                          <span className="rounded-lg bg-[#f1f6f1] border border-emerald-900/10 px-2 py-0.5 font-bold text-[#172b23]">
                            {food.nutrients_per_100?.energy_kcal ?? 'NULL'} kcal
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-semibold text-[#566960] pt-0.5">
                          <span>
                            Basis: Per {food.default_basis}
                          </span>
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[#087153]">
                            ✓ {(food.data_quality || 'verified').replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border-t border-emerald-900/10 bg-[#f7fbf7] space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          to={`/foods/${food.slug}`}
                          data-testid={`body-food-detail-link-${food.slug}`}
                          className="font-extrabold text-[#087153] hover:underline"
                        >
                          Open Food Detail →
                        </Link>
                        <button
                          type="button"
                          data-testid={`body-food-log-trigger-${food.slug}`}
                          onClick={() =>
                            setConfirmingFoodSlug((cur) =>
                              cur === food.slug ? null : food.slug
                            )
                          }
                          className="rounded-xl bg-[#087153] px-3 py-1.5 font-extrabold text-white hover:bg-[#064d3c] transition"
                        >
                          + Log in Diary
                        </button>
                      </div>

                      {confirmingFoodSlug === food.slug && (
                        <form
                          onSubmit={(e) =>
                            void handleConfirmLogFoodFromExplorer(
                              e,
                              food.slug,
                              food.name_en
                            )
                          }
                          className="rounded-xl border border-emerald-300 bg-white p-2.5 space-y-2"
                        >
                          <div className="font-bold text-[#064d3c] text-[11px]">
                            Confirm serving to add to Today’s Food Diary:
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              step="0.5"
                              min="0.25"
                              max="10"
                              value={logQty}
                              onChange={(e) => setLogQty(e.target.value)}
                              className="w-16 rounded-lg border border-stone-300 bg-white px-2 py-1 font-bold"
                            />
                            <select
                              value={logMealCategory}
                              onChange={(e) => setLogMealCategory(e.target.value)}
                              className="flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1 font-bold"
                            >
                              <option value="breakfast">Breakfast</option>
                              <option value="lunch">Lunch</option>
                              <option value="evening_snack">Evening Snack</option>
                              <option value="dinner">Dinner</option>
                            </select>
                            <button
                              type="submit"
                              data-testid={`body-explorer-confirm-log-${food.slug}`}
                              className="rounded-lg bg-[#087153] px-3 py-1 font-extrabold text-white"
                            >
                              Confirm
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. FULL-WIDTH FOOD & NUTRIENT DENSITY COMPARISON TABLE */}
          {(regionDetail.foods?.length || 0) > 0 && (
            <section
              data-testid="full-width-food-comparison-section"
              className="w-full gp-surface-elevated rounded-3xl p-6 sm:p-8 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-[#172b23]">
                    Side-by-Side Nutrient Comparison for {regionDetail.name}
                  </h2>
                  <p className="text-xs text-[#566960]">
                    Compare primary nutrient density, protein, energy, and household serving sizes across verified Indian foods.
                  </p>
                </div>
                <Link
                  to="/compare"
                  className="rounded-xl border border-emerald-900/15 bg-[#e8f2e9] px-3.5 py-1.5 text-xs font-extrabold text-[#064d3c] hover:bg-[#d8f0e1]"
                >
                  Open Multi-Product Comparator →
                </Link>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-emerald-900/15 text-[#566960] uppercase text-[11px]">
                      <th className="py-2.5 pr-3">Indian Food Source</th>
                      <th className="py-2.5 px-3">Household Serving</th>
                      <th className="py-2.5 px-3">Key Supporting Nutrient (per 100g)</th>
                      <th className="py-2.5 px-3">Protein / 100g</th>
                      <th className="py-2.5 px-3">Energy / 100g</th>
                      <th className="py-2.5 pl-3">Composition Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-900/10">
                    {(regionDetail.foods || []).map((food: any) => {
                      const pVal =
                        food.nutrients_per_100?.[food.primary_nutrient_code];
                      return (
                        <tr
                          key={`cmp-${food.slug}`}
                          className="hover:bg-[#e8f2e9]/40 transition"
                        >
                          <td className="py-2.5 pr-3 font-extrabold text-[#172b23]">
                            <Link
                              to={`/foods/${food.slug}`}
                              className="hover:text-[#087153] hover:underline"
                            >
                              {food.name_en}
                            </Link>
                          </td>
                          <td className="py-2.5 px-3 text-[#566960]">
                            {food.standard_serving_name} ({food.standard_serving_grams}g)
                          </td>
                          <td className="py-2.5 px-3 font-mono font-extrabold text-[#064d3c]">
                            {food.primary_nutrient_code.replace(/_/g, ' ')}:{' '}
                            {pVal !== null && pVal !== undefined ? pVal : 'NULL'}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#172b23]">
                            {food.nutrients_per_100?.protein_g ?? 'NULL'} g
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[#566960]">
                            {food.nutrients_per_100?.energy_kcal ?? 'NULL'} kcal
                          </td>
                          <td className="py-2.5 pl-3 text-[11px] font-semibold text-[#087153]">
                            {food.source_name} ({food.source_year})
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 4. FULL-WIDTH RECOMMENDED INDIAN RECIPES SECTION */}
          {relatedRecipes.length > 0 && (
            <section
              data-testid="full-width-recipes-section"
              className="w-full gp-surface-elevated rounded-3xl p-6 sm:p-8 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="rounded-full bg-[#d8f0e1] px-3 py-0.5 text-[11px] font-extrabold text-[#064d3c] uppercase tracking-wider">
                    Guided Indian Kitchen Integration
                  </span>
                  <h2 className="mt-1.5 text-lg sm:text-xl font-black text-[#172b23]">
                    Recommended Indian Recipes Supporting {regionDetail.name}
                  </h2>
                  <p className="text-xs text-[#566960]">
                    Complete home-cooked recipes calculated from verified IFCT 2017 ingredients with step-by-step Guided Cooking timers.
                  </p>
                </div>
                <Link
                  to="/recipes/discover"
                  className="rounded-xl bg-[#087153] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#064d3c] transition"
                >
                  Explore All Recipes →
                </Link>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {relatedRecipes.slice(0, 3).map((rec: any) => (
                  <div
                    key={rec.id}
                    className="gp-card-interactive rounded-2xl border border-emerald-900/15 bg-white overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <FoodImage
                        src={rec.image_url}
                        foodName={rec.title}
                        categorySlug="indian-dishes"
                        aspectClass="aspect-[16/9]"
                      />
                      <div className="p-4 space-y-2 text-xs">
                        <div className="text-[11px] font-bold uppercase text-[#087153]">
                          {rec.meal_type?.replace(/_/g, ' ') || 'Balanced Meal'} •{' '}
                          {rec.servings || 2} servings
                        </div>
                        <Link
                          to={`/recipes/${rec.id}`}
                          className="block text-base font-black text-[#172b23] hover:text-[#087153]"
                        >
                          {rec.title}
                        </Link>
                        <p className="text-[#566960] line-clamp-2">
                          {rec.why_recommended}
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-1 font-mono text-[11px]">
                          <span className="rounded-lg bg-[#f1f6f1] px-2.5 py-0.5 font-bold text-[#172b23]">
                            {rec.per_serving_macros?.energy_kcal ?? 'NULL'} kcal
                          </span>
                          <span className="rounded-lg bg-[#d8f0e1] px-2.5 py-0.5 font-extrabold text-[#064d3c]">
                            {rec.per_serving_macros?.protein_g ?? 'NULL'}g Protein
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="p-4 border-t border-emerald-900/10 bg-[#f7fbf7] flex items-center justify-between text-xs">
                      <Link
                        to={`/recipes/${rec.id}`}
                        className="font-extrabold text-[#087153] hover:underline"
                      >
                        📖 View Recipe &amp; Cook Mode →
                      </Link>
                      <span className="text-[10px] font-semibold text-[#566960]">
                        {rec.completeness_pct || 100}% Verified
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 5. FULL-WIDTH EVIDENCE, CLINICAL REFERENCES & 3D ANATOMY ATTRIBUTION */}
          <section
            data-testid="full-width-evidence-section"
            className="w-full rounded-3xl border border-emerald-900/15 bg-white/90 p-6 text-xs text-[#566960] grid gap-6 lg:grid-cols-3"
          >
            <div className="space-y-1.5">
              <div className="font-extrabold text-[#172b23]">
                1. Evidence &amp; Physiological Scope
              </div>
              <p className="leading-relaxed">
                {regionDetail.evidence_limitation_note} These foods contain nutrients that support normal physiological function; no single food cures, repairs, or treats organ disease.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="font-extrabold text-[#172b23]">
                2. Clinical &amp; Composition References
              </div>
              <p className="leading-relaxed">
                Primary References: ICMR-NIN Indian Food Composition Tables (IFCT 2017) and ICMR-NIN Dietary Guidelines for Indians (2024).{' '}
                {medicalDisclaimer}
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="font-extrabold text-[#172b23]">
                3. Open-License 3D Anatomy Attribution (CC BY 4.0)
              </div>
              <p className="leading-relaxed">
                BodyParts3D 4.0, © The Database Center for Life Science (CC BY 4.0, Male Reference). Human Reference Atlas v1.10, HuBMAP, by Kristen Browne &amp; Heidi Schlehlein, Visible Human Project of the U.S. National Library of Medicine (CC BY 4.0, Female Reference).
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
