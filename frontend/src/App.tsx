import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HouseholdProvider } from './hooks/useHousehold';
import {
  ProductComparisonPage,
  MealSuggestionsPage,
} from './pages/ComparisonMealsPages';
import {
  ConditionDetailPage,
  ConditionExplorerPage,
} from './pages/ConditionPages';
import {
  FoodDetailPage,
  FoodExplorerPage,
  HomePage,
} from './pages/HomePages';
import {
  HouseholdDashboardPage,
  MemberProfilePage,
} from './pages/HouseholdPages';
import {
  RecipeCalculatorPage,
  SavedRecipesPage,
} from './pages/RecipePages';
import {
  BarcodeLookupPage,
  FoodRecognitionPage,
  FoodScannerPage,
} from './pages/ScannerPages';
import {
  AboutPage,
  DataSourcesPage,
  PrivacySafetyPage,
  SettingsPage,
} from './pages/TrustPages';

export const AppRoutes: React.FC = () => (
  <Layout>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/foods" element={<FoodExplorerPage />} />
      <Route path="/foods/:slug" element={<FoodDetailPage />} />
      <Route path="/conditions" element={<ConditionExplorerPage />} />
      <Route path="/conditions/:code" element={<ConditionDetailPage />} />
      <Route path="/household" element={<HouseholdDashboardPage />} />
      <Route path="/household/member" element={<MemberProfilePage />} />
      <Route path="/recipes/calculator" element={<RecipeCalculatorPage />} />
      <Route path="/recipes/saved" element={<SavedRecipesPage />} />
      <Route path="/scanner" element={<FoodScannerPage />} />
      <Route path="/barcode" element={<BarcodeLookupPage />} />
      <Route path="/recognition" element={<FoodRecognitionPage />} />
      <Route path="/compare" element={<ProductComparisonPage />} />
      <Route path="/meals" element={<MealSuggestionsPage />} />
      <Route path="/sources" element={<DataSourcesPage />} />
      <Route path="/privacy-safety" element={<PrivacySafetyPage />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  </Layout>
);

export const App: React.FC = () => (
  <HouseholdProvider>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </HouseholdProvider>
);

export default App;
