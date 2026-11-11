import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import NutrientExplorerPage from '../src/pages/NutrientExplorerPage'

const mockGetNutrientCatalog = vi.fn()
const mockSearchFoodsByNutrient = vi.fn()

vi.mock('../src/hooks/useHousehold', () => ({
  useHousehold: () => ({
    activeMember: {
      id: 1,
      display_name: 'Aarav',
      dietary_preference: 'vegetarian',
    },
  }),
}))

vi.mock('../src/hooks/useAssistantContext', () => ({
  openAssistantWorkspace: vi.fn(),
  publishAssistantContext: vi.fn(),
}))

vi.mock('../src/services/api', () => ({
  api: {
    getNutrientCatalog: (...args: unknown[]) => mockGetNutrientCatalog(...args),
    searchFoodsByNutrient: (...args: unknown[]) => mockSearchFoodsByNutrient(...args),
  },
}))

describe('NutrientExplorerPage — Nutrient Discovery & Clean Food Cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockGetNutrientCatalog.mockResolvedValue({
      total_nutrients: 65,
      groups: [
        {
          code: 'vitamins',
          label: 'Vitamins',
          description: 'Vitamin A, B-complex, C, D, E, K',
          icon: '💊',
          nutrient_count: 19,
          nutrients: [
            {
              code: 'vit_d_mcg',
              name: 'Vitamin D (Total)',
              unit: 'mcg',
              category: 'vitamin',
              explorer_group_code: 'vitamins',
              explorer_group_label: 'Vitamins',
              is_core_11: true,
              display_order: 1,
              description: 'Total Vitamin D',
              aliases: ['vit d', 'calciferol'],
              measured_food_count: 10,
              rda_adult_note: 'ICMR-NIN 2020 RDA: 15 mcg/day',
              bioavailability_note: 'Fat-soluble vitamin absorbed best with dietary fat.',
              coverage_limitation_note: 'Most unfortified plant foods contain negligible Vitamin D.',
            },
          ],
        },
        {
          code: 'minerals',
          label: 'Minerals',
          description: 'Iron, Calcium, Magnesium, Zinc',
          icon: '🪨',
          nutrient_count: 13,
          nutrients: [
            {
              code: 'iron_mg',
              name: 'Iron (Fe)',
              unit: 'mg',
              category: 'mineral',
              explorer_group_code: 'minerals',
              explorer_group_label: 'Minerals',
              is_core_11: true,
              display_order: 20,
              description: 'Dietary Iron',
              aliases: ['fe'],
              measured_food_count: 120,
              rda_adult_note: 'ICMR-NIN 2020 RDA: 19-29 mg/day',
              bioavailability_note: 'Pair non-haem plant iron with Vitamin C foods.',
              coverage_limitation_note: null,
            },
          ],
        },
        {
          code: 'protein_amino_acids',
          label: 'Protein and Amino Acids',
          description: 'Total Protein & Essential Amino Acids',
          icon: '💪',
          nutrient_count: 12,
          nutrients: [],
        },
        {
          code: 'carbohydrates_fibre',
          label: 'Carbohydrates and Fibre',
          description: 'Total Carbs, Starch, Soluble & Insoluble Fibre',
          icon: '🌾',
          nutrient_count: 8,
          nutrients: [],
        },
        {
          code: 'fats_fatty_acids',
          label: 'Fats and Essential Fatty Acids',
          description: 'Total Fat, MUFA, PUFA, Omega-3 & Omega-6',
          icon: '🥑',
          nutrient_count: 7,
          nutrients: [],
        },
        {
          code: 'other_components',
          label: 'Other Nutritional Components',
          description: 'Energy, Choline, Water, Carotenoids',
          icon: '🧬',
          nutrient_count: 6,
          nutrients: [],
        },
      ],
      nutrients: [],
    })

    mockSearchFoodsByNutrient.mockResolvedValue({
      matched: true,
      query: 'iron_mg',
      nutrient: {
        code: 'iron_mg',
        name: 'Iron (Fe)',
        unit: 'mg',
        category: 'mineral',
        explorer_group_code: 'minerals',
        explorer_group_label: 'Minerals',
        description: 'Essential mineral for haemoglobin and oxygen transport.',
        aliases: ['iron', 'fe'],
        rda_adult_note: 'ICMR-NIN 2020 RDA (Adults): 19 mg/day (Men), 29 mg/day (Women).',
        bioavailability_note: 'Pairing plant meals with Vitamin C foods triples non-haem iron absorption.',
        coverage_limitation_note: null,
        measured_food_count: 120,
      },
      total_matching_foods: 2,
      empty_or_sparse_explanation: null,
      foods: [
        {
          slug: 'amaranth-leaves-chaulai',
          name_en: 'Amaranth Leaves (Chaulai / Rajgira)',
          image_url: '/images/foods/vegetables/amaranth-leaves-chaulai.webp',
          category_slug: 'vegetables',
          category_name: 'Vegetables & Greens',
          food_forms: ['raw', 'natural'],
          is_vegetarian: true,
          is_vegan: true,
          is_packaged: false,
          nutrient_code: 'iron_mg',
          nutrient_name: 'Iron',
          nutrient_unit: 'mg',
          amount_per_100g: 4.64,
          amount_per_serving: 4.64,
          density_per_100kcal: 15.2,
          formatted_amount: '4.64 mg per 100 g',
          formatted_per_serving: '4.64 mg per serving (100 g)',
          standard_serving_name: '1 cup chopped',
          standard_serving_grams: 100,
          source_code: 'ICMR_NIN_IFCT_2017',
          source_name: 'ICMR-NIN IFCT 2017',
          source_url: 'https://www.nin.res.in/ebooks/IFCT2017.pdf',
          view_details_path: '/foods/amaranth-leaves-chaulai',
        },
      ],
    })
  })

  it('renders Nutrient Explorer heading, 6 category tabs, search bar, and clean food cards', async () => {
    render(
      <MemoryRouter initialEntries={['/nutrient-explorer']}>
        <NutrientExplorerPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('What Nutrient Are You Looking For?')).toBeInTheDocument()
    expect(
      screen.getByText('Explore Indian foods by their vitamin, mineral and nutritional composition.'),
    ).toBeInTheDocument()

    // Verify 6 category tabs
    expect(await screen.findByTestId('nutrient-group-tab-vitamins')).toBeInTheDocument()
    expect(screen.getByTestId('nutrient-group-tab-minerals')).toBeInTheDocument()
    expect(screen.getByTestId('nutrient-group-tab-protein_amino_acids')).toBeInTheDocument()
    expect(screen.getByTestId('nutrient-group-tab-carbohydrates_fibre')).toBeInTheDocument()
    expect(screen.getByTestId('nutrient-group-tab-fats_fatty_acids')).toBeInTheDocument()
    expect(screen.getByTestId('nutrient-group-tab-other_components')).toBeInTheDocument()

    // Wait for ranked food cards to render
    await waitFor(() => {
      expect(screen.getByTestId('nutrient-food-card-amaranth-leaves-chaulai')).toBeInTheDocument()
    })

    const card = screen.getByTestId('nutrient-food-card-amaranth-leaves-chaulai')
    expect(card).toHaveTextContent('Amaranth Leaves (Chaulai / Rajgira)')
    expect(card).toHaveTextContent('4.64 mg per 100 g')
    expect(card).toHaveTextContent('View Details')
    expect(card).not.toHaveTextContent('ICMR_NIN_IFCT_2017')

    // Trigger search input
    const searchInput = screen.getByTestId('nutrient-search-input')
    fireEvent.change(searchInput, { target: { value: 'Vitamin D' } })
    fireEvent.submit(searchInput.closest('form')!)

    await waitFor(() => {
      expect(mockSearchFoodsByNutrient).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Vitamin D' }),
      )
    })
  })
})
