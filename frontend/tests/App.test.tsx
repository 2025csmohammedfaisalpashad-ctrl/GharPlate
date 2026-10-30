import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppRoutes } from '../src/App';
import { HouseholdProvider } from '../src/hooks/useHousehold';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/health')) {
      return {
        ok: true,
        json: async () => ({
          status: 'healthy',
          service: 'GharPlate API',
          version: '1.0.0',
          counts: { foods: 75, conditions: 24, sources: 9 },
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
    if (url.includes('/foods/categories')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 1,
            slug: 'cereals-millets',
            name: 'Cereals & Millets',
            description: 'Staple grains and millets',
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

describe('GharPlate Frontend UI & Feature Suite', () => {
  it('renders Landing Home Page with medical safety disclaimer and live database stats', async () => {
    render(
      <HouseholdProvider>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </HouseholdProvider>
    );

    expect(
      screen.getByText(/Transparent, Evidence-Based Nutrition Intelligence/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Educational Tool Only:/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('75')).toBeInTheDocument();
    });
  });

  it('renders Food Explorer and displays multilingual alias cards', async () => {
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
  });

  it('supports manual OCR correction workflow on Food Scanner page', async () => {
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
});
