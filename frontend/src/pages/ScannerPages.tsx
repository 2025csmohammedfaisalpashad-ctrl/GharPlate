import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ConfidenceBadge,
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
export const BarcodeLookupPage: React.FC = () => {
  const [barcode, setBarcode] = useState('8906005618726');
  const [result, setResult] = useState<BarcodeLookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Camera Barcode Scanner States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string>(
    'Camera idle — click "Start Camera Barcode Scanner" to scan EAN-8, UPC-A, EAN-13, or GTIN-14.'
  );
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);

  const sampleBarcodes = [
    { code: '8906005618726', label: 'Pineapple Cake (Winkles)' },
    { code: '8901491101813', label: 'Multigrain Muesli' },
    { code: '8901491100519', label: 'Plain Rolled Oats' },
    { code: '8901719101014', label: 'Glucose Biscuits' },
    { code: '8901058851458', label: 'Instant Noodles' },
    { code: '8909999000000', label: 'Unlisted SKU Fallback' },
  ];

  const stopCameraScanner = () => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setTorchOn(false);
    setTorchSupported(false);
  };

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  const handleLookup = async (codeToLookup: string, forceRefresh = false) => {
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
  };

  const startCameraScanner = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError(
        'Camera API (navigator.mediaDevices.getUserMedia) is not available in this browser context. Please use manual barcode entry.'
      );
      return;
    }

    try {
      setCameraStatus('Requesting camera permission...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      setCameraActive(true);
      setCameraStatus(
        'Live camera active — hold EAN-8, UPC-A, EAN-13, or GTIN-14 barcode steady in frame.'
      );

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof videoTrack.getCapabilities === 'function') {
        const caps = videoTrack.getCapabilities() as Record<string, unknown>;
        if (caps && 'torch' in caps) {
          setTorchSupported(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }

      // Use native BarcodeDetector where supported in browser
      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (
              source: HTMLVideoElement
            ) => Promise<{ rawValue: string; format: string }[]>;
          };
        }
      ).BarcodeDetector;

      if (BarcodeDetectorCtor) {
        const detector = new BarcodeDetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'itf', 'code_128'],
        });
        scanTimerRef.current = window.setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes && barcodes.length > 0) {
              const detected = barcodes[0].rawValue.trim();
              if (/^\d{8,14}$/.test(detected)) {
                setBarcode(detected);
                setCameraStatus(`Detected barcode: ${detected} (${barcodes[0].format})`);
                stopCameraScanner();
                void handleLookup(detected);
              }
            }
          } catch {
            // continue scanning next frame
          }
        }, 400);
      } else {
        setCameraStatus(
          'Live camera preview active. Place barcode in frame or enter digits manually below.'
        );
      }
    } catch (err) {
      const errName = err instanceof Error ? err.name : 'CameraError';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setCameraError(
          'Camera permission was denied. Please allow camera access in your browser address bar or enter the barcode number manually.'
        );
      } else {
        setCameraError(
          `Could not start camera scanner (${err instanceof Error ? err.message : errName}). Please use manual barcode entry.`
        );
      }
      stopCameraScanner();
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
            {cameraActive ? (
              <>
                <video
                  ref={videoRef}
                  data-testid="live-barcode-video"
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                />
                <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-400 shadow-[0_0_12px_#34d399]" />
              </>
            ) : (
              <div className="p-4 space-y-2">
                <div className="text-3xl">📷</div>
                <div className="text-xs font-extrabold text-emerald-300">
                  Live Camera Barcode Scanner
                </div>
                <div className="text-[11px] text-stone-400">
                  Supports EAN-8, UPC-A, EAN-13 & GTIN-14
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

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {!cameraActive ? (
              <button
                type="button"
                data-testid="start-camera-scanner-btn"
                onClick={() => void startCameraScanner()}
                className="rounded-2xl bg-emerald-500 px-5 py-2.5 text-xs font-extrabold text-stone-950 shadow hover:bg-emerald-400 transition"
              >
                📷 Start Camera Barcode Scanner
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-testid="stop-camera-scanner-btn"
                  onClick={stopCameraScanner}
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
                  <strong>{result.product.completeness_pct}% ({result.product.available_nutrient_count}/20 nutrients)</strong>
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
                          Open Nutrition →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
