import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  ConfidenceBadge,
  FoodImage,
} from '../components/UIWidgets';
import {
  clearAssistantEntityContext,
  openAssistantWorkspace,
  publishAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  BarcodeLookupResponse,
  DishCandidate,
  DishRecognitionResponse,
  FoodDetail,
  FoodSummary,
  OCRScanResponse,
  ServingConversion,
} from '../types/api';

// ==========================================
// PAGE 10: MULTI-PANEL PACKAGED FOOD LABEL OCR SCANNER
// ==========================================
export const FoodScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const prefillSlug = searchParams.get('slug') || '';
  const prefillBarcode = searchParams.get('barcode') || '';
  const prefillName = searchParams.get('name') || '';
  const prefillBrand = searchParams.get('brand') || '';

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
  const [ingredientsFile, setIngredientsFile] = useState<File | null>(null);
  const [frontDisplayDataUrl, setFrontDisplayDataUrl] = useState<string | null>(null);
  const [retainFrontImageConsent, setRetainFrontImageConsent] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [useHintTextWithImage, setUseHintTextWithImage] = useState(false);

  const [scanResult, setScanResult] = useState<OCRScanResponse | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [barcodeInput, setBarcodeInput] = useState(prefillBarcode);
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
    if (prefillName && !next.product_name) next.product_name = prefillName;
    if (prefillBrand && !next.brand) next.brand = prefillBrand;
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

  const handleFrontImageSelect = (file: File | null) => {
    if (!file) {
      setFrontDisplayDataUrl(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFrontDisplayDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
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
      const res = await api.scanLabelImage(
        selectedFile,
        useHintTextWithImage ? rawTextInput : undefined,
        ingredientsFile
      );
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
        .map((s) => s.replace(/contains/i, '').replace(/ingredients/i, '').trim().toLowerCase())
        .filter(Boolean);

      const saved = await api.confirmScannedProduct({
        slug: prefillSlug || undefined,
        name_en: editedValues.product_name || prefillName || 'User-Confirmed Packaged Food',
        brand: editedValues.brand || prefillBrand || 'Household Scanned Label',
        barcode: barcodeInput.trim() || undefined,
        net_quantity: editedValues.net_quantity || undefined,
        image_url:
          retainFrontImageConsent && frontDisplayDataUrl ? frontDisplayDataUrl : undefined,
        retain_front_image_consent: retainFrontImageConsent,
        default_basis: scanResult.detected_basis === '100ml' ? '100ml' : '100g',
        standard_serving_name: editedValues.serving_size || '1 serving (30g)',
        standard_serving_grams: parseFloat(editedValues.serving_size || '30') || 30,
        is_vegetarian: !allergens.some((a) => a.includes('egg') || a.includes('fish')),
        ingredients_text: editedValues.ingredients_text || undefined,
        raw_ocr_text: scanResult.raw_text || undefined,
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
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
              Scan a Packaged Food Label
            </h1>
            <p className="text-xs sm:text-sm text-stone-500">
              OCR label photos are processed strictly in RAM and purged immediately. GharPlate never inserts synthetic fallback nutrients.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-extrabold">
            <span className="rounded-full bg-emerald-800 px-3 py-1 text-white">1. Upload Panels</span>
            <span>→</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-950">2. Review & Correct</span>
            <span>→</span>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">3. Confirm</span>
          </div>
        </div>

        {(prefillName || prefillBarcode) && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2">
            <span>
              Enriching packaged product: <strong>{prefillName}</strong>{' '}
              {prefillBrand ? `(${prefillBrand})` : ''}{' '}
              {prefillBarcode ? `• Barcode #${prefillBarcode}` : ''}
            </span>
            {prefillSlug && (
              <Link to={`/foods/${prefillSlug}`} className="font-bold underline">
                ← Back to Product Page
              </Link>
            )}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Multi-Panel Camera / Upload Form */}
          <form
            onSubmit={(e) => void handleImageScan(e)}
            className="lg:col-span-7 flex flex-col justify-between rounded-3xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 space-y-4"
          >
            {imagePreviewUrl ? (
              <div className="mx-auto max-h-52 overflow-hidden rounded-2xl border border-stone-200 bg-white p-2">
                <img
                  src={imagePreviewUrl}
                  alt="Uploaded Nutrition Label Preview"
                  className="mx-auto max-h-44 object-contain rounded-xl"
                />
              </div>
            ) : (
              <div className="py-4 text-center space-y-2">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-800 text-2xl text-white shadow">
                  📸
                </div>
                <div className="text-base font-extrabold text-stone-900">
                  Upload Nutrition & Ingredient Panel Photos
                </div>
                <p className="text-xs text-stone-500 max-w-md mx-auto">
                  Supports rotated or upright JPEG, PNG, or WebP up to 5 MB. If OCR cannot read the photo, GharPlate reports an explicit failure state rather than guessing numbers.
                </p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 text-left text-xs">
              <div className="rounded-2xl bg-white border border-stone-200 p-3 space-y-1.5">
                <div className="font-extrabold text-stone-900">
                  1. Nutrition Information Panel (Required)
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  aria-label="Upload Nutrition Label Image"
                  onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
              </div>

              <div className="rounded-2xl bg-white border border-stone-200 p-3 space-y-1.5">
                <div className="font-extrabold text-stone-900">
                  2. Ingredients & Allergen Panel (Optional)
                </div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  aria-label="Upload Ingredients Panel Image"
                  onChange={(e) => setIngredientsFile(e.target.files?.[0] || null)}
                  className="w-full text-xs"
                />
              </div>
            </div>

            {/* Optional Consented Front-of-Package Display Image */}
            <div className="rounded-2xl bg-white border border-stone-200 p-3 text-left text-xs space-y-2">
              <div className="font-extrabold text-stone-900">
                3. Optional: Front-of-Package Display Image (Only Saved With Consent)
              </div>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Upload Front Package Image"
                onChange={(e) => handleFrontImageSelect(e.target.files?.[0] || null)}
                className="w-full text-xs"
              />
              {frontDisplayDataUrl && (
                <label className="inline-flex items-center gap-2 font-semibold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={retainFrontImageConsent}
                    onChange={(e) => setRetainFrontImageConsent(e.target.checked)}
                    className="rounded border-stone-300 text-emerald-800"
                  />
                  I explicitly consent to saving this front-of-package photo for product display.
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-stone-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useHintTextWithImage}
                  onChange={(e) => setUseHintTextWithImage(e.target.checked)}
                  className="rounded border-stone-300 text-emerald-800"
                />
                Include transcription text box on the right as OCR assist
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
                Paste or Test Label Text Extraction
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Includes an intentional OCR character error (<code>48O kcal</code>) to demonstrate smart validation.
              </p>
              <textarea
                rows={7}
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
            <div className="flex items-center gap-2">
              {scanResult.ocr_status && scanResult.ocr_status !== 'success' && (
                <span
                  data-testid="ocr-failure-badge"
                  className="rounded-full bg-rose-100 border border-rose-300 px-3 py-1 text-xs font-extrabold text-rose-900"
                >
                  OCR Status: {scanResult.ocr_status}
                </span>
              )}
              <span className="rounded-full bg-amber-100 px-3.5 py-1 text-xs font-extrabold text-amber-950">
                Basis: {scanResult.detected_basis}
              </span>
            </div>
          </div>

          {/* Explicit Honest OCR Failure Banner (No Synthetic Fallback!) */}
          {scanResult.ocr_status && scanResult.ocr_status !== 'success' && (
            <div
              data-testid="ocr-failure-notice"
              className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-950 space-y-1.5"
            >
              <div className="font-extrabold">
                ⚠️ Automatic OCR Could Not Read Text from the Image
              </div>
              <p>
                {scanResult.ocr_error_reason ||
                  'The OCR engine is unavailable or the uploaded image was unreadable. GharPlate never inserts fake fallback nutrition values.'}
              </p>
              <p className="font-semibold">
                Please upload a clearer photograph or enter the package values manually in the cards below.
              </p>
            </div>
          )}

          {scanResult.validation_warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-1">
              <div className="font-extrabold">Please Check Highlighted Fields:</div>
              {scanResult.validation_warnings.map((w, idx) => (
                <p key={idx}>• {w}</p>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-stone-50/60 p-4 text-xs space-y-2">
              <label htmlFor="ocr-barcode-input" className="font-extrabold text-stone-900 block">
                Barcode (EAN / UPC)
              </label>
              <input
                id="ocr-barcode-input"
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Optional 8–14 digit barcode"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-mono font-bold text-stone-900"
              />
            </div>

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
              Step 3: Confirm the reviewed values to save or update this packaged product record.
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
// PAGE 11: REAL CAMERA BARCODE SCANNER & MULTI-SOURCE PRODUCT LOOKUP
// ==========================================

interface CameraVideoDevice {
  deviceId: string;
  label: string;
}

function createZXingMultiFormatReader(): BrowserMultiFormatReader {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.ITF,
    BarcodeFormat.CODE_128,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 300,
    delayBetweenScanSuccess: 500,
  });
}

async function waitForVideoReadyAndDimensions(
  video: HTMLVideoElement,
  timeoutMs = 2000
): Promise<{ width: number; height: number }> {
  if (video.readyState < 1) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        video.removeEventListener('loadedmetadata', done);
        video.removeEventListener('canplay', done);
        resolve();
      };
      video.addEventListener('loadedmetadata', done, { once: true });
      video.addEventListener('canplay', done, { once: true });
      window.setTimeout(done, Math.min(timeoutMs, 600));
    });
  }

  // Ensure video.play() succeeds and report genuine playback failures
  await video.play();

  // Wait for non-zero videoWidth / videoHeight frames to arrive
  const start = Date.now();
  while (
    (video.videoWidth === 0 || video.videoHeight === 0) &&
    Date.now() - start < timeoutMs
  ) {
    await new Promise((r) => window.setTimeout(r, 40));
  }

  return {
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

export const BarcodeLookupPage: React.FC = () => {
  const [barcode, setBarcode] = useState('8906005618726');
  const [result, setResult] = useState<BarcodeLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Camera Barcode Scanner States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraInitializing, setCameraInitializing] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>(
    'Camera idle — click "Start Camera Barcode Scanner" to scan EAN-8, UPC-A, EAN-13, or GTIN-14.'
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<CameraVideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [activeDecoderName, setActiveDecoderName] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const sessionIdRef = useRef<number>(0);
  const hasDetectedRef = useRef<boolean>(false);

  const sampleBarcodes = [
    { code: '8906005618726', label: 'Pineapple Cake (Winkles)' },
    { code: '8901491101813', label: 'Multigrain Muesli' },
    { code: '8901491100519', label: 'Plain Rolled Oats' },
    { code: '8901719101014', label: 'Glucose Biscuits' },
    { code: '8901058851458', label: 'Instant Noodles' },
    { code: '8909999000000', label: 'Unlisted SKU Fallback' },
  ];

  const stopCameraScanner = useCallback((resetStatusMessage = true) => {
    sessionIdRef.current += 1;

    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }

    try {
      BrowserCodeReader.releaseAllStreams();
    } catch {
      // ignore static stream tracker cleanup error
    }

    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // ignore pause in non-playing element
      }
      videoRef.current.srcObject = null;
    }

    setCameraActive(false);
    setCameraInitializing(false);
    setTorchOn(false);
    setTorchSupported(false);
    setActiveDecoderName('');
    if (resetStatusMessage) {
      setCameraStatus(
        'Camera idle — click "Start Camera Barcode Scanner" to scan EAN-8, UPC-A, EAN-13, or GTIN-14.'
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCameraScanner(false);
    };
  }, [stopCameraScanner]);

  const handleLookup = useCallback(async (codeToLookup: string, forceRefresh = false) => {
    const clean = codeToLookup.trim();
    if (!clean) {
      setError('Please enter or scan an 8 to 14 digit barcode.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.lookupBarcode(clean, forceRefresh);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Barcode lookup failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCameraDeviceList = async () => {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
      setAvailableCameras(videoInputs);
    } catch {
      // ignore enumeration errors on restricted browsers
    }
  };

  const startCameraScanner = async (deviceIdOverride?: string) => {
    // Stop any previous stream before starting a fresh session
    stopCameraScanner(false);
    const currentSessionId = sessionIdRef.current;
    hasDetectedRef.current = false;
    setCameraError(null);

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setCameraError(
        'Camera access requires a secure browser context (HTTPS or http://localhost:5173). Please open GharPlate via localhost or use manual barcode entry.'
      );
      setCameraStatus('Camera unavailable in insecure context.');
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraError(
        'Camera API (navigator.mediaDevices.getUserMedia) is not available in this browser context. Please use manual barcode entry.'
      );
      setCameraStatus('Camera API unavailable.');
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) {
      setCameraError('Camera preview element is not mounted. Please reload the page or use manual barcode entry.');
      return;
    }

    setCameraInitializing(true);
    setCameraStatus('Requesting camera permission...');

    const targetDeviceId =
      deviceIdOverride !== undefined ? deviceIdOverride : selectedDeviceId;

    try {
      let stream: MediaStream;
      const primaryConstraints: MediaStreamConstraints = targetDeviceId
        ? {
            video: {
              deviceId: { exact: targetDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          }
        : {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          };

      try {
        stream = await navigator.mediaDevices.getUserMedia(primaryConstraints);
      } catch (constraintErr) {
        const cErrName = constraintErr instanceof Error ? constraintErr.name : '';
        if (
          cErrName === 'OverconstrainedError' ||
          cErrName === 'ConstraintNotSatisfiedError'
        ) {
          // Fallback to generic video constraint for desktop webcams (e.g., macOS FaceTime HD camera)
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } else {
          throw constraintErr;
        }
      }

      // Guard against stale async completion if user clicked Stop or navigated away
      if (currentSessionId !== sessionIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const videoTracks = stream.getVideoTracks();
      if (!videoTracks || videoTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        setCameraInitializing(false);
        setCameraError(
          'No active video track was returned by the camera device. Please connect a working camera or enter the barcode manually.'
        );
        return;
      }

      streamRef.current = stream;
      void refreshCameraDeviceList();

      const primaryTrack = videoTracks[0];
      if (!selectedDeviceId && primaryTrack.getSettings) {
        const settings = primaryTrack.getSettings();
        if (settings.deviceId) {
          setSelectedDeviceId(settings.deviceId);
        }
      }

      primaryTrack.onended = () => {
        if (currentSessionId === sessionIdRef.current) {
          setCameraError(
            'Camera stream unexpectedly stopped. Please click Start Camera to reconnect or enter the barcode manually.'
          );
          stopCameraScanner(false);
          setCameraStatus('Camera stream disconnected.');
        }
      };

      if (typeof primaryTrack.getCapabilities === 'function') {
        try {
          const caps = primaryTrack.getCapabilities() as Record<string, unknown>;
          if (caps && 'torch' in caps) {
            setTorchSupported(true);
          }
        } catch {
          // ignore if capabilities are unsupported
        }
      }

      // Attach stream to the already-mounted <video> element BEFORE marking camera active
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('muted', 'true');

      let dims: { width: number; height: number };
      try {
        dims = await waitForVideoReadyAndDimensions(videoEl, 1800);
      } catch (playErr) {
        const playMsg =
          playErr instanceof Error ? playErr.message : 'Video playback rejected';
        setCameraError(
          `Video stream was acquired, but live preview playback failed (${playMsg}). Please check browser autoplay permissions or use manual barcode entry.`
        );
        stopCameraScanner(false);
        setCameraStatus('Camera preview playback failed.');
        return;
      }

      if (currentSessionId !== sessionIdRef.current) {
        return;
      }

      if (dims.width === 0 || dims.height === 0) {
        setCameraError(
          'Camera stream started, but no video frames (0×0 dimensions) were received. Please check if another app is using the camera or switch cameras.'
        );
        stopCameraScanner(false);
        setCameraStatus('Camera returned 0×0 video frames.');
        return;
      }

      // Initialize Safari & cross-browser barcode decoding (ZXing BrowserMultiFormatReader + native BarcodeDetector)
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (
              source: HTMLVideoElement
            ) => Promise<{ rawValue: string; format?: string }[]>;
          };
        }
      ).BarcodeDetector;

      const nativeDetector = BarcodeDetectorCtor
        ? new BarcodeDetectorCtor({
            formats: ['ean_13', 'ean_8', 'upc_a', 'itf', 'code_128'],
          })
        : null;

      if (!zxingReaderRef.current) {
        zxingReaderRef.current = createZXingMultiFormatReader();
      }
      const zxingReader = zxingReaderRef.current;

      const decoderLabel = nativeDetector
        ? 'Native BarcodeDetector + ZXing MultiFormat'
        : 'ZXing BrowserMultiFormatReader (Safari/Cross-Browser)';

      setActiveDecoderName(decoderLabel);
      setCameraInitializing(false);
      setCameraActive(true);
      setCameraStatus(
        `Live camera active (${dims.width}×${dims.height}) — hold EAN-8, UPC-A, EAN-13, or GTIN-14 barcode steady in frame.`
      );

      console.debug('[GharPlate Camera Diagnostics]', {
        isSecureContext: window.isSecureContext,
        userAgent: navigator.userAgent,
        trackReadyState: primaryTrack.readyState,
        trackSettings:
          typeof primaryTrack.getSettings === 'function'
            ? primaryTrack.getSettings()
            : {},
        videoReadyState: videoEl.readyState,
        videoWidth: dims.width,
        videoHeight: dims.height,
        decoder: decoderLabel,
      });

      const handleDecodedValue = (rawCode: string, formatLabel: string) => {
        const cleaned = rawCode.trim();
        if (!/^\d{8,14}$/.test(cleaned)) {
          return;
        }
        if (hasDetectedRef.current || currentSessionId !== sessionIdRef.current) {
          return;
        }
        hasDetectedRef.current = true;
        setBarcode(cleaned);
        stopCameraScanner(false);
        setCameraStatus(`Detected barcode: ${cleaned} (${formatLabel})`);
        void handleLookup(cleaned);
      };

      // Single unified decoding loop using the active video element
      scanTimerRef.current = window.setInterval(async () => {
        if (
          currentSessionId !== sessionIdRef.current ||
          hasDetectedRef.current ||
          !videoRef.current
        ) {
          return;
        }
        const activeVideo = videoRef.current;
        if (
          activeVideo.paused ||
          activeVideo.ended ||
          activeVideo.videoWidth === 0 ||
          activeVideo.videoHeight === 0
        ) {
          return;
        }

        // 1. Try native BarcodeDetector when available
        if (nativeDetector) {
          try {
            const barcodes = await nativeDetector.detect(activeVideo);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              handleDecodedValue(
                barcodes[0].rawValue,
                barcodes[0].format || 'BarcodeDetector'
              );
              return;
            }
          } catch {
            // Fall through to ZXing decoder
          }
        }

        // 2. Always run ZXing BrowserMultiFormatReader for Safari and cross-browser support
        try {
          const zxingResult = zxingReader.decode(activeVideo);
          if (zxingResult && typeof zxingResult.getText === 'function') {
            const text = zxingResult.getText();
            const fmt =
              typeof zxingResult.getBarcodeFormat === 'function'
                ? String(zxingResult.getBarcodeFormat())
                : 'ZXing';
            if (text) {
              handleDecodedValue(text, fmt);
            }
          }
        } catch {
          // NotFoundException on current frame — continue scanning next frame
        }
      }, 320);
    } catch (err) {
      setCameraInitializing(false);
      const errName = err instanceof Error ? err.name : 'CameraError';
      const errMsg = err instanceof Error ? err.message : String(err);

      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Please allow camera access in your browser address bar or enter the barcode number manually.'
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError(
          'No camera device was found on this device. Please connect a camera or enter the barcode number manually.'
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        setCameraError(
          'Camera is already in use by another application or browser tab. Please close other apps using the camera and try again.'
        );
      } else if (
        errName === 'OverconstrainedError' ||
        errName === 'ConstraintNotSatisfiedError'
      ) {
        setCameraError(
          'Selected camera does not support the required video settings. Try selecting another camera or enter the barcode manually.'
        );
      } else if (errName === 'SecurityError') {
        setCameraError(
          'Camera access was blocked by browser security settings. Please open http://localhost:5173 or HTTPS.'
        );
      } else {
        setCameraError(
          `Could not start camera scanner (${errMsg || errName}). Please use manual barcode entry.`
        );
      }
      stopCameraScanner(false);
      setCameraStatus('Camera failed to start — manual barcode entry is ready.');
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track || typeof track.applyConstraints !== 'function') return;
    const nextTorch = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorch);
    } catch {
      // ignore if hardware rejects torch constraint
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm grid gap-8 lg:grid-cols-12 items-start">
        {/* Left: Real Camera Barcode Scanner Viewfinder */}
        <div className="lg:col-span-5 rounded-3xl bg-stone-900 p-5 text-center text-white space-y-4">
          <div className="relative mx-auto overflow-hidden rounded-2xl border-2 border-emerald-400/80 bg-black aspect-[16/10] flex items-center justify-center">
            {/* CRITICAL FIX: Keep <video> always mounted so videoRef.current is never null when stream attaches */}
            <video
              ref={videoRef}
              data-testid="live-barcode-video"
              playsInline
              muted
              autoPlay
              className={`h-full w-full object-cover ${
                cameraActive ? 'block opacity-100' : 'hidden opacity-0'
              }`}
            />

            {cameraActive ? (
              <>
                <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400 shadow-[0_0_12px_#34d399]" />
                {activeDecoderName && (
                  <span
                    data-testid="active-decoder-badge"
                    className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-black/70 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 backdrop-blur-xs"
                  >
                    {activeDecoderName}
                  </span>
                )}
              </>
            ) : (
              <div className="p-4 space-y-2">
                <div className="text-3xl">{cameraInitializing ? '⏳' : '📷'}</div>
                <div className="text-xs font-extrabold text-emerald-300">
                  {cameraInitializing
                    ? 'Starting Camera Preview...'
                    : 'Live Camera Barcode Scanner'}
                </div>
                <div className="text-[11px] text-stone-400">
                  Supports EAN-8, UPC-A, EAN-13, ITF, CODE-128 & GTIN-14
                </div>
              </div>
            )}
          </div>

          <p data-testid="camera-scanner-status" className="text-xs text-stone-300">
            {cameraStatus}
          </p>

          {cameraError && (
            <div
              data-testid="camera-scanner-error"
              className="rounded-2xl border border-rose-400/60 bg-rose-950/80 p-3 text-xs text-rose-200"
            >
              ⚠️ {cameraError}
            </div>
          )}

          {availableCameras.length > 1 && (
            <div className="flex items-center justify-center gap-2 text-xs">
              <label htmlFor="camera-device-select" className="text-stone-400 font-semibold">
                Camera:
              </label>
              <select
                id="camera-device-select"
                aria-label="Select Camera Device"
                value={selectedDeviceId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedDeviceId(nextId);
                  if (cameraActive) {
                    void startCameraScanner(nextId);
                  }
                }}
                className="rounded-xl border border-stone-700 bg-stone-800 px-2.5 py-1 text-xs font-bold text-white"
              >
                {availableCameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {!cameraActive ? (
              <button
                type="button"
                disabled={cameraInitializing}
                data-testid="start-camera-scanner-btn"
                onClick={() => void startCameraScanner()}
                className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-xs font-extrabold text-stone-950 shadow hover:bg-emerald-400 disabled:opacity-50 transition"
              >
                {cameraInitializing
                  ? 'Starting Camera...'
                  : '📷 Start Camera Barcode Scanner'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="stop-camera-scanner-btn"
                  onClick={() => stopCameraScanner(true)}
                  className="rounded-2xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-500"
                >
                  Stop Camera
                </button>
                {torchSupported && (
                  <button
                    type="button"
                    onClick={() => void toggleTorch()}
                    className="rounded-2xl bg-amber-400 px-4 py-2 text-xs font-extrabold text-stone-950"
                  >
                    {torchOn ? '🔦 Torch Off' : '🔦 Torch On'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Manual Barcode Input & Sample Chips */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
              Multi-Source Barcode Intelligence (Local + Open Food Facts v3 + USDA FDC)
            </span>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black text-stone-900">
              Lookup or Enrich Product by Barcode
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Checks GharPlate’s local database first, evaluates field completeness, and automatically queries Open Food Facts & USDA FoodData Central when images or nutrients are missing.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleLookup(barcode, false);
            }}
            className="flex flex-col sm:flex-row gap-2.5"
          >
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="Enter 8, 12, 13, or 14 digit EAN/UPC/GTIN barcode..."
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
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleLookup(barcode, true)}
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-xs font-bold text-stone-800 hover:bg-stone-100"
            >
              🔄 Force Online Refresh
            </button>
          </form>

          {error && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-900">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="text-xs font-bold text-stone-500">
              Tap a sample barcode to test (includes Pineapple Cake `8906005618726`):
            </div>
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
                  🏷️ {b.label} ({b.code})
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {result && (
        <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-5">
          {result.found && result.product ? (
            <div className="grid gap-6 sm:grid-cols-12 items-center">
              <div className="sm:col-span-4">
                <FoodImage
                  src={result.product.image_url}
                  foodName={result.product.name_en}
                  foodSlug={result.product.slug}
                  categorySlug="packaged-foods"
                  isPackaged={result.product.is_packaged}
                  hasVerifiedImage={
                    result.product.has_verified_image ?? Boolean(result.product.image_url)
                  }
                  aspectClass="aspect-[16/10] rounded-2xl"
                />
              </div>
              <div className="sm:col-span-8 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ConfidenceBadge status={result.product.confidence_level || 'label_declared'} />
                  <span className="font-mono text-xs font-bold text-stone-600">
                    {result.barcode_format || 'EAN-13'}: #{result.barcode}
                  </span>
                </div>
                <h2 className="text-xl font-black text-stone-900">
                  {result.product.name_en}{' '}
                  {result.product.brand ? `— ${result.product.brand}` : ''}
                </h2>
                <p className="text-xs text-stone-700">{result.message}</p>
                <p className="text-xs text-stone-600">
                  Brand: <strong>{result.product.brand}</strong> • Serving:{' '}
                  <strong>{result.product.standard_serving_name}</strong> • Completeness:{' '}
                  <strong>
                    {result.product.completeness_pct}% ({result.product.available_nutrient_count}/20 nutrients)
                  </strong>
                </p>

                {result.provider_attempts && result.provider_attempts.length > 0 && (
                  <div className="rounded-2xl bg-stone-50 border border-stone-200 p-3 text-xs space-y-1">
                    <div className="font-extrabold text-stone-800">
                      External Provider Enrichment Checks:
                    </div>
                    {result.provider_attempts.map((att, idx) => (
                      <div key={idx} className="text-stone-600">
                        • <strong>{att.provider_name}:</strong>{' '}
                        <span className="font-mono">{att.status}</span> — {att.message}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-3 pt-2">
                  <Link
                    to={`/foods/${result.product.slug}`}
                    className="inline-block rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700"
                  >
                    Open Full Product & Ingredients Page →
                  </Link>
                  {result.product.available_nutrient_count === 0 && (
                    <Link
                      to={`/scanner?slug=${encodeURIComponent(result.product.slug)}&barcode=${encodeURIComponent(result.barcode)}&name=${encodeURIComponent(result.product.name_en)}&brand=${encodeURIComponent(result.product.brand || '')}`}
                      className="inline-block rounded-2xl bg-stone-900 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-stone-800"
                    >
                      📸 Scan Nutrition Panel for {result.product.name_en} →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="text-base font-extrabold text-stone-900">{result.message}</div>
              {result.provider_attempts && result.provider_attempts.length > 0 && (
                <div className="rounded-2xl bg-stone-50 border border-stone-200 p-3 space-y-1">
                  {result.provider_attempts.map((att, idx) => (
                    <div key={idx}>
                      • <strong>{att.provider_name}:</strong>{' '}
                      <span className="font-mono">{att.status}</span> — {att.message}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-3 pt-2">
                <Link
                  to={`/scanner?barcode=${encodeURIComponent(result.barcode)}`}
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
// PAGE 12: AI FOOD PHOTO ANALYZER (MULTIMODAL LOCAL VISION + PORTION NUTRITION)
// ==========================================
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PHOTO_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

interface PortionPreset {
  key: string;
  label: string;
  unitName: string;
  quantity: number;
  grams: number;
}

function buildPortionPresetsForCandidate(cand: DishCandidate | null): PortionPreset[] {
  if (!cand) {
    return [
      { key: '100g', label: '100 g', unitName: '100g', quantity: 1, grams: 100 },
    ];
  }
  const presets: PortionPreset[] = [];
  const seenLabels = new Set<string>();
  const stdGrams = cand.standard_serving_grams || 100;
  const stdLabel = cand.standard_serving_name || `1 serving (${stdGrams}g)`;

  const addPreset = (p: PortionPreset) => {
    const norm = p.label.toLowerCase();
    if (!seenLabels.has(norm) && p.grams > 0) {
      seenLabels.add(norm);
      presets.push(p);
    }
  };

  (cand.servings || []).forEach((s: ServingConversion) => {
    addPreset({
      key: `srv_${s.unit_name}_1`,
      label: `${s.unit_label} (${Math.round(s.grams_equivalent)}g)`,
      unitName: s.unit_name,
      quantity: 1,
      grams: s.grams_equivalent,
    });
    if (s.unit_name !== '100g' && s.unit_name !== '100ml') {
      addPreset({
        key: `srv_${s.unit_name}_2`,
        label: `2 × ${s.unit_label} (${Math.round(s.grams_equivalent * 2)}g)`,
        unitName: s.unit_name,
        quantity: 2,
        grams: s.grams_equivalent * 2,
      });
    }
  });

  addPreset({
    key: 'std_1',
    label: `${stdLabel} (${Math.round(stdGrams)}g)`,
    unitName: 'standard_serving',
    quantity: 1,
    grams: stdGrams,
  });
  addPreset({
    key: 'std_2',
    label: `2 × ${stdLabel} (${Math.round(stdGrams * 2)}g)`,
    unitName: 'standard_serving',
    quantity: 2,
    grams: stdGrams * 2,
  });
  addPreset({
    key: '100g',
    label: '100 g (IFCT Reference Basis)',
    unitName: '100g',
    quantity: 1,
    grams: 100,
  });

  return presets;
}

export const FoodRecognitionPage: React.FC = () => {
  const { household, activeMember } = useHousehold();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [userHint, setUserHint] = useState('');
  const [result, setResult] = useState<DishRecognitionResponse | null>(null);
  const [confirmedSlug, setConfirmedSlug] = useState<string | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [selectedPortionKey, setSelectedPortionKey] = useState<string>('std_1');
  const [customGrams, setCustomGrams] = useState<string>('100');

  const [manualQuery, setManualQuery] = useState('');
  const [manualResults, setManualResults] = useState<FoodSummary[]>([]);
  const [manualSearching, setManualSearching] = useState(false);

  const [mealCategory, setMealCategory] = useState<'breakfast' | 'lunch' | 'dinner' | 'snack'>('breakfast');
  const [loggingToTracker, setLoggingToTracker] = useState(false);
  const [trackerSuccessMsg, setTrackerSuccessMsg] = useState<string | null>(null);

  const revokeCurrentPreview = useCallback((urlToRevoke: string | null) => {
    if (urlToRevoke && urlToRevoke.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(urlToRevoke);
      } catch {
        // ignore
      }
    }
  }, []);

  const stopCameraCapture = useCallback(() => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCameraCapture();
    };
  }, [stopCameraCapture]);

  useEffect(() => {
    return () => {
      revokeCurrentPreview(previewUrl);
    };
  }, [previewUrl, revokeCurrentPreview]);

  const validateAndAttachFile = (incoming: File | null) => {
    setError(null);
    setTrackerSuccessMsg(null);
    if (!incoming) {
      revokeCurrentPreview(previewUrl);
      setFile(null);
      setPreviewUrl(null);
      setResult(null);
      setConfirmedSlug(null);
      clearAssistantEntityContext('/recognition');
      return;
    }

    const mime = (incoming.type || '').toLowerCase();
    const extOk = /\.(jpe?g|png|webp)$/i.test(incoming.name || '');
    if ((mime && !ALLOWED_PHOTO_MIMES.includes(mime)) || (!mime && !extOk)) {
      setError(
        `Unsupported file format '${incoming.type || incoming.name}'. Please select a JPEG, PNG, or WebP photograph.`
      );
      return;
    }
    if (incoming.size === 0) {
      setError('The selected image file is empty (0 bytes). Please choose a valid photograph.');
      return;
    }
    if (incoming.size > MAX_PHOTO_BYTES) {
      setError('File exceeds the 5 MB maximum upload size. Please choose a smaller photograph.');
      return;
    }

    revokeCurrentPreview(previewUrl);
    const nextUrl = URL.createObjectURL(incoming);
    setFile(incoming);
    setPreviewUrl(nextUrl);
    setResult(null);
    setConfirmedSlug(null);
    setShowAlternatives(false);
    clearAssistantEntityContext('/recognition');
  };

  const handleRemoveImage = () => {
    validateAndAttachFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setCameraError('Camera capture is not supported in this browser. Use Select Photo instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      window.setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          void cameraVideoRef.current.play().catch(() => null);
        }
      }, 50);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Could not access camera (${err.message}). You can select a photo from your Mac instead.`
          : 'Could not access camera.'
      );
    }
  };

  const handleCaptureCameraFrame = () => {
    const video = cameraVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera frame is not ready yet. Please wait a moment and try again.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        stopCameraCapture();
        if (blob) {
          const capturedFile = new File([blob], `gharplate-camera-${Date.now()}.jpg`, {
            type: 'image/jpeg',
          });
          validateAndAttachFile(capturedFile);
        }
      },
      'image/jpeg',
      0.9
    );
  };

  const handleRecognize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select or drop a food photograph (JPEG, PNG, or WebP) first.');
      return;
    }
    setLoading(true);
    setError(null);
    setTrackerSuccessMsg(null);
    try {
      const res = await api.recognizeDish(file, userHint.trim() || undefined);
      setResult(res);
      const topCandidate = res.candidates?.[0] || null;
      if (topCandidate) {
        setConfirmedSlug(topCandidate.food_slug);
        const presets = buildPortionPresetsForCandidate(topCandidate);
        setSelectedPortionKey(presets[0]?.key || 'std_1');
        setCustomGrams(String(Math.round(topCandidate.standard_serving_grams || 100)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Food photo analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const activeCandidate: DishCandidate | null = useMemo(() => {
    if (!result || !result.candidates || result.candidates.length === 0) return null;
    return (
      result.candidates.find((c) => c.food_slug === confirmedSlug) ||
      result.candidates[0]
    );
  }, [result, confirmedSlug]);

  const portionPresets = useMemo(
    () => buildPortionPresetsForCandidate(activeCandidate),
    [activeCandidate]
  );

  const activePortion = useMemo(() => {
    if (selectedPortionKey === 'custom') {
      const parsed = Number(customGrams);
      const grams = Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
      return {
        label: `Custom (${Math.round(grams)}g)`,
        unitName: '100g',
        quantity: Number((grams / 100).toFixed(2)),
        grams,
      };
    }
    const found = portionPresets.find((p) => p.key === selectedPortionKey) || portionPresets[0];
    return {
      label: found?.label || '1 serving (100g)',
      unitName: found?.unitName || 'standard_serving',
      quantity: found?.quantity || 1,
      grams: found?.grams || 100,
    };
  }, [selectedPortionKey, customGrams, portionPresets]);

  const scaledNutrients = useMemo(() => {
    const factor = activePortion.grams / 100.0;
    const list = activeCandidate?.nutrients || [];
    const byCode: Record<string, number | null> = {};
    list.forEach((n) => {
      if (n.is_available && n.value_per_100 !== null && n.value_per_100 !== undefined) {
        byCode[n.nutrient_code] = Number((n.value_per_100 * factor).toFixed(1));
      } else {
        byCode[n.nutrient_code] = null;
      }
    });
    return byCode;
  }, [activeCandidate, activePortion.grams]);

  useEffect(() => {
    if (!result || !activeCandidate) {
      return;
    }
    const analysisContextPayload = {
      recognition_id: result.recognition_id,
      analysis_status: result.analysis_status || 'success',
      vision_model_used: result.vision_model_used,
      overall_description: result.overall_description || activeCandidate.visual_cue_explanation,
      confirmed_food_id: activeCandidate.food_id ?? null,
      confirmed_food_slug: activeCandidate.food_slug,
      confirmed_food_name: activeCandidate.food_name,
      matched_in_database: activeCandidate.matched_in_database ?? true,
      category_name: activeCandidate.category_name,
      confidence_category: activeCandidate.confidence_category || 'moderate_confidence',
      visual_similarity_score: activeCandidate.visual_similarity_score,
      uncertainty_label: activeCandidate.uncertainty_label,
      is_vegetarian: activeCandidate.is_vegetarian ?? true,
      is_vegan: activeCandidate.is_vegan ?? false,
      selected_serving_label: activePortion.label,
      selected_unit_name: activePortion.unitName,
      selected_quantity: activePortion.quantity,
      selected_grams: activePortion.grams,
      portion_nutrients: scaledNutrients,
      detected_components: result.detected_components || [],
      ambiguity_notes: result.ambiguity_notes || [],
      source_name: activeCandidate.source_name || 'ICMR-NIN IFCT 2017',
      source_url: activeCandidate.source_url || null,
    };

    publishAssistantContext({
      page_type: 'food_image_analysis',
      route: '/recognition',
      food_slug: activeCandidate.matched_in_database !== false ? activeCandidate.food_slug : null,
      selected_entity: {
        type: 'food',
        id: activeCandidate.food_slug,
        name: activeCandidate.food_name,
        category: activeCandidate.category_name,
        summary: `${activePortion.label} (${Math.round(activePortion.grams)}g)`,
      },
      food_image_analysis: analysisContextPayload,
    });
  }, [result, activeCandidate, activePortion, scaledNutrients]);

  const handleManualFoodSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = manualQuery.trim();
    if (!q) return;
    setManualSearching(true);
    try {
      const sr = await api.searchFoods({ q, page_size: 6 });
      setManualResults(sr.items || []);
    } catch {
      setManualResults([]);
    } finally {
      setManualSearching(false);
    }
  };

  const handleSelectManualFood = async (summary: FoodSummary) => {
    try {
      const detail = await api.getFoodDetail(summary.slug);
      const manualCand: DishCandidate = {
        food_id: detail.id,
        food_slug: detail.slug,
        food_name: detail.name_en,
        matched_in_database: true,
        image_url: detail.image_url,
        regional_aliases: (detail.aliases || []).map((a) => a.alias_text).slice(0, 4),
        visual_similarity_score: 1.0,
        confidence_category: 'high_confidence',
        uncertainty_label: 'Confirmed manually by user from GharPlate database',
        visual_cue_explanation: `Manually selected verified record '${detail.name_en}'.`,
        category_name: detail.category.name,
        default_basis: detail.default_basis,
        standard_serving_name: detail.standard_serving_name,
        standard_serving_grams: detail.standard_serving_grams,
        is_vegetarian: detail.is_vegetarian,
        is_vegan: detail.is_vegan,
        completeness_pct: detail.completeness_pct,
        available_nutrient_count: detail.available_nutrient_count,
        missing_nutrient_codes: detail.missing_nutrient_codes,
        source_name: detail.source.name,
        source_url: detail.source.url,
        publication_year: detail.source.publication_year,
        servings: detail.servings,
        nutrients: detail.nutrients,
      };
      setResult((prev) => ({
        recognition_id: prev?.recognition_id || `rec_manual_${Date.now()}`,
        analysis_status: 'success',
        vision_provider: prev?.vision_provider || 'manual_selection',
        vision_model_used: prev?.vision_model_used || null,
        vision_reachable: prev?.vision_reachable ?? true,
        overall_description: prev?.overall_description || `Selected ${detail.name_en} from GharPlate catalog.`,
        experimental_disclaimer:
          prev?.experimental_disclaimer ||
          'Confirmed against GharPlate verified food composition database.',
        privacy_confirmation:
          prev?.privacy_confirmation || 'Processed locally with RAM-only image handling.',
        requires_user_confirmation: false,
        image_quality_notes: prev?.image_quality_notes || '',
        detected_components: prev?.detected_components || [],
        unrecognized_items: prev?.unrecognized_items || [],
        ambiguity_notes: prev?.ambiguity_notes || [],
        remediation_instructions: [],
        candidates: [
          manualCand,
          ...(prev?.candidates || []).filter((c) => c.food_slug !== manualCand.food_slug),
        ],
      }));
      setConfirmedSlug(manualCand.food_slug);
      const presets = buildPortionPresetsForCandidate(manualCand);
      setSelectedPortionKey(presets[0]?.key || 'std_1');
      setCustomGrams(String(Math.round(manualCand.standard_serving_grams || 100)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load food details');
    }
  };

  const handleLogToDailyTracker = async () => {
    if (!activeCandidate || activeCandidate.matched_in_database === false) return;
    if (!household?.household_token) {
      setError('No active household profile found. Please visit Household & Profiles first.');
      return;
    }
    setLoggingToTracker(true);
    setTrackerSuccessMsg(null);
    setError(null);
    try {
      await api.addDailyFoodLog({
        household_token: household.household_token,
        member_id: activeMember?.id,
        food_slug: activeCandidate.food_slug,
        quantity: activePortion.quantity,
        unit_name: activePortion.unitName,
        meal_category: mealCategory,
        notes: `Logged from AI Food Photo Analyzer (${activePortion.label})`,
      });
      setTrackerSuccessMsg(
        `Added ${activePortion.label} of ${activeCandidate.food_name} to today's ${mealCategory} tracker!`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log food to Daily Tracker.');
    } finally {
      setLoggingToTracker(false);
    }
  };

  const confidenceBadgeStyle = (cat?: string) => {
    if (cat === 'high_confidence') {
      return 'bg-emerald-100 text-emerald-950 border-emerald-300';
    }
    if (cat === 'low_confidence') {
      return 'bg-rose-100 text-rose-950 border-rose-300';
    }
    return 'bg-amber-100 text-amber-950 border-amber-300';
  };

  const keyMacroRows = useMemo(() => {
    const nutList = activeCandidate?.nutrients || [];
    const wanted = [
      { code: 'energy_kcal', label: 'Energy', unit: 'kcal' },
      { code: 'protein_g', label: 'Protein', unit: 'g' },
      { code: 'carbs_g', label: 'Total Carbohydrates', unit: 'g' },
      { code: 'sugars_total_g', label: 'Total Sugars', unit: 'g' },
      { code: 'fat_total_g', label: 'Total Fat', unit: 'g' },
      { code: 'fat_saturated_g', label: 'Saturated Fat', unit: 'g' },
      { code: 'fibre_g', label: 'Dietary Fibre', unit: 'g' },
      { code: 'sodium_mg', label: 'Sodium', unit: 'mg' },
      { code: 'iron_mg', label: 'Iron', unit: 'mg' },
      { code: 'calcium_mg', label: 'Calcium', unit: 'mg' },
      { code: 'potassium_mg', label: 'Potassium', unit: 'mg' },
      { code: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg' },
    ];
    return wanted.map((w) => {
      const found = nutList.find((n) => n.nutrient_code === w.code);
      const per100 =
        found && found.is_available && found.value_per_100 !== null
          ? found.value_per_100
          : null;
      const perStd =
        found && found.is_available && found.value_for_serving !== null
          ? found.value_for_serving
          : per100 !== null && activeCandidate?.standard_serving_grams
          ? Number(((per100 * activeCandidate.standard_serving_grams) / 100.0).toFixed(1))
          : null;
      const perPortion = scaledNutrients[w.code] ?? null;
      return {
        ...w,
        unit: found?.unit || w.unit,
        per100,
        perStd,
        perPortion,
      };
    });
  }, [activeCandidate, scaledNutrients]);

  return (
    <div className="space-y-8" data-testid="food-photo-analyzer-page">
      {/* STAGE 1: CLEAN PROGRESSIVE-DISCLOSURE UPLOAD & CAPTURE WORKSPACE */}
      <div className="gp-surface-elevated rounded-3xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 border border-emerald-300/80 px-3 py-1 text-xs font-extrabold text-emerald-950">
              <span>📸</span>
              <span>Local Multimodal Vision • RAM-Only Privacy</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-[#172b23] tracking-tight">
              AI Food Photo Analyzer
            </h1>
            <p className="text-xs sm:text-sm text-[#566960] max-w-2xl">
              Upload a photograph of an Indian food or meal to identify possible foods and explore their nutritional information.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[#087153] bg-[#e8f2e9] border border-emerald-900/15 rounded-2xl px-3.5 py-2">
            <span>🔒</span>
            <span>Processed in RAM • Never stored on disk</span>
          </div>
        </div>

        <form onSubmit={(e) => void handleRecognize(e)} className="space-y-5">
          <div
            data-testid="photo-dropzone"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              const droppedFile = e.dataTransfer.files?.[0] || null;
              if (droppedFile) validateAndAttachFile(droppedFile);
            }}
            className={`rounded-3xl border-2 border-dashed p-6 transition ${
              isDraggingOver
                ? 'border-[#087153] bg-emerald-50/80'
                : 'border-emerald-800/25 bg-[#f7fbf7]'
            }`}
          >
            <input
              ref={fileInputRef}
              id="food-photo-file-input"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              aria-label="Upload Dish Image"
              data-testid="food-photo-input"
              onChange={(e) => validateAndAttachFile(e.target.files?.[0] || null)}
              className="sr-only"
            />

            {previewUrl && file ? (
              <div className="grid gap-6 md:grid-cols-12 items-center">
                <div className="md:col-span-5 flex justify-center">
                  <div className="relative overflow-hidden rounded-2xl border border-emerald-900/15 bg-white shadow-sm max-h-64">
                    <img
                      src={previewUrl}
                      alt="Selected food photograph preview"
                      data-testid="uploaded-food-preview"
                      className="max-h-60 w-auto object-contain rounded-xl"
                    />
                  </div>
                </div>
                <div className="md:col-span-7 space-y-3 text-left">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-950">
                    <span>✓ Photograph Ready for Analysis</span>
                  </div>
                  <div className="text-sm font-extrabold text-[#172b23] truncate">
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </div>
                  <p className="text-xs text-[#566960]">
                    Click <strong>Analyze Food</strong> below to inspect this photograph with your local Ollama vision model and match it against GharPlate’s verified nutrition database.
                  </p>
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    <button
                      type="button"
                      data-testid="replace-photo-btn"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl border border-emerald-800/25 bg-white px-4 py-2 text-xs font-extrabold text-[#172b23] hover:bg-[#e8f2e9] transition"
                    >
                      Replace Image
                    </button>
                    <button
                      type="button"
                      data-testid="remove-photo-btn"
                      onClick={handleRemoveImage}
                      className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-xs font-extrabold text-rose-900 hover:bg-rose-100 transition"
                    >
                      Remove Image
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center space-y-3">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#087153] text-2xl text-white shadow-sm">
                  🍛
                </div>
                <div className="space-y-1">
                  <div className="text-base font-extrabold text-[#172b23]">
                    Select a Food Photograph from Your Mac or Drag &amp; Drop Here
                  </div>
                  <p className="text-xs text-[#566960]">
                    Supports JPEG, PNG, and WebP up to 5 MB • Single dishes, fruits, snacks, or full Indian thali plates
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    data-testid="select-photo-btn"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-2xl bg-[#087153] px-5 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-[#064d3c] transition"
                  >
                    📁 Select Photo
                  </button>
                  <button
                    type="button"
                    data-testid="take-photo-btn"
                    onClick={() => void handleStartCamera()}
                    className="rounded-2xl border border-emerald-800/25 bg-white px-4 py-2.5 text-xs font-extrabold text-[#172b23] hover:bg-[#e8f2e9] transition"
                  >
                    📷 Take Photo
                  </button>
                </div>
              </div>
            )}
          </div>

          {cameraOpen && (
            <div
              data-testid="photo-camera-modal"
              className="rounded-3xl bg-stone-900 p-5 text-white space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-300">
                  📷 Live Camera Capture (Stops immediately after capture)
                </span>
                <button
                  type="button"
                  onClick={stopCameraCapture}
                  className="rounded-xl bg-stone-800 px-3 py-1 text-xs font-bold text-stone-200 hover:bg-stone-700"
                >
                  Close Camera
                </button>
              </div>
              <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-emerald-500/50 bg-black aspect-[16/10]">
                <video
                  ref={cameraVideoRef}
                  playsInline
                  muted
                  autoPlay
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  data-testid="capture-camera-frame-btn"
                  onClick={handleCaptureCameraFrame}
                  className="rounded-2xl bg-emerald-500 px-5 py-2 text-xs font-extrabold text-stone-950 hover:bg-emerald-400"
                >
                  📸 Capture Photo
                </button>
                <button
                  type="button"
                  onClick={stopCameraCapture}
                  className="rounded-2xl bg-rose-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-rose-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {cameraError && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
              {cameraError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-12 items-end">
            <div className="sm:col-span-9">
              <label
                htmlFor="optional-food-description"
                className="block text-xs font-bold text-[#172b23] mb-1.5"
              >
                Optional Food Description or Context Note
              </label>
              <input
                id="optional-food-description"
                data-testid="optional-food-hint-input"
                type="text"
                value={userHint}
                onChange={(e) => setUserHint(e.target.value)}
                placeholder="Optional: describe anything you already know about the food."
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-xs text-[#172b23] placeholder:text-stone-400 focus:border-[#087153] focus:outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="submit"
                data-testid="analyze-food-btn"
                disabled={loading}
                className="w-full rounded-2xl bg-[#087153] py-3 px-5 text-xs font-extrabold text-white shadow-sm hover:bg-[#064d3c] disabled:opacity-50 transition"
              >
                {loading ? 'Analysing Photo…' : '🔍 Analyze Food'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {error && (
        <div
          data-testid="photo-analyzer-error"
          className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-900"
        >
          {error}
        </div>
      )}

      {/* STAGE 2: PROGRESSIVE DISCLOSURE — RECOGNITION RESULTS, PORTION SELECTOR, NUTRITION & AI CONVERSATION */}
      {result && (
        <section className="space-y-6" data-testid="photo-analysis-results">
          {(result.analysis_status === 'vision_unavailable' ||
            result.analysis_status === 'vision_error') && (
            <div
              data-testid="vision-unavailable-banner"
              className="rounded-3xl border border-amber-300 bg-amber-50/95 p-5 text-xs text-amber-950 space-y-2"
            >
              <div className="font-extrabold text-sm">
                ⚠️ Local Multimodal Vision Model Unavailable ({result.analysis_status})
              </div>
              <p>{result.overall_description}</p>
              {result.remediation_instructions &&
                result.remediation_instructions.length > 0 && (
                  <ul className="list-disc pl-5 space-y-1 font-semibold">
                    {result.remediation_instructions.map((inst, i) => (
                      <li key={i}>{inst}</li>
                    ))}
                  </ul>
                )}
            </div>
          )}

          <div className="rounded-3xl border border-emerald-900/15 bg-white/95 p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#e8f2e9] px-3 py-1 text-xs font-extrabold text-[#087153]">
                  🤖 Vision Engine: {result.vision_model_used || 'Local Ollama Vision'}
                </span>
                {result.image_quality_notes && (
                  <span className="text-xs text-[#566960]">
                    {result.image_quality_notes}
                  </span>
                )}
              </div>
              <span className="text-xs font-bold text-[#087153]">
                🔒 {result.privacy_confirmation}
              </span>
            </div>

            {result.overall_description &&
              result.analysis_status !== 'vision_unavailable' && (
                <p
                  data-testid="vision-overall-description"
                  className="text-xs sm:text-sm font-semibold text-[#172b23]"
                >
                  {result.overall_description}
                </p>
              )}

            {result.ambiguity_notes && result.ambiguity_notes.length > 0 && (
              <div
                data-testid="vision-ambiguity-notes"
                className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-950 space-y-1"
              >
                <div className="font-extrabold">Visual Confidence &amp; Lighting Notes:</div>
                {result.ambiguity_notes.map((note, idx) => (
                  <p key={idx}>• {note}</p>
                ))}
              </div>
            )}

            {result.detected_components && result.detected_components.length > 0 && (
              <div
                data-testid="detected-plate-components"
                className="pt-2 border-t border-stone-100 space-y-2"
              >
                <div className="text-xs font-extrabold text-[#172b23]">
                  🍱 Detected Food Items in Photograph ({result.detected_components.length}):
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.detected_components.map((comp, idx) => {
                    const isActive =
                      comp.matched_food_slug &&
                      comp.matched_food_slug === activeCandidate?.food_slug;
                    return (
                      <button
                        key={`${comp.component_label}-${idx}`}
                        type="button"
                        onClick={() => {
                          if (comp.matched_food_slug) {
                            setConfirmedSlug(comp.matched_food_slug);
                          }
                        }}
                        className={`rounded-2xl border px-3.5 py-2 text-left text-xs transition ${
                          isActive
                            ? 'border-[#087153] bg-[#087153] text-white shadow-xs'
                            : comp.matched_in_database
                            ? 'border-emerald-800/20 bg-[#f1f6f1] text-[#172b23] hover:bg-[#e8f2e9]'
                            : 'border-amber-300 bg-amber-50 text-amber-950'
                        }`}
                      >
                        <div className="font-extrabold">
                          {comp.matched_food_name || comp.component_label}{' '}
                          <span className="opacity-80">
                            ({Math.round(comp.confidence_score * 100)}%)
                          </span>
                        </div>
                        <div className="text-[10px] opacity-85">
                          {comp.matched_in_database
                            ? comp.standard_serving_name || 'Matched in GharPlate DB'
                            : 'Unmatched item — search manually below'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {activeCandidate ? (
            <div className="grid gap-6 lg:grid-cols-12 items-start">
              <div className="lg:col-span-5 space-y-5">
                <div
                  data-testid="primary-identified-food-card"
                  className="overflow-hidden rounded-3xl border border-emerald-900/20 bg-white shadow-sm"
                >
                  {previewUrl ? (
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-stone-900 flex items-center justify-center">
                      <img
                        src={previewUrl}
                        alt={activeCandidate.food_name}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute top-3 left-3 rounded-full bg-stone-950/80 px-3 py-1 text-[11px] font-extrabold text-white backdrop-blur-xs">
                        Uploaded Photo
                      </span>
                    </div>
                  ) : (
                    <FoodImage
                      src={activeCandidate.image_url}
                      foodName={activeCandidate.food_name}
                      categorySlug="indian-dishes"
                      aspectClass="aspect-[16/10]"
                    />
                  )}

                  <div className="p-5 space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        data-testid="candidate-confidence-badge"
                        className={`rounded-full border px-3 py-0.5 font-extrabold ${confidenceBadgeStyle(
                          activeCandidate.confidence_category
                        )}`}
                      >
                        Match: {Math.round(activeCandidate.visual_similarity_score * 100)}% •{' '}
                        {(activeCandidate.confidence_category || 'moderate_confidence').replace(
                          /_/g,
                          ' '
                        )}
                      </span>
                      <span className="font-bold text-[#566960]">
                        {activeCandidate.category_name}
                      </span>
                    </div>

                    <div>
                      <h2
                        data-testid="confirmed-food-title"
                        className="text-xl font-black text-[#172b23]"
                      >
                        {activeCandidate.food_name}
                      </h2>
                      {activeCandidate.regional_aliases &&
                        activeCandidate.regional_aliases.length > 0 && (
                          <p className="text-[11px] font-semibold text-[#566960] mt-0.5">
                            Also known as: {activeCandidate.regional_aliases.join(' • ')}
                          </p>
                        )}
                    </div>

                    <p className="text-[#566960] leading-relaxed">
                      {activeCandidate.visual_cue_explanation}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          activeCandidate.is_vegetarian !== false
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-rose-100 text-rose-900'
                        }`}
                      >
                        {activeCandidate.is_vegetarian !== false
                          ? '🟢 Vegetarian'
                          : '🔴 Non-Vegetarian'}
                      </span>
                      {activeCandidate.matched_in_database !== false && (
                        <Link
                          to={`/foods/${activeCandidate.food_slug}`}
                          className="font-extrabold text-[#087153] hover:underline ml-auto"
                        >
                          Open Full Food Page →
                        </Link>
                      )}
                    </div>

                    {result.candidates.length > 1 && (
                      <div className="pt-2 border-t border-stone-100">
                        <button
                          type="button"
                          data-testid="toggle-alternatives-btn"
                          onClick={() => setShowAlternatives((prev) => !prev)}
                          className="text-xs font-extrabold text-[#087153] hover:underline"
                        >
                          {showAlternatives
                            ? '▴ Hide Alternative Candidates'
                            : `▾ Not ${activeCandidate.food_name}? View ${result.candidates.length - 1} Alternative Match(es)`}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {activeCandidate.matched_in_database !== false && (
                  <div
                    data-testid="portion-selector-card"
                    className="rounded-3xl border border-emerald-900/15 bg-white p-5 shadow-xs space-y-4 text-xs"
                  >
                    <div>
                      <h3 className="text-sm font-black text-[#172b23]">
                        ⚖️ Select Consumed Portion / Serving Size
                      </h3>
                      <p className="text-[11px] text-[#566960]">
                        Nutrition values update automatically using verified GharPlate serving conversions.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="portion-preset-select"
                        className="block font-bold text-[#172b23]"
                      >
                        Household Serving Measure:
                      </label>
                      <select
                        id="portion-preset-select"
                        data-testid="portion-preset-select"
                        value={selectedPortionKey}
                        onChange={(e) => setSelectedPortionKey(e.target.value)}
                        className="w-full rounded-2xl border border-stone-300 bg-[#f7fbf7] px-3.5 py-2.5 text-xs font-extrabold text-[#172b23]"
                      >
                        {portionPresets.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label}
                          </option>
                        ))}
                        <option value="custom">Custom Gram Weight (g)…</option>
                      </select>
                    </div>

                    {selectedPortionKey === 'custom' && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="custom-grams-input"
                          className="block font-bold text-[#172b23]"
                        >
                          Enter Custom Portion Weight (grams):
                        </label>
                        <input
                          id="custom-grams-input"
                          data-testid="custom-grams-input"
                          type="number"
                          min={5}
                          max={2500}
                          step={5}
                          value={customGrams}
                          onChange={(e) => setCustomGrams(e.target.value)}
                          className="w-full rounded-2xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-extrabold text-[#172b23]"
                        />
                      </div>
                    )}

                    <div className="pt-2 border-t border-stone-100 space-y-3">
                      <button
                        type="button"
                        data-testid="ask-assistant-about-photo-btn"
                        onClick={() => openAssistantWorkspace()}
                        className="gp-sidebar-ai-btn w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-extrabold text-white shadow-sm"
                      >
                        <span>🤖</span>
                        <span>Ask GharPlate about this food</span>
                      </button>

                      <Link
                        to={`/food-nearby?dish=${encodeURIComponent(
                          activeCandidate?.food_name || 'Masala Dosa'
                        )}`}
                        data-testid="find-analysed-food-nearby-btn"
                        className="w-full flex items-center justify-center gap-2 rounded-2xl border border-emerald-800/25 bg-[#e8f2e9] px-4 py-2.5 text-xs font-extrabold text-[#064d3c] hover:bg-emerald-100 transition"
                      >
                        <span>📍</span>
                        <span>Find This Food Nearby →</span>
                      </Link>

                      <div className="flex items-center gap-2">
                        <select
                          aria-label="Select Meal Category"
                          data-testid="photo-log-meal-select"
                          value={mealCategory}
                          onChange={(e) =>
                            setMealCategory(
                              e.target.value as 'breakfast' | 'lunch' | 'dinner' | 'snack'
                            )
                          }
                          className="rounded-2xl border border-stone-300 bg-white px-3 py-2.5 text-xs font-bold text-[#172b23]"
                        >
                          <option value="breakfast">Breakfast</option>
                          <option value="lunch">Lunch</option>
                          <option value="dinner">Dinner</option>
                          <option value="snack">Snack</option>
                        </select>
                        <button
                          type="button"
                          data-testid="log-analysed-food-btn"
                          disabled={loggingToTracker}
                          onClick={() => void handleLogToDailyTracker()}
                          className="flex-1 rounded-2xl bg-stone-900 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-stone-800 disabled:opacity-50 transition"
                        >
                          {loggingToTracker ? 'Logging…' : '📒 Add to Daily Tracker'}
                        </button>
                      </div>

                      {trackerSuccessMsg && (
                        <div
                          data-testid="photo-tracker-success"
                          className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-950 flex items-center justify-between gap-2"
                        >
                          <span>✓ {trackerSuccessMsg}</span>
                          <Link
                            to="/fitness/tracker"
                            className="underline font-extrabold shrink-0"
                          >
                            View Tracker →
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-7 space-y-5">
                {activeCandidate.matched_in_database !== false ? (
                  <div
                    data-testid="photo-nutrition-summary-card"
                    className="rounded-3xl border border-emerald-900/15 bg-white p-6 shadow-xs space-y-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-4">
                      <div>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#087153]">
                          Verified GharPlate Nutrition Composition
                        </span>
                        <h3 className="text-lg font-black text-[#172b23]">
                          {activeCandidate.food_name} — {activePortion.label}
                        </h3>
                        <p className="text-xs text-[#566960]">
                          Source: <strong>{activeCandidate.source_name || 'ICMR-NIN IFCT 2017'}</strong>
                          {activeCandidate.publication_year
                            ? ` (${activeCandidate.publication_year})`
                            : ''}{' '}
                          • Completeness:{' '}
                          <strong>{activeCandidate.completeness_pct ?? 100}%</strong>
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        {
                          label: 'Energy',
                          val: scaledNutrients.energy_kcal,
                          unit: 'kcal',
                        },
                        {
                          label: 'Protein',
                          val: scaledNutrients.protein_g,
                          unit: 'g',
                        },
                        {
                          label: 'Carbohydrates',
                          val: scaledNutrients.carbs_g,
                          unit: 'g',
                        },
                        {
                          label: 'Total Fat',
                          val: scaledNutrients.fat_total_g,
                          unit: 'g',
                        },
                      ].map((m) => (
                        <div
                          key={m.label}
                          className="rounded-2xl border border-emerald-900/10 bg-[#f7fbf7] p-3.5 text-center"
                        >
                          <div className="text-[11px] font-bold text-[#566960]">
                            {m.label}
                          </div>
                          <div className="mt-1 text-lg font-black text-[#087153]">
                            {m.val !== null && m.val !== undefined
                              ? `${m.val} ${m.unit}`
                              : 'NULL'}
                          </div>
                          <div className="text-[10px] text-stone-400">
                            for {Math.round(activePortion.grams)}g
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-stone-200 text-[#566960]">
                            <th className="py-2.5 pr-3 font-extrabold">Nutrient</th>
                            <th className="py-2.5 px-3 font-extrabold">
                              Per {activeCandidate.default_basis || '100g'}
                            </th>
                            <th className="py-2.5 px-3 font-extrabold">
                              Std Serving ({Math.round(activeCandidate.standard_serving_grams || 100)}g)
                            </th>
                            <th className="py-2.5 pl-3 font-extrabold text-[#087153]">
                              Your Portion ({Math.round(activePortion.grams)}g)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {keyMacroRows.map((row) => (
                            <tr key={row.code}>
                              <td className="py-2.5 pr-3 font-bold text-[#172b23]">
                                {row.label}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-stone-600">
                                {row.per100 !== null ? `${row.per100} ${row.unit}` : 'NULL (Unmeasured)'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-stone-600">
                                {row.perStd !== null ? `${row.perStd} ${row.unit}` : 'NULL'}
                              </td>
                              <td className="py-2.5 pl-3 font-mono font-extrabold text-[#087153]">
                                {row.perPortion !== null
                                  ? `${row.perPortion} ${row.unit}`
                                  : 'NULL (Unmeasured)'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div
                    data-testid="unmatched-food-notice"
                    className="rounded-3xl border border-amber-300 bg-amber-50 p-6 text-xs text-amber-950 space-y-2"
                  >
                    <div className="text-base font-black">
                      ⚠️ No Verified Nutrition Record Found for “{activeCandidate.food_name}”
                    </div>
                    <p>
                      Your local vision model identified <strong>{activeCandidate.food_name}</strong> visually, but GharPlate does not yet have a verified composition record for this exact item and never fabricates nutrient values.
                    </p>
                    <p className="font-bold">
                      Use the manual database search below to select the closest verified Indian dish or ingredient.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {showAlternatives && result.candidates.length > 1 && (
            <div
              data-testid="alternative-candidates-grid"
              className="rounded-3xl border border-emerald-900/15 bg-white p-6 space-y-4"
            >
              <h3 className="text-sm font-black text-[#172b23]">
                Alternative Visual Candidates ({result.candidates.length}):
              </h3>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {result.candidates.map((cand) => {
                  const isSelected = activeCandidate?.food_slug === cand.food_slug;
                  return (
                    <div
                      key={cand.food_slug}
                      className={`rounded-2xl border p-4 text-xs space-y-2 transition ${
                        isSelected
                          ? 'border-[#087153] bg-[#e8f2e9]/70'
                          : 'border-stone-200 bg-stone-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-[#087153]">
                          Match: {Math.round(cand.visual_similarity_score * 100)}%
                        </span>
                        <span className="text-[10px] text-stone-500">
                          {cand.category_name}
                        </span>
                      </div>
                      <div className="text-sm font-extrabold text-[#172b23]">
                        {cand.food_name}
                      </div>
                      <p className="text-[#566960] line-clamp-2">
                        {cand.visual_cue_explanation}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmedSlug(cand.food_slug);
                          const presets = buildPortionPresetsForCandidate(cand);
                          setSelectedPortionKey(presets[0]?.key || 'std_1');
                          setCustomGrams(String(Math.round(cand.standard_serving_grams || 100)));
                        }}
                        className="w-full rounded-xl bg-stone-900 py-2 font-extrabold text-white hover:bg-[#087153]"
                      >
                        {isSelected ? '✓ Confirmed Dish' : 'Select This Dish'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="rounded-3xl border border-emerald-900/15 bg-white p-6 space-y-4">
            <div>
              <h3 className="text-sm font-black text-[#172b23]">
                🔎 Search GharPlate Food Database Manually
              </h3>
              <p className="text-xs text-[#566960]">
                Want to switch to a different dish, fruit, pulse, or regional food? Search English, Kannada, or Hindi names directly.
              </p>
            </div>
            <form
              onSubmit={(e) => void handleManualFoodSearch(e)}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="text"
                data-testid="manual-food-override-input"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Search e.g. Masala Dosa, Banana, Ragi Mudde, Paneer, Curd Rice…"
                className="flex-1 rounded-2xl border border-stone-300 px-4 py-2.5 text-xs"
              />
              <button
                type="submit"
                disabled={manualSearching}
                className="rounded-2xl bg-stone-900 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-stone-800"
              >
                {manualSearching ? 'Searching…' : 'Search Database'}
              </button>
            </form>
            {manualResults.length > 0 && (
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pt-1">
                {manualResults.map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => void handleSelectManualFood(item)}
                    className="flex items-center justify-between rounded-2xl border border-stone-200 bg-[#f7fbf7] px-3.5 py-2.5 text-left text-xs hover:border-[#087153] hover:bg-[#e8f2e9] transition"
                  >
                    <div>
                      <div className="font-extrabold text-[#172b23]">{item.name_en}</div>
                      <div className="text-[10px] text-[#566960]">{item.category_name}</div>
                    </div>
                    <span className="font-extrabold text-[#087153]">Select →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
