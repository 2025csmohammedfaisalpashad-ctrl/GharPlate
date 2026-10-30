import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ConfidenceBadge,
  ExpandableSection,
  FoodImage,
} from '../components/UIWidgets';
import { api } from '../services/api';
import type {
  BarcodeLookupResponse,
  DishRecognitionResponse,
  FoodDetail,
  OCRScanResponse,
} from '../types/api';

// ==========================================
// PAGE 10: VISUAL STEP-BY-STEP PACKAGED FOOD LABEL SCANNER
// ==========================================
export const FoodScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [rawTextInput, setRawTextInput] = useState(
    `Product Name: Karnataka Roasted Millet Mixture
Brand: Mysuru Home Foods
Serving Size: 30 g
Nutritional Information Per 100g:
Energy: 48O kcal
Protein: 11.2 g
Total Carbohydrates: 58.4 g
Total Sugars: 3.2 g
Added Sugars: 1.5 g
Total Fat: 22.0 g
Saturated Fat: 4.8 g
Trans Fat: 0.0 g
Dietary Fibre: 8.4 g
Sodium: 410 mg
Ingredients: Roasted Ragi Flakes, Jowar Puffs, Groundnut (Peanuts), Roasted Gram, Curry Leaves, Rice Bran Oil, Iodised Salt, Spices.
Allergen Advice: Contains Peanuts.`
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<OCRScanResponse | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [savedProduct, setSavedProduct] = useState<FoodDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const populateEditState = (res: OCRScanResponse) => {
    const next: Record<string, string> = {};
    Object.entries(res.fields).forEach(([key, pred]) => {
      next[key] =
        pred.extracted_value !== null && pred.extracted_value !== undefined
          ? String(pred.extracted_value)
          : '';
    });
    setEditedValues(next);
  };

  const handleFileChange = (file: File | null) => {
    setSelectedFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreviewUrl(url);
    } else {
      setImagePreviewUrl(null);
    }
  };

  const handleImageScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose or capture a nutrition label image (JPEG, PNG, or WebP).');
      return;
    }
    setLoading(true);
    setError(null);
    setSavedProduct(null);
    try {
      const res = await api.scanLabelImage(selectedFile, rawTextInput);
      setScanResult(res);
      populateEditState(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR image processing failed');
    } finally {
      setLoading(false);
    }
  };

  const handleTextScan = async () => {
    setLoading(true);
    setError(null);
    setSavedProduct(null);
    try {
      const res = await api.scanLabelText(rawTextInput);
      setScanResult(res);
      populateEditState(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR text parsing failed');
    } finally {
      setLoading(false);
    }
  };

  const applyProposedCorrection = (fieldKey: string, proposed: string | number) => {
    setEditedValues((prev) => ({ ...prev, [fieldKey]: String(proposed) }));
  };

  const handleConfirmAndSave = async () => {
    if (!scanResult) return;
    setLoading(true);
    setError(null);
    try {
      const parseNumOrNull = (key: string): number | null => {
        const raw = editedValues[key]?.trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };

      const nutrientsPer100: Record<string, number | null> = {
        energy_kcal: parseNumOrNull('energy_kcal'),
        protein_g: parseNumOrNull('protein_g'),
        carbs_g: parseNumOrNull('carbs_g'),
        sugars_total_g: parseNumOrNull('sugars_total_g'),
        sugars_added_g: parseNumOrNull('sugars_added_g'),
        fat_total_g: parseNumOrNull('fat_total_g'),
        fat_saturated_g: parseNumOrNull('fat_saturated_g'),
        fat_trans_g: parseNumOrNull('fat_trans_g'),
        fibre_g: parseNumOrNull('fibre_g'),
        sodium_mg: parseNumOrNull('sodium_mg'),
      };

      const allergenRaw = editedValues.allergen_declarations || '';
      const allergens = allergenRaw
        .split(/[,;:]/)
        .map((s) => s.replace(/contains/i, '').trim().toLowerCase())
        .filter(Boolean);

      const saved = await api.confirmScannedProduct({
        name_en: editedValues.product_name || 'User-Confirmed Packaged Food',
        brand: editedValues.brand || 'Household Scanned Label',
        default_basis: scanResult.detected_basis === '100ml' ? '100ml' : '100g',
        standard_serving_name: editedValues.serving_size || '1 serving (30g)',
        standard_serving_grams: parseFloat(editedValues.serving_size || '30') || 30,
        is_vegetarian: true,
        ingredients_text: editedValues.ingredients_text || undefined,
        allergen_tags: allergens,
        allergen_declaration_complete: Boolean(editedValues.ingredients_text),
        nutrients_per_100: nutrientsPer100,
        source_type: 'ocr_extracted',
        user_confirmed: true,
      });
      setSavedProduct(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save confirmed product');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Visual 3-Step Header */}
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
              Scan a Packaged Food Label
            </h1>
            <p className="text-xs sm:text-sm text-stone-500">
              Processed strictly in memory (RAM) and never stored on disk.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <span className="rounded-full bg-emerald-800 px-3 py-1 text-white">1. Upload Photo</span>
            <span>→</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-950">2. Review Cards</span>
            <span>→</span>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">3. Confirm</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Large Camera / Upload Dropzone */}
          <form
            onSubmit={(e) => void handleImageScan(e)}
            className="lg:col-span-7 flex flex-col justify-between rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 text-center space-y-4"
          >
            {imagePreviewUrl ? (
              <div className="mx-auto max-h-56 overflow-hidden rounded-2xl border border-stone-200 bg-white p-2">
                <img
                  src={imagePreviewUrl}
                  alt="Uploaded Nutrition Label Preview"
                  className="mx-auto max-h-48 object-contain rounded-xl"
                />
              </div>
            ) : (
              <div className="py-6 space-y-2">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-800 text-3xl text-white shadow">
                  📸
                </div>
                <div className="text-base font-extrabold text-stone-900">
                  Capture or Upload Nutrition Table Photo
                </div>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Supports JPEG, PNG, or WebP up to 5 MB. Keep the "Nutritional Information" box clearly visible.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <label className="cursor-pointer rounded-2xl bg-white border border-stone-300 px-4 py-2.5 text-xs font-extrabold text-stone-800 shadow-sm hover:bg-stone-50">
                Choose / Capture Photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  aria-label="Upload Nutrition Label Image"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="hidden"
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-emerald-800 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700"
              >
                {loading ? 'Scanning...' : 'Extract Nutrition from Photo →'}
              </button>
            </div>
          </form>

          {/* Instant Demo / Text Parser */}
          <div className="lg:col-span-5 rounded-3xl border border-stone-200 bg-stone-50 p-5 flex flex-col justify-between space-y-3">
            <div>
              <div className="text-sm font-extrabold text-stone-900">
                Try Instant Sample Label Extraction
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Includes an intentional OCR character error (<code>48O kcal</code>) to demonstrate smart validation.
              </p>
              <textarea
                rows={6}
                aria-label="Raw Label Text Input"
                value={rawTextInput}
                onChange={(e) => setRawTextInput(e.target.value)}
                className="mt-3 w-full rounded-2xl border border-stone-300 bg-white p-3 font-mono text-xs"
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleTextScan()}
              className="w-full rounded-2xl bg-stone-900 py-3 text-xs font-extrabold text-white hover:bg-stone-800 transition"
            >
              Parse & Validate Label Text
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-900">
          {error}
        </div>
      )}

      {/* Step 2: Clean Visual Extracted Nutrition Cards */}
      {scanResult && (
        <section className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-4">
            <div>
              <h2 className="text-xl font-black text-stone-900">
                Step 2: Review & Edit Extracted Nutrition Cards
              </h2>
              <p className="text-xs font-semibold text-emerald-800">
                🔒 {scanResult.privacy_confirmation}
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-3.5 py-1 text-xs font-extrabold text-amber-950">
              Basis: {scanResult.detected_basis}
            </span>
          </div>

          {scanResult.validation_warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1">
              <div className="font-extrabold">Please Check Highlighted Fields:</div>
              {scanResult.validation_warnings.map((w, idx) => (
                <p key={idx}>• {w}</p>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(scanResult.fields).map(([key, pred]) => (
              <div
                key={key}
                className={`rounded-2xl border p-4 text-xs space-y-2 ${
                  pred.validation_status === 'warning' || pred.validation_status === 'error'
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-stone-200 bg-stone-50/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <label htmlFor={`ocr-field-${key}`} className="font-extrabold text-stone-900">
                    {pred.field_name} {pred.unit ? `(${pred.unit})` : ''}
                  </label>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      pred.validation_status === 'valid'
                        ? 'bg-emerald-100 text-emerald-900'
                        : pred.validation_status === 'warning'
                        ? 'bg-amber-200 text-amber-950'
                        : pred.validation_status === 'error'
                        ? 'bg-rose-200 text-rose-950'
                        : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {pred.validation_status}
                  </span>
                </div>

                <input
                  id={`ocr-field-${key}`}
                  type="text"
                  value={editedValues[key] ?? ''}
                  onChange={(e) =>
                    setEditedValues((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder="NULL / Not declared"
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-bold text-stone-900"
                />

                {pred.proposed_correction !== null && pred.proposed_correction !== undefined && (
                  <button
                    type="button"
                    onClick={() => applyProposedCorrection(key, pred.proposed_correction!)}
                    className="w-full rounded-xl bg-amber-300 px-3 py-1.5 text-[11px] font-extrabold text-amber-950 hover:bg-amber-400 transition"
                  >
                    Apply Proposed Correction: {pred.proposed_correction}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 pt-4">
            <span className="text-xs text-stone-500">
              Step 3: Confirm the reviewed values to analyse this product against your household profiles.
            </span>
            <button
              type="button"
              onClick={() => void handleConfirmAndSave()}
              className="rounded-2xl bg-emerald-800 px-6 py-3 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700"
            >
              ✓ Confirm & Save Product
            </button>
          </div>

          {savedProduct && (
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950 flex items-center justify-between">
              <span className="font-bold">
                Saved <strong>{savedProduct.name_en}</strong> to packaged foods catalog!
              </span>
              <button
                type="button"
                onClick={() => navigate(`/foods/${savedProduct.slug}`)}
                className="rounded-xl bg-emerald-800 px-4 py-2 font-extrabold text-white"
              >
                Open Product Page →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

// ==========================================
// PAGE 11: VISUAL BARCODE SCANNER & PRODUCT LOOKUP
// ==========================================
export const BarcodeLookupPage: React.FC = () => {
  const [barcode, setBarcode] = useState('8901491101813');
  const [result, setResult] = useState<BarcodeLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const sampleBarcodes = [
    { code: '8901491101813', label: 'Multigrain Muesli' },
    { code: '8901491100519', label: 'Plain Rolled Oats' },
    { code: '8901719101014', label: 'Glucose Biscuits' },
    { code: '8901058851458', label: 'Instant Noodles' },
    { code: '8901764032103', label: 'Mango Beverage' },
    { code: '8909999000000', label: 'Unlisted SKU Fallback' },
  ];

  const handleLookup = async (codeToLookup: string) => {
    setLoading(true);
    try {
      const res = await api.lookupBarcode(codeToLookup);
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm grid gap-8 lg:grid-cols-12 items-center">
        {/* Visual Barcode Viewfinder Card */}
        <div className="lg:col-span-5 rounded-3xl bg-stone-900 p-6 text-center text-white space-y-3">
          <div className="mx-auto flex h-28 w-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400 bg-stone-800/80">
            <div className="font-mono text-2xl tracking-widest text-emerald-300">
              ||| |||| || |||
            </div>
            <div className="mt-1 text-[11px] font-mono text-stone-300">{barcode}</div>
          </div>
          <div className="text-sm font-extrabold">Packaged Food Barcode Lookup</div>
          <p className="text-xs text-stone-400">
            Checks GharPlate’s verified Indian retail catalog + Open Food Facts.
          </p>
        </div>

        {/* Manual Barcode Input & Sample Chips */}
        <div className="lg:col-span-7 space-y-4">
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
            Lookup Product by Barcode
          </h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLookup(barcode);
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Enter 8–13 digit EAN/UPC barcode..."
              aria-label="Barcode Input"
              className="flex-1 rounded-2xl border border-stone-300 px-4 py-3 text-sm font-mono font-bold"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-emerald-800 px-6 py-3 text-xs font-extrabold text-white shadow hover:bg-emerald-700"
            >
              {loading ? 'Searching...' : 'Search Barcode'}
            </button>
          </form>

          <div className="space-y-1.5">
            <div className="text-xs font-bold text-stone-500">Tap a sample barcode to test:</div>
            <div className="flex flex-wrap gap-2">
              {sampleBarcodes.map((b) => (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => {
                    setBarcode(b.code);
                    void handleLookup(b.code);
                  }}
                  className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-700 hover:border-emerald-600 hover:bg-emerald-50"
                >
                  🏷️ {b.label} ({b.code.slice(-4)})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm">
          {result.found && result.product ? (
            <div className="grid gap-6 sm:grid-cols-12 items-center">
              <div className="sm:col-span-4">
                <FoodImage
                  src={result.product.image_url}
                  foodName={result.product.name_en}
                  categorySlug="packaged-foods"
                  aspectClass="aspect-[16/10] rounded-2xl"
                />
              </div>
              <div className="sm:col-span-8 space-y-3">
                <div className="flex items-center justify-between">
                  <ConfidenceBadge status="label_declared" />
                  <span className="font-mono text-xs text-stone-400">#{result.barcode}</span>
                </div>
                <h2 className="text-xl font-black text-stone-900">
                  {result.product.name_en}
                </h2>
                <p className="text-xs text-stone-600">
                  Brand: <strong>{result.product.brand}</strong> • Serving:{' '}
                  <strong>{result.product.standard_serving_name}</strong>
                </p>
                <div className="pt-2">
                  <Link
                    to={`/foods/${result.product.slug}`}
                    className="inline-block rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700"
                  >
                    View Nutrition & Health Considerations →
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="text-base font-extrabold text-stone-900">{result.message}</div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to="/scanner"
                  className="rounded-2xl bg-emerald-800 px-5 py-2.5 font-extrabold text-white"
                >
                  📸 Scan Nutrition Label Instead →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==========================================
// PAGE 12: VISUAL INDIAN DISH IMAGE RECOGNITION
// ==========================================
export const FoodRecognitionPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [userHint, setUserHint] = useState('steamed white idli with sambar');
  const [result, setResult] = useState<DishRecognitionResponse | null>(null);
  const [confirmedSlug, setConfirmedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (f: File | null) => {
    setFile(f);
    if (f) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  };

  const handleRecognize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please upload a meal photograph (JPEG, PNG, or WebP) first.');
      return;
    }
    setLoading(true);
    setError(null);
    setConfirmedSlug(null);
    try {
      const res = await api.recognizeDish(file, userHint);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dish recognition failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-950">
            ✨ Experimental Visual Dish Finder (RAM-Only Privacy)
          </span>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black text-stone-900">
            Identify an Indian Dish from a Photo
          </h1>
          <p className="text-xs sm:text-sm text-stone-500">
            Upload a meal photo to see candidate dishes and confirm the right match before viewing nutrition.
          </p>
        </div>

        <form onSubmit={(e) => void handleRecognize(e)} className="grid gap-4 sm:grid-cols-12 items-end">
          <div className="sm:col-span-5">
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Meal Photograph (Processed in RAM Only)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload Dish Image"
              onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
              className="block w-full text-xs text-stone-700 file:mr-3 file:rounded-xl file:border-0 file:bg-emerald-800 file:px-4 file:py-2.5 file:text-xs file:font-extrabold file:text-white"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Optional Visual Note
            </label>
            <input
              type="text"
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="e.g. steamed rice cake, crepe, lentil porridge"
              className="w-full rounded-2xl border border-stone-300 px-3.5 py-2.5 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-emerald-800 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700"
            >
              {loading ? 'Analysing...' : 'Find Dish'}
            </button>
          </div>
        </form>

        {previewUrl && (
          <div className="flex items-center gap-4 rounded-2xl bg-stone-50 p-3 border border-stone-200">
            <img src={previewUrl} alt="Meal Preview" className="h-16 w-20 rounded-xl object-cover" />
            <span className="text-xs text-stone-600">
              Preview loaded locally in browser. Server analyses pixels in RAM and purges immediately.
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-900">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-black text-stone-900">
              Confirm Your Dish from Visual Candidates Below:
            </h2>
            <span className="text-xs font-bold text-emerald-800">
              🔒 {result.privacy_confirmation}
            </span>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {result.candidates.map((cand) => {
              const isSelected = confirmedSlug === cand.food_slug;
              return (
                <div
                  key={cand.food_slug}
                  className={`overflow-hidden rounded-3xl border shadow-sm transition ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50 ring-2 ring-emerald-700/20'
                      : 'border-stone-200/90 bg-white'
                  }`}
                >
                  <FoodImage
                    src={cand.image_url}
                    foodName={cand.food_name}
                    categorySlug="indian-dishes"
                    aspectClass="aspect-[16/10]"
                  />
                  <div className="p-5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-extrabold text-amber-950">
                        Match: {Math.round(cand.visual_similarity_score * 100)}%
                      </span>
                      <span className="text-stone-400">{cand.uncertainty_label.split(' (')[0]}</span>
                    </div>
                    <div className="text-base font-extrabold text-stone-900">
                      {cand.food_name}
                    </div>
                    <p className="text-stone-500">{cand.visual_cue_explanation}</p>

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setConfirmedSlug(cand.food_slug)}
                        className="rounded-xl bg-stone-900 px-3.5 py-2 font-extrabold text-white hover:bg-emerald-800"
                      >
                        {isSelected ? '✓ Confirmed' : 'Select This Dish'}
                      </button>
                      {isSelected && (
                        <Link
                          to={`/foods/${cand.food_slug}`}
                          className="font-extrabold text-emerald-800 underline"
                        >
                          View Nutrition →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <ExpandableSection
            title="About Experimental Dish Recognition & Safeguards"
            subtitle="Why GharPlate asks you to confirm visual candidates"
          >
            <p className="text-xs text-stone-600 leading-relaxed">
              {result.experimental_disclaimer}
            </p>
          </ExpandableSection>
        </section>
      )}
    </div>
  );
};
