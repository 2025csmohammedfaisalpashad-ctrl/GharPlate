import { useEffect, useState } from 'react';
import type { AssistantPageContext, AssistantSelectedEntity } from '../types/api';

const ACTIVE_CONTEXT_EVENT = 'gharplate:assistant-context-updated';
export const OPEN_ASSISTANT_EVENT = 'gharplate:open-assistant';

export interface OpenAssistantEventDetail {
  initialPrompt?: string;
  startNewChat?: boolean;
}

export interface ActiveAssistantContextStore {
  page_type?: string | null;
  route?: string | null;
  selected_entity?: AssistantSelectedEntity | null;
  selected_condition?: Record<string, any> | string | null;
  selected_body_region?: Record<string, any> | string | null;
  selected_recipe?: Record<string, any> | string | null;
  selected_product?: Record<string, any> | string | null;
  food_image_analysis?: Record<string, any> | null;
  health_report_context?: Record<string, any> | null;
  symptom_review_context?: Record<string, any> | null;
  food_discovery_context?: Record<string, any> | null;
  food_slug?: string | null;
  barcode?: string | null;
  condition_code?: string | null;
}

let currentActiveContext: ActiveAssistantContextStore = {};

export function publishAssistantContext(next: ActiveAssistantContextStore): void {
  currentActiveContext = { ...next };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ActiveAssistantContextStore>(ACTIVE_CONTEXT_EVENT, {
        detail: currentActiveContext,
      })
    );
  }
}

export function openAssistantWorkspace(detail?: OpenAssistantEventDetail): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<OpenAssistantEventDetail>(OPEN_ASSISTANT_EVENT, {
        detail: detail || {},
      })
    );
  }
}

export function clearAssistantEntityContext(matchingRoute?: string): void {
  if (matchingRoute && currentActiveContext.route && currentActiveContext.route !== matchingRoute) {
    return;
  }
  currentActiveContext = {};
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<ActiveAssistantContextStore>(ACTIVE_CONTEXT_EVENT, {
        detail: currentActiveContext,
      })
    );
  }
}

export function getPublishedAssistantContext(): ActiveAssistantContextStore {
  return currentActiveContext;
}

export function usePublishedAssistantContext(): ActiveAssistantContextStore {
  const [ctx, setCtx] = useState<ActiveAssistantContextStore>(() => currentActiveContext);

  useEffect(() => {
    const handler = (evt: Event) => {
      const customEvt = evt as CustomEvent<ActiveAssistantContextStore>;
      setCtx({ ...(customEvt.detail || currentActiveContext) });
    };
    window.addEventListener(ACTIVE_CONTEXT_EVENT, handler);
    return () => window.removeEventListener(ACTIVE_CONTEXT_EVENT, handler);
  }, []);

  return ctx;
}

