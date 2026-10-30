import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfidenceBadge } from '../components/UIWidgets';
import { api } from '../services/api';
import type {
  BarcodeLookupResponse,
  DishRecognitionResponse,
  FoodDetail,
  OCRScanResponse,
} from '../types/api';

// ==========================================
// PAGE 10: PACKAGED FOOD LABEL SCANNER & OCR
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
  const [scanResult, setScanResult] = useState<OCRScanResponse | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [savedProduct, setSavedProduct] = useState<FoodDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const populateEditState = (res: OCRScanResponse) => {
    const next: Record<string, string> = {};
    Object.entries(res.fields).forEach(([key, pred]) => {
      if (pred.extracted_value !== null && pred.extracted_value !== undefined) {
        next[key] = String(pred.extracted_value);
      } else {
        next[key] = '';
      }
    });
    setEditedValues(next);
  };

  const handleImageScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a label image file (JPEG, PNG, or WebP) up to 5 MB.');
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
          Module 6 — In-Memory OCR & FSSAI Label Validator
        </span>
        <h1 className="mt-2 text-2xl font-extrabold text-stone-900">
          Packaged Food Nutrition Label Scanner
        </h1>
        <p className="mt-1 text-xs text-stone-600">
          Upload a packaged food nutrition label photograph (processed strictly in RAM and purged immediately) or test the parser directly. Extracted fields are validated for impossible values, OCR character errors (such as 'O' vs '0'), and per-serving vs. per-100g basis before you confirm and use them.
        </p>

        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <form onSubmit={(e) => void handleImageScan(e)} className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-xs font-bold text-stone-800">
              Option A: Upload Label Photograph (JPEG / PNG / WebP, max 5 MB)
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload Nutrition Label Image"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-stone-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-800 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
            />
            <p className="text-[11px] text-stone-500">
              Privacy Guarantee: Uploaded photographs are validated and processed in RAM (`io.BytesIO`) and immediately garbage-collected. Zero images are saved to disk.
            </p>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Scan Uploaded Label Image
            </button>
          </form>

          <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="text-xs font-bold text-stone-800">
              Option B: Inspect / Paste Raw OCR Label Text (Includes OCR Typo & Validation Demo)
            </div>
            <textarea
              rows={6}
              aria-label="Raw Label Text Input"
              value={rawTextInput}
              onChange={(e) => setRawTextInput(e.target.value)}
              className="w-full rounded-xl border border-stone-300 p-2.5 font-mono text-xs"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleTextScan()}
              className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800"
            >
              Parse & Validate Label Text
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-semibold text-rose-900">
          {error}
        </div>
      )}

      {/* Step 2: Review & Edit Extracted Values Before Confirmation */}
      {scanResult && (
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">
                Review & Correct Extracted Label Fields
              </h2>
              <p className="text-xs text-emerald-800 font-medium">
                {scanResult.privacy_confirmation}
              </p>
            </div>
            <span className="rounded-lg bg-amber-100 border border-amber-300 px-3 py-1 text-xs font-bold text-amber-900">
              Detected Basis: {scanResult.detected_basis}
            </span>
          </div>

          {scanResult.validation_warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1">
              <div className="font-bold">Automated Label Validation Flags (Review Required):</div>
              {scanResult.validation_warnings.map((w, idx) => (
                <p key={idx}>• {w}</p>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(scanResult.fields).map(([key, pred]) => (
              <div key={key} className="rounded-xl border border-stone-200 p-3.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor={`ocr-field-${key}`} className="font-bold text-stone-800">
                    {pred.field_name} {pred.unit ? `(${pred.unit})` : ''}
                  </label>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      pred.validation_status === 'valid'
                        ? 'bg-emerald-100 text-emerald-900'
                        : pred.validation_status === 'warning'
                        ? 'bg-amber-100 text-amber-900'
                        : pred.validation_status === 'error'
                        ? 'bg-rose-100 text-rose-900'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {pred.validation_status} ({Math.round(pred.confidence * 100)}%)
                  </span>
                </div>

                <input
                  id={`ocr-field-${key}`}
                  type="text"
                  value={editedValues[key] ?? ''}
                  onChange={(e) =>
                    setEditedValues((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder="Leave blank if NULL / unknown"
                  className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-mono"
                />

                {pred.validation_message && (
                  <p className="text-[11px] text-amber-800">{pred.validation_message}</p>
                )}

                {pred.proposed_correction !== null && pred.proposed_correction !== undefined && (
                  <button
                    type="button"
                    onClick={() => applyProposedCorrection(key, pred.proposed_correction!)}
                    className="rounded bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-950 hover:bg-amber-300"
                  >
                    Apply Proposed Correction: {pred.proposed_correction}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 pt-4">
            <p className="text-xs text-stone-600">
              Only after you review and confirm these values will the product be saved for condition guidance or comparison.
            </p>
            <button
              type="button"
              onClick={() => void handleConfirmAndSave()}
              className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-700"
            >
              Confirm Reviewed Values & Save Product
            </button>
          </div>

          {savedProduct && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950 flex items-center justify-between">
              <span>
                Successfully confirmed and saved <strong>{savedProduct.name_en}</strong>!
              </span>
              <button
                type="button"
                onClick={() => navigate(`/foods/${savedProduct.slug}`)}
                className="rounded-lg bg-emerald-800 px-3 py-1.5 font-bold text-white"
              >
                Open Food & Health Guidance →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

// ==========================================
// PAGE 11: BARCODE SCANNING & PRODUCT LOOKUP
// ==========================================
export const BarcodeLookupPage: React.FC = () => {
  const [barcode, setBarcode] = useState('8901491101813');
  const [result, setResult] = useState<BarcodeLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const sampleBarcodes = [
    { code: '8901491101813', label: 'Multigrain Muesli (8901491101813)' },
    { code: '8901491100519', label: 'Rolled Oats (8901491100519)' },
    { code: '8901719101014', label: 'Glucose Biscuits (8901719101014)' },
    { code: '8901058851458', label: 'Instant Masala Noodles (8901058851458)' },
    { code: '8901764032103', label: 'Sweetened Mango Drink (8901764032103)' },
    { code: '8909999000000', label: 'Unlisted Barcode Fallback Demo' },
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
          Module 7 — Barcode Scanner & Open Food Facts Lookup
        </span>
        <h1 className="text-2xl font-extrabold text-stone-900">
          Packaged Product Barcode Lookup
        </h1>
        <p className="text-xs text-stone-600">
          Enter an EAN-13 / UPC barcode below. GharPlate checks its verified Indian packaged catalog and queries Open Food Facts when reachable. When a barcode is not found, GharPlate never invents a product — it provides a direct fallback to OCR label scanning or manual entry.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleLookup(barcode);
          }}
          className="flex flex-col sm:flex-row gap-2.5 max-w-xl"
        >
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Enter 8–13 digit barcode (e.g. 8901491101813)"
            aria-label="Barcode Input"
            className="flex-1 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-mono"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-emerald-800 px-6 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
          >
            {loading ? 'Looking up...' : 'Lookup Barcode'}
          </button>
        </form>

        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <span className="text-stone-500 font-medium">Sample Indian Barcodes:</span>
          {sampleBarcodes.map((b) => (
            <button
              key={b.code}
              type="button"
              onClick={() => {
                setBarcode(b.code);
                void handleLookup(b.code);
              }}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-stone-700 hover:border-emerald-600"
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-mono text-stone-500">Barcode: {result.barcode}</span>
              <h2 className="text-lg font-bold text-stone-900">{result.message}</h2>
            </div>
            <ConfidenceBadge status={result.found ? 'label_declared' : 'not_measured'} />
          </div>

          {result.found && result.product ? (
            <div className="space-y-3 border-t border-stone-100 pt-4 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <div className="text-base font-extrabold text-stone-900">
                    {result.product.name_en}
                  </div>
                  <div className="text-stone-600">
                    Brand: {result.product.brand} • Serving: {result.product.standard_serving_name}
                  </div>
                </div>
                <Link
                  to={`/foods/${result.product.slug}`}
                  className="rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white hover:bg-emerald-700"
                >
                  Open Full Nutrition & Health Guidance →
                </Link>
              </div>
              {result.product.ingredients_text && (
                <p className="text-stone-700">
                  <strong>Declared Ingredients:</strong> {result.product.ingredients_text}
                </p>
              )}
              <p className="text-amber-900 font-medium">
                {result.product.allergen_safety_disclaimer}
              </p>
            </div>
          ) : (
            <div className="space-y-3 border-t border-stone-100 pt-4 text-xs">
              <div className="font-bold text-stone-800">Recommended Fallback Actions:</div>
              <ul className="list-disc pl-5 space-y-1 text-stone-700">
                {result.fallback_actions.map((act, i) => (
                  <li key={i}>{act}</li>
                ))}
              </ul>
              <div className="pt-2">
                <Link
                  to="/scanner"
                  className="inline-block rounded-xl bg-emerald-800 px-4 py-2 font-bold text-white"
                >
                  Open Nutrition Label OCR Scanner →
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
// PAGE 12: EXPERIMENTAL FOOD & DISH IMAGE RECOGNITION
// ==========================================
export const FoodRecognitionPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [userHint, setUserHint] = useState('steamed white idli with sambar');
  const [result, setResult] = useState<DishRecognitionResponse | null>(null);
  const [confirmedSlug, setConfirmedSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRecognize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please upload a meal photograph (JPEG, PNG, or WebP) to run candidate analysis.');
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <span className="rounded-md bg-amber-100 border border-amber-300 px-2.5 py-1 text-xs font-bold text-amber-900">
          Module 8 — Experimental Indian Dish Recognition (Candidate-Based with Uncertainty)
        </span>
        <h1 className="text-2xl font-extrabold text-stone-900">
          Experimental Indian Food & Dish Image Recognition
        </h1>
        <p className="text-xs text-stone-600 leading-relaxed">
          Upload a photograph of an Indian dish. GharPlate processes the image strictly in memory, never stores photographs on disk, and presents multiple possible dish candidates with explicit uncertainty labels. Visual similarity is never presented as a confirmed identification or used to guess portion calories.
        </p>

        <form onSubmit={(e) => void handleRecognize(e)} className="grid gap-4 sm:grid-cols-12 items-end">
          <div className="sm:col-span-5">
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Select Meal Photograph (RAM-Only Processing)
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Upload Dish Image"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-stone-700 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-800 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Optional Visual Context / Note
            </label>
            <input
              type="text"
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="e.g. steamed rice cake, crepe, yellow lentil porridge"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-800 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
            >
              {loading ? 'Analysing...' : 'Suggest Candidates'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs font-semibold text-rose-900">
          {error}
        </div>
      )}

      {result && (
        <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1">
            <div className="font-bold">{result.experimental_disclaimer}</div>
            <div className="text-emerald-900 font-semibold">{result.privacy_confirmation}</div>
            <div className="text-stone-600">{result.image_quality_notes}</div>
          </div>

          <h2 className="text-base font-bold text-stone-900">
            Select & Confirm the Actual Dish from Candidates Below (Or Search Manually):
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.candidates.map((cand) => {
              const isSelected = confirmedSlug === cand.food_slug;
              return (
                <div
                  key={cand.food_slug}
                  className={`rounded-2xl border p-4 text-xs space-y-2 ${
                    isSelected
                      ? 'border-emerald-700 bg-emerald-50'
                      : 'border-stone-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-900">
                      Similarity: {Math.round(cand.visual_similarity_score * 100)}%
                    </span>
                    <span className="text-stone-500">{cand.category_name}</span>
                  </div>
                  <div className="text-base font-bold text-stone-900">{cand.food_name}</div>
                  <div className="text-stone-600">
                    Aliases: {cand.regional_aliases.join(', ') || 'Standard'}
                  </div>
                  <div className="text-amber-900 font-medium">{cand.uncertainty_label}</div>
                  <p className="text-stone-500">{cand.visual_cue_explanation}</p>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setConfirmedSlug(cand.food_slug)}
                      className="rounded-lg bg-stone-900 px-3 py-1.5 font-bold text-white hover:bg-emerald-800"
                    >
                      {isSelected ? '✓ Confirmed by User' : 'Confirm This Dish'}
                    </button>
                    {isSelected && (
                      <Link
                        to={`/foods/${cand.food_slug}`}
                        className="font-bold text-emerald-800 underline"
                      >
                        Open Nutrition →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-stone-100 pt-3 text-xs flex items-center justify-between">
            <span>Dish not in the candidate list?</span>
            <Link to="/foods" className="font-bold text-emerald-800 underline">
              Search All 75+ Indian Foods Manually →
            </Link>
          </div>
        </section>
      )}
    </div>
  );
};
