import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  clampSidebarWidth,
  findGroupForPathname,
  isNavItemActive,
  Layout,
  NAV_GROUPS,
  readStoredSidebarWidth,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_STORAGE_KEY,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from '../src/components/Layout';
import {
  OpenStreetMapView,
  OSM_COPYRIGHT_HREF,
  STANDARD_OSM_TILE_URL,
} from '../src/components/OpenStreetMapView';
import { deriveStructuredPageContext } from '../src/hooks/useAssistantContext';
import { HealthReportsAndSymptomsPage } from '../src/pages/HealthReportsAndSymptomsPage';
import { FoodNearbyPage } from '../src/pages/FoodNearbyPage';
import { api } from '../src/services/api';

vi.mock('../src/App', () => ({
  useAuthGate: () => ({
    authProfile: { id: 1, name: 'Test User', email: 'test@gharplate.local' },
    signOut: vi.fn(),
  }),
}));

vi.mock('../src/hooks/useHousehold', () => ({
  useHousehold: () => ({
    household: {
      id: 1,
      household_token: 'hh-test',
      name: 'Test Household',
      members: [
        {
          id: 1,
          display_name: 'Aarav',
          age_group: 'adult',
          dietary_preference: 'vegetarian',
          selected_conditions: [],
          allergies: [],
          intolerances: [],
        },
      ],
    },
    activeMember: {
      id: 1,
      display_name: 'Aarav',
      age_group: 'adult',
      dietary_preference: 'vegetarian',
      selected_conditions: [],
      allergies: [],
      intolerances: [],
    },
    setActiveMemberId: vi.fn(),
  }),
}));

vi.mock('../src/components/AssistantWorkspacePanel', () => ({
  AssistantWorkspacePanel: () => <div data-testid="mock-assistant-drawer" />,
}));

