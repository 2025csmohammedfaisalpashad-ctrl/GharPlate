import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { App, AppRoutes } from '../src/App';
import { AssistantMarkdown } from '../src/components/AssistantDrawer';
import { HouseholdProvider } from '../src/hooks/useHousehold';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;
let mockAuthenticated = true;

const MOCK_HOUSEHOLD = {
  id: 1,
  household_token: 'hh_mock_token_123',
  name: 'Test Household',
  default_member_id: 1,
  privacy_notice: 'Private account household',
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
};

const MOCK_AUTH_SESSION = {
  authenticated: true,
  user: {
    id: 1,
    email: 'priya.rao@gharplate.in',
    full_name: 'Priya Rao',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  household: MOCK_HOUSEHOLD,
  csrf_token: 'csrf_test_token_123',
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  mockAuthenticated = true;
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.includes('/auth/me')) {
      if (!mockAuthenticated) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ detail: 'Authentication required.' }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_AUTH_SESSION,
      };
    }
    if (url.includes('/auth/login')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.email === 'unknown@gharplate.in' || body.password === 'WrongPass123!') {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            detail: 'Invalid email address or password. Please verify your credentials or create an account.',
          }),
        };
      }
      mockAuthenticated = true;
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_AUTH_SESSION,
      };
    }
    if (url.includes('/auth/register')) {
      mockAuthenticated = true;
      return {
        ok: true,
        status: 201,
        json: async () => MOCK_AUTH_SESSION,
      };
    }
    if (url.includes('/auth/logout')) {
      mockAuthenticated = false;
      return {
        ok: true,
        status: 200,
        json: async () => ({ logged_out: true }),
      };
    }
    if (url.includes('/assistant/conversations')) {
      return {
        ok: true,
        status: 200,
        json: async () => [],
      };
    }
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
        json: async () => MOCK_HOUSEHOLD,
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

  it('displays the Login / Sign-up landing page when unauthenticated, rejects unregistered credentials via backend API, authenticates registered accounts, and logs out cleanly', async () => {
    mockAuthenticated = false;
    render(<App />);

    // 1. Verify Login / Sign-up landing page is shown after backend /auth/me returns 401
    await waitFor(() => {
      expect(screen.getByTestId('auth-landing-page')).toBeInTheDocument();
    });
    expect(screen.getByText(/Every Indian Kitchen Deserves/i)).toBeInTheDocument();

    // Verify demo login button is NOT present
    expect(screen.queryByTestId('demo-login-btn')).not.toBeInTheDocument();

    // 2. Verify interactive animated food plate and Assemble Nourishing Plate CTA
    const plate = screen.getByTestId('interactive-food-plate');
    expect(plate.getAttribute('data-plate-state')).toBe('orbiting');
    expect(screen.getByTestId('plate-calorie-readout')).toHaveTextContent('477 kcal');

    fireEvent.click(screen.getByTestId('animate-plate-btn'));
    expect(plate.getAttribute('data-plate-state')).toBe('assembled');
    expect(screen.getByTestId('plate-calorie-readout')).toHaveTextContent('643 kcal');

    // 3. Verify live food discovery search on landing page
    const discoveryInput = screen.getByTestId('landing-food-search-input');
    fireEvent.change(discoveryInput, { target: { value: 'Avalakki' } });
    expect(
      screen.getByTestId('discovery-food-card-poha-avalakki-cooked')
    ).toBeInTheDocument();
    fireEvent.change(discoveryInput, { target: { value: '' } });

    // 4. Test Sign-up mode switch, validation error, and password show/hide toggle
    fireEvent.click(screen.getByTestId('tab-signup'));
    expect(screen.getByTestId('signup-name-input')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('auth-submit-btn'));
    expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
      /Please enter your name/i
    );

    // Switch back to Login, test rejected unregistered email, then sign in with valid credentials
    fireEvent.click(screen.getByTestId('tab-login'));
    const emailInput = screen.getByTestId('auth-email-input') as HTMLInputElement;
    const passwordInput = screen.getByTestId('auth-password-input') as HTMLInputElement;

    expect(passwordInput.type).toBe('password');
    fireEvent.click(screen.getByTestId('toggle-password-visibility'));
    expect(passwordInput.type).toBe('text');

    fireEvent.change(emailInput, { target: { value: 'unknown@gharplate.in' } });
    fireEvent.change(passwordInput, { target: { value: 'WrongPass123!' } });
    fireEvent.click(screen.getByTestId('auth-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-error-banner')).toHaveTextContent(
        /Invalid email address or password/i
      );
    });
    expect(screen.getByTestId('auth-landing-page')).toBeInTheDocument();

    fireEvent.change(emailInput, { target: { value: 'priya.rao@gharplate.in' } });
    fireEvent.change(passwordInput, { target: { value: 'NourishIndia2026!' } });
    fireEvent.click(screen.getByTestId('auth-submit-btn'));

    // 5. Verify navigation to the existing GharPlate HomePage after backend authentication
    await waitFor(() => {
      expect(screen.getByText(/Know What’s on Your Plate/i)).toBeInTheDocument();
    });

    // 6. Verify Sign Out calls backend /auth/logout and returns to the Login / Sign-up landing page
    fireEvent.click(screen.getByTestId('header-signout-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('auth-landing-page')).toBeInTheDocument();
    });
  });

  it('verifies all 8 New Chat & Saved Chats conversation-management scenarios: 5-message chat -> + New Chat blank welcome state -> isolated new message -> switch back to 5-message chat -> switch to new chat -> search, rename, and delete with confirmation', async () => {
    const nowIso = new Date().toISOString();
    const yesterdayIso = new Date(Date.now() - 86400000).toISOString();

    interface MockConvStore {
      id: number;
      title: string;
      created_at: string;
      updated_at: string;
      messages: {
        id: number;
        conversation_id: number;
        role: 'user' | 'assistant';
        content: string;
        mode_used: string;
        model_used: string;
        ollama_connected: boolean;
        tool_traces: [];
        sources: [];
        created_at: string;
      }[];
    }

    let nextConvId = 200;
    let nextMsgId = 500;
    const convStore: MockConvStore[] = [
      {
        id: 101,
        title: 'Ragi Calcium & Sambar Guide',
        created_at: yesterdayIso,
        updated_at: yesterdayIso,
        messages: [
          {
            id: 1,
            conversation_id: 101,
            role: 'user',
            content: 'Message 1: What is the calcium content in Ragi?',
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            tool_traces: [],
            sources: [],
            created_at: yesterdayIso,
          },
          {
            id: 2,
            conversation_id: 101,
            role: 'assistant',
            content: 'Message 2: Ragi contains 364 mg of calcium per 100g according to IFCT 2017.',
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            tool_traces: [],
            sources: [],
            created_at: yesterdayIso,
          },
          {
            id: 3,
            conversation_id: 101,
            role: 'user',
            content: 'Message 3: Is Ragi Mudde suitable for vegetarians?',
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            tool_traces: [],
            sources: [],
            created_at: yesterdayIso,
          },
          {
            id: 4,
            conversation_id: 101,
            role: 'assistant',
            content: 'Message 4: Yes, Ragi Mudde is 100% plant-based and vegetarian.',
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            tool_traces: [],
            sources: [],
            created_at: yesterdayIso,
          },
          {
            id: 5,
            conversation_id: 101,
            role: 'user',
            content: 'Message 5: How much protein does Sambar add?',
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            tool_traces: [],
            sources: [],
            created_at: yesterdayIso,
          },
        ],
      },
    ];

    const prevImpl = mockFetch.getMockImplementation();
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();

      if (url.includes('/assistant/conversations/')) {
        const idStr = url.split('/assistant/conversations/')[1]?.split('?')[0];
        const targetId = Number(idStr);
        const found = convStore.find((c) => c.id === targetId);
        if (!found) {
          return { ok: false, status: 404, json: async () => ({ detail: 'Not found' }) };
        }
        if (method === 'GET') {
          return { ok: true, status: 200, json: async () => found };
        }
        if (method === 'PATCH' || method === 'PUT') {
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          found.title = body.title || found.title;
          found.updated_at = new Date().toISOString();
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: found.id,
              title: found.title,
              created_at: found.created_at,
              updated_at: found.updated_at,
              message_count: found.messages.length,
              last_message_preview:
                found.messages[found.messages.length - 1]?.content || null,
            }),
          };
        }
        if (method === 'DELETE') {
          const idx = convStore.findIndex((c) => c.id === targetId);
          if (idx >= 0) convStore.splice(idx, 1);
          return {
            ok: true,
            status: 200,
            json: async () => ({ deleted: true, conversation_id: targetId }),
          };
        }
      }

      if (url.includes('/assistant/conversations')) {
        if (method === 'POST') {
          const body = init?.body ? JSON.parse(String(init.body)) : {};
          const created: MockConvStore = {
            id: ++nextConvId,
            title: body.title || 'New Chat',
            created_at: nowIso,
            updated_at: nowIso,
            messages: [],
          };
          convStore.unshift(created);
          return { ok: true, status: 201, json: async () => created };
        }
        return {
          ok: true,
          status: 200,
          json: async () =>
            convStore.map((c) => ({
              id: c.id,
              title: c.title,
              created_at: c.created_at,
              updated_at: c.updated_at,
              message_count: c.messages.length,
              last_message_preview:
                c.messages[c.messages.length - 1]?.content || null,
            })),
        };
      }

      if (url.includes('/assistant/chat') && method === 'POST') {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        let targetConv = convStore.find((c) => c.id === body.conversation_id);
        if (!targetConv) {
          targetConv = {
            id: ++nextConvId,
            title: String(body.message || 'New Chat').slice(0, 60),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            messages: [],
          };
          convStore.unshift(targetConv);
        } else if (targetConv.messages.length === 0 && targetConv.title === 'New Chat') {
          targetConv.title = String(body.message).slice(0, 60);
        }
        const replyText = `Verified Reply for Conv ${targetConv.id}: Khichdi and Idli are reviewed for Fever recovery.`;
        targetConv.messages.push(
          {
            id: ++nextMsgId,
            conversation_id: targetConv.id,
            role: 'user',
            content: body.message,
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            tool_traces: [],
            sources: [],
            created_at: new Date().toISOString(),
          },
          {
            id: ++nextMsgId,
            conversation_id: targetConv.id,
            role: 'assistant',
            content: replyText,
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            tool_traces: [],
            sources: [],
            created_at: new Date().toISOString(),
          }
        );
        targetConv.updated_at = new Date().toISOString();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            conversation_id: targetConv.id,
            conversation_title: targetConv.title,
            reply: replyText,
            mode_used: 'automatic',
            model_used: 'llama3.2:latest',
            ollama_connected: true,
            used_fallback_synthesis: false,
            tool_traces: [],
            sources: [],
            suggested_followups: [],
            medical_disclaimer: 'Educational only.',
          }),
        };
      }

      return prevImpl ? prevImpl(url, init) : { ok: true, json: async () => [] };
    });

    const { unmount } = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    // Step 1: Open Assistant -> existing conversation with 5 messages loads
    const fab = await screen.findByTestId('ask-gharplate-fab');
    fireEvent.click(fab);

    await waitFor(() => {
      expect(
        screen.getByText('Message 1: What is the calcium content in Ragi?')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Message 5: How much protein does Sambar add?')
      ).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('assistant-user-message').length).toBe(3);
    expect(screen.getAllByTestId('assistant-ai-message').length).toBe(2);

    // Type something in input box to verify + New Chat clears it too
    const input = screen.getByLabelText(/Ask GharPlate Input/i) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Unsent draft text' } });
    expect(input.value).toBe('Unsent draft text');

    // Step 2 & 3: Click + New Chat -> screen immediately clears all 5 messages, clears input, and shows welcome state
    fireEvent.click(screen.getByTestId('assistant-new-conversation-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('assistant-empty-welcome')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/What would you like to explore today\?/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId('assistant-suggested-questions')).toBeInTheDocument();
    expect(input.value).toBe('');
    expect(
      screen.queryByText('Message 1: What is the calcium content in Ragi?')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Message 5: How much protein does Sambar add?')
    ).not.toBeInTheDocument();
    expect(screen.queryAllByTestId('assistant-user-message').length).toBe(0);
    expect(screen.queryAllByTestId('assistant-ai-message').length).toBe(0);

    // Step 4: Send a new message in the new conversation -> appears ONLY in the new conversation
    fireEvent.change(input, {
      target: { value: 'New Chat Question: Fever recovery foods?' },
    });
    fireEvent.click(screen.getByText(/Send ↑/i));

    await waitFor(() => {
      expect(
        screen.getByText('New Chat Question: Fever recovery foods?')
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Verified Reply for Conv 201/i)
      ).toBeInTheDocument();
    });
    // Ensure old conversation messages are NOT present above or below
    expect(
      screen.queryByText('Message 1: What is the calcium content in Ragi?')
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId('assistant-user-message').length).toBe(1);
    expect(screen.getAllByTestId('assistant-ai-message').length).toBe(1);

    // Step 5: Open Saved Chats panel, verify date sections (Today & Yesterday), and reopen Conversation 101
    fireEvent.click(screen.getByTestId('assistant-saved-chats-toggle'));
    expect(screen.getByTestId('assistant-saved-chats-panel')).toBeInTheDocument();
    expect(screen.getByTestId('saved-chats-group-today')).toBeInTheDocument();
    expect(screen.getByTestId('saved-chats-group-yesterday')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('saved-chat-open-101'));

    await waitFor(() => {
      expect(
        screen.getByText('Message 1: What is the calcium content in Ragi?')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Message 5: How much protein does Sambar add?')
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText('New Chat Question: Fever recovery foods?')
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId('assistant-user-message').length).toBe(3);
    expect(screen.getAllByTestId('assistant-ai-message').length).toBe(2);

    // Step 6: Switch back to the new conversation (201) and confirm its messages are separate
    fireEvent.click(screen.getByTestId('assistant-saved-chats-toggle'));
    fireEvent.click(screen.getByTestId('saved-chat-open-201'));

    await waitFor(() => {
      expect(
        screen.getByText('New Chat Question: Fever recovery foods?')
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText('Message 1: What is the calcium content in Ragi?')
    ).not.toBeInTheDocument();

    // Test Search, Rename, and Delete with confirmation in Saved Chats
    fireEvent.click(screen.getByTestId('assistant-saved-chats-toggle'));
    const searchBox = screen.getByTestId('saved-chats-search-input');
    fireEvent.change(searchBox, { target: { value: 'Ragi Calcium' } });
    expect(screen.getByTestId('saved-chat-item-101')).toBeInTheDocument();
    expect(screen.queryByTestId('saved-chat-item-201')).not.toBeInTheDocument();
    fireEvent.change(searchBox, { target: { value: '' } });

    // Rename conversation 101
    fireEvent.click(screen.getByTestId('rename-chat-btn-101'));
    const renameInput = screen.getByTestId('rename-chat-input-101');
    fireEvent.change(renameInput, { target: { value: 'Renamed Ragi Guide' } });
    fireEvent.click(screen.getByTestId('save-rename-chat-btn-101'));

    await waitFor(() => {
      expect(screen.getByTestId('saved-chat-title-101')).toHaveTextContent(
        'Renamed Ragi Guide'
      );
    });

    // Step 7: Unmount and remount (simulate browser refresh) and confirm both conversations remain available
    unmount();

    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );
    fireEvent.click(await screen.findByTestId('ask-gharplate-fab'));
    await waitFor(() => {
      expect(screen.getByTestId('assistant-saved-chats-toggle')).toHaveTextContent(
        'Saved Chats (2)'
      );
    });

    // Delete conversation 201 with confirmation
    fireEvent.click(screen.getByTestId('assistant-saved-chats-toggle'));
    fireEvent.click(screen.getByTestId('delete-chat-btn-201'));
    expect(screen.getByTestId('delete-confirm-box-201')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('confirm-delete-chat-btn-201'));

    await waitFor(() => {
      expect(screen.queryByTestId('saved-chat-item-201')).not.toBeInTheDocument();
    });
  });

  it('renders GharPlate 3.0 ecosystem modules: My Daily Tracker, Water Tracker, Visual Analytics, Smart Grocery List, and Protein Intelligence', async () => {
    const prevImpl = mockFetch.getMockImplementation();
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/tracker/daily')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            date: '2026-11-07',
            weekday: 'saturday',
            today_training: { is_training_day: true, workout_type: 'Strength & Conditioning' },
            member: {
              id: 1,
              display_name: 'Ajji',
              dietary_preference: 'vegetarian',
              primary_goal: 'build_muscle',
              selected_conditions: ['type_2_diabetes'],
            },
            targets: {
              calories_kcal: 2100,
              protein_g: 85,
              carbs_g: 240,
              fat_g: 55,
              fiber_g: 30,
            },
            daily_nutrition: {
              entry_count: 1,
              totals: {
                energy_kcal: 320,
                protein_g: 14.5,
                carbs_g: 52,
                fat_total_g: 4.2,
                fibre_g: 11.2,
              },
              has_incomplete_entries: false,
              incomplete_entry_names: [],
            },
            meals: [
              {
                meal_category: 'breakfast',
                meal_label: 'Breakfast',
                summary: {
                  entry_count: 1,
                  totals: { energy_kcal: 320, protein_g: 14.5, carbs_g: 52 },
                },
                entries: [
                  {
                    id: 701,
                    food_name: 'Ragi (Finger Millet)',
                    quantity: 1,
                    unit_name: '100g',
                    grams_equivalent: 100,
                    meal_category: 'breakfast',
                    energy_kcal: 320,
                    protein_g: 14.5,
                  },
                ],
              },
            ],
            hydration: { total_ml: 1250, goal_ml: 2250, progress_pct: 55.6 },
            meal_templates: [],
            meal_categories_catalog: [{ code: 'breakfast', label: 'Breakfast' }],
          }),
        };
      }
      if (url.includes('/hydration/daily')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            date: '2026-11-07',
            total_ml: 1250,
            goal_ml: 2000,
            remaining_ml: 750,
            progress_pct: 62.5,
            fluid_medical_notice:
              'Individualised Fluid Guidance Notice: Follow physician fluid advice.',
            individual_hydration_disclaimer: 'Fluid needs vary.',
            settings: {
              daily_goal_ml: 2000,
              preferred_container: 'large_glass',
              reminders_enabled: false,
            },
            entries: [
              {
                id: 801,
                logged_date: '2026-11-07',
                logged_time: '09:30',
                amount_ml: 250,
                container_type: 'large_glass',
              },
            ],
            weekly_history: [],
          }),
        };
      }
      if (url.includes('/analytics/overview')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            targets: { calories_kcal: 2000, protein_g: 75, fiber_g: 30, water_ml: 2250 },
            today_meal_pattern: [],
            weekly_series: [
              {
                date: '2026-11-06',
                food_data_status: 'recorded',
                protein_g: 68,
                energy_kcal: 1950,
              },
              {
                date: '2026-11-07',
                food_data_status: 'no_entry_recorded',
                protein_g: null,
                energy_kcal: null,
              },
            ],
            monthly_series: [],
            summary_metrics: {
              logged_days_last_7: 5,
              weekly_avg_protein_g: 71.2,
              weekly_avg_calories_kcal: 1980,
              training_day_avg_protein_g: 78.5,
              training_day_avg_calories_kcal: 2120,
              rest_day_avg_protein_g: 64.0,
              rest_day_avg_calories_kcal: 1840,
            },
            chart_integrity_notice: 'Days without entries are marked no_entry_recorded.',
          }),
        };
      }
      if (url.includes('/shopping-lists')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 1,
            title: 'Household Smart Grocery List',
            delivery_pincode: '570001',
            location_consent_given: true,
            total_items: 1,
            unpurchased_count: 1,
            total_estimated_cost_inr: 32,
            retailer_transparency_notice:
              'Official search destinations on Blinkit, Zepto, Swiggy Instamart, and BigBasket.',
            items: [
              {
                id: 901,
                ingredient_name: 'Curd (Dahi)',
                grams_needed: 300,
                is_purchased: false,
                related_recipes: ['Ragi Bowl', 'Khichdi'],
                retailer_destinations: [
                  {
                    retailer_code: 'blinkit',
                    retailer_name: 'Blinkit',
                    url: 'https://blinkit.com/',
                    availability_note: 'Official search destination',
                  },
                  {
                    retailer_code: 'swiggy_instamart',
                    retailer_name: 'Swiggy Instamart',
                    url: 'https://instamart.in/',
                    availability_note: 'Official search destination',
                  },
                  {
                    retailer_code: 'bigbasket',
                    retailer_name: 'BigBasket',
                    url: 'https://www.bigbasket.com/',
                    availability_note: 'Official search destination',
                  },
                ],
              },
            ],
          }),
        };
      }
      if (url.includes('/pantry')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 1,
              ingredient_name: 'Spinach (Palak)',
              grams_available: 500,
              in_stock: true,
            },
          ],
        };
      }
      if (url.includes('/protein-intelligence')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            whole_food_first_disclaimer: 'Whole Indian foods can meet protein goals.',
            items: [
              {
                food_slug: 'soya-chunks-textured-veg-protein',
                name_en: 'Soya Chunks (Textured Vegetable Protein)',
                standard_serving_name: '1 bowl dry (50g)',
                standard_serving_grams: 50,
                is_vegetarian: true,
                protein_per_100g: 52.0,
                protein_per_serving_g: 26.0,
                energy_per_100g_kcal: 345,
                price_inr_per_100g: 16.0,
                cost_per_10g_protein_inr: 3.08,
              },
            ],
          }),
        };
      }
      return prevImpl ? prevImpl(url, init) : { ok: true, json: async () => [] };
    });

    const { unmount } = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/fitness/tracker']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    // 1. Verify My Daily Tracker page renders logged meals & macro progress
    await waitFor(() => {
      expect(screen.getByTestId('daily-tracker-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('food-log-entry-701')).toHaveTextContent(
      /Ragi \(Finger Millet\)/i
    );
    expect(screen.getByTestId('tracker-stat-protein')).toHaveTextContent('14.5 g');
    unmount();

    // 2. Verify Water & Hydration Tracker page renders 1,250 ml / 2,000 ml and CKD notice
    const r2 = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/fitness/hydration']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('water-tracker-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('hydration-readout-headline')).toHaveTextContent(
      /1,250 ml/i
    );
    expect(screen.getByTestId('hydration-medical-notice')).toBeInTheDocument();
    r2.unmount();

    // 3. Verify Visual Progress Analytics page renders SVG line chart
    const r3 = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/fitness/analytics']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('progress-analytics-page')).toBeInTheDocument();
    });
    expect(screen.getByTestId('analytics-svg-line-chart')).toBeInTheDocument();
    r3.unmount();

    // 4. Verify Smart Grocery & Pantry page renders consolidated item & Blinkit/Instamart/BigBasket links
    const r4 = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/kitchen/grocery']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('smart-grocery-pantry-page')).toBeInTheDocument();
    });
    expect(screen.getByText(/Curd \(Dahi\)/i)).toBeInTheDocument();
    expect(screen.getByTestId('retailer-link-blinkit-901')).toBeInTheDocument();
    expect(screen.getByTestId('retailer-link-swiggy_instamart-901')).toBeInTheDocument();
    expect(screen.getByTestId('retailer-link-bigbasket-901')).toBeInTheDocument();
    r4.unmount();

    // 5. Verify Indian Protein & Budget Intelligence page
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/fitness/protein']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('protein-intelligence-page')).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('protein-row-soya-chunks-textured-veg-protein')
    ).toHaveTextContent('52 g');
    expect(
      screen.getByTestId('protein-row-soya-chunks-textured-veg-protein')
    ).toHaveTextContent('₹3.08 / 10g P');
  });

  it("verifies Premium Minimalist UX Transformation: consolidated sidebar, Quick Add menu, progressive Fitness Profile, simplified Today's Food tracker, Graph-First Habits with deduplication & once-only rewards, and assistant-style AI Habit Builder", async () => {
    const prevImpl = mockFetch.getMockImplementation();
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/fitness/profile")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            member_id: 1,
            member_name: "Ajji",
            primary_goal: "build_muscle",
            height_cm: 162,
            current_weight_kg: 61,
            target_weight_kg: 63,
            training_frequency_days_per_week: 3,
            training_type: "strength_training",
            daily_activity_level: "moderately_active",
            computed_targets: {
              calories_kcal: 2050,
              protein_g: 80,
              fiber_g: 30,
              assumptions_disclosure: "Conservative estimate.",
            },
            training_schedule: [
              { day_of_week: "monday", is_training_day: true, workout_type: "Strength", duration_minutes: 45 },
              { day_of_week: "tuesday", is_training_day: false, workout_type: "Rest", duration_minutes: 0 },
            ],
          }),
        };
      }
      if (url.includes("/tracker/daily")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            date: "2026-11-08",
            weekday: "sunday",
            today_training: { is_training_day: false, workout_type: "Rest" },
            member: { id: 1, display_name: "Ajji", primary_goal: "build_muscle" },
            targets: { calories_kcal: 2050, protein_g: 80, carbs_g: 240, fat_g: 55, fiber_g: 30 },
            daily_nutrition: {
              entry_count: 1,
              totals: { energy_kcal: 260, protein_g: 9.2, carbs_g: 44, fat_total_g: 3.1, fibre_g: 4.8 },
              has_incomplete_entries: false,
              incomplete_entry_names: [],
            },
            meals: [
              {
                meal_category: "breakfast",
                meal_label: "Breakfast",
                summary: { entry_count: 1, totals: { energy_kcal: 260, protein_g: 9.2 } },
                entries: [
                  {
                    id: 910,
                    food_name: "Idli & Sambar",
                    quantity: 1,
                    unit_name: "standard_serving",
                    grams_equivalent: 180,
                    meal_category: "breakfast",
                    energy_kcal: 260,
                    protein_g: 9.2,
                  },
                ],
              },
              {
                meal_category: "dinner",
                meal_label: "Dinner",
                summary: { entry_count: 0, totals: {} },
                entries: [],
              },
            ],
            hydration: { total_ml: 1500, goal_ml: 2250, progress_pct: 66.7 },
            meal_templates: [{ id: 11, name: "South Indian Breakfast", items_count: 2 }],
            meal_categories_catalog: [
              { code: "breakfast", label: "Breakfast" },
              { code: "dinner", label: "Dinner" },
            ],
          }),
        };
      }
      if (url.includes("/tracker/food-logs/parse")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            raw_text: "I had two idlis and one bowl of sambar for breakfast",
            logged_date: "2026-11-08",
            meal_category: "breakfast",
            requires_user_confirmation: true,
            parsed_items: [
              {
                food_slug: "idli-steamed-rice-lentil",
                food_name: "Idli (Steamed Rice & Lentil Cake)",
                quantity: 2,
                unit_name: "standard_serving",
                grams_equivalent: 120,
                energy_kcal: 176,
                protein_g: 5.8,
              },
            ],
            clarification_questions: [],
          }),
        };
      }
      if (url.includes("/fitness/goals")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 301,
              goal_name: "Reach Daily Protein Target",
              goal_type: "protein_intake",
              target_value: 80,
              current_value: 80,
              progress_pct: 100,
              unit: "g / day",
              status: "active",
            },
          ],
        };
      }
      if (url.includes("/fitness/habits/ai-plan") && !url.includes("confirm")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ai_plan_id: "ai_plan_test_99",
            plan_summary: "Proposed 3 focused habits.",
            proposed_habits: [
              {
                title: "Eat & log a protein-rich breakfast",
                frequency: "daily",
                category: "nutrition",
                description: "Anchors morning energy and protein.",
              },
              {
                title: "Record water intake throughout the day",
                frequency: "daily",
                category: "hydration",
                description: "Steady hydration across meals.",
              },
              {
                title: "Complete scheduled workout (3 days/week)",
                frequency: "training_days",
                category: "training",
                description: "Consistent strength sessions.",
              },
            ],
          }),
        };
      }
      if (url.includes("/fitness/habits/ai-plan/confirm")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            saved: true,
            saved_count: 3,
            habits: [],
          }),
        };
      }
      if (url.includes("/fitness/habits")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: 401,
              title: "Drink water regularly",
              description: "Keep a water bottle nearby",
              category: "hydration",
              frequency: "daily",
              is_active: true,
              completed_on_date: true,
              completed_days_last_7: 6,
              weekly_consistency_pct: 85.7,
              completed_dates: ["2026-11-06", "2026-11-07", "2026-11-08"],
            },
            {
              id: 402,
              title: "Drink water regularly",
              description: "Duplicate row that should be deduplicated on frontend",
              category: "hydration",
              frequency: "daily",
              is_active: true,
              completed_on_date: false,
              completed_days_last_7: 1,
              weekly_consistency_pct: 14.3,
              completed_dates: ["2026-11-08"],
            },
            {
              id: 403,
              title: "Paused evening stretch",
              category: "training",
              frequency: "daily",
              is_active: false,
              completed_on_date: false,
              completed_days_last_7: 0,
              weekly_consistency_pct: 0,
              completed_dates: [],
            },
          ],
        };
      }
      return prevImpl ? prevImpl(url, init) : { ok: true, json: async () => [] };
    });

    // 1. Test Fitness Dashboard & Progressive Profile Setup + Header Quick Add Menu
    const rFit = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/fitness/dashboard"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("fitness-dashboard-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("fitness-dashboard-progress-chart")).toBeInTheDocument();

    // Open Quick Add menu in header and verify all 6 unified items exist
    fireEvent.click(screen.getByTestId("header-quick-add-btn"));
    expect(screen.getByTestId("quick-add-log-food")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-add-water")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-record-bp")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-record-glucose")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-log-workout")).toBeInTheDocument();
    expect(screen.getByTestId("quick-add-complete-habit")).toBeInTheDocument();

    // Open progressive profile editor
    fireEvent.click(screen.getByTestId("edit-fitness-profile-btn"));
    expect(screen.getByTestId("primary-goal-select")).toBeInTheDocument();
    rFit.unmount();

    // 2. Test Simplified Daily Tracker ("Today's Food"): only logged meal cards shown, + Log Food modal, NL preview, Saved Meals
    const rDay = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/fitness/tracker"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("daily-tracker-page")).toBeInTheDocument();
    });
    expect(screen.getByText(/Today’s Food/i)).toBeInTheDocument();
    expect(screen.getByTestId("meal-card-breakfast")).toBeInTheDocument();
    // Dinner has 0 entries so it should NOT render an empty meal card, only a compact + Add Dinner button
    expect(screen.queryByTestId("meal-card-dinner")).not.toBeInTheDocument();
    expect(screen.getByTestId("quick-add-meal-dinner")).toBeInTheDocument();

    // Expand More nutrition
    fireEvent.click(screen.getByTestId("toggle-more-nutrition-btn"));
    expect(screen.getByTestId("more-nutrition-panel")).toBeInTheDocument();

    // Open + Log Food drawer and test Natural Language meal preview
    fireEvent.click(screen.getByTestId("open-log-food-modal-btn"));
    fireEvent.click(screen.getByTestId("log-mode-nl"));
    fireEvent.change(screen.getByTestId("nl-food-log-input"), {
      target: { value: "I had two idlis and one bowl of sambar for breakfast" },
    });
    fireEvent.click(screen.getByTestId("nl-food-parse-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("nl-food-preview-card")).toBeInTheDocument();
    });
    rDay.unmount();

    // 3. Test Rebuilt Goals & Habits: Graph-First Habit Chart, Deduplicated Habits, and Once-Only Celebration Banner
    const rHab = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/fitness/goals"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("goals-habits-page")).toBeInTheDocument();
    });
    expect(screen.getByText(/My Goals & Habits/i)).toBeInTheDocument();
    expect(screen.getByTestId("habit-completion-svg-chart")).toBeInTheDocument();
    expect(screen.getByTestId("goal-achievement-celebration")).toBeInTheDocument();

    // Verify duplicate "Drink water regularly" (id 402) and paused habit (id 403) are not shown in active checklist
    expect(screen.getByTestId("habit-item-401")).toBeInTheDocument();
    expect(screen.queryByTestId("habit-item-402")).not.toBeInTheDocument();
    expect(screen.queryByTestId("habit-item-403")).not.toBeInTheDocument();

    // Switch range on habit graph (7d -> 30d -> 90d)
    fireEvent.click(screen.getByTestId("habit-range-30d"));
    fireEvent.click(screen.getByTestId("habit-range-90d"));
    expect(screen.getByTestId("habit-completion-svg-chart")).toBeInTheDocument();
    rHab.unmount();

    // 4. Test Assistant-Style AI Habit Builder: clean initial view, generate 3-5 cards, revise, and confirm
    const rAi = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/fitness/habit-builder"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("ai-habit-builder-page")).toBeInTheDocument();
    });
    expect(screen.getByText(/What would you like to improve\?/i)).toBeInTheDocument();
    expect(screen.queryByTestId("ai-habit-plan-preview")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("generate-habit-plan-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("proposed-habit-card-0")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("confirm-habit-plan-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("ai-habit-success-banner")).toBeInTheDocument();
    });
    rAi.unmount();
  });

  it("verifies Recipe Detail Page, Guided Cooking Mode with step timer & confirmed diary logging, Persistent Achievement History, and Interactive 3D Human Body & Nutrition Explorer", async () => {
    const prevImpl = mockFetch.getMockImplementation();
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/recipes/discover")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            local_verified_recipes: [
              {
                id: 1,
                slug: "idli-steamed-rice-lentil",
                title: "South Indian Steamed Idli",
                why_recommended: "Balanced fermented cereal-pulse breakfast",
                meal_type: "breakfast",
                prep_time_minutes: 25,
                cook_time_minutes: 12,
                servings: 4,
                step_count: 6,
                verification_badge_label: "GharPlate-curated recipe",
                source_name: "ICMR-NIN IFCT 2017",
                completeness_pct: 100,
                per_serving_macros: {
                  energy_kcal: 234,
                  protein_g: 7.4,
                  fibre_g: 3.1,
                },
              },
            ],
          }),
        };
      }
      if (url.includes("/recipes/1/log-diary")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            logged: true,
            entry: { id: 991, food_name: "South Indian Steamed Idli" },
            daily_summary: {},
          }),
        };
      }
      if (url.includes("/recipes/1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 1,
            slug: "idli-steamed-rice-lentil",
            title: "South Indian Steamed Idli",
            description: "Soft steamed fermented parboiled rice and black gram cakes.",
            servings: 4,
            meal_type: "breakfast",
            prep_time_minutes: 25,
            cook_time_minutes: 12,
            total_time_minutes: 37,
            difficulty: "Easy",
            dietary_tags: ["vegetarian", "fermented"],
            suitable_goals: ["maintain_balanced_diet"],
            source_type: "gharplate_verified",
            source_name: "GharPlate IFCT 2017 / ICMR-NIN DGI 2024 Kitchen",
            source_url: "https://www.nin.res.in/",
            verification_status: "gharplate_verified",
            verification_badge_label: "GharPlate-curated recipe",
            instructions_reviewed: true,
            instructions_status: "available",
            is_favourite: false,
            user_rating: 5,
            total_weight_grams: 390,
            serving_weight_grams: 97.5,
            completeness_pct: 100,
            completeness_notice: "All 20 nutrients measured in IFCT 2017.",
            instructions_notes: "Steam for 10-12 minutes.",
            created_at: new Date().toISOString(),
            ingredients: [
              {
                food_slug: "idli-steamed-rice-lentil",
                food_name: "Idli (Steamed Rice & Lentil Cake)",
                quantity: 3,
                unit_name: "standard_serving",
                grams_equivalent: 360,
                household_measure_note: "8 steamed idlis",
                preparation_note: "Naturally fermented 8-10 hours",
                energy_kcal_contribution: 468,
                protein_g_contribution: 14.8,
                carbs_g_contribution: 92.4,
                fat_total_g_contribution: 2.8,
                missing_nutrients: [],
              },
            ],
            steps: [
              {
                id: 10,
                step_number: 1,
                step_title: "Grease the idli moulds",
                instruction_text: "Lightly brush each idli plate cavity with sesame oil.",
                duration_minutes: 2,
                temperature: "Room temperature",
                tip: "Avoid over-stirring fermented batter.",
                equipment: "Idli steamer",
              },
              {
                id: 11,
                step_number: 2,
                step_title: "Steam over boiling water",
                instruction_text: "Steam covered on medium-high flame for 10 to 12 minutes.",
                duration_minutes: 12,
                temperature: "Medium-high steam",
                tip: "Wait 2 minutes before unmoulding.",
                equipment: "Idli steamer",
              },
            ],
            nutrients: [
              {
                nutrient_code: "energy_kcal",
                nutrient_name: "Energy",
                unit: "kcal",
                total_known_value: 936,
                per_serving_known_value: 234,
                ingredients_with_data: 1,
                ingredients_missing_data: 0,
                missing_ingredient_names: [],
                is_complete: true,
              },
              {
                nutrient_code: "protein_g",
                nutrient_name: "Protein",
                unit: "g",
                total_known_value: 29.6,
                per_serving_known_value: 7.4,
                ingredients_with_data: 1,
                ingredients_missing_data: 0,
                missing_ingredient_names: [],
                is_complete: true,
              },
            ],
          }),
        };
      }
      if (url.includes("/explore/body-nutrition/eyes_vision")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 2,
            code: "eyes_vision",
            name: "Eyes & Vision",
            anatomical_system: "Ocular & Retinal System",
            category: "Eyes",
            short_summary: "Retinal phototransduction and macular pigment protection.",
            physiological_function:
              "Vitamin A forms rhodopsin in retinal rod cells for dim-light vision.",
            nutrition_connection:
              "Provitamin A carotenoids from dark leafy greens and orange produce.",
            key_nutrients_summary: ["Vitamin A / Beta-Carotene", "Vitamin C", "Zinc"],
            dietary_pattern_guidance: "Cook beta-carotene vegetables with a little healthy fat.",
            hydration_connection: "Supports tear film stability.",
            evidence_limitation_note: "Educational nutrition reference only.",
            source: {
              name: "ICMR-NIN Dietary Guidelines for Indians",
              organization: "ICMR-NIN",
              year: 2024,
              url: "https://www.nin.res.in/",
              section: "Ocular Health",
            },
            nutrients: [
              {
                nutrient_code: "vitamin_a_ug",
                nutrient_name: "Vitamin A (Retinol / Beta-Carotene RAE)",
                physiological_role: "Essential component of rhodopsin for night vision.",
                daily_reference_note: "ICMR-NIN RDA ~840-1000 ug RAE/day",
                evidence_grade: "Established physiological function",
                source_name: "ICMR-NIN DGI 2024",
                source_url: "https://www.nin.res.in/",
                source_section: "Ocular Health",
              },
            ],
            foods: [
              {
                food_id: 12,
                slug: "spinach-palak",
                name_en: "Spinach (Palak)",
                image_url: "/images/foods/vegetables/spinach-palak.webp",
                default_basis: "100g",
                standard_serving_name: "1 cup chopped (100g)",
                standard_serving_grams: 100,
                is_vegetarian: true,
                is_vegan: true,
                primary_nutrient_code: "vitamin_a_ug",
                relevance_explanation: "Provides 469 ug RAE/100g vitamin A equivalents.",
                preparation_or_serving_tip: "Cook with dal and a little ghee.",
                priority_rank: 1,
                nutrients_per_100: {
                  vitamin_a_ug: 469,
                  protein_g: 2.0,
                  energy_kcal: 26,
                },
                missing_relevant_nutrients: [],
                source_name: "ICMR-NIN IFCT 2017",
                source_url: "https://www.nin.res.in/",
                source_year: 2017,
              },
            ],
          }),
        };
      }
      if (url.includes("/explore/body-nutrition")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total_regions: 2,
            initial_prompt: "Select a body region to explore its nutritional needs.",
            medical_disclaimer: "Educational physiology reference only.",
            regions: [
              {
                id: 1,
                code: "brain_nerves",
                name: "Brain & Nervous System",
                anatomical_system: "Central Nervous System",
                category: "Brain & Nerves",
                display_order: 1,
                short_summary: "Neurotransmitter synthesis and nerve conduction.",
                key_nutrients_summary: ["Folate", "Vitamin B12"],
                camera_position: { theta: 0, phi: 0.15, zoom: 1.35 },
                mesh_coordinates: { cx: 0, cy: 1.55, cz: 0.04, rx: 0.17, ry: 0.2, rz: 0.18, color: "#059669" },
                nutrient_count: 4,
                verified_food_count: 6,
                source_name: "ICMR-NIN DGI 2024",
                source_year: 2024,
              },
              {
                id: 2,
                code: "eyes_vision",
                name: "Eyes & Vision",
                anatomical_system: "Ocular System",
                category: "Eyes",
                display_order: 2,
                short_summary: "Retinal phototransduction and macular protection.",
                key_nutrients_summary: ["Vitamin A", "Vitamin C"],
                camera_position: { theta: 0, phi: 0.12, zoom: 1.45 },
                mesh_coordinates: { cx: 0, cy: 1.48, cz: 0.15, rx: 0.12, ry: 0.07, rz: 0.08, color: "#d97706" },
                nutrient_count: 3,
                verified_food_count: 5,
                source_name: "ICMR-NIN DGI 2024",
                source_year: 2024,
              },
            ],
          }),
        };
      }
      return prevImpl ? prevImpl(url, init) : { ok: true, json: async () => [] };
    });

    // 1. Verify Recipe Discovery Page shows View Recipe button
    const rDisc = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/recipes/discover"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("view-recipe-btn-1")).toBeInTheDocument();
    });
    rDisc.unmount();

    // 2. Verify RecipeDetailPage & Guided Cooking Mode (/recipes/1)
    const rRec = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/recipes/1"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("recipe-detail-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("recipe-detail-title")).toHaveTextContent(
      /South Indian Steamed Idli/i
    );
    expect(screen.getByTestId("recipe-step-card-1")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-step-card-2")).toBeInTheDocument();

    // Launch Guided Cooking Mode
    fireEvent.click(screen.getByTestId("start-cooking-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("guided-cook-mode")).toBeInTheDocument();
    });
    expect(screen.getByTestId("cook-mode-progress-indicator")).toHaveTextContent(/Step 1 of 2/i);
    expect(screen.getByTestId("cook-timer-display")).toBeInTheDocument();

    // Advance to Step 2 and Finish Cooking
    fireEvent.click(screen.getByTestId("cook-next-step-btn"));
    expect(screen.getByTestId("cook-mode-progress-indicator")).toHaveTextContent(/Step 2 of 2/i);
    fireEvent.click(screen.getByTestId("cook-finish-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("cook-completion-panel")).toBeInTheDocument();
    });

    // Confirm logging cooked recipe to today's food diary
    fireEvent.click(screen.getByTestId("confirm-log-cooked-recipe-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("recipe-detail-action-banner")).toBeInTheDocument();
    });
    rRec.unmount();

    // 3. Verify Interactive 3D Human Body & Nutrition Explorer (/explore/body-nutrition)
    const rBody = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/explore/body-nutrition"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("body-nutrition-explorer-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("body-explorer-empty-prompt")).toHaveTextContent(
      /Select a body region to explore its nutritional needs/i
    );

    // Select "Eyes & Vision" structure and verify Level A (top 2-column) and Level B (full-width lower sections)
    expect(screen.getByTestId("anatomy-exploration-level-a")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("body-region-pill-eyes_vision"));
    await waitFor(() => {
      expect(screen.getByTestId("body-region-detail-panel")).toBeInTheDocument();
    });
    expect(screen.getByTestId("anatomy-full-width-level-b")).toBeInTheDocument();
    expect(screen.getByTestId("selected-body-region-title")).toHaveTextContent(/Eyes & Vision/i);
    expect(screen.getByTestId("full-width-nutrients-section")).toBeInTheDocument();
    expect(screen.getByTestId("full-width-foods-section")).toBeInTheDocument();
    expect(screen.getByTestId("full-width-food-comparison-section")).toBeInTheDocument();
    expect(screen.getByTestId("full-width-evidence-section")).toBeInTheDocument();
    expect(screen.getByTestId("body-region-food-card-spinach-palak")).toHaveTextContent(/Spinach \(Palak\)/i);
    expect(screen.getByTestId("body-region-food-card-spinach-palak")).toHaveTextContent(/469/i);

    // Switch between 2D Accessible Diagram and 3D Interactive Model
    fireEvent.click(screen.getByTestId("body-view-mode-toggle"));
    rBody.unmount();
  });

  it("verifies Realistic 10-Layer 3D Anatomy presets & layer controls, Active Context Badge synchronization, and Voice Conversation controls (Mic, en-IN/hi-IN/kn-IN, Auto-speak, Speak Answer)", async () => {
    const prevImpl = mockFetch.getMockImplementation();
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/explore/body-nutrition/eyes_vision")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 2,
            code: "eyes_vision",
            name: "Eyes & Vision",
            anatomical_system: "Ocular & Retinal System",
            category: "Eyes",
            layer_id: "sensory_immune",
            fma_id: "FMA:54448",
            mesh_id: "eyes_vision",
            short_summary: "Retinal phototransduction and macular pigment protection.",
            physiological_function: "Vitamin A forms rhodopsin in retinal rod cells for dim-light vision.",
            nutrition_connection: "Provitamin A carotenoids from dark leafy greens and orange produce.",
            key_nutrients_summary: ["Vitamin A / Beta-Carotene", "Vitamin C", "Zinc"],
            dietary_pattern_guidance: "Cook beta-carotene vegetables with a little healthy fat.",
            hydration_connection: "Supports tear film stability.",
            evidence_limitation_note: "Educational nutrition reference only.",
            source: {
              name: "ICMR-NIN Dietary Guidelines for Indians",
              organization: "ICMR-NIN",
              year: 2024,
              url: "https://www.nin.res.in/",
              section: "Ocular Health",
            },
            nutrients: [
              {
                nutrient_code: "vitamin_a_ug",
                nutrient_name: "Vitamin A (Retinol / Beta-Carotene RAE)",
                physiological_role: "Essential component of rhodopsin for night vision.",
                daily_reference_note: "ICMR-NIN RDA ~840-1000 ug RAE/day",
                evidence_grade: "Established physiological function",
                source_name: "ICMR-NIN DGI 2024",
                source_url: "https://www.nin.res.in/",
                source_section: "Ocular Health",
              },
            ],
            foods: [
              {
                food_id: 12,
                slug: "spinach-palak",
                name_en: "Spinach (Palak)",
                image_url: "/images/foods/vegetables/spinach-palak.webp",
                default_basis: "100g",
                standard_serving_name: "1 cup chopped (100g)",
                standard_serving_grams: 100,
                is_vegetarian: true,
                is_vegan: true,
                primary_nutrient_code: "vitamin_a_ug",
                relevance_explanation: "Provides 469 ug RAE/100g vitamin A equivalents.",
                preparation_or_serving_tip: "Cook with dal and a little ghee.",
                priority_rank: 1,
                nutrients_per_100: { vitamin_a_ug: 469, protein_g: 2.0, energy_kcal: 26 },
                missing_relevant_nutrients: [],
                source_name: "ICMR-NIN IFCT 2017",
                source_url: "https://www.nin.res.in/",
                source_year: 2017,
              },
            ],
          }),
        };
      }
      if (url.includes("/explore/body-nutrition")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            total_regions: 2,
            initial_prompt: "Select a body region to explore its nutritional needs.",
            medical_disclaimer: "Educational physiology reference only.",
            regions: [
              {
                id: 1,
                code: "brain_nerves",
                name: "Brain & Nervous System",
                anatomical_system: "Central Nervous System",
                category: "Brain & Nerves",
                display_order: 1,
                short_summary: "Neurotransmitter synthesis and nerve conduction.",
                key_nutrients_summary: ["Folate", "Vitamin B12"],
                camera_position: { theta: 0, phi: 0.15, zoom: 1.35 },
                mesh_coordinates: { cx: 0, cy: 1.55, cz: 0.04, rx: 0.17, ry: 0.2, rz: 0.18, color: "#059669" },
                nutrient_count: 4,
                verified_food_count: 6,
                source_name: "ICMR-NIN DGI 2024",
                source_year: 2024,
              },
              {
                id: 2,
                code: "eyes_vision",
                name: "Eyes & Vision",
                anatomical_system: "Ocular System",
                category: "Eyes",
                display_order: 2,
                short_summary: "Retinal phototransduction and macular protection.",
                key_nutrients_summary: ["Vitamin A", "Vitamin C"],
                camera_position: { theta: 0, phi: 0.12, zoom: 1.45 },
                mesh_coordinates: { cx: 0, cy: 1.48, cz: 0.15, rx: 0.12, ry: 0.07, rz: 0.08, color: "#d97706" },
                nutrient_count: 3,
                verified_food_count: 5,
                source_name: "ICMR-NIN DGI 2024",
                source_year: 2024,
              },
            ],
          }),
        };
      }
      return prevImpl ? prevImpl(url, init) : { ok: true, json: async () => [] };
    });

    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      writable: true,
      value: {
        speak: speakMock,
        cancel: cancelMock,
        pause: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [
          { lang: "en-IN", name: "Rishi (en-IN)" },
          { lang: "hi-IN", name: "Lekha (hi-IN)" },
          { lang: "kn-IN", name: "Soumya (kn-IN)" },
        ],
        onvoiceschanged: null,
      },
    });
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
      class MockUtterance {
        text: string;
        lang = "en-IN";
        rate = 1;
        volume = 1;
        voice: unknown = null;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(t: string) {
          this.text = t;
        }
      };

    const rUp = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/explore/body-nutrition"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("body-nutrition-explorer-page")).toBeInTheDocument();
    });

    // 1. Verify 3D Anatomy Layer Presets & 10-Layer Popover
    expect(screen.getByTestId("anatomy-preset-whole_body")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-preset-organs")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-preset-muscles")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-preset-skeleton")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("anatomy-preset-muscles"));
    fireEvent.click(screen.getByTestId("anatomy-layers-menu-trigger"));
    expect(screen.getByTestId("anatomy-layers-popover")).toBeInTheDocument();
    expect(screen.getByTestId("layer-toggle-skeletal")).toBeInTheDocument();
    expect(screen.getByTestId("layer-toggle-muscular")).toBeInTheDocument();

    // 2. Select "Eyes & Vision" structure and verify Ask GharPlate syncs Active Context Badge
    fireEvent.click(screen.getByTestId("body-region-pill-eyes_vision"));
    await waitFor(() => {
      expect(screen.getByTestId("selected-body-region-title")).toHaveTextContent(/Eyes & Vision/i);
    });

    // Click Ask GharPlate FAB to open the AI Assistant Drawer with synchronized context
    fireEvent.click(screen.getByTestId("ask-gharplate-fab"));
    await waitFor(() => {
      expect(screen.getByTestId("assistant-drawer")).toBeInTheDocument();
    });

    // Verify Active Context Badge displays "Eyes & Vision"
    expect(screen.getByTestId("assistant-active-context-badge")).toHaveTextContent(
      /Eyes & Vision/i
    );

    // 3. Verify Voice Conversation controls (Mic button, Language selector en-IN/hi-IN/kn-IN, Auto-speak toggle, Voice settings)
    expect(screen.getByTestId("assistant-mic-toggle")).toBeInTheDocument();
    const langSelect = screen.getByTestId("assistant-voice-lang-select") as HTMLSelectElement;
    expect(langSelect.value).toBe("en-IN");
    fireEvent.change(langSelect, { target: { value: "kn-IN" } });
    expect(langSelect.value).toBe("kn-IN");

    const autoSpeakBtn = screen.getByTestId("assistant-voice-autospeak-toggle");
    fireEvent.click(autoSpeakBtn);
    expect(autoSpeakBtn).toHaveTextContent(/Auto-speak ON/i);

    expect(screen.getByTestId("assistant-voice-controls-bar")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-voice-rate-select")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-voice-volume-select")).toBeInTheDocument();

    // Send a question with Auto-speak ON and verify SpeechSynthesis automatically speaks the reply
    const input = screen.getByLabelText(/Ask GharPlate Input/i);
    fireEvent.change(input, { target: { value: "What nutrients are important for this?" } });
    fireEvent.click(screen.getByText(/Send ↑/i));

    await waitFor(() => {
      expect(speakMock).toHaveBeenCalled();
      expect(screen.getByTestId("stop-speak-answer-btn")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId("stop-speak-answer-btn"));
    expect(cancelMock).toHaveBeenCalled();

    rUp.unmount();
  });

  it("verifies AI Assistant Sidebar layout, Enter-to-Send / Shift+Enter newline / IME / error-preservation, Voice Auto-Send on Silence, and Smooth Male/Female 3D Human Reference Anatomy without wireframes", async () => {
    const prevImpl = mockFetch.getMockImplementation();
    let chatCallCount = 0;
    let shouldFailNextChat = false;

    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/assistant/voice/transcribe")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return {
          ok: true,
          status: 200,
          json: async () => ({
            transcript: body.transcript_hint || "",
            normalized_transcript: body.transcript_hint || "",
            language_code: body.language_code || "en-IN",
          }),
        };
      }
      if (url.includes("/assistant/chat")) {
        chatCallCount += 1;
        if (shouldFailNextChat) {
          shouldFailNextChat = false;
          return {
            ok: false,
            status: 500,
            json: async () => ({ detail: "Simulated network failure" }),
          };
        }
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        return {
          ok: true,
          status: 200,
          json: async () => ({
            conversation_id: 301,
            conversation_title: String(body.message || "Chat").slice(0, 50),
            reply: `### Grounded Anatomy & Nutrition Response\n\nAnswered: **${body.message}** for context **${body.context?.selected_entity?.name || "General"}**.`,
            mode_used: body.mode || "automatic",
            model_used: "qwen2.5:7b",
            ollama_connected: true,
            used_fallback_synthesis: false,
            resolved_entity: body.context?.selected_entity || null,
            resolved_intent: "anatomy_nutrition",
            tool_traces: [
              {
                tool_name: "get_body_region_nutrition",
                arguments: { region_code: "muscles_strength" },
                status: "success",
                summary: "Retrieved reviewed nutrients for Skeletal Musculature",
                source_type: "local_database",
              },
            ],
            sources: [
              {
                title: "ICMR-NIN DGI 2024",
                source_type: "local_database",
                url: "https://www.nin.res.in/",
                retrieved_at: new Date().toISOString(),
                verification_status: "verified",
              },
            ],
            suggested_followups: ["Which vegetarian foods support this?"],
            medical_disclaimer: "Educational only.",
          }),
        };
      }
      return prevImpl ? prevImpl(url, init) : { ok: true, json: async () => [] };
    });

    // Install mock SpeechRecognition for Voice Auto-Send on Silence verification
    let activeRecognitionInstance: any = null;
    class MockSpeechRecognition {
      lang = "en-IN";
      continuous = true;
      interimResults = true;
      onstart: (() => void) | null = null;
      onresult: ((e: any) => void) | null = null;
      onerror: ((e: any) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        activeRecognitionInstance = this;
        if (this.onstart) this.onstart();
      }
      stop() {
        if (this.onend) this.onend();
      }
      abort() {
        activeRecognitionInstance = null;
      }
    }
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const rFinal = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/explore/body-nutrition"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("body-nutrition-explorer-page")).toBeInTheDocument();
    });

    // 1. Verify Default Preset is 'Full Internal Anatomy' with Skin Layer DISABLED and Muscles/Organs/Skeleton ENABLED
    const defaultPresetBtn = screen.getByTestId("anatomy-preset-whole_body");
    expect(defaultPresetBtn).toHaveTextContent(/Full Internal Anatomy/i);
    expect(screen.getByTestId("anatomy-default-preset-badge")).toHaveTextContent(/Default/i);

    fireEvent.click(screen.getByTestId("anatomy-layers-menu-trigger"));
    const skinCheckbox = screen.getByTestId("layer-toggle-skin_external") as HTMLInputElement;
    const muscleCheckbox = screen.getByTestId("layer-toggle-muscular") as HTMLInputElement;
    const skeletalCheckbox = screen.getByTestId("layer-toggle-skeletal") as HTMLInputElement;
    const cardioCheckbox = screen.getByTestId("layer-toggle-cardiovascular") as HTMLInputElement;
    expect(skinCheckbox.checked).toBe(false);
    expect(muscleCheckbox.checked).toBe(true);
    expect(skeletalCheckbox.checked).toBe(true);
    expect(cardioCheckbox.checked).toBe(true);
    fireEvent.click(screen.getByTestId("anatomy-layers-menu-trigger"));

    // Verify Male / Female Reference 3D Anatomy toggle, 29 selectable 3D structures, structure search, and individual mesh selection
    const maleBtn = screen.getByTestId("anatomy-sex-male");
    const femaleBtn = screen.getByTestId("anatomy-sex-female");
    expect(maleBtn).toBeInTheDocument();
    expect(femaleBtn).toBeInTheDocument();
    fireEvent.click(femaleBtn);
    fireEvent.click(maleBtn);

    // Verify individual 3D structure chips & search (Pectoralis Major, Rib Cage, Heart, Liver, Femur)
    expect(screen.getByTestId("anatomy-structure-chip-FMA_9627_PECTORALIS_MAJOR")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-structure-chip-FMA_7480_RIB_CAGE")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-structure-chip-FMA_7088_HEART")).toBeInTheDocument();
    expect(screen.getByTestId("anatomy-structure-chip-FMA_7197_LIVER_GALLBLADDER")).toBeInTheDocument();

    const structSearch = screen.getByTestId("anatomy-structure-search") as HTMLInputElement;
    fireEvent.change(structSearch, { target: { value: "Pectoralis" } });
    expect(screen.getByTestId("anatomy-structure-chip-FMA_9627_PECTORALIS_MAJOR")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("anatomy-structure-chip-FMA_9627_PECTORALIS_MAJOR"));
    expect(screen.getByTestId("active-3d-mesh-badge")).toHaveTextContent(/Pectoralis Major/i);
    fireEvent.change(structSearch, { target: { value: "" } });

    // 2. Open Ask GharPlate and verify the Collapsible Left Assistant Control Sidebar + Header New Chat when collapsed
    fireEvent.click(screen.getByTestId("ask-gharplate-fab"));
    await waitFor(() => {
      expect(screen.getByTestId("assistant-sidebar")).toBeInTheDocument();
    });
    expect(screen.getByTestId("assistant-floating-window").getAttribute("data-sidebar-state")).toBe("expanded");
    expect(screen.getByTestId("assistant-saved-chats-panel")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-model-settings-section")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-voice-autosend-toggle")).toHaveTextContent("ON");
    // Only 1 New Chat button exists when expanded (in sidebar, not duplicated in header)
    expect(screen.getAllByTestId("assistant-new-conversation-btn").length).toBe(1);

    // Type draft text, collapse the sidebar via the header toggle, verify sidebar is hidden & draft text is preserved
    const draftInput = screen.getByTestId("assistant-chat-input") as HTMLTextAreaElement;
    fireEvent.change(draftInput, { target: { value: "Preserved unsent draft" } });

    const sidebarToggleBtn = screen.getByTestId("assistant-sidebar-toggle");
    expect(sidebarToggleBtn).toHaveTextContent(/Hide Sidebar/i);
    fireEvent.click(sidebarToggleBtn);

    expect(screen.queryByTestId("assistant-sidebar")).not.toBeInTheDocument();
    expect(screen.getByTestId("assistant-floating-window").getAttribute("data-sidebar-state")).toBe("collapsed");
    expect(window.localStorage.getItem("gharplate_assistant_sidebar_open")).toBe("false");
    expect(draftInput.value).toBe("Preserved unsent draft");
    // Microphone remains accessible in composer when sidebar is collapsed
    expect(screen.getByTestId("assistant-mic-toggle")).toBeInTheDocument();
    // + New Chat button remains visible in the main conversation header while sidebar is collapsed!
    const collapsedHeaderNewChatBtn = screen.getByTestId("assistant-new-conversation-btn");
    expect(collapsedHeaderNewChatBtn).toBeInTheDocument();

    // Click + New Chat while sidebar is closed -> clears draft and starts a fresh conversation without opening sidebar
    fireEvent.click(collapsedHeaderNewChatBtn);
    expect(draftInput.value).toBe("");
    expect(screen.queryByTestId("assistant-sidebar")).not.toBeInTheDocument();

    // Reopen sidebar via the persistent header toggle
    expect(sidebarToggleBtn).toHaveTextContent(/Show Sidebar/i);
    fireEvent.click(sidebarToggleBtn);
    expect(screen.getByTestId("assistant-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("assistant-floating-window").getAttribute("data-sidebar-state")).toBe("expanded");
    expect(window.localStorage.getItem("gharplate_assistant_sidebar_open")).toBe("true");

    // 3. Verify Keyboard Composer: empty Enter does not send, IME composition does not send, Shift+Enter does not send, Enter sends
    const chatInput = screen.getByTestId("assistant-chat-input") as HTMLTextAreaElement;
    fireEvent.change(chatInput, { target: { value: "   " } });
    fireEvent.keyDown(chatInput, { key: "Enter", shiftKey: false });
    expect(chatCallCount).toBe(0);

    fireEvent.change(chatInput, { target: { value: "What does Skeletal Musculature do?" } });
    // IME composition should not send
    fireEvent.keyDown(chatInput, { key: "Enter", shiftKey: false, isComposing: true, keyCode: 229 });
    expect(chatCallCount).toBe(0);

    // Shift+Enter should not send
    fireEvent.keyDown(chatInput, { key: "Enter", shiftKey: true });
    expect(chatCallCount).toBe(0);

    // Failed request preserves user's input text
    shouldFailNextChat = true;
    fireEvent.keyDown(chatInput, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(screen.getByTestId("assistant-error-banner")).toBeInTheDocument();
    });
    expect(chatInput.value).toBe("What does Skeletal Musculature do?");

    // Successful Enter-to-send submits and clears input
    fireEvent.keyDown(chatInput, { key: "Enter", shiftKey: false });
    await waitFor(() => {
      expect(chatInput.value).toBe("");
      expect(screen.getByText(/Grounded Anatomy & Nutrition Response/i)).toBeInTheDocument();
    });

    // 4. Verify Voice Auto-Send on Silence & Cancel Guardrail
    const countBeforeVoice = chatCallCount;
    fireEvent.click(screen.getByTestId("assistant-mic-toggle"));
    expect(activeRecognitionInstance).not.toBeNull();

    // Test cancelling voice recording does not send
    activeRecognitionInstance.onresult?.({
      results: [[{ transcript: "Cancelled voice query" }]],
    });
    fireEvent.click(screen.getByTestId("assistant-mic-cancel"));
    expect(chatCallCount).toBe(countBeforeVoice);

    // Start mic again, speak final result, and let recognition end -> auto-sends once
    fireEvent.click(screen.getByTestId("assistant-mic-toggle"));
    const finalResultItem: any = [{ transcript: "Which nutrients support muscles?" }];
    finalResultItem.isFinal = true;
    activeRecognitionInstance.onresult?.({
      results: [finalResultItem],
    });
    activeRecognitionInstance.onend?.();

    await waitFor(() => {
      expect(chatCallCount).toBe(countBeforeVoice + 1);
    });

    rFinal.unmount();
  });

  it("verifies AI Food Photo Analyzer in Tools sidebar, Ask GharPlate AI in main left sidebar, unbiased upload, portion nutrition scaling, and contextual food photo conversation", async () => {
    let lastAssistantContext: any = null;
    const origFetch = globalThis.fetch;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/scan/recognize-dish")) {
        return new Response(
          JSON.stringify({
            recognition_id: "rec_live_photo_01",
            analysis_status: "success",
            vision_provider: "ollama_local_vision",
            vision_model_used: "qwen2.5vl:7b",
            vision_reachable: true,
            overall_description:
              "Two fluffy steamed white idlis served with vegetable sambar.",
            experimental_disclaimer:
              "EXPERIMENTAL FEATURE — AI FOOD PHOTO ANALYSIS: Confirm food and portion.",
            privacy_confirmation:
              "Image (640x480px) was analysed strictly in RAM and purged immediately.",
            requires_user_confirmation: true,
            image_quality_notes: "Analysed 640x480px RGB photograph in memory.",
            detected_components: [
              {
                component_label: "Idli",
                confidence_score: 0.94,
                confidence_category: "high_confidence",
                visual_description: "Two steamed rice-lentil cakes",
                matched_in_database: true,
                matched_food_id: 101,
                matched_food_slug: "idli-steamed-rice-lentil",
                matched_food_name: "Idli (Steamed Rice-Lentil Cake)",
                category_name: "Indian Cooked Dishes",
                standard_serving_name: "2 idlis",
                standard_serving_grams: 120,
              },
              {
                component_label: "Sambar",
                confidence_score: 0.88,
                confidence_category: "high_confidence",
                visual_description: "Bowl of lentil vegetable sambar",
                matched_in_database: true,
                matched_food_id: 102,
                matched_food_slug: "sambar-vegetable-lentil-stew",
                matched_food_name: "Sambar (Vegetable-Lentil Stew)",
                category_name: "Indian Cooked Dishes",
                standard_serving_name: "1 katori",
                standard_serving_grams: 150,
              },
            ],
            unrecognized_items: [],
            ambiguity_notes: [],
            remediation_instructions: [],
            candidates: [
              {
                food_id: 101,
                food_slug: "idli-steamed-rice-lentil",
                food_name: "Idli (Steamed Rice-Lentil Cake)",
                matched_in_database: true,
                image_url: "/images/foods/idli-steamed-rice-lentil.webp",
                regional_aliases: ["ಇಡ್ಲಿ", "इडली"],
                visual_similarity_score: 0.94,
                confidence_category: "high_confidence",
                uncertainty_label: "High visual confidence (confirm portion below)",
                visual_cue_explanation:
                  "Identified as steamed rice-lentil idli by qwen2.5vl:7b.",
                category_name: "Indian Cooked Dishes",
                default_basis: "100g",
                standard_serving_name: "2 idlis",
                standard_serving_grams: 120,
                is_vegetarian: true,
                is_vegan: true,
                completeness_pct: 95,
                available_nutrient_count: 19,
                missing_nutrient_codes: ["vitamin_d_ug"],
                source_name: "ICMR-NIN IFCT",
                source_url: "https://www.nin.res.in/",
                publication_year: 2017,
                servings: [
                  {
                    unit_name: "1_idli",
                    unit_label: "1 idli",
                    grams_equivalent: 60,
                    is_default: false,
                    conversion_source: "ICMR-NIN Household Measures",
                  },
                  {
                    unit_name: "standard_serving",
                    unit_label: "2 idlis",
                    grams_equivalent: 120,
                    is_default: true,
                    conversion_source: "ICMR-NIN Household Measures",
                  },
                ],
                nutrients: [
                  {
                    nutrient_code: "energy_kcal",
                    nutrient_name: "Energy",
                    unit: "kcal",
                    category: "macronutrient",
                    value_per_100: 146,
                    value_for_serving: 175.2,
                    basis: "100g",
                    is_available: true,
                    confidence_status: "verified_ifct",
                    source_name: "ICMR-NIN IFCT",
                    source_url: "https://www.nin.res.in/",
                    publication_year: 2017,
                  },
                  {
                    nutrient_code: "protein_g",
                    nutrient_name: "Protein",
                    unit: "g",
                    category: "macronutrient",
                    value_per_100: 4.8,
                    value_for_serving: 5.8,
                    basis: "100g",
                    is_available: true,
                    confidence_status: "verified_ifct",
                    source_name: "ICMR-NIN IFCT",
                    source_url: "https://www.nin.res.in/",
                    publication_year: 2017,
                  },
                  {
                    nutrient_code: "carbs_g",
                    nutrient_name: "Total Carbohydrates",
                    unit: "g",
                    category: "macronutrient",
                    value_per_100: 28.8,
                    value_for_serving: 34.6,
                    basis: "100g",
                    is_available: true,
                    confidence_status: "verified_ifct",
                    source_name: "ICMR-NIN IFCT",
                    source_url: "https://www.nin.res.in/",
                    publication_year: 2017,
                  },
                  {
                    nutrient_code: "fat_total_g",
                    nutrient_name: "Total Fat",
                    unit: "g",
                    category: "macronutrient",
                    value_per_100: 0.7,
                    value_for_serving: 0.8,
                    basis: "100g",
                    is_available: true,
                    confidence_status: "verified_ifct",
                    source_name: "ICMR-NIN IFCT",
                    source_url: "https://www.nin.res.in/",
                    publication_year: 2017,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/assistant/chat") && init?.body) {
        const parsed = JSON.parse(String(init.body));
        lastAssistantContext = parsed.context;
        return new Response(
          JSON.stringify({
            conversation_id: 707,
            conversation_title: "Photo Nutrition Chat",
            reply:
              "**Analysed Food Photo Context:** **Idli (Steamed Rice-Lentil Cake)** provides **5.8 g** protein in your **2 idlis (120g)** portion.",
            mode_used: "automatic",
            model_used: "qwen2.5vl:7b",
            ollama_connected: true,
            used_fallback_synthesis: false,
            resolved_entity: {
              type: "food",
              id: "idli-steamed-rice-lentil",
              name: "Idli (Steamed Rice-Lentil Cake)",
            },
            resolved_intent: "active_food_query",
            tool_traces: [],
            sources: [],
            suggested_followups: [
              "Is Idli suitable for someone going to the gym?",
              "Add this to today's breakfast",
            ],
            medical_disclaimer: "Educational nutrition assistant only.",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return origFetch(input, init);
    });

    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-photo");
    }
    if (!globalThis.URL.revokeObjectURL) {
      globalThis.URL.revokeObjectURL = vi.fn();
    }

    const rPhoto = render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={["/recognition"]}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    // 1. Verify Food Photo Analyzer page heading and unbiased empty description input
    await waitFor(() => {
      expect(screen.getByText("AI Food Photo Analyzer")).toBeInTheDocument();
    });
    const hintInput = screen.getByTestId("optional-food-hint-input") as HTMLInputElement;
    expect(hintInput.value).toBe("");
    expect(hintInput.placeholder).toBe(
      "Optional: describe anything you already know about the food."
    );

    // 2. Verify Tools group in left sidebar includes "Food Photo Analyzer" and main sidebar has "Ask GharPlate AI"
    expect(screen.getByText("Food Photo Analyzer")).toBeInTheDocument();
    const sidebarAiBtn = screen.getByTestId("sidebar-ask-gharplate-btn");
    expect(sidebarAiBtn).toBeInTheDocument();

    // 3. Upload a food image from Mac and analyze it
    const fileInput = screen.getByTestId("food-photo-input");
    const samplePhoto = new File(["fake_jpeg_bytes"], "my_breakfast.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(fileInput, { target: { files: [samplePhoto] } });

    await waitFor(() => {
      expect(screen.getByTestId("uploaded-food-preview")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("analyze-food-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("confirmed-food-title")).toHaveTextContent(
        "Idli (Steamed Rice-Lentil Cake)"
      );
    });

    // 4. Verify Portion Selector updates nutrition values (1 idli = 60g -> 2.9g protein; 2 idlis = 120g -> 5.8g protein)
    const portionSelect = screen.getByTestId("portion-preset-select") as HTMLSelectElement;
    fireEvent.change(portionSelect, { target: { value: "srv_standard_serving_1" } });
    await waitFor(() => {
      expect(screen.getByTestId("photo-nutrition-summary-card")).toHaveTextContent("5.8 g");
    });

    // 5. Click "Ask GharPlate about this food" -> opens shared AssistantWorkspacePanel with food_image_analysis context
    fireEvent.click(screen.getByTestId("ask-assistant-about-photo-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("assistant-drawer")).toBeInTheDocument();
    });

    const chatInput = screen.getByTestId("assistant-chat-input");
    fireEvent.change(chatInput, {
      target: { value: "How much protein does this contain?" },
    });
    fireEvent.click(screen.getByTestId("assistant-send-btn"));

    await waitFor(() => {
      expect(lastAssistantContext).not.toBeNull();
      expect(lastAssistantContext.page_type).toBe("food_image_analysis");
      expect(lastAssistantContext.food_image_analysis.confirmed_food_slug).toBe(
        "idli-steamed-rice-lentil"
      );
      expect(lastAssistantContext.food_image_analysis.selected_grams).toBe(120);
    });

    rPhoto.unmount();
  });
});
