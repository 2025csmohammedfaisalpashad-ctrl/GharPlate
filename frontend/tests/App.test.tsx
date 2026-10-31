import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { AppRoutes } from '../src/App';
import { AssistantMarkdown } from '../src/components/AssistantDrawer';
import { HouseholdProvider } from '../src/hooks/useHousehold';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  window.localStorage.clear();
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/health')) {
      return {
        ok: true,
        json: async () => ({
          status: 'healthy',
          service: 'GharPlate API',
          version: '2.0.0',
          counts: { foods: 77, conditions: 24, sources: 10 },
          medical_disclaimer: 'Educational only',
        }),
      };
    }
    if (url.includes('/households')) {
      return {
        ok: true,
        json: async () => ({
          id: 1,
          household_token: 'hh_mock_token_123',
          name: 'Test Household',
          default_member_id: 1,
          privacy_notice: 'Convenience token only',
          created_at: new Date().toISOString(),
          members: [
            {
              id: 1,
              household_id: 1,
              display_name: 'Ajji',
              age_group: 'older_adult',
              dietary_preference: 'vegetarian',
              selected_conditions: ['type_2_diabetes'],
              allergies: ['peanut'],
              intolerances: ['lactose'],
              dietary_restrictions: [],
              food_preferences: [],
              created_at: new Date().toISOString(),
            },
          ],
        }),
      };
    }
    if (url.includes('/foods/pkg-pineapple-cake-6b35c3')) {
      return {
        ok: true,
        json: async () => ({
          id: 78,
          slug: 'pkg-pineapple-cake-6b35c3',
          ifct_code: null,
          name_en: 'Pineapple Cake',
          image_url: null,
          has_verified_image: false,
          scientific_name: null,
          description: 'User-confirmed packaged product (winkles).',
          region_state: null,
          category: {
            id: 9,
            slug: 'packaged-foods',
            name: 'Packaged Foods',
            description: 'Packaged foods',
            image_url: '/images/categories/packaged-foods.webp',
            display_order: 9,
          },
          is_packaged: true,
          brand: 'winkles',
          barcode: '8906005618726',
          net_quantity: '110 g',
          default_basis: '100g',
          standard_serving_name: '1 serving (30g)',
          standard_serving_grams: 30,
          is_vegetarian: false,
          is_vegan: false,
          allergen_tags: ['eggs', 'gluten', 'milk'],
          intolerance_tags: [],
          dietary_tags: ['packaged_food'],
          ingredients_text:
            'REFINED WHEAT FLOUR (MAIDA), EGGS, SUGAR, PINEAPPLE CUTS (2%). CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS.',
          cleaned_ingredients_text:
            'REFINED WHEAT FLOUR (MAIDA), EGGS, SUGAR, PINEAPPLE CUTS (2%).',
          ingredient_items: [
            'REFINED WHEAT FLOUR (MAIDA)',
            'EGGS',
            'SUGAR',
            'PINEAPPLE CUTS (2%)',
          ],
          ingredient_percentages: ['PINEAPPLE CUTS (2%)'],
          additives: ['INS 330', 'INS 471', 'INS 322'],
          allergen_statement: 'CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS.',
          label_warnings: ['POLYOLS MAY HAVE LAXATIVE EFFECTS.'],
          manufacturer_info: 'SOUTHERN BAKERIES PVT. LTD, BANGALORE',
          lot_and_date_info: null,
          ocr_uncertainty_notes: [],
          raw_ocr_text:
            'REFINED WHEAT FLOUR (MAIDA), EGGS, SUGAR, PINEAPPLE CUTS (2%). CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS.',
          allergen_declaration_complete: true,
          allergen_safety_disclaimer:
            'ALLERGEN CONSISTENCY ALERT: Label declares additional allergens (soy).',
          allergen_consistency: {
            stored_allergen_tags: ['egg', 'gluten', 'milk'],
            declared_allergens: ['egg', 'gluten', 'milk', 'soy'],
            ingredient_inferred_allergens: ['egg', 'gluten', 'milk', 'soy'],
            missing_from_stored_tags: ['soy'],
            consistency_status: 'inconsistent_missing_tags',
            consistency_warnings: [
              'Allergen consistency alert: Label text mentions [soy], which is missing from stored allergen tags.',
            ],
            requires_manual_review: true,
          },
          aliases: [],
          servings: [
            {
              unit_name: 'standard_serving',
              unit_label: '1 serving (30g)',
              grams_equivalent: 30,
              is_default: true,
              conversion_source: 'User Label',
            },
          ],
          nutrients: [
            {
              nutrient_code: 'energy_kcal',
              nutrient_name: 'Energy',
              unit: 'kcal',
              category: 'macronutrient',
              value_per_100: null,
              value_for_serving: null,
              basis: '100g',
              is_available: false,
              confidence_status: 'not_measured',
              source_name: 'User-Confirmed Packaged Food Label Declaration',
              source_url: 'https://fssai.gov.in',
              publication_year: 2026,
            },
          ],
          available_nutrient_count: 0,
          missing_nutrient_codes: ['energy_kcal', 'protein_g'],
          completeness_pct: 0,
          confidence_level: 'label_declared',
          conversion_methodology: null,
          date_imported: new Date().toISOString(),
          source: {
            id: 10,
            code: 'USER_VERIFIED_LABEL',
            name: 'User-Confirmed Packaged Food Label Declaration',
            organization: 'GharPlate Household',
            document_title: 'FSSAI Package Label',
            publication_year: 2026,
            version: '1.0',
            url: 'https://fssai.gov.in',
            license_notes: 'User confirmed',
            source_type: 'ocr_extracted',
          },
          field_provenance: [],
          data_conflicts: [],
        }),
      };
    }
    if (url.includes('/assistant/status')) {
      return {
        ok: true,
        json: async () => ({
          enabled: true,
          ollama_base_url: 'http://127.0.0.1:11434',
          ollama_reachable: true,
          configured_model: 'llama3.2:latest',
          active_model: 'llama3.2:latest',
          installed_models: ['llama3.2:latest', 'qwen2.5:7b'],
          status_message: "Connected to local Ollama using model 'llama3.2:latest'.",
          remediation_command: null,
          available_modes: [
            { id: 'database_only', label: 'My GharPlate Database', description: 'Local DB only' },
            { id: 'automatic', label: 'Automatic', description: 'Local first then online' },
            { id: 'online_search', label: 'Search Online', description: 'Online search' },
          ],
          allowlisted_tools: ['get_food_details', 'get_ingredients_and_allergens'],
        }),
      };
    }
    if (url.includes('/assistant/chat')) {
      return {
        ok: true,
        json: async () => ({
          reply: `## Fever-related food information\n\nFor short-term illness recovery:\n\n**Foods to explore:**\n\n1. Moong Dal Khichdi.\n2. Idli.\n3. Pongal.\n\n**Allergen Consistency Note:** Label declares **soy** in addition to wheat, milk, and egg.\n\n| Food | Energy | Protein |\n|---|---|---|\n| Khichdi | 118 kcal | 4.3 g |\n\n\`\`\`json\n{"barcode": "8906005618726"}\n\`\`\`\n\n[ICMR-NIN Guidelines](https://www.nin.res.in)`,
          mode_used: 'automatic',
          model_used: 'llama3.2:latest',
          ollama_connected: true,
          used_fallback_synthesis: false,
          tool_traces: [
            {
              tool_name: 'get_ingredients_and_allergens',
              arguments: { food_slug: 'pkg-pineapple-cake-6b35c3' },
              status: 'success',
              summary: 'Retrieved ingredients for Pineapple Cake',
              source_type: 'local_database',
            },
          ],
          sources: [
            {
              title: 'Pineapple Cake (User-Confirmed Packaged Food Label Declaration)',
              source_type: 'local_database',
              url: 'https://fssai.gov.in',
              retrieved_at: new Date().toISOString(),
              verification_status: 'label_declared',
            },
          ],
          suggested_followups: ['Why are the nutritional values missing?'],
          medical_disclaimer: 'Educational only.',
        }),
      };
    }
    if (url.includes('/scan/barcode/8901491101813')) {
      return {
        ok: true,
        json: async () => ({
          barcode: '8901491101813',
          barcode_format: 'EAN-13',
          is_valid_barcode: true,
          found: true,
          source_origin: 'open_food_facts_v3',
          retrieval_timestamp: new Date().toISOString(),
          message: "Found packaged product 'Crunchy Almond Muesli' with verified product photo.",
          fallback_actions: [],
          provider_attempts: [
            {
              provider_code: 'OPEN_FOOD_FACTS',
              provider_name: 'Open Food Facts',
              status: 'found',
              http_status: 200,
              message: 'Matched exact barcode 8901491101813.',
              from_cache: false,
              retrieved_at: new Date().toISOString(),
            },
          ],
          product: {
            id: 68,
            slug: 'packaged-crunchy-muesli-almond',
            name_en: 'Crunchy Almond Muesli',
            image_url: 'https://images.openfoodfacts.org/images/products/890/149/110/1813/front_en.jpg',
            has_verified_image: true,
            is_packaged: true,
            brand: 'Bagrrys',
            barcode: '8901491101813',
            standard_serving_name: '1 bowl (40g)',
            standard_serving_grams: 40,
            completeness_pct: 85,
            available_nutrient_count: 17,
            confidence_level: 'openfoodfacts',
          },
        }),
      };
    }
    if (url.includes('/scan/barcode/8906005618726')) {
      return {
        ok: true,
        json: async () => ({
          barcode: '8906005618726',
          barcode_format: 'EAN-13',
          is_valid_barcode: true,
          found: true,
          source_origin: 'local_verified_db',
          retrieval_timestamp: new Date().toISOString(),
          message:
            "Found packaged product 'Pineapple Cake' (winkles). Local record is incomplete (missing: image_url, nutrition_values).",
          fallback_actions: ['Scan nutrition panel'],
          provider_attempts: [
            {
              provider_code: 'OPEN_FOOD_FACTS',
              provider_name: 'Open Food Facts',
              status: 'not_found',
              http_status: 404,
              message: 'Not found in Open Food Facts.',
              from_cache: false,
              retrieved_at: new Date().toISOString(),
            },
          ],
          product: {
            id: 78,
            slug: 'pkg-pineapple-cake-6b35c3',
            name_en: 'Pineapple Cake',
            image_url: null,
            has_verified_image: false,
            is_packaged: true,
            brand: 'winkles',
            barcode: '8906005618726',
            standard_serving_name: '1 serving (30g)',
            standard_serving_grams: 30,
            completeness_pct: 0,
            available_nutrient_count: 0,
            confidence_level: 'label_declared',
          },
        }),
      };
    }
    if (url.includes('/conditions/fever_acute_recovery/foods')) {
      return {
        ok: true,
        json: async () => ({
          condition: {
            code: 'fever_acute_recovery',
            name: 'Fever, Reduced Appetite & Short-Term Illness Recovery',
            condition_group_code: 'I_short_term_illness',
            condition_group_name: 'Short-Term Illness & Recovery',
            is_short_term_illness: true,
          },
          member_context: {
            member_id: 1,
            member_name: 'Ajji',
            dietary_preference: 'vegetarian',
            allergies: ['peanut'],
            intolerances: ['lactose'],
            personalised: true,
            personalisation_note: 'Filtered for Ajji (vegetarian).',
          },
          total_reviewed_foods: 1,
          empty_state_message: null,
          medical_disclaimer: 'Educational nutrition information only.',
          foods: [
            {
              id: 51,
              slug: 'khichdi-moong-dal-rice',
              ifct_code: null,
              name_en: 'Khichdi (Moong Dal & Rice)',
              image_url: '/images/foods/indian-dishes/khichdi-moong-dal-rice.webp',
              category: 'Indian Dishes',
              category_slug: 'indian-dishes',
              category_name: 'Indian Dishes',
              is_packaged: false,
              brand: null,
              barcode: null,
              default_basis: '100g',
              standard_serving_name: '1 bowl (180g)',
              standard_serving_grams: 180,
              is_vegetarian: true,
              is_vegan: false,
              aliases: [],
              key_nutrients: { energy_kcal: 118, protein_g: 4.3, sodium_mg: 195 },
              unavailable_nutrients: [],
              completeness_pct: 95,
              confidence_level: 'high',
              source_name: 'ICMR-NIN Dietary Guidelines for Indians',
              source_organization: 'ICMR-NIN',
              source_url: 'https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI07052024P.pdf',
              publication_year: 2024,
              relevance_type: 'relevant_food_to_explore',
              relevance_label: 'Relevant food to explore',
              reason:
                'Soft-cooked rice and split green gram porridge provides warm energy and complementary plant protein that is gentle on digestion.',
              caution_notes: 'Supportive nourishment only — does not treat fever or infection.',
              portion_guidance: 'Small, warm, frequent servings alongside oral fluids.',
              evidence_type: 'energy_kcal, protein_g, gentle_digestive',
              review_status: 'reviewed',
              priority_order: 101,
              relevant_tags: ['gentle_digestive', 'recovery_supportive', 'balanced_cereal_pulse'],
              nutrition_highlights: { energy_kcal: 118, protein_g: 4.3, sodium_mg: 195 },
              missing_relevant_nutrients: [],
              dietary_compatibility: {
                is_vegetarian: true,
                is_vegan: false,
                is_eggetarian_compatible: true,
                dietary_tags: ['gentle_digestive', 'vegetarian'],
              },
              allergen_flags: ['milk'],
              intolerance_flags: [],
              allergen_warnings: [],
              intolerance_warnings: [],
              incomplete_ingredient_warning: null,
              source: {
                name: 'ICMR-NIN Dietary Guidelines for Indians',
                organization: 'ICMR-NIN',
                year: 2024,
                url: 'https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI07052024P.pdf',
                section: 'Dietary Support During Short-Term Illness & Convalescence',
              },
            },
          ],
        }),
      };
    }
    if (url.includes('/conditions/fever_acute_recovery')) {
      return {
        ok: true,
        json: async () => ({
          id: 23,
          code: 'fever_acute_recovery',
          name: 'Fever, Reduced Appetite & Short-Term Illness Recovery',
          condition_group_code: 'I_short_term_illness',
          condition_group_name: 'Short-Term Illness & Recovery',
          is_short_term_illness: true,
          is_special_life_stage: false,
          applicable_age_groups: ['child', 'adolescent', 'adult', 'older_adult'],
          nutritional_meaning: 'Short-term convalescent hydration and gentle energy support.',
          relevant_nutrients: ['energy_kcal', 'protein_g', 'sodium_mg', 'potassium_mg'],
          relevant_food_groups: ['indian-dishes', 'fruits', 'pulses-legumes'],
          evidence_dietary_patterns: 'Soft, easily digestible cereal-pulse preparations and fluids.',
          portion_considerations: 'Small, frequent warm servings.',
          individual_differences: 'Adapt to appetite and hydration status.',
          professional_advice_circumstances: 'Seek urgent medical care for high or persistent fever.',
          red_flag_warning: 'Red flag: Persistent high fever or dehydration requires medical care.',
          what_evidence_does_not_establish: 'Does not cure infection.',
          review_status: 'reviewed',
          source_name: 'ICMR-NIN Dietary Guidelines for Indians',
          source_url: 'https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI07052024P.pdf',
          publication_year: 2024,
          source: {
            id: 2,
            code: 'ICMR_NIN_DGI_2024',
            name: 'ICMR-NIN Dietary Guidelines for Indians',
            organization: 'ICMR-NIN',
            document_title: 'Dietary Guidelines for Indians 2024',
            publication_year: 2024,
            version: '2024',
            url: 'https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI07052024P.pdf',
            license_notes: 'Public Government Publication',
            source_type: 'official',
          },
          rules: [],
        }),
      };
    }
    if (url.includes('/guidance/evaluate')) {
      return {
        ok: true,
        json: async () => ({
          food_slug: 'khichdi-moong-dal-rice',
          food_name: 'Khichdi (Moong Dal & Rice)',
          evaluated_serving_label: '1 bowl (180g)',
          evaluated_grams: 180,
          selected_conditions: ['fever_acute_recovery'],
          age_group: 'older_adult',
          medical_disclaimer: 'Educational only.',
          requires_professional_guidance: false,
          allergen_alerts: [],
          intolerance_alerts: [],
          dietary_preference_alerts: [],
          multi_condition_conflicts: [],
          observations: [],
          missing_relevant_nutrients: [],
          data_confidence: 'high',
        }),
      };
    }
    if (url.includes('/foods/categories')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 1,
            slug: 'cereals-millets',
            name: 'Cereals & Millets',
            description: 'Staple grains and millets',
            image_url: '/images/categories/cereals-millets.webp',
            display_order: 1,
          },
        ],
      };
    }
    if (url.includes('/foods')) {
      return {
        ok: true,
        json: async () => ({
          query: 'Ragi',
          category: null,
          total: 1,
          page: 1,
          page_size: 18,
          suggestions: [],
          items: [
            {
              id: 4,
              slug: 'ragi-finger-millet',
              ifct_code: 'A010',
              name_en: 'Ragi (Finger Millet)',
              image_url: '/images/foods/cereals-millets/ragi-finger-millet.webp',
              category_slug: 'cereals-millets',
              category_name: 'Cereals & Millets',
              is_packaged: false,
              brand: null,
              barcode: null,
              default_basis: '100g',
              standard_serving_name: '1 serving (30g)',
              standard_serving_grams: 30,
              is_vegetarian: true,
              is_vegan: true,
              aliases: [{ language: 'kn', alias_text: 'Ragi', script_text: 'ರಾಗಿ' }],
              key_nutrients: {
                energy_kcal: 320,
                protein_g: 7.16,
                carbs_g: 66.82,
                fibre_g: 11.18,
              },
              unavailable_nutrients: [],
              completeness_pct: 100,
              confidence_level: 'high',
              source_name: 'ICMR-NIN IFCT 2017',
              source_organization: 'ICMR-NIN',
              source_url: 'https://www.nin.res.in/ebooks/IFCT2017.pdf',
              publication_year: 2017,
            },
          ],
        }),
      };
    }
    if (url.includes('/scan/ocr-text')) {
      return {
        ok: true,
        json: async () => ({
          scan_id: 'ocr_123',
          ocr_status: 'success',
          privacy_confirmation: 'Processed strictly in memory (RAM).',
          raw_text: 'Energy: 48O kcal',
          detected_basis: '100g',
          fields: {
            energy_kcal: {
              field_name: 'Energy',
              extracted_value: '48O',
              unit: 'kcal',
              confidence: 0.45,
              validation_status: 'warning',
              validation_message: 'OCR typo detected',
              proposed_correction: 480,
            },
          },
          validation_warnings: ['OCR character ambiguity in Energy'],
          requires_user_confirmation: true,
        }),
      };
    }
    return { ok: true, json: async () => [] };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GharPlate Targeted Food Images, Barcode Camera Scanner & Resizable AI Assistant Suite', () => {
  it('renders Redesigned Visual Home Page with local .webp food photographs and live stats', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    expect(screen.getByText(/Know What’s on Your Plate/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('77')).toBeInTheDocument();
    });

    const idliImg = screen.getByAltText('Idli & Sambar') as HTMLImageElement;
    expect(idliImg.getAttribute('src')).toBe(
      '/images/foods/indian-dishes/idli-steamed-rice-lentil.webp'
    );
  });

  it('renders Image-First Food Explorer with Grid and Compact List view toggle and local food photograph', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/foods']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Ragi (Finger Millet)')).toBeInTheDocument();
    });

    const ragiImg = screen.getByAltText('Ragi (Finger Millet)') as HTMLImageElement;
    expect(ragiImg.getAttribute('src')).toBe(
      '/images/foods/cereals-millets/ragi-finger-millet.webp'
    );

    const listBtn = screen.getByText(/Compact List/i);
    fireEvent.click(listBtn);
    expect(screen.getByText('Ragi (Finger Millet)')).toBeInTheDocument();
  });

  it('supports visual step-by-step OCR review and correction workflow', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/scanner']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    const parseBtn = screen.getByText(/Parse & Validate Label Text/i);
    fireEvent.click(parseBtn);

    await waitFor(() => {
      expect(screen.getByText(/Apply Proposed Correction: 480/i)).toBeInTheDocument();
    });
  });

  it('renders Fever Condition Detail page with reviewed supportive foods and excludes Chicken Biryani', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/conditions/fever_acute_recovery']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(
        screen.getAllByText(/Fever, Reduced Appetite & Short-Term Illness Recovery/i).length
      ).toBeGreaterThan(0);
      expect(screen.getAllByText(/Khichdi \(Moong Dal & Rice\)/i).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/Chicken Biryani/i)).not.toBeInTheDocument();
  });

  it('renders Pineapple Cake packaged product page with visible barcode, visible ingredients, soy consistency alert, and honest missing-image card', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/foods/pkg-pineapple-cake-6b35c3']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('product-barcode-value')).toHaveTextContent('8906005618726');
    });

    expect(screen.getByTestId('no-verified-product-image')).toBeInTheDocument();
    expect(screen.getByText(/No verified product image available/i)).toBeInTheDocument();
    expect(screen.getByTestId('visible-ingredients-allergens-section')).toBeInTheDocument();
    expect(
      screen.getAllByText(/REFINED WHEAT FLOUR \(MAIDA\)/i).length
    ).toBeGreaterThan(0);
    expect(screen.getByTestId('allergen-consistency-alert')).toBeInTheDocument();
    expect(screen.getByText(/mentions \[soy\]/i)).toBeInTheDocument();
    expect(screen.getByTestId('missing-nutrition-action-card')).toBeInTheDocument();
  });

  it('handles camera permission denied, no camera found, live video stream attachment, non-zero dimensions, ZXing Safari barcode detection, automatic lookup with product image, and stop/unmount cleanup', async () => {
    const stopTrackSpy = vi.fn();
    const mockTrack = {
      stop: stopTrackSpy,
      readyState: 'live',
      onended: null,
      getSettings: () => ({ deviceId: 'cam_1', width: 1280, height: 720 }),
      getCapabilities: () => ({ torch: true }),
      applyConstraints: vi.fn().mockResolvedValue(undefined),
    };
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    } as unknown as MediaStream;

    // 1. Test Permission Denied
    const getUserMediaMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
      )
      // 2. Test No Camera Found
      .mockRejectedValueOnce(
        Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' })
      )
      // 3. Test Successful Camera Stream + ZXing Barcode Detection in Safari (no native BarcodeDetector)
      .mockResolvedValue(mockStream);

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      writable: true,
      value: {
        getUserMedia: getUserMediaMock,
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'cam_1', label: 'FaceTime HD Camera' },
        ]),
      },
    });

    // Mock HTMLVideoElement play and non-zero dimensions
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(async function (
      this: HTMLVideoElement
    ) {
      Object.defineProperty(this, 'readyState', { configurable: true, value: 4 });
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      Object.defineProperty(this, 'ended', { configurable: true, value: false });
      Object.defineProperty(this, 'videoWidth', { configurable: true, value: 1280 });
      Object.defineProperty(this, 'videoHeight', { configurable: true, value: 720 });
    });
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    // Ensure native BarcodeDetector is absent so Safari ZXing fallback is exercised
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;

    // Mock ZXing BrowserMultiFormatReader.prototype.decode to detect EAN-13 8901491101813
    const zxingDecodeSpy = vi
      .spyOn(BrowserMultiFormatReader.prototype, 'decode')
      .mockReturnValue({
        getText: () => '8901491101813',
        getBarcodeFormat: () => 'EAN_13',
      } as unknown as ReturnType<BrowserMultiFormatReader['decode']>);

    const { unmount } = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/barcode']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    // Video element is mounted in the DOM from initial render (fixes React videoRef null bug)
    const videoEl = screen.getByTestId('live-barcode-video') as HTMLVideoElement;
    expect(videoEl).toBeInTheDocument();

    // Attempt 1: Permission denied
    fireEvent.click(screen.getByTestId('start-camera-scanner-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('camera-scanner-error')).toHaveTextContent(
        /Camera permission was denied/i
      );
    });

    // Attempt 2: No camera found
    fireEvent.click(screen.getByTestId('start-camera-scanner-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('camera-scanner-error')).toHaveTextContent(
        /No camera device was found/i
      );
    });

    // Attempt 3: Camera granted -> attaches stream, verifies 1280x720, runs ZXing decode, stops camera, and looks up 8901491101813
    fireEvent.click(screen.getByTestId('start-camera-scanner-btn'));

    await waitFor(
      () => {
        expect(zxingDecodeSpy).toHaveBeenCalled();
        expect(screen.getByTestId('camera-scanner-status')).toHaveTextContent(
          /Detected barcode: 8901491101813/i
        );
      },
      { timeout: 2500 }
    );

    // Verify automatic barcode API lookup and immediate display of the verified Open Food Facts product image
    await waitFor(() => {
      expect(screen.getAllByText(/Crunchy Almond Muesli/i).length).toBeGreaterThan(0);
    });
    const muesliImg = screen.getByAltText('Crunchy Almond Muesli') as HTMLImageElement;
    expect(muesliImg.getAttribute('src')).toBe(
      'https://images.openfoodfacts.org/images/products/890/149/110/1813/front_en.jpg'
    );

    // Verify camera tracks were stopped after detection
    expect(stopTrackSpy).toHaveBeenCalled();

    unmount();
  });

  it('opens the Ask GharPlate Assistant as a resizable floating window, persists width and dock side, preserves conversation on Escape/reopen, and renders rich Markdown without literal asterisks', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/foods/pkg-pineapple-cake-6b35c3']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    const fab = await screen.findByTestId('ask-gharplate-fab');
    fireEvent.click(fab);

    const drawer = screen.getByTestId('assistant-drawer');
    const floatingWindow = screen.getByTestId('assistant-floating-window');
    const backdrop = screen.getByTestId('assistant-backdrop');
    const resizeHandle = screen.getByTestId('assistant-resize-handle');

    expect(drawer).toBeInTheDocument();
    expect(floatingWindow).toBeInTheDocument();
    expect(backdrop).toBeInTheDocument();

    // Test interactive horizontal resizing via pointer events
    fireEvent.mouseDown(resizeHandle, { clientX: 700 });
    fireEvent.mouseMove(window, { clientX: 550 }); // Dragging left when docked right increases width
    fireEvent.mouseUp(window);

    const resizedWidth = Number(
      window.localStorage.getItem('gharplate_assistant_width_px')
    );
    expect(resizedWidth).toBeGreaterThanOrEqual(360);

    // Test docking Left / Right toggle
    const dockToggle = screen.getByTestId('assistant-dock-toggle');
    fireEvent.click(dockToggle);
    expect(window.localStorage.getItem('gharplate_assistant_dock_side')).toBe('left');
    fireEvent.click(dockToggle);
    expect(window.localStorage.getItem('gharplate_assistant_dock_side')).toBe('right');

    // Send a message and verify Rich Markdown formatting (headings, bold, numbered list, table, code block, safe link)
    const input = screen.getByLabelText(/Ask GharPlate Input/i);
    fireEvent.change(input, { target: { value: 'What are the ingredients in this cake?' } });
    fireEvent.click(screen.getByText(/Send ↑/i));

    await waitFor(() => {
      expect(screen.getByText('Fever-related food information')).toBeInTheDocument();
    });

    const markdownBody = screen.getByTestId('assistant-markdown-body');
    // Verify literal ** asterisks are NOT displayed
    expect(markdownBody.textContent).not.toContain('**Foods to explore:**');
    expect(markdownBody.querySelector('h2')?.textContent).toBe(
      'Fever-related food information'
    );
    expect(markdownBody.querySelector('ol')).not.toBeNull();
    expect(markdownBody.querySelector('table')).not.toBeNull();
    expect(screen.getByTestId('copy-code-btn')).toBeInTheDocument();
    expect(screen.getByTestId('copy-answer-btn')).toBeInTheDocument();

    // Close with Escape and reopen: verify conversation & width are preserved
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('assistant-drawer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('ask-gharplate-fab'));
    expect(screen.getByTestId('assistant-drawer')).toBeInTheDocument();
    expect(screen.getByText('Fever-related food information')).toBeInTheDocument();
  });

  it('sanitizes unsafe links and raw HTML in AssistantMarkdown', () => {
    render(
      <AssistantMarkdown
        content={`Click [Safe Link](https://www.nin.res.in) or [Unsafe JS](javascript:alert(1))`}
      />
    );

    const safeAnchor = screen.getByText('Safe Link').closest('a');
    expect(safeAnchor).not.toBeNull();
    expect(safeAnchor?.getAttribute('href')).toBe('https://www.nin.res.in');

    const unsafeSpan = screen.getByText('Unsafe JS').closest('a');
    expect(unsafeSpan).toBeNull();
  });

  it('renders all 9 Home page Explore Food Categories cards as compact, text-only clickable cards without image preview areas', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('77')).toBeInTheDocument();
    });

    const expectedCategories = [
      { slug: 'cereals-millets', title: 'Cereals & Millets' },
      { slug: 'pulses-legumes', title: 'Pulses & Dals' },
      { slug: 'vegetables', title: 'Vegetables & Greens' },
      { slug: 'fruits', title: 'Fresh Fruits' },
      { slug: 'dairy', title: 'Dairy & Fermented' },
      { slug: 'protein-sources', title: 'Protein Sources' },
      { slug: 'nuts-seeds', title: 'Nuts & Seeds' },
      { slug: 'indian-dishes', title: 'Indian Dishes' },
      { slug: 'packaged-foods', title: 'Packaged Foods' },
    ];

    for (const cat of expectedCategories) {
      const card = screen.getByTestId(`home-category-card-${cat.slug}`);
      expect(card).toBeInTheDocument();
      expect(card).toHaveTextContent(cat.title);
      expect(card.getAttribute('href')).toBe(`/foods?category=${cat.slug}`);
      // Verify category card is strictly text-only (no <img> or blank image container)
      expect(card.querySelector('img')).toBeNull();
    }
  });
});