describe('GharPlate Fixed & Resizable Left Sidebar, Health Reports, Symptom Review & OpenStreetMap Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('includes Health Reports, Symptom Review, and Find Food Nearby in NAV_GROUPS', () => {
    const exploreGroup = NAV_GROUPS.find((g) => g.id === 'explore');
    const healthGroup = NAV_GROUPS.find((g) => g.id === 'health');
    expect(exploreGroup).toBeDefined();
    expect(healthGroup).toBeDefined();

    const nearbyItem = exploreGroup!.items.find((i) => i.to === '/food-nearby');
    expect(nearbyItem).toBeDefined();
    expect(nearbyItem!.label).toBe('Find Food Nearby');
    expect(isNavItemActive(nearbyItem!, '/food-nearby')).toBe(true);
    expect(findGroupForPathname('/food-nearby')).toBe('explore');

    const reportsItem = healthGroup!.items.find((i) => i.to === '/health/reports');
    const symptomsItem = healthGroup!.items.find((i) => i.to === '/health/symptoms');
    expect(reportsItem).toBeDefined();
    expect(reportsItem!.label).toBe('Health Reports');
    expect(symptomsItem).toBeDefined();
    expect(symptomsItem!.label).toBe('Symptom Review');
    expect(findGroupForPathname('/health/reports')).toBe('health');
    expect(findGroupForPathname('/health/symptoms')).toBe('health');
  });

  it('maintains fixed desktop sidebar, independent right-hand scroll container, horizontal resize handle, clamping, and localStorage width persistence', () => {
    expect(clampSidebarWidth(120)).toBe(SIDEBAR_MIN_WIDTH);
    expect(clampSidebarWidth(500)).toBe(SIDEBAR_MAX_WIDTH);
    expect(clampSidebarWidth(285)).toBe(285);
    expect(readStoredSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);

    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '9999');
    expect(readStoredSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);

    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, '276');
    expect(readStoredSidebarWidth()).toBe(276);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/foods']}>
        <Layout>
          <div data-testid="tall-page-content" style={{ height: '2400px' }}>
            Scrollable Main Content
          </div>
        </Layout>
      </MemoryRouter>
    );

    const appShell = screen.getByTestId('gharplate-app-shell');
    const leftSidebar = screen.getByTestId('desktop-left-sidebar');
    const sidebarScroll = screen.getByTestId('sidebar-scroll-container');
    const mainWorkspace = screen.getByTestId('main-content-workspace');
    const resizeHandle = screen.getByTestId('sidebar-resize-handle');

    // Verify application-shell independent scrolling classes
    expect(appShell.className).toContain('lg:h-screen');
    expect(appShell.className).toContain('lg:overflow-hidden');
    expect(leftSidebar.className).toContain('lg:h-full');
    expect(sidebarScroll.className).toContain('overflow-y-auto');
    expect(mainWorkspace.className).toContain('lg:h-full');
    expect(mainWorkspace.className).toContain('lg:overflow-y-auto');

    // Initial restored width from localStorage ('276')
    expect(leftSidebar.style.width).toBe('276px');

    // Test dragging resize handle right (+44px -> 320px) and left
    fireEvent.mouseDown(resizeHandle, { clientX: 276 });
    fireEvent.mouseMove(window, { clientX: 320 });
    fireEvent.mouseUp(window);
    expect(leftSidebar.style.width).toBe('320px');
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('320');

    // Test keyboard resize accessibility
    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' });
    expect(leftSidebar.style.width).toBe('308px');
    expect(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe('308');

    // Test collapse & expand works independently of custom width
    const collapseBtn = screen.getByTestId('sidebar-collapse-toggle');
    fireEvent.click(collapseBtn);
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('true');
    expect(screen.queryByTestId('sidebar-resize-handle')).not.toBeInTheDocument();

    fireEvent.click(collapseBtn);
    expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBe('false');
    expect(screen.getByTestId('desktop-left-sidebar').style.width).toBe('308px');

    unmount();
  });

  it('derives structured assistant page context for health_report, symptom_review, and food_discovery routes', () => {
    const repCtx = deriveStructuredPageContext(
      '/health/reports',
      {
        route: '/health/reports',
        page_type: 'health_report',
        selected_entity: {
          type: 'health_report',
          id: '501',
          name: 'Annual Blood Panel',
        },
        health_report_context: { id: 501, report_title: 'Annual Blood Panel' },
      },
      null,
      { id: 1, display_name: 'Member One', dietary_preference: 'vegetarian' }
    );
    expect(repCtx.page_type).toBe('health_report');
    expect(repCtx.selected_entity?.type).toBe('health_report');
    expect(repCtx.health_report_context?.report_title).toBe('Annual Blood Panel');

    const symCtx = deriveStructuredPageContext(
      '/health/symptoms',
      {
        route: '/health/symptoms',
        page_type: 'symptom_review',
        selected_entity: {
          type: 'symptom_review',
          id: '99',
          name: 'Symptom Review',
        },
        symptom_review_context: { urgency_level: 'routine_clinician_review' },
      },
      null,
      null
    );
    expect(symCtx.page_type).toBe('symptom_review');
    expect(symCtx.symptom_review_context?.urgency_level).toBe('routine_clinician_review');

    const foodNearbyCtx = deriveStructuredPageContext(
      '/food-nearby',
      {
        route: '/food-nearby',
        page_type: 'food_discovery',
        selected_entity: {
          type: 'food_discovery',
          id: 'masala-dosa',
          name: 'Masala Dosa near Mysuru',
        },
        food_discovery_context: { dish_query: 'Masala Dosa', total_results: 3 },
      },
      null,
      null
    );
    expect(foodNearbyCtx.page_type).toBe('food_discovery');
    expect(foodNearbyCtx.food_discovery_context?.dish_query).toBe('Masala Dosa');
  });

  it('renders genuine OpenStreetMapView with Leaflet TileLayer, visible © OpenStreetMap contributors attribution, map controls, and skips coordinate-less restaurants', () => {
    expect(STANDARD_OSM_TILE_URL).toContain('{z}/{x}/{y}.png');
    expect(OSM_COPYRIGHT_HREF).toContain('/copyright');

    const onSelect = vi.fn();
    const onUseLocation = vi.fn();

    const r = render(
      <OpenStreetMapView
        centerLat={12.2958}
        centerLon={76.6394}
        locationLabel="Mysuru, Karnataka"
        userCoords={null}
        selectedRestaurantId="mys-gayathri-tiffin-room"
        onSelectRestaurant={onSelect}
        onUseMyLocation={onUseLocation}
        restaurants={[
          {
            id: 'mys-gayathri-tiffin-room',
            name: 'Gayathri Tiffin Room (GTR Heritage Tiffins)',
            city: 'Mysuru',
            area: 'Chamundipuram',
            address: 'Narayana Shastry Road, Chamundipuram, Mysuru 570004',
            coordinates_available: true,
            latitude: 12.2874,
            longitude: 76.6481,
            distance_km: 1.32,
            cuisine_types: ['South Indian', 'Karnataka Tiffin'],
            dietary_badge: 'Pure Vegetarian Restaurant',
            matched_dish: {
              dish_name: 'Masala Dosa',
              match_badge: 'Verified Dish Match',
            },
          },
          {
            id: 'no-coords-restaurant',
            name: 'Unmapped Restaurant Without Coordinates',
            city: 'Mysuru',
            address: 'Unmapped Street',
            coordinates_available: false,
            latitude: null,
            longitude: null,
          },
        ]}
      />
    );

    expect(screen.getByTestId('openstreetmap-view-container')).toBeInTheDocument();
    expect(screen.getByTestId('leaflet-osm-map-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('osm-visible-attribution')).toHaveTextContent(
      '© OpenStreetMap contributors'
    );
    expect(screen.getByTestId('osm-visible-attribution')).toHaveTextContent(
      '1 mapped marker(s) • 1 without coordinates'
    );
    expect(screen.getByTestId('osm-copyright-link')).toHaveAttribute(
      'href',
      OSM_COPYRIGHT_HREF
    );
    expect(screen.getByTestId('osm-zoom-in-btn')).toBeInTheDocument();
    expect(screen.getByTestId('osm-zoom-out-btn')).toBeInTheDocument();
    expect(screen.getByTestId('osm-fit-markers-btn')).toHaveTextContent('Fit All (1)');
    expect(screen.getByTestId('osm-reset-area-btn')).toBeInTheDocument();
    expect(screen.getByTestId('open-in-openstreetmap-btn')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('osm-current-location-btn'));
    expect(onUseLocation).toHaveBeenCalledTimes(1);

    r.unmount();
  });

  it('populates HealthReportsAndSymptomsPage confirmation table when blood report image upload returns extracted rows and shows honest extraction error when 0 rows are returned', async () => {
    vi.spyOn(api, 'getHealthReports').mockResolvedValue([]);
    vi.spyOn(api, 'getHealthReportTrends').mockResolvedValue({ series: [] });
    vi.spyOn(api, 'getSymptomReviewHistory').mockResolvedValue([]);

    const extractSpy = vi.spyOn(api, 'extractHealthReportFile').mockResolvedValueOnce({
      extraction_status: 'extracted_requires_confirmation',
      extraction_method: 'pil_numpy_laboratory_ocr_single_col',
      extracted_count: 3,
      extracted_measurements: [
        {
          canonical_code: 'haemoglobin',
          panel_code: 'cbc_haemogram',
          test_name: 'Haemoglobin',
          measured_value: 10.8,
          unit: 'g/dL',
          reference_low: 12.0,
          reference_high: 16.0,
          status_flag: 'low',
          status_label: 'Below reference interval',
        },
        {
          canonical_code: 'fasting_blood_glucose',
          panel_code: 'glucose_hba1c',
          test_name: 'Fasting Blood Glucose',
          measured_value: 114,
          unit: 'mg/dL',
          reference_low: 70,
          reference_high: 99,
          status_flag: 'high',
          status_label: 'Above reference interval',
        },
        {
          canonical_code: 'hba1c',
          panel_code: 'glucose_hba1c',
          test_name: 'Glycated Haemoglobin (HbA1c)',
          measured_value: 6.1,
          unit: '%',
          reference_low: 4.0,
          reference_high: 5.6,
          status_flag: 'high',
          status_label: 'Above reference interval',
        },
      ],
      extraction_diagnostics: {
        ocr_engine_used: 'pil_numpy_laboratory_ocr_single_col',
        ocr_success: true,
        text_extracted: true,
        candidate_rows_detected: 3,
        valid_structured_rows: 3,
        final_api_status: 'confirmation_required',
      },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/health/reports']}>
        <HealthReportsAndSymptomsPage />
      </MemoryRouter>
    );

    const imgInput = screen.getByTestId('health-report-image-input');
    const mockFile = new File(['fake-png-bytes'], 'blood_report.png', { type: 'image/png' });
    fireEvent.change(imgInput, { target: { files: [mockFile] } });

    const analyseBtn = await screen.findByTestId('analyse-report-file-btn');
    fireEvent.click(analyseBtn);

    await waitFor(() => {
      expect(extractSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('health-report-confirmation-card')).toHaveTextContent(
        'Verify Extracted Laboratory Values (3 markers detected)'
      );
    });

    expect(screen.getByTestId('confirm-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-row-2')).toBeInTheDocument();
    expect(screen.getByTestId('extraction-abnormal-preview-summary')).toHaveTextContent(
      'Abnormal / Attention Markers Detected (3 of 3)'
    );

    // Now test unreadable image upload returning 0 markers -> surfaces honest extraction failure banner
    extractSpy.mockResolvedValueOnce({
      extraction_status: 'ocr_text_unavailable',
      extraction_method: 'ocr_text_unavailable',
      extracted_count: 0,
      extracted_measurements: [],
      extraction_error_message:
        'Could not extract readable text from the uploaded report image.',
      extraction_diagnostics: {
        ocr_engine_used: 'ocr_text_unavailable',
        ocr_success: false,
        text_extracted: false,
        candidate_rows_detected: 0,
        valid_structured_rows: 0,
        final_api_status: 'extraction_failed',
      },
    });

    fireEvent.click(screen.getByTestId('analyse-report-file-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('extraction-failure-banner')).toHaveTextContent(
        'Could Not Automatically Extract Structured Laboratory Rows'
      );
    });

    unmount();
  });

  it('renders full-width Health Report analysis without wasted left column, compact Saved Reports, deduplicated nutritional-priority food cards showing only image/name/relevance initially, and complete food details on click', async () => {
    const sharedIronFoods = [
      {
        slug: 'amaranth-leaves-chaulai',
        name_en: 'Amaranth Leaves (Chaulai)',
        image_url: '/images/foods/leafy-greens/amaranth-leaves-chaulai.webp',
        short_reason: 'Provides iron (5.3 mg per 100 g).',
        primary_nutrient_code: 'iron_mg',
        primary_nutrient_name: 'Iron',
        primary_nutrient_value_per_100g: 5.3,
        primary_nutrient_unit: 'mg',
        standard_serving_name: '1 katori cooked',
        standard_serving_grams: 100,
        default_basis: '100g',
        energy_kcal: 30,
        protein_g: 3.3,
        carbs_g: 2.3,
        fat_total_g: 0.4,
        fibre_g: 4.1,
        iron_mg: 5.3,
        calcium_mg: 330,
        vitamin_b12_mcg: null,
        completeness_pct: 90,
        source_name: 'ICMR-NIN IFCT 2017',
        source_url: 'https://www.nin.res.in/',
      },
      {
        slug: 'spinach-palak',
        name_en: 'Spinach (Palak)',
        image_url: '/images/foods/leafy-greens/spinach-palak.webp',
        short_reason: 'Provides iron (2.95 mg per 100 g).',
        primary_nutrient_code: 'iron_mg',
        primary_nutrient_name: 'Iron',
        primary_nutrient_value_per_100g: 2.95,
        primary_nutrient_unit: 'mg',
        standard_serving_name: '1 katori',
        standard_serving_grams: 100,
        default_basis: '100g',
        energy_kcal: 24,
        protein_g: 2.1,
        fibre_g: 2.4,
        iron_mg: 2.95,
        calcium_mg: 82,
        vitamin_b12_mcg: null,
        completeness_pct: 95,
        source_name: 'ICMR-NIN IFCT 2017',
        source_url: 'https://www.nin.res.in/',
      },
      {
        slug: 'ragi-finger-millet',
        name_en: 'Ragi (Finger Millet)',
        image_url: '/images/foods/cereals-millets/ragi-finger-millet.webp',
        short_reason: 'Provides iron (4.62 mg per 100 g).',
        primary_nutrient_code: 'iron_mg',
        primary_nutrient_name: 'Iron',
        primary_nutrient_value_per_100g: 4.62,
        primary_nutrient_unit: 'mg',
        standard_serving_name: '2 rotis',
        standard_serving_grams: 60,
        default_basis: '100g',
        energy_kcal: 320,
        protein_g: 7.2,
        fibre_g: 11.2,
        iron_mg: 4.62,
        calcium_mg: 364,
        vitamin_b12_mcg: null,
        completeness_pct: 95,
        source_name: 'ICMR-NIN IFCT 2017',
        source_url: 'https://www.nin.res.in/',
      },
      {
        slug: 'horse-gram-kulthi',
        name_en: 'Horse Gram (Kulthi)',
        image_url: '/images/foods/pulses-legumes/horse-gram-kulthi.webp',
        short_reason: 'Provides iron (8.76 mg per 100 g).',
        primary_nutrient_code: 'iron_mg',
        primary_nutrient_name: 'Iron',
        primary_nutrient_value_per_100g: 8.76,
        primary_nutrient_unit: 'mg',
        standard_serving_name: '1 katori cooked',
        standard_serving_grams: 150,
        default_basis: '100g',
        energy_kcal: 329,
        protein_g: 21.7,
        fibre_g: 7.9,
        iron_mg: 8.76,
        calcium_mg: 269,
        vitamin_b12_mcg: null,
        completeness_pct: 90,
        source_name: 'ICMR-NIN IFCT 2017',
        source_url: 'https://www.nin.res.in/',
      },
      {
        slug: 'chickpea-kabuli-chana',
        name_en: 'Chickpea (Kabuli Chana)',
        image_url: '/images/foods/pulses-legumes/chickpea-kabuli-chana.webp',
        short_reason: 'Provides iron (6.78 mg per 100 g).',
        primary_nutrient_code: 'iron_mg',
        primary_nutrient_name: 'Iron',
        primary_nutrient_value_per_100g: 6.78,
        primary_nutrient_unit: 'mg',
        standard_serving_name: '1 katori cooked',
        standard_serving_grams: 150,
        default_basis: '100g',
        energy_kcal: 357,
        protein_g: 18.8,
        fibre_g: 15.2,
        iron_mg: 6.78,
        calcium_mg: 150,
        vitamin_b12_mcg: null,
        completeness_pct: 95,
        source_name: 'ICMR-NIN IFCT 2017',
        source_url: 'https://www.nin.res.in/',
      },
    ];

    vi.spyOn(api, 'getHealthReports').mockResolvedValue([
      {
        id: 101,
        report_title: 'Comprehensive Blood & Metabolic Report',
        laboratory_name: 'Apollo / Metropolis Clinical Diagnostics',
        report_date: '2026-04-10',
        measurement_count: 3,
        results_requiring_attention: 2,
        attention_results: [
          {
            id: 1,
            canonical_code: 'haemoglobin',
            test_name: 'Haemoglobin (Hb)',
            measured_value: 10.8,
            unit: 'g/dL',
            reference_range_text: '12.0 - 16.0',
            status_flag: 'low',
            status_label: 'Below reference interval',
          },
          {
            id: 2,
            canonical_code: 'serum_ferritin',
            test_name: 'Serum Ferritin',
            measured_value: 12.4,
            unit: 'ng/mL',
            reference_range_text: '15.0 - 150.0',
            status_flag: 'low',
            status_label: 'Below reference interval',
          },
        ],
        measurements: [
          {
            id: 1,
            canonical_code: 'haemoglobin',
            test_name: 'Haemoglobin (Hb)',
            measured_value: 10.8,
            unit: 'g/dL',
            reference_range_text: '12.0 - 16.0',
            status_flag: 'low',
            status_label: 'Below reference interval',
          },
          {
            id: 2,
            canonical_code: 'serum_ferritin',
            test_name: 'Serum Ferritin',
            measured_value: 12.4,
            unit: 'ng/mL',
            reference_range_text: '15.0 - 150.0',
            status_flag: 'low',
            status_label: 'Below reference interval',
          },
          {
            id: 3,
            canonical_code: 'tsh',
            test_name: 'Thyroid Stimulating Hormone (TSH)',
            measured_value: 3.1,
            unit: 'mIU/L',
            reference_range_text: '0.45 - 4.5',
            status_flag: 'within_reference',
            status_label: 'Within reference interval',
          },
        ],
        possible_nutritional_concerns: [
          {
            concern_code: 'possible_low_iron_status',
            title: 'Possible low iron status',
            explanation:
              'Your report shows Serum Ferritin (12.4 ng/mL) below the laboratory reference interval alongside low haemoglobin.',
          },
        ],
        lab_to_plate: {
          kidney_safety_triggered: false,
          member_dietary_preference: 'vegetarian',
          marker_food_cards: [
            {
              canonical_code: 'haemoglobin',
              test_name: 'Haemoglobin (Hb)',
              measured_value: 10.8,
              unit: 'g/dL',
              status_flag: 'low',
              status_label: 'Below reference interval',
              focus_nutrient_label: 'Provides iron',
              educational_explanation: 'Pair plant iron with vitamin C.',
              recommended_foods: sharedIronFoods,
            },
            {
              canonical_code: 'serum_ferritin',
              test_name: 'Serum Ferritin',
              measured_value: 12.4,
              unit: 'ng/mL',
              status_flag: 'low',
              status_label: 'Below reference interval',
              focus_nutrient_label: 'Provides iron',
              educational_explanation: 'Pair plant iron with vitamin C.',
              recommended_foods: sharedIronFoods,
            },
          ],
        },
      },
    ]);
    vi.spyOn(api, 'getHealthReportTrends').mockResolvedValue({ series: [] });
    vi.spyOn(api, 'getSymptomReviewHistory').mockResolvedValue([]);

    const { unmount } = render(
      <MemoryRouter initialEntries={['/health/reports']}>
        <HealthReportsAndSymptomsPage />
      </MemoryRouter>
    );

    const fullwidthWorkspace = await screen.findByTestId('confirmed-reports-fullwidth-workspace');
    expect(fullwidthWorkspace.className).toContain('w-full');
    expect(fullwidthWorkspace.className).not.toContain('lg:grid-cols-12');

    // Compact horizontal Saved Reports bar
    expect(screen.getByTestId('saved-reports-compact-bar')).toBeInTheDocument();
    expect(screen.getByTestId('saved-report-card-101')).toHaveTextContent(
      'Comprehensive Blood & Metabolic Report'
    );

    // Attention results table is visible; normal test results are hidden until clicked
    expect(screen.getByTestId('attention-results-summary-table')).toHaveTextContent(
      'Haemoglobin (Hb)'
    );
    expect(screen.queryByTestId('all-test-results-expanded')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('toggle-view-all-test-results-btn'));
    expect(screen.getByTestId('all-test-results-expanded')).toHaveTextContent(
      'Thyroid Stimulating Hormone (TSH)'
    );

    // Nutritional priority is compact initially; details expand on click
    expect(
      screen.getByTestId('nutritional-priority-card-possible_low_iron_status')
    ).toHaveTextContent('Possible low iron status');
    expect(
      screen.queryByTestId('concern-explanation-possible_low_iron_status')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('toggle-concern-details-possible_low_iron_status'));
    expect(
      screen.getByTestId('concern-explanation-possible_low_iron_status')
    ).toBeInTheDocument();

    // Both Haemoglobin and Serum Ferritin are consolidated into one deduplicated Iron-related food options group
    const ironGroup = screen.getByTestId('lab-to-plate-card-iron_options');
    expect(ironGroup).toHaveTextContent('Iron-related food options');

    // Initially shows 4 food cards (5th card 'chickpea-kabuli-chana' hidden behind View More Foods)
    const ragiCards = screen.getAllByTestId('report-food-card-ragi-finger-millet');
    expect(ragiCards).toHaveLength(1);
    expect(screen.queryByTestId('report-food-card-chickpea-kabuli-chana')).not.toBeInTheDocument();

    // Verify the initial compact food card ONLY shows image, food name, relevance label, and View Details ->
    const ragiCard = ragiCards[0];
    expect(ragiCard).toHaveTextContent('Ragi (Finger Millet)');
    expect(ragiCard).toHaveTextContent('Iron source');
    expect(ragiCard).toHaveTextContent('View Details →');
    expect(ragiCard).not.toHaveTextContent('320 kcal');
    expect(ragiCard).not.toHaveTextContent('Completeness');
    expect(ragiCard).not.toHaveTextContent('ICMR-NIN IFCT 2017');

    // Click View More Foods -> reveals 5th food card
    fireEvent.click(screen.getByTestId('view-more-food-options-btn-iron_options'));
    expect(screen.getByTestId('report-food-card-chickpea-kabuli-chana')).toBeInTheDocument();

    // Click Ragi food card -> opens complete Food Nutritional Details modal
    fireEvent.click(ragiCard);
    const modal = await screen.findByTestId('report-food-detail-modal');
    expect(modal).toHaveTextContent('Ragi (Finger Millet)');
    expect(modal).toHaveTextContent('2 rotis (60g)');
    expect(modal).toHaveTextContent('ICMR-NIN IFCT 2017');
    expect(modal).toHaveTextContent('95%');
    // Verify NULL nutrient (Vitamin B12) is shown as Unavailable (NULL) and never 0
    expect(modal).toHaveTextContent('Unavailable (NULL)');
    expect(
      screen.getByTestId('open-full-food-page-link-ragi-finger-millet')
    ).toHaveAttribute('href', '/foods/ragi-finger-millet');

    // Close modal -> returns to active report
    fireEvent.click(screen.getByTestId('close-food-detail-modal-btn'));
    expect(screen.queryByTestId('report-food-detail-modal')).not.toBeInTheDocument();
    expect(screen.getByTestId('active-confirmed-report-detail')).toBeInTheDocument();

    unmount();
  });

  it('renders simplified FoodNearbyPage search bar, current location button, expandable Filters, and simplified nutrition card', async () => {
    vi.spyOn(api, 'searchFoodNearby').mockResolvedValue({
      dish_query: 'Masala Dosa',
      total_results: 1,
      location_context: {
        city: 'Mysuru',
        display_name: 'Mysuru, Karnataka',
        latitude: 12.2958,
        longitude: 76.6394,
      },
      matched_gharplate_dish: {
        matched_in_database: true,
        food_slug: 'masala-dosa',
        food_name: 'Masala Dosa',
        source_name: 'ICMR-NIN IFCT 2017',
        standard_serving_name: '1 dosa',
        standard_serving_grams: 150,
        nutrients_per_serving: {
          energy_kcal: 320,
          protein_g: 7.4,
          carbs_g: 48.0,
          fibre_g: 3.2,
        },
      },
      menu_to_goal_intelligence: {
        active_goal: 'Balanced',
        goal_fit_highlights: ['Good complex carbohydrate source'],
        smart_ordering_tips: ['Pair with extra sambar for lentil protein'],
      },
      restaurants: [
        {
          id: 'mys-gtr',
          name: 'Gayathri Tiffin Room',
          city: 'Mysuru',
          address: 'Chamundipuram, Mysuru',
          distance_km: 1.2,
          rating: 4.6,
          coordinates_available: true,
          latitude: 12.2874,
          longitude: 76.6481,
          dietary_badge: 'Pure Vegetarian',
          matched_dish: {
            dish_name: 'Masala Dosa',
            estimated_price_inr: 75,
          },
          maps_links: {
            openstreetmap_directions_url: 'https://www.openstreetmap.org/directions',
          },
        },
      ],
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/food-nearby']}>
        <FoodNearbyPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'What would you like to eat today?' })
    ).toBeInTheDocument();
    expect(screen.getByTestId('food-nearby-dish-input')).toBeInTheDocument();
    expect(screen.getByTestId('use-my-location-btn')).toHaveTextContent(
      'Use My Current Location'
    );
    await screen.findByTestId('matched-dish-nutrition-card');
    expect(screen.getByTestId('food-nearby-search-btn')).toHaveTextContent('Find Nearby');

    // Filters are collapsed initially
    expect(screen.queryByTestId('food-nearby-filters-panel')).not.toBeInTheDocument();

    // Expand Filters
    fireEvent.click(screen.getByTestId('food-nearby-filters-toggle'));
    expect(screen.getByTestId('food-nearby-filters-panel')).toBeInTheDocument();
    expect(screen.getByTestId('food-nearby-dietary-select')).toBeInTheDocument();
    expect(screen.getByTestId('food-nearby-radius-select')).toBeInTheDocument();

    // Nutrition card shows compact summary initially, details expand on click
    const nutCard = await screen.findByTestId('matched-dish-nutrition-card');
    expect(nutCard).toHaveTextContent('Masala Dosa');
    expect(nutCard).toHaveTextContent('Calories: 320 kcal');
    expect(nutCard).toHaveTextContent('Protein: 7.4 g');
    expect(screen.queryByTestId('matched-dish-nutrition-details')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-nutrition-details-btn'));
    expect(screen.getByTestId('matched-dish-nutrition-details')).toBeInTheDocument();

    unmount();
  });
});
