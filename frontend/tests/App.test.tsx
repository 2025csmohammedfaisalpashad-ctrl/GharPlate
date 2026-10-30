import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppRoutes } from '../src/App';
import { HouseholdProvider } from '../src/hooks/useHousehold';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
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
            image_url: null,
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
          installed_models: ['llama3.2:latest'],
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
          reply:
            '**Pineapple Cake** (winkles) • Barcode: `8906005618726`\n- **Declared Ingredients:** REFINED WHEAT FLOUR (MAIDA), EGGS, SUGAR, PINEAPPLE CUTS (2%).\n- **Allergen Consistency Note:** Label declares **soy** in addition to wheat, milk, and egg.',
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
              image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Khichdi.jpg/640px-Khichdi.jpg',
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
            image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Eleusine_coracana_seeds.jpg/640px-Eleusine_coracana_seeds.jpg',
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
              image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Eleusine_coracana_seeds.jpg/640px-Eleusine_coracana_seeds.jpg',
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

describe('GharPlate Redesigned Visual UI, Packaged Product Intelligence & AI Assistant Suite', () => {
  it('renders Redesigned Visual Home Page with hero, food photos, and live stats', async () => {
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
  });

  it('renders Image-First Food Explorer with Grid and Compact List view toggle', async () => {
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

  it('renders Pineapple Cake packaged product page with visible barcode, visible ingredients, soy consistency alert, honest missing-image card, and missing-nutrition actions', async () => {
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

    // Honest missing-image card (never shows generic Muesli photo)
    expect(screen.getByTestId('no-verified-product-image')).toBeInTheDocument();
    expect(screen.getByText(/No verified product image available/i)).toBeInTheDocument();

    // Visible Ingredients & Allergens section (not hidden inside collapsed accordion)
    expect(screen.getByTestId('visible-ingredients-allergens-section')).toBeInTheDocument();
    expect(
      screen.getAllByText(/REFINED WHEAT FLOUR \(MAIDA\)/i).length
    ).toBeGreaterThan(0);

    // Soy allergen consistency alert
    expect(screen.getByTestId('allergen-consistency-alert')).toBeInTheDocument();
    expect(screen.getByText(/mentions \[soy\]/i)).toBeInTheDocument();

    // Actionable missing-nutrition card (not a wall of NULLs)
    expect(screen.getByTestId('missing-nutrition-action-card')).toBeInTheDocument();
    expect(
      screen.getByText(/Nutrition values have not yet been captured for this product/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Search Online Databases/i)).toBeInTheDocument();
  });

  it('supports Barcode Lookup page and camera scanner state handling', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/barcode']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    const startCamBtn = screen.getByTestId('start-camera-scanner-btn');
    fireEvent.click(startCamBtn);

    await waitFor(() => {
      expect(screen.getByTestId('camera-scanner-error')).toBeInTheDocument();
    });

    const searchBtn = screen.getByText(/^Search Barcode$/i);
    fireEvent.click(searchBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Found packaged product 'Pineapple Cake'/i)
      ).toBeInTheDocument();
    });
  });

  it('opens the Ask GharPlate AI Assistant drawer, switches search modes, and sends a context-aware question', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/foods/pkg-pineapple-cake-6b35c3']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    const fab = await screen.findByTestId('ask-gharplate-fab');
    fireEvent.click(fab);

    expect(screen.getByTestId('assistant-drawer')).toBeInTheDocument();

    // Switch modes
    const dbModeBtn = screen.getByTestId('assistant-mode-database_only');
    fireEvent.click(dbModeBtn);
    const onlineModeBtn = screen.getByTestId('assistant-mode-online_search');
    fireEvent.click(onlineModeBtn);
    const autoModeBtn = screen.getByTestId('assistant-mode-automatic');
    fireEvent.click(autoModeBtn);

    const input = screen.getByLabelText(/Ask GharPlate Input/i);
    fireEvent.change(input, { target: { value: 'What are the ingredients in this cake?' } });
    fireEvent.click(screen.getByText(/^Send$/i));

    await waitFor(() => {
      expect(screen.getByText(/get_ingredients_and_allergens/i)).toBeInTheDocument();
      expect(screen.getByText(/Allergen Consistency Note/i)).toBeInTheDocument();
    });
  });
});