export function deriveStructuredPageContext(
  pathname: string,
  published: ActiveAssistantContextStore,
  householdToken?: string | null,
  activeMember?: {
    id: number;
    display_name: string;
    dietary_preference?: string;
    age_group?: string;
    selected_conditions?: string[];
    allergies?: string[];
  } | null
): AssistantPageContext {
  const isSameRoute = !published.route || published.route === pathname;
  const activePub = isSameRoute ? published : {};

  const foodMatch = pathname.match(/^\/foods\/([^/]+)/);
  const condMatch = pathname.match(/^\/conditions\/([^/]+)/);
  const recipeMatch = pathname.match(/^\/recipes\/([^/]+)/);
  const isRecognitionPage = pathname.startsWith('/recognition');
  const isHealthReportsPage = pathname.startsWith('/health/reports');
  const isSymptomReviewPage = pathname.startsWith('/health/symptoms');
  const isFoodNearbyPage = pathname.startsWith('/food-nearby');
  const isBodyExplorer = pathname.startsWith('/explore/body-nutrition');
  const isBarcodePage = pathname.startsWith('/barcode');
  const isTrackerPage = pathname.startsWith('/fitness/tracker');
  const isGoalsPage = pathname.startsWith('/fitness/goals');
  const isMeasurementsPage = pathname.startsWith('/health/');
  const isMemberPage = pathname.startsWith('/household');

  let pageType = activePub.page_type || 'general';
  let selectedEntity: AssistantSelectedEntity | null = activePub.selected_entity || null;

  if (isRecognitionPage) {
    pageType = 'food_image_analysis';
    if (activePub.selected_entity) {
      selectedEntity = activePub.selected_entity;
    }
  } else if (isHealthReportsPage) {
    pageType = 'health_report';
    if (activePub.selected_entity) {
      selectedEntity = activePub.selected_entity;
    }
  } else if (isSymptomReviewPage) {
    pageType = 'symptom_review';
    if (activePub.selected_entity) {
      selectedEntity = activePub.selected_entity;
    }
  } else if (isFoodNearbyPage) {
    pageType = 'food_discovery';
    if (activePub.selected_entity) {
      selectedEntity = activePub.selected_entity;
    }
  } else if (foodMatch) {
    const slug = decodeURIComponent(foodMatch[1]);
    pageType = activePub.page_type || (slug.startsWith('pkg-') ? 'packaged_product' : 'food_detail');
    if (!selectedEntity || selectedEntity.id !== slug) {
      selectedEntity = {
        type: slug.startsWith('pkg-') ? 'packaged_product' : 'food',
        id: slug,
        name: activePub.selected_entity?.name || slug.replace(/-/g, ' '),
      };
    }
  } else if (isBodyExplorer) {
    pageType = 'body_region';
    if (activePub.selected_entity?.type === 'body_region') {
      selectedEntity = activePub.selected_entity;
    }
  } else if (recipeMatch && !['calculator', 'saved', 'discover'].includes(recipeMatch[1])) {
    const recId = decodeURIComponent(recipeMatch[1]);
    pageType = 'recipe_detail';
    if (!selectedEntity || selectedEntity.id !== recId) {
      selectedEntity = {
        type: 'recipe',
        id: recId,
        name: activePub.selected_entity?.name || recId.replace(/-/g, ' '),
      };
    }
  } else if (condMatch) {
    const condCode = decodeURIComponent(condMatch[1]);
    pageType = 'condition_detail';
    if (!selectedEntity || selectedEntity.id !== condCode) {
      selectedEntity = {
        type: 'condition',
        id: condCode,
        name: activePub.selected_entity?.name || condCode.replace(/_/g, ' '),
      };
    }
  } else if (isBarcodePage) {
    pageType = 'barcode_result';
  } else if (isTrackerPage) {
    pageType = 'daily_tracker';
  } else if (isGoalsPage) {
    pageType = 'fitness_goal';
  } else if (isMeasurementsPage) {
    pageType = 'health_measurement';
  } else if (isMemberPage) {
    pageType = 'household_member';
  } else {
    selectedEntity = null;
  }

  const foodSlug =
    activePub.food_slug ||
    (foodMatch ? decodeURIComponent(foodMatch[1]) : null) ||
    (selectedEntity?.type === 'food' || selectedEntity?.type === 'packaged_product'
      ? selectedEntity.id || null
      : null);

  const conditionCode =
    activePub.condition_code ||
    (condMatch ? decodeURIComponent(condMatch[1]) : null) ||
    (selectedEntity?.type === 'condition' ? selectedEntity.id || null : null);

  return {
    current_path: pathname,
    route: pathname,
    page_type: pageType,
    food_slug: foodSlug,
    barcode: activePub.barcode || null,
    condition_code: conditionCode,
    household_token: householdToken || null,
    member_id: activeMember?.id ?? null,
    selected_entity: selectedEntity,
    selected_member: activeMember
      ? {
          id: activeMember.id,
          name: activeMember.display_name,
          dietary_preference: activeMember.dietary_preference,
          age_group: activeMember.age_group,
        }
      : null,
    selected_condition:
      activePub.selected_condition || (conditionCode ? { code: conditionCode } : null),
    selected_body_region:
      isBodyExplorer && activePub.selected_body_region ? activePub.selected_body_region : null,
    selected_recipe:
      pageType === 'recipe_detail' && activePub.selected_recipe
        ? activePub.selected_recipe
        : null,
    selected_product:
      (pageType === 'packaged_product' || pageType === 'barcode_result') &&
      activePub.selected_product
        ? activePub.selected_product
        : null,
    food_image_analysis:
      isRecognitionPage && activePub.food_image_analysis
        ? activePub.food_image_analysis
        : null,
    health_report_context:
      (isHealthReportsPage || isSymptomReviewPage) && activePub.health_report_context
        ? activePub.health_report_context
        : null,
    symptom_review_context:
      (isHealthReportsPage || isSymptomReviewPage) && activePub.symptom_review_context
        ? activePub.symptom_review_context
        : null,
    food_discovery_context:
      isFoodNearbyPage && activePub.food_discovery_context
        ? activePub.food_discovery_context
        : null,
  };
}
