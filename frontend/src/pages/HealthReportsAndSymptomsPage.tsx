import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FoodImage } from '../components/UIWidgets';
import {
  openAssistantWorkspace,
  publishAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';

const SAMPLE_LAB_REPORT_TEXT = `APOLLO / METROPOLIS CLINICAL DIAGNOSTICS — BENGALURU & MYSURU
Report Date: 2026-04-10
Patient Name: Household Member

COMPLETE BLOOD COUNT (CBC) & IRON PANEL
Haemoglobin: **10.8** g/dL L (12.0 - 16.0)
Packed Cell Volume (PCV / Haematocrit): 34.2 % L (36.0 - 46.0)
RBC Count: 4.4 million/cumm (4.0 - 5.2)
WBC Count: 6800 /cumm (4000 - 11000)
Platelet Count: 2.6 lakh/cumm (1.5 - 4.5)
MCV: 77.5 fL ↓ (80.0 - 100.0)
MCH: 25.8 pg L (27.0 - 32.0)
MCHC: 32.4 g/dL (31.5 - 34.5)
Serum Ferritin: **12.4** ng/mL L (15.0 - 150.0)
Serum Iron: 48 µg/dL L (60 - 170)
Transferrin Saturation: 14 % L (20 - 50)

GLUCOSE & DIABETES PANEL
Fasting Blood Glucose: 114 mg/dL H (70 - 99)
Post-Meal Blood Glucose: 148 mg/dL H (70 - 140)
HbA1c: **6.1** % ↑ (4.0 - 5.6)

LIPID PROFILE
Total Cholesterol: 212 mg/dL * (125 - 200)
Triglycerides: 178 mg/dL H (40 - 150)
HDL Cholesterol: 44 mg/dL (40 - 60)
LDL Cholesterol: **134** mg/dL H (0 - 100)

VITAMIN & THYROID PANEL
Vitamin B12: **168** pg/mL L (200 - 900)
25-OH Vitamin D: **16.5** ng/mL L (30.0 - 100.0)
Serum Folate: 8.4 ng/mL (4.6 - 18.7)
TSH: 3.1 mIU/L (0.45 - 4.5)
Free T3: 3.0 pg/mL (2.3 - 4.2)
Free T4: 1.2 ng/dL (0.8 - 1.8)

KIDNEY & LIVER FUNCTION
Serum Creatinine: 0.92 mg/dL (0.6 - 1.2)
Blood Urea: 24 mg/dL (15 - 40)
eGFR: 94 mL/min/1.73m2 (90 - 120)
SGPT (ALT): 28 U/L (7 - 45)
SGOT (AST): 24 U/L (8 - 40)
Total Bilirubin: 0.7 mg/dL (0.2 - 1.2)
`;

const REPORT_TYPES = [
  { value: 'comprehensive_blood_panel', label: 'Comprehensive Blood & Metabolic Panel' },
  { value: 'glucose_hba1c', label: 'Blood Glucose & HbA1c Report' },
  { value: 'cbc_haemogram', label: 'Complete Blood Count (CBC / Haemogram)' },
  { value: 'lipid_profile', label: 'Lipid Profile (Cholesterol & Triglycerides)' },
  { value: 'kidney_renal', label: 'Kidney Function Test (KFT / Renal Panel)' },
  { value: 'liver_hepatic', label: 'Liver Function Test (LFT / Hepatic Panel)' },
  { value: 'thyroid_panel', label: 'Thyroid Profile (TSH, Free T3, Free T4)' },
  { value: 'vitamin_deficiency', label: 'Vitamin D, Vitamin B12 & Iron Deficiency Panel' },
];

const STATUS_BADGE_STYLES: Record<string, string> = {
  low: 'bg-amber-100 text-amber-900 border-amber-300',
  below_reference: 'bg-amber-100 text-amber-900 border-amber-300',
  within_reference: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  borderline: 'bg-orange-100 text-orange-900 border-orange-300',
  high: 'bg-rose-100 text-rose-900 border-rose-300',
  above_reference: 'bg-rose-100 text-rose-900 border-rose-300',
  lab_flagged_abnormal: 'bg-rose-100 text-rose-900 border-rose-300',
  requires_manual_review: 'bg-purple-100 text-purple-900 border-purple-300',
  critical_attention: 'bg-red-600 text-white border-red-700 font-black',
  reference_unavailable: 'bg-stone-100 text-stone-700 border-stone-300',
};

const STATUS_LABELS: Record<string, string> = {
  low: 'Below reference interval',
  below_reference: 'Below reference interval',
  within_reference: 'Within reference interval',
  borderline: 'Borderline — Monitor & Review',
  high: 'Above reference interval',
  above_reference: 'Above reference interval',
  lab_flagged_abnormal: 'Laboratory-flagged abnormal',
  requires_manual_review: 'Requires manual review',
  critical_attention: 'Requires Prompt Clinician Review',
  reference_unavailable: 'Reference interval unavailable',
};

interface PriorityGroupMeta {
  priorityKey: string;
  title: string;
  defaultRelevanceLabel: string;
  specificityOrder: number;
}

function getPriorityGroupMetaForMarker(canonicalCode: string, fallbackLabel?: string): PriorityGroupMeta {
  const code = (canonicalCode || '').toLowerCase();
  if (code === 'vitamin_b12') {
    return {
      priorityKey: 'vitamin_b12_options',
      title: 'Vitamin B12-related food options',
      defaultRelevanceLabel: 'Vitamin B12 source',
      specificityOrder: 1,
    };
  }
  if (code === 'vitamin_d_25oh' || code === 'serum_calcium') {
    return {
      priorityKey: 'vitamin_d_options',
      title: 'Vitamin D & calcium-related food options',
      defaultRelevanceLabel: 'Vitamin D / calcium source',
      specificityOrder: 2,
    };
  }
  if (code === 'serum_folate') {
    return {
      priorityKey: 'folate_options',
      title: 'Folate-related food options',
      defaultRelevanceLabel: 'Dietary folate source',
      specificityOrder: 3,
    };
  }
  if (
    [
      'haemoglobin',
      'rbc_count',
      'hematocrit_pcv',
      'mcv',
      'mch',
      'mchc',
      'serum_ferritin',
      'serum_iron',
      'transferrin_saturation',
      'tibc',
    ].includes(code)
  ) {
    return {
      priorityKey: 'iron_options',
      title: 'Iron-related food options',
      defaultRelevanceLabel: 'Iron source',
      specificityOrder: 4,
    };
  }
  if (
    [
      'fasting_blood_glucose',
      'post_prandial_glucose',
      'random_blood_glucose',
      'hba1c',
    ].includes(code)
  ) {
    return {
      priorityKey: 'glycaemic_fibre_options',
      title: 'Dietary fibre & glycaemic balance food options',
      defaultRelevanceLabel: 'Dietary fibre source',
      specificityOrder: 5,
    };
  }
  if (
    ['total_cholesterol', 'ldl_cholesterol', 'hdl_cholesterol', 'triglycerides'].includes(code)
  ) {
    return {
      priorityKey: 'lipid_fibre_options',
      title: 'Heart-healthy soluble fibre & lipid food options',
      defaultRelevanceLabel: 'Soluble fibre source',
      specificityOrder: 6,
    };
  }
  if (['alt_sgpt', 'ast_sgot', 'total_bilirubin', 'alkaline_phosphatase'].includes(code)) {
    return {
      priorityKey: 'liver_support_options',
      title: 'Liver-supportive whole food options',
      defaultRelevanceLabel: 'Fibre & protein source',
      specificityOrder: 7,
    };
  }
  if (['tsh', 't3', 't4'].includes(code)) {
    return {
      priorityKey: 'thyroid_support_options',
      title: 'Thyroid & metabolic nutrition food options',
      defaultRelevanceLabel: 'Protein & mineral source',
      specificityOrder: 8,
    };
  }
  return {
    priorityKey: code || 'general_options',
    title: fallbackLabel ? `${fallbackLabel} food options` : 'Recommended food options',
    defaultRelevanceLabel: fallbackLabel || 'Nutrient source',
    specificityOrder: 9,
  };
}

function deriveConciseRelevanceLabel(food: Record<string, any>, fallbackLabel: string): string {
  const pCode = String(food.primary_nutrient_code || '').toLowerCase();
  if (pCode === 'iron_mg') return 'Iron source';
  if (pCode === 'vit_b12_mcg' || pCode === 'vitamin_b12_ug') return 'Vitamin B12 source';
  if (pCode === 'vit_d_mcg' || pCode === 'vitamin_d_ug') return 'Vitamin D source';
  if (pCode === 'calcium_mg') return 'Calcium source';
  if (pCode === 'folate_mcg' || pCode === 'folate_ug') return 'Dietary folate source';
  if (pCode === 'fibre_g') return 'Dietary fibre source';
  if (pCode === 'protein_g') return 'Protein source';
  if (pCode === 'vit_c_mg' || pCode === 'vitamin_c_mg') return 'Vitamin C source';
  return fallbackLabel;
}

function recomputeClientMeasurementStatus(row: Record<string, any>): {
  status_flag: string;
  range_status: string;
  status_label: string;
} {
  const val =
    row.measured_value !== null && row.measured_value !== undefined && row.measured_value !== ''
      ? Number(row.measured_value)
      : row.result_value !== null && row.result_value !== undefined && row.result_value !== ''
      ? Number(row.result_value)
      : null;
  const rLow =
    row.reference_low !== null && row.reference_low !== undefined && row.reference_low !== ''
      ? Number(row.reference_low)
      : row.reference_min !== null && row.reference_min !== undefined && row.reference_min !== ''
      ? Number(row.reference_min)
      : null;
  const rHigh =
    row.reference_high !== null && row.reference_high !== undefined && row.reference_high !== ''
      ? Number(row.reference_high)
      : row.reference_max !== null && row.reference_max !== undefined && row.reference_max !== ''
      ? Number(row.reference_max)
      : null;

  if (val !== null && Number.isFinite(val) && (rLow !== null || rHigh !== null)) {
    if (rLow !== null && Number.isFinite(rLow) && val < rLow) {
      return {
        status_flag: 'low',
        range_status: 'below_reference',
        status_label: 'Below reference interval',
      };
    }
    if (rHigh !== null && Number.isFinite(rHigh) && val > rHigh) {
      return {
        status_flag: 'high',
        range_status: 'above_reference',
        status_label: 'Above reference interval',
      };
    }
    return {
      status_flag: 'within_reference',
      range_status: 'within_reference',
      status_label: 'Within reference interval',
    };
  }
  return {
    status_flag: row.status_flag || 'reference_unavailable',
    range_status: row.range_status || 'reference_unavailable',
    status_label:
      row.status_label ||
      STATUS_LABELS[row.status_flag] ||
      'Reference interval unavailable',
  };
}

export const HealthReportsAndSymptomsPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialTab =
    location.pathname.startsWith('/health/symptoms') || searchParams.get('tab') === 'symptoms'
      ? 'symptoms'
      : searchParams.get('tab') === 'trends'
      ? 'trends'
      : 'reports';

  const [activeTab, setActiveTab] = useState<'reports' | 'trends' | 'symptoms'>(initialTab);

  useEffect(() => {
    if (location.pathname.startsWith('/health/symptoms')) {
      setActiveTab('symptoms');
    } else if (searchParams.get('tab') === 'symptoms') {
      setActiveTab('symptoms');
    } else if (searchParams.get('tab') === 'trends') {
      setActiveTab('trends');
    } else {
      setActiveTab('reports');
    }
  }, [location.pathname, searchParams]);

  // ==========================================
  // PART A — HEALTH REPORT UPLOAD & EXTRACTION STATE
  // ==========================================
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [reportTitleInput, setReportTitleInput] = useState('Comprehensive Blood & Metabolic Report');
  const [reportTypeInput, setReportTypeInput] = useState('comprehensive_blood_panel');
  const [laboratoryNameInput, setLaboratoryNameInput] = useState('');
  const [reportDateInput, setReportDateInput] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [rawTextFallback, setRawTextFallback] = useState('');
  const [showTextPasteBox, setShowTextPasteBox] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractionPreview, setExtractionPreview] = useState<Record<string, any> | null>(null);
  const [editableMeasurements, setEditableMeasurements] = useState<Record<string, any>[]>([]);
  const [confirmingSave, setConfirmingSave] = useState(false);

  // Confirmed Reports & Trends State
  const [confirmedReports, setConfirmedReports] = useState<Record<string, any>[]>([]);
  const [activeConfirmedReport, setActiveConfirmedReport] = useState<Record<string, any> | null>(
    null
  );
  const [trendsData, setTrendsData] = useState<Record<string, any> | null>(null);
  const [selectedTrendKey, setSelectedTrendKey] = useState<string>('');
  const [, setLoadingReports] = useState(false);

  // Compact UI State: Saved Reports drawer, "View all test results", Nutritional Priority details, "View More Foods", Food Details Modal & Daily Tracker confirmation
  const [showSavedReportsList, setShowSavedReportsList] = useState(false);
  const [showAllTestResults, setShowAllTestResults] = useState(false);
  const [expandedConcernDetails, setExpandedConcernDetails] = useState<Record<string, boolean>>({});
  const [expandedFoodCardsByMarker, setExpandedFoodCardsByMarker] = useState<
    Record<string, boolean>
  >({});
  const [selectedReportFoodDetail, setSelectedReportFoodDetail] = useState<Record<string, any> | null>(
    null
  );
  const [detailBasisMode, setDetailBasisMode] = useState<'serving' | '100g'>('serving');
  const [detailServingQty, setDetailServingQty] = useState<number>(1);
  const [pendingTrackerFood, setPendingTrackerFood] = useState<{
    slug: string;
    name_en: string;
    standard_serving_name: string;
    meal_category: string;
    quantity: number;
  } | null>(null);
  const [loggingTrackerFood, setLoggingTrackerFood] = useState(false);
  const [trackerFoodBanner, setTrackerFoodBanner] = useState<string | null>(null);

  // ==========================================
  // PART B — AI SYMPTOM REVIEW & CARE GUIDANCE STATE
  // ==========================================
  const [symptomDescription, setSymptomDescription] = useState('');
  const [symptomOnset, setSymptomOnset] = useState('Gradual over the past week');
  const [symptomDuration, setSymptomDuration] = useState('3 to 5 days');
  const [symptomSeverity, setSymptomSeverity] = useState<'mild' | 'moderate' | 'severe'>('mild');
  const [symptomPattern, setSymptomPattern] = useState('More noticeable in the afternoon');
  const [symptomContextNotes, setSymptomContextNotes] = useState('');
  const [includeRecordsConsent, setIncludeRecordsConsent] = useState(true);
  const [evaluatingSymptoms, setEvaluatingSymptoms] = useState(false);
  const [symptomResult, setSymptomResult] = useState<Record<string, any> | null>(null);
  const [, setSymptomHistory] = useState<Record<string, any>[]>([]);
  const [voiceListening, setVoiceListening] = useState(false);

  const selectConfirmedReport = (rep: Record<string, any> | null) => {
    setActiveConfirmedReport(rep);
    try {
      if (rep?.id != null) {
        sessionStorage.setItem('gharplate_active_report_id', String(rep.id));
      } else {
        sessionStorage.removeItem('gharplate_active_report_id');
      }
    } catch {
      // ignore storage errors
    }
  };

  const loadReportsAndTrends = async () => {
    setLoadingReports(true);
    try {
      const [reps, trs, symHist] = await Promise.all([
        api.getHealthReports(activeMember?.id),
        api.getHealthReportTrends(activeMember?.id),
        api.getSymptomReviewHistory(activeMember?.id),
      ]);
      setConfirmedReports(reps || []);
      if (reps && reps.length > 0 && !activeConfirmedReport) {
        let restored: Record<string, any> | undefined;
        try {
          const savedId = sessionStorage.getItem('gharplate_active_report_id');
          if (savedId) {
            restored = reps.find((r: any) => String(r.id) === savedId);
          }
        } catch {
          // ignore
        }
        selectConfirmedReport(restored || reps[0]);
      }
      setTrendsData(trs || null);
      if (trs?.series?.length > 0 && !selectedTrendKey) {
        setSelectedTrendKey(`${trs.series[0].canonical_code}::${trs.series[0].unit}`);
      }
      setSymptomHistory(symHist || []);
    } catch {
      // ignore initial load error
    } finally {
      setLoadingReports(false);
    }
  };

  useEffect(() => {
    setActiveConfirmedReport(null);
    void loadReportsAndTrends();
  }, [activeMember?.id]);

  // Publish active context for Ask GharPlate AI Assistant
  useEffect(() => {
    if (activeTab === 'symptoms' && symptomResult) {
      publishAssistantContext({
        route: location.pathname,
        page_type: 'symptom_review',
        selected_entity: {
          type: 'symptom_review',
          id: String(symptomResult.session_id || 'latest'),
          name: `Symptom Review: ${symptomResult.urgency_label || 'Care Guidance'}`,
          summary: symptomResult.educational_overview,
        },
        symptom_review_context: symptomResult,
      });
    } else if (activeConfirmedReport) {
      publishAssistantContext({
        route: location.pathname,
        page_type: 'health_report',
        selected_entity: {
          type: 'health_report',
          id: String(activeConfirmedReport.id),
          name: activeConfirmedReport.report_title || 'Confirmed Health Report',
          summary: activeConfirmedReport.overall_summary,
        },
        health_report_context: activeConfirmedReport,
      });
    }
  }, [activeTab, activeConfirmedReport, symptomResult, location.pathname]);

  const handleSelectFile = (file: File | null) => {
    setExtractError(null);
    if (!file) {
      setSelectedFile(null);
      if (filePreviewUrl && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl(null);
      return;
    }
    const allowedExts = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
    const lowerName = file.name.toLowerCase();
    if (!allowedExts.some((ext) => lowerName.endsWith(ext))) {
      setExtractError(
        `Unsupported file format (${file.name}). Please upload a PDF (.pdf) or image (.jpg, .jpeg, .png, .webp).`
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setExtractError('File exceeds the 10 MB maximum upload size.');
      return;
    }
    setSelectedFile(file);
    if (filePreviewUrl && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(filePreviewUrl);
    }
    if (file.type.startsWith('image/') && typeof URL.createObjectURL === 'function') {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
    if (!reportTitleInput || reportTitleInput === 'Comprehensive Blood & Metabolic Report') {
      setReportTitleInput(file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const handleAnalyseUploadedFile = async () => {
    if (!selectedFile) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await api.extractHealthReportFile(selectedFile, {
        member_id: activeMember?.id,
        report_title: reportTitleInput,
        report_type: reportTypeInput,
      });
      const rows = res.extracted_measurements || res.measurements || [];
      setExtractionPreview(res);
      setEditableMeasurements(rows);
      if (res.laboratory_name) setLaboratoryNameInput(res.laboratory_name);
      if (res.report_date) setReportDateInput(res.report_date);
      if (
        rows.length === 0 ||
        res.extraction_status === 'ocr_text_unavailable' ||
        res.extraction_status === 'no_structured_tests_found' ||
        res.extraction_status === 'extraction_failed' ||
        res.extraction_diagnostics?.final_api_status === 'extraction_failed'
      ) {
        setExtractError(
          res.extraction_error_message ||
            'Could not extract structured laboratory measurements from this file. Please retry with a clearer image or PDF, paste the laboratory text, or enter values manually.'
        );
      }
    } catch (err: any) {
      setExtractError(err?.message || 'Failed to extract health report.');
    } finally {
      setExtracting(false);
    }
  };

  const handleAnalyseReportText = async (textToParse: string, titleOverride?: string) => {
    if (!textToParse.trim()) {
      setExtractError('Please enter or load report text to analyse.');
      return;
    }
    setExtracting(true);
    setExtractError(null);
    try {
      const res = await api.extractHealthReportText({
        member_id: activeMember?.id,
        raw_report_text: textToParse,
        report_title: titleOverride || reportTitleInput || 'Clinical Lab Report',
        report_type: reportTypeInput,
        laboratory_name: laboratoryNameInput || 'Apollo / Metropolis Diagnostics',
        report_date: reportDateInput,
      });
      const rows = res.extracted_measurements || res.measurements || [];
      setExtractionPreview(res);
      setEditableMeasurements(rows);
      if (res.laboratory_name) setLaboratoryNameInput(res.laboratory_name);
      if (res.report_date) setReportDateInput(res.report_date);
      if (
        rows.length === 0 ||
        res.extraction_status === 'no_structured_tests_found' ||
        res.extraction_status === 'extraction_failed'
      ) {
        setExtractError(
          res.extraction_error_message ||
            'No recognizable laboratory test rows were found in the provided text. Please check the format or add rows manually.'
        );
      }
    } catch (err: any) {
      setExtractError(err?.message || 'Failed to extract report text.');
    } finally {
      setExtracting(false);
    }
  };

  const handleUpdateMeasurementField = (
    idx: number,
    field: string,
    value: string | number | null
  ) => {
    setEditableMeasurements((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const updated: Record<string, any> = { ...row, [field]: value };
        if (field === 'measured_value') {
          updated.result_value = value;
          updated.requires_manual_review = false;
        }
        if (field === 'reference_low') updated.reference_min = value;
        if (field === 'reference_high') updated.reference_max = value;
        const recomputed = recomputeClientMeasurementStatus(updated);
        updated.status_flag = recomputed.status_flag;
        updated.range_status = recomputed.range_status;
        updated.status_label = recomputed.status_label;
        return updated;
      })
    );
  };

  const handleRemoveMeasurementRow = (idx: number) => {
    setEditableMeasurements((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddBlankMeasurementRow = () => {
    setEditableMeasurements((prev) => [
      ...prev,
      {
        canonical_code: 'custom_marker',
        panel_code: 'general',
        test_name: 'Custom Lab Test',
        measured_value: 0,
        unit: 'mg/dL',
        reference_low: null,
        reference_high: null,
        reference_range_text: '',
        status_flag: 'reference_unavailable',
        status_label: 'Reference interval unavailable',
        confidence_score: 1.0,
      },
    ]);
  };

  const handleConfirmAndSaveReport = async () => {
    if (editableMeasurements.length === 0) {
      setExtractError('Please include at least one verified measurement row before saving.');
      return;
    }
    setConfirmingSave(true);
    setExtractError(null);
    try {
      const saved = await api.confirmHealthReport({
        member_id: activeMember?.id,
        user_confirmed: true,
        report_title: reportTitleInput || 'Confirmed Lab Report',
        report_type: reportTypeInput,
        laboratory_name: laboratoryNameInput || null,
        report_date: reportDateInput,
        source_file_name: extractionPreview?.file_name || selectedFile?.name || 'lab-report.pdf',
        source_mime_type: extractionPreview?.mime_type || selectedFile?.type || 'application/pdf',
        file_size_bytes: extractionPreview?.file_size_bytes || selectedFile?.size || null,
        page_count: extractionPreview?.page_count || 1,
        extraction_method: extractionPreview?.extraction_method || 'user_verified_report',
        extraction_confidence: extractionPreview?.extraction_confidence || 0.95,
        measurements: editableMeasurements,
      });
      selectConfirmedReport(saved);
      setExtractionPreview(null);
      setShowAllTestResults(false);
      await loadReportsAndTrends();
    } catch (err: any) {
      setExtractError(err?.message || 'Could not save confirmed health report.');
    } finally {
      setConfirmingSave(false);
    }
  };

  const handleDeleteSavedReport = async (reportId: number) => {
    try {
      await api.deleteHealthReport(reportId, activeMember?.id);
      if (activeConfirmedReport?.id === reportId) {
        selectConfirmedReport(null);
      }
      await loadReportsAndTrends();
    } catch {
      // ignore
    }
  };

  const handleConfirmAddFoodToTracker = async () => {
    if (!pendingTrackerFood) return;
    setLoggingTrackerFood(true);
    setTrackerFoodBanner(null);
    try {
      await api.addDailyFoodLog({
        member_id: activeMember?.id,
        food_slug: pendingTrackerFood.slug,
        food_name: pendingTrackerFood.name_en,
        quantity: pendingTrackerFood.quantity,
        unit_name: 'standard_serving',
        meal_category: pendingTrackerFood.meal_category,
        notes: `Added from Blood Report Recommendation (${activeConfirmedReport?.report_title || 'Health Report'})`,
      });
      setTrackerFoodBanner(
        `Added ${pendingTrackerFood.quantity} × ${pendingTrackerFood.standard_serving_name} of ${pendingTrackerFood.name_en} to your Daily Tracker (${pendingTrackerFood.meal_category}).`
      );
      setPendingTrackerFood(null);
    } catch (err: any) {
      setExtractError(err?.message || 'Could not log food to Daily Tracker.');
    } finally {
      setLoggingTrackerFood(false);
    }
  };

  // ==========================================
  // PART B — SYMPTOM REVIEW HANDLERS
  // ==========================================
  const handleRunSymptomReview = async (overrideDesc?: string) => {
    const desc = (overrideDesc !== undefined ? overrideDesc : symptomDescription).trim();
    if (!desc) return;
    setEvaluatingSymptoms(true);
    try {
      const res = await api.evaluateSymptomReview({
        member_id: activeMember?.id,
        symptom_description: desc,
        onset: symptomOnset,
        duration: symptomDuration,
        severity: symptomSeverity,
        pattern_triggers: symptomPattern,
        additional_context: symptomContextNotes,
        include_health_records_consent: includeRecordsConsent,
      });
      setSymptomResult(res);
      const hist = await api.getSymptomReviewHistory(activeMember?.id);
      setSymptomHistory(hist || []);
    } catch {
      // ignore
    } finally {
      setEvaluatingSymptoms(false);
    }
  };

  const handleVoiceSymptomCapture = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSymptomDescription((prev) =>
        prev
          ? prev
          : 'I have been feeling tired and dizzy in the afternoon for the past week.'
      );
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = 'en-IN';
      rec.interimResults = false;
      setVoiceListening(true);
      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setSymptomDescription((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
        setVoiceListening(false);
      };
      rec.onerror = () => setVoiceListening(false);
      rec.onend = () => setVoiceListening(false);
      rec.start();
    } catch {
      setVoiceListening(false);
    }
  };

  const activeTrendSeries = useMemo(() => {
    const list: Record<string, any>[] = trendsData?.series || [];
    if (!list.length) return null;
    return (
      list.find((s) => `${s.canonical_code}::${s.unit}` === selectedTrendKey) || list[0]
    );
  }, [trendsData, selectedTrendKey]);

  // Derived summary metrics for activeConfirmedReport
  const confirmedAttentionMeasurements = useMemo(() => {
    if (!activeConfirmedReport) return [];
    if (Array.isArray(activeConfirmedReport.attention_results)) {
      return activeConfirmedReport.attention_results;
    }
    return (activeConfirmedReport.measurements || []).filter((m: any) =>
      [
        'low',
        'high',
        'below_reference',
        'above_reference',
        'lab_flagged_abnormal',
        'requires_manual_review',
        'critical_attention',
      ].includes(m.status_flag || m.range_status)
    );
  }, [activeConfirmedReport]);

  const confirmedNutritionalConcerns = useMemo(() => {
    if (!activeConfirmedReport) return [];
    return (
      activeConfirmedReport.possible_nutritional_concerns ||
      activeConfirmedReport.summary?.possible_nutritional_concerns ||
      []
    );
  }, [activeConfirmedReport]);

  /**
   * Groups `marker_food_cards` by underlying Nutritional Priority (e.g. Iron-related food options,
   * Vitamin B12-related food options, Vitamin D & calcium-related food options, Dietary fibre & glycaemic balance food options)
   * and deduplicates food items by their stable food ID (`slug`) so the same food is never displayed
   * as a repeated card across the report. If a food is relevant to multiple priorities, its relevance labels
   * and supporting markers are combined cleanly on its single card and detail view.
   */
  const deduplicatedPriorityGroups = useMemo(() => {
    const rawCards: Record<string, any>[] =
      activeConfirmedReport?.lab_to_plate?.marker_food_cards || [];
    if (rawCards.length === 0) return [];

    // 1. Collect all relevance labels and supporting test names for each food slug across the entire report
    const globalFoodRelevance = new Map<
      string,
      {
        labels: string[];
        supportingTests: string[];
        reasons: string[];
      }
    >();

    const groupMap = new Map<
      string,
      {
        meta: PriorityGroupMeta;
        supportingMarkers: string[];
        educationalNotes: string[];
        foodsToModerate: string[];
        linkedConditionCode: string | null;
        candidateFoods: Map<string, Record<string, any>>;
      }
    >();

    for (const card of rawCards) {
      const meta = getPriorityGroupMetaForMarker(
        card.canonical_code,
        card.focus_nutrient_label
      );
      if (!groupMap.has(meta.priorityKey)) {
        groupMap.set(meta.priorityKey, {
          meta,
          supportingMarkers: [],
          educationalNotes: [],
          foodsToModerate: [],
          linkedConditionCode: card.linked_condition_code || null,
          candidateFoods: new Map(),
        });
      }
      const grp = groupMap.get(meta.priorityKey)!;
      const markerSummary = `${card.test_name} (${card.measured_value} ${card.unit || ''})`;
      if (!grp.supportingMarkers.includes(markerSummary)) {
        grp.supportingMarkers.push(markerSummary);
      }
      if (
        card.educational_explanation &&
        !grp.educationalNotes.includes(card.educational_explanation)
      ) {
        grp.educationalNotes.push(card.educational_explanation);
      }
      for (const modItem of card.foods_to_moderate || []) {
        if (!grp.foodsToModerate.includes(modItem)) {
          grp.foodsToModerate.push(modItem);
        }
      }
      if (!grp.linkedConditionCode && card.linked_condition_code) {
        grp.linkedConditionCode = card.linked_condition_code;
      }

      for (const f of card.recommended_foods || []) {
        if (!f || !f.slug) continue;
        const relLabel = deriveConciseRelevanceLabel(f, meta.defaultRelevanceLabel);
        if (!globalFoodRelevance.has(f.slug)) {
          globalFoodRelevance.set(f.slug, {
            labels: [],
            supportingTests: [],
            reasons: [],
          });
        }
        const gEntry = globalFoodRelevance.get(f.slug)!;
        if (!gEntry.labels.includes(relLabel)) {
          gEntry.labels.push(relLabel);
        }
        if (card.test_name && !gEntry.supportingTests.includes(card.test_name)) {
          gEntry.supportingTests.push(card.test_name);
        }
        if (f.short_reason && !gEntry.reasons.includes(f.short_reason)) {
          gEntry.reasons.push(f.short_reason);
        }

        if (!grp.candidateFoods.has(f.slug)) {
          grp.candidateFoods.set(f.slug, f);
        }
      }
    }

    // 2. Assign each unique food slug once across priority groups (ordered by specificity first so smaller
    //    pools like Vitamin B12 / Vitamin D / Folate keep their dedicated foods, then Iron / Glucose / Lipid)
    const sortedForAssignment = Array.from(groupMap.values()).sort(
      (a, b) => a.meta.specificityOrder - b.meta.specificityOrder
    );
    const assignedSlugs = new Set<string>();
    const assignedFoodsByGroup = new Map<string, Record<string, any>[]>();

    for (const grp of sortedForAssignment) {
      const uniqueFoodsForGroup: Record<string, any>[] = [];
      for (const [slug, fObj] of grp.candidateFoods.entries()) {
        if (assignedSlugs.has(slug)) continue;
        assignedSlugs.add(slug);
        const gRel = globalFoodRelevance.get(slug);
        const primaryLabel = deriveConciseRelevanceLabel(
          fObj,
          grp.meta.defaultRelevanceLabel
        );
        const allLabels = gRel?.labels || [primaryLabel];
        const orderedLabels = [
          primaryLabel,
          ...allLabels.filter((l) => l !== primaryLabel),
        ];
        uniqueFoodsForGroup.push({
          ...fObj,
          concise_relevance_label: orderedLabels.slice(0, 2).join(' • '),
          all_relevance_labels: orderedLabels,
          supporting_tests: gRel?.supportingTests || grp.supportingMarkers,
          combined_reasons: gRel?.reasons || [fObj.short_reason].filter(Boolean),
        });
      }
      assignedFoodsByGroup.set(grp.meta.priorityKey, uniqueFoodsForGroup);
    }

    // Preserve natural display order of groups (Iron -> Vitamin B12 -> Vitamin D -> Folate -> Glycaemic -> Lipid -> Others)
    const displayOrder: Record<string, number> = {
      iron_options: 1,
      vitamin_b12_options: 2,
      vitamin_d_options: 3,
      folate_options: 4,
      glycaemic_fibre_options: 5,
      lipid_fibre_options: 6,
      liver_support_options: 7,
      thyroid_support_options: 8,
    };

    return Array.from(groupMap.values())
      .map((grp) => ({
        priorityKey: grp.meta.priorityKey,
        title: grp.meta.title,
        supportingMarkers: grp.supportingMarkers,
        educationalNote: grp.educationalNotes[0] || '',
        foodsToModerate: grp.foodsToModerate,
        linkedConditionCode: grp.linkedConditionCode,
        foods: assignedFoodsByGroup.get(grp.meta.priorityKey) || [],
      }))
      .filter((g) => g.foods.length > 0 || g.educationalNote)
      .sort(
        (a, b) =>
          (displayOrder[a.priorityKey] ?? 99) - (displayOrder[b.priorityKey] ?? 99)
      );
  }, [activeConfirmedReport]);

  return (
    <div className="w-full space-y-6 animate-gp-reveal" data-testid="health-reports-symptoms-page">
      {/* Page Hero Banner */}
      <section className="gp-hero-surface rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-900/10 px-3 py-1 text-xs font-extrabold text-[#087153]">
              <span>🧪</span>
              <span>Blood Report Analysis • Personalised Indian Food Recommendations • AI Symptom Review</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172b23]">
              {activeTab === 'symptoms'
                ? 'AI Symptom Review & Care Guidance'
                : 'Health Reports & Lab-to-Plate Nutrition Intelligence'}
            </h1>
            <p className="text-sm text-[#566960] leading-relaxed">
              Upload laboratory PDFs or photos, inspect abnormal indicators and reference intervals,
              verify extracted values before saving, and receive personalised Indian food
              recommendations grounded in{' '}
              <span className="font-bold text-[#172b23]">ICMR-NIN IFCT 2017</span> &amp;{' '}
              <span className="font-bold text-[#172b23]">DGI 2024</span>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              data-testid="tab-btn-health-reports"
              onClick={() => {
                setActiveTab('reports');
                setSearchParams({ tab: 'reports' });
              }}
              className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
                activeTab === 'reports'
                  ? 'bg-[#087153] text-white shadow-sm'
                  : 'bg-white text-[#172b23] border border-emerald-900/15 hover:bg-emerald-50'
              }`}
            >
              🧪 Lab Reports &amp; Lab-to-Plate
            </button>
            <button
              type="button"
              data-testid="tab-btn-lab-trends"
              onClick={() => {
                setActiveTab('trends');
                setSearchParams({ tab: 'trends' });
              }}
              className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
                activeTab === 'trends'
                  ? 'bg-[#087153] text-white shadow-sm'
                  : 'bg-white text-[#172b23] border border-emerald-900/15 hover:bg-emerald-50'
              }`}
            >
              📈 Lab History &amp; Trends
            </button>
            <button
              type="button"
              data-testid="tab-btn-symptom-review"
              onClick={() => {
                setActiveTab('symptoms');
                setSearchParams({ tab: 'symptoms' });
              }}
              className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition ${
                activeTab === 'symptoms'
                  ? 'bg-[#087153] text-white shadow-sm'
                  : 'bg-white text-[#172b23] border border-emerald-900/15 hover:bg-emerald-50'
              }`}
            >
              🩺 AI Symptom Review
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* TAB 1: HEALTH REPORTS UPLOAD, CONFIRMATION & LAB-TO-PLATE             */}
      {/* ===================================================================== */}
      {activeTab === 'reports' && (
        <div className="w-full space-y-6">
          {/* Upload & Extraction Card */}
          <section
            data-testid="health-report-upload-card"
            className="gp-surface-elevated rounded-3xl p-6 space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-900/10 pb-4">
              <div>
                <h2 className="text-lg font-extrabold text-[#172b23]">
                  1. Upload or Load a Medical / Laboratory Report
                </h2>
                <p className="text-xs text-[#566960]">
                  Supports PDF (`.pdf`, up to 15 pages, ≤ 10 MB) and lab images (`.jpg`, `.jpeg`,
                  `.png`, `.webp`). Inspects both text and visual formatting (bold/dark text, H/L
                  flags, arrows, asterisks, and printed reference intervals). Nothing is saved
                  until you confirm.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="load-sample-lab-report-btn"
                  onClick={() => {
                    setReportTitleInput('Sample Comprehensive Blood & Metabolic Report');
                    setLaboratoryNameInput('Apollo / Metropolis Clinical Diagnostics');
                    setRawTextFallback(SAMPLE_LAB_REPORT_TEXT);
                    void handleAnalyseReportText(
                      SAMPLE_LAB_REPORT_TEXT,
                      'Sample Comprehensive Blood & Metabolic Report'
                    );
                  }}
                  className="rounded-xl border border-emerald-800/25 bg-[#e8f2e9] px-3.5 py-2 text-xs font-extrabold text-[#064d3c] hover:bg-emerald-100 transition"
                >
                  ✨ Load &amp; Analyse Sample Lab Report
                </button>
                <button
                  type="button"
                  onClick={() => setShowTextPasteBox((prev) => !prev)}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-[#172b23] hover:bg-stone-50 transition"
                >
                  {showTextPasteBox ? 'Hide Text Input' : 'Paste Lab Text Manually'}
                </button>
              </div>
            </div>

            {/* Metadata Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#566960] mb-1">
                  Report Title
                </label>
                <input
                  type="text"
                  value={reportTitleInput}
                  onChange={(e) => setReportTitleInput(e.target.value)}
                  placeholder="e.g., Annual Blood & Vitamin Panel"
                  className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs font-semibold text-[#172b23]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#566960] mb-1">
                  Report Panel Type
                </label>
                <select
                  aria-label="Report Panel Type"
                  value={reportTypeInput}
                  onChange={(e) => setReportTypeInput(e.target.value)}
                  className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs font-semibold text-[#172b23]"
                >
                  {REPORT_TYPES.map((rt) => (
                    <option key={rt.value} value={rt.value}>
                      {rt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#566960] mb-1">
                  Laboratory / Hospital Name (Optional)
                </label>
                <input
                  type="text"
                  value={laboratoryNameInput}
                  onChange={(e) => setLaboratoryNameInput(e.target.value)}
                  placeholder="e.g., Metropolis / Thyrocare / Apollo"
                  className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs font-semibold text-[#172b23]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#566960] mb-1">
                  Report Date
                </label>
                <input
                  type="date"
                  value={reportDateInput}
                  onChange={(e) => setReportDateInput(e.target.value)}
                  className="w-full rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs font-semibold text-[#172b23]"
                />
              </div>
            </div>

            {/* Hidden Native File Inputs */}
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              data-testid="health-report-pdf-input"
              className="hidden"
              onChange={(e) => handleSelectFile(e.target.files?.[0] || null)}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              data-testid="health-report-image-input"
              className="hidden"
              onChange={(e) => handleSelectFile(e.target.files?.[0] || null)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleSelectFile(e.target.files?.[0] || null)}
            />

            {/* Drag & Drop Zone + Upload Buttons */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  handleSelectFile(e.dataTransfer.files[0]);
                }
              }}
              className="rounded-2xl border-2 border-dashed border-emerald-800/25 bg-[#f7fbf7] p-5 text-center space-y-3"
            >
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <button
                  type="button"
                  data-testid="select-pdf-report-btn"
                  onClick={() => pdfInputRef.current?.click()}
                  className="rounded-xl bg-[#087153] px-4 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-[#064d3c] transition"
                >
                  📄 Select PDF Report
                </button>
                <button
                  type="button"
                  data-testid="select-image-report-btn"
                  onClick={() => imageInputRef.current?.click()}
                  className="rounded-xl border border-emerald-800/25 bg-white px-4 py-2.5 text-xs font-extrabold text-[#172b23] hover:bg-emerald-50 transition"
                >
                  🖼️ Select Report Image
                </button>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="rounded-xl border border-emerald-800/25 bg-white px-4 py-2.5 text-xs font-extrabold text-[#172b23] hover:bg-emerald-50 transition"
                >
                  📷 Camera Photo
                </button>
              </div>
              <p className="text-xs text-[#566960]">
                Or drag and drop a laboratory PDF (`.pdf`) or image (`.jpg`, `.png`, `.webp`) here
              </p>

              {/* Selected File Preview & Controls */}
              {selectedFile && (
                <div
                  data-testid="selected-report-file-card"
                  className="mx-auto max-w-xl rounded-2xl border border-emerald-900/15 bg-white p-4 text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {filePreviewUrl ? (
                      <img
                        src={filePreviewUrl}
                        alt="Report preview"
                        className="h-14 w-14 rounded-xl object-cover border border-stone-200 shrink-0"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-lg font-bold text-[#087153] shrink-0">
                        PDF
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-[#172b23] truncate">
                        {selectedFile.name}
                      </div>
                      <div className="text-[11px] text-[#566960]">
                        {(selectedFile.size / 1024).toFixed(1)} KB •{' '}
                        {selectedFile.type || 'Document'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      data-testid="analyse-report-file-btn"
                      disabled={extracting}
                      onClick={() => void handleAnalyseUploadedFile()}
                      className="rounded-xl bg-[#087153] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[#064d3c] disabled:opacity-50 transition"
                    >
                      {extracting ? 'Analysing...' : '🔬 Analyse Report'}
                    </button>
                    <button
                      type="button"
                      onClick={() => pdfInputRef.current?.click()}
                      className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#172b23] hover:bg-stone-50"
                    >
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectFile(null)}
                      className="rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Optional Paste Lab Text Box */}
            {showTextPasteBox && (
              <div className="rounded-2xl border border-emerald-900/15 bg-white p-4 space-y-3">
                <label className="block text-xs font-extrabold text-[#172b23]">
                  Paste Laboratory Report Text (for quick testing or copied portal results)
                </label>
                <textarea
                  rows={6}
                  data-testid="raw-report-text-input"
                  value={rawTextFallback}
                  onChange={(e) => setRawTextFallback(e.target.value)}
                  placeholder="Example: Haemoglobin: 11.2 g/dL L (12.0 - 16.0)&#10;HbA1c: 6.2 % ↑ (4.0 - 5.6)&#10;Vitamin B12: 175 pg/mL L (200 - 900)"
                  className="w-full rounded-xl border border-stone-300 p-3 text-xs font-mono text-[#172b23]"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="analyse-report-text-btn"
                    disabled={extracting}
                    onClick={() => void handleAnalyseReportText(rawTextFallback)}
                    className="rounded-xl bg-[#087153] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#064d3c]"
                  >
                    {extracting ? 'Extracting...' : '🔬 Extract Structured Lab Values'}
                  </button>
                </div>
              </div>
            )}

            {extractError && (
              <div
                role="alert"
                data-testid="report-extract-error"
                className="rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-bold text-rose-900"
              >
                ⚠️ {extractError}
              </div>
            )}
          </section>

          {/* ================================================================= */}
          {/* STEP 2: MANDATORY VALIDATION & CONFIRMATION SCREEN BEFORE SAVING   */}
          {/* ================================================================= */}
          {extractionPreview && (
            <section
              data-testid="health-report-confirmation-card"
              className={`gp-surface-elevated rounded-3xl p-6 space-y-5 border-2 ${
                editableMeasurements.length === 0
                  ? 'border-rose-400/80 bg-rose-50/30'
                  : 'border-amber-400/70'
              }`}
            >
              {editableMeasurements.length === 0 ? (
                <div data-testid="extraction-failure-banner" className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-rose-900/10 pb-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-[11px] font-extrabold text-rose-900">
                        ⚠️ Laboratory Extraction Incomplete — Manual Action or Clearer Scan Needed
                      </span>
                      <h2 className="mt-1.5 text-lg font-extrabold text-[#172b23]">
                        Could Not Automatically Extract Structured Laboratory Rows
                      </h2>
                      <p className="text-xs text-[#566960] mt-0.5">
                        {extractionPreview.extraction_error_message ||
                          extractError ||
                          'No readable laboratory test rows were matched from this file. Please upload a clearer image/PDF, paste the laboratory text, or enter values manually below.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {selectedFile && (
                        <button
                          type="button"
                          data-testid="retry-report-analysis-btn"
                          disabled={extracting}
                          onClick={() => void handleAnalyseUploadedFile()}
                          className="rounded-xl bg-[#087153] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[#064d3c] disabled:opacity-50"
                        >
                          🔄 Retry Analysis
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowTextPasteBox(true)}
                        className="rounded-xl border border-emerald-900/20 bg-white px-3.5 py-2 text-xs font-bold text-[#172b23] hover:bg-emerald-50"
                      >
                        📋 Paste Lab Text
                      </button>
                      <button
                        type="button"
                        data-testid="enter-values-manually-btn"
                        onClick={() => {
                          setExtractError(null);
                          handleAddBlankMeasurementRow();
                        }}
                        className="rounded-xl border border-emerald-800/25 bg-[#e8f2e9] px-3.5 py-2 text-xs font-extrabold text-[#064d3c] hover:bg-emerald-100"
                      >
                        ✍️ Enter Values Manually
                      </button>
                    </div>
                  </div>

                  {extractionPreview.extraction_diagnostics && (
                    <div
                      data-testid="extraction-diagnostics-summary"
                      className="rounded-2xl border border-stone-200 bg-white p-3.5 text-[11px] text-[#566960] flex flex-wrap items-center gap-3"
                    >
                      <span className="font-extrabold text-[#172b23]">Diagnostics:</span>
                      <span>
                        Engine:{' '}
                        <strong>
                          {extractionPreview.extraction_diagnostics.ocr_engine_used ||
                            extractionPreview.extraction_method}
                        </strong>
                      </span>
                      <span>
                        Text Extracted:{' '}
                        <strong>
                          {extractionPreview.extraction_diagnostics.text_extracted ? 'Yes' : 'No'}
                        </strong>
                      </span>
                      <span>
                        Candidate Lines:{' '}
                        <strong>
                          {extractionPreview.extraction_diagnostics.candidate_rows_detected ?? 0}
                        </strong>
                      </span>
                      <span>
                        Valid Rows:{' '}
                        <strong>
                          {extractionPreview.extraction_diagnostics.valid_structured_rows ?? 0}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-900/10 pb-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-extrabold text-amber-950">
                        🛡️ Step 2 — Mandatory Review &amp; Confirmation Before Saving
                      </span>
                      <h2 className="mt-1.5 text-lg font-extrabold text-[#172b23]">
                        Verify Extracted Laboratory Values ({editableMeasurements.length} markers
                        detected)
                      </h2>
                      <p className="text-xs text-[#566960]">
                        Compare each extracted test name, numeric value, unit, lab flag, and printed
                        reference interval against your original report. Uncertain OCR values or flag
                        conflicts are highlighted for manual correction before saving.
                      </p>
                      {extractionPreview.extraction_diagnostics && (
                        <div
                          data-testid="extraction-diagnostics-summary"
                          className="mt-1.5 inline-flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50/90 border border-emerald-900/10 px-2.5 py-1 text-[11px] font-semibold text-[#064d3c]"
                        >
                          <span>
                            OCR / Parser:{' '}
                            <strong>
                              {extractionPreview.extraction_diagnostics.ocr_engine_used ||
                                extractionPreview.extraction_method}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            <strong>{editableMeasurements.length}</strong> structured rows extracted
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleAddBlankMeasurementRow}
                        className="rounded-xl border border-emerald-900/20 bg-white px-3 py-2 text-xs font-bold text-[#172b23] hover:bg-emerald-50"
                      >
                        + Add Row
                      </button>
                      <button
                        type="button"
                        data-testid="confirm-save-health-report-btn"
                        disabled={confirmingSave}
                        onClick={() => void handleConfirmAndSaveReport()}
                        className="rounded-xl bg-[#087153] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-[#064d3c] disabled:opacity-50"
                      >
                        {confirmingSave
                          ? 'Saving Confirmed Report...'
                          : '✅ Confirm & Save Report to My Health'}
                      </button>
                    </div>
                  </div>

                  {/* Concise Abnormal-Result Summary Preview */}
                  {(() => {
                    const abnormalRows = editableMeasurements.filter((m) =>
                      [
                        'low',
                        'high',
                        'below_reference',
                        'above_reference',
                        'lab_flagged_abnormal',
                        'requires_manual_review',
                        'critical_attention',
                      ].includes(m.status_flag || m.range_status)
                    );
                    if (abnormalRows.length === 0) return null;
                    return (
                      <div
                        data-testid="extraction-abnormal-preview-summary"
                        className="rounded-2xl border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-950 space-y-1.5"
                      >
                        <div className="font-extrabold">
                          Abnormal / Attention Markers Detected ({abnormalRows.length} of{' '}
                          {editableMeasurements.length}):
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {abnormalRows.map((m, i) => (
                            <span
                              key={`${m.canonical_code}-abn-${i}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-white border border-amber-300 px-2 py-0.5 text-[11px] font-bold text-[#172b23]"
                            >
                              <span>{m.test_name}:</span>
                              <span className="font-black text-[#087153]">
                                {m.measured_value ?? m.result_value ?? 'Review'} {m.unit || ''}
                              </span>
                              <span className="text-[10px] text-amber-900">
                                ({m.status_label || STATUS_LABELS[m.status_flag] || m.status_flag})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {(extractionPreview.uncertainty_notes || extractionPreview.validation_warnings)
                    ?.length > 0 && (
                    <div
                      data-testid="extraction-review-warnings"
                      className="rounded-2xl border border-amber-300 bg-amber-50/90 p-3.5 text-xs text-amber-950 space-y-1"
                    >
                      <div className="font-extrabold">Extraction &amp; Reliability Review Notes:</div>
                      {(
                        extractionPreview.uncertainty_notes ||
                        extractionPreview.validation_warnings ||
                        []
                      ).map((n: string, idx: number) => (
                        <p key={idx}>• {n}</p>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-emerald-900/15 text-[11px] font-extrabold uppercase text-[#566960]">
                          <th className="py-2 pr-2">Test Name</th>
                          <th className="py-2 px-2">Measured Value</th>
                          <th className="py-2 px-2">Unit</th>
                          <th className="py-2 px-2">Ref Low</th>
                          <th className="py-2 px-2">Ref High</th>
                          <th className="py-2 px-2">Lab Flag / Visual</th>
                          <th className="py-2 px-2">Status Preview</th>
                          <th className="py-2 pl-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-900/10">
                        {editableMeasurements.map((m, idx) => (
                          <tr
                            key={`${m.canonical_code}-${idx}`}
                            data-testid={`confirm-row-${idx}`}
                            className={m.requires_manual_review ? 'bg-purple-50/60' : ''}
                          >
                            <td className="py-2 pr-2">
                              <input
                                type="text"
                                aria-label={`Test Name ${idx + 1}`}
                                value={m.test_name || ''}
                                onChange={(e) =>
                                  handleUpdateMeasurementField(idx, 'test_name', e.target.value)
                                }
                                className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-bold text-[#172b23]"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="number"
                                  step="any"
                                  aria-label={`Measured Value ${idx + 1}`}
                                  value={m.measured_value ?? m.result_value ?? ''}
                                  onChange={(e) =>
                                    handleUpdateMeasurementField(
                                      idx,
                                      'measured_value',
                                      e.target.value === '' ? null : Number(e.target.value)
                                    )
                                  }
                                  className="w-24 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-extrabold text-[#172b23]"
                                />
                                {m.proposed_correction != null && (
                                  <button
                                    type="button"
                                    data-testid={`apply-proposed-correction-${idx}`}
                                    onClick={() =>
                                      handleUpdateMeasurementField(
                                        idx,
                                        'measured_value',
                                        Number(m.proposed_correction)
                                      )
                                    }
                                    title="Apply suggested decimal correction"
                                    className="rounded-md bg-purple-100 border border-purple-300 px-2 py-1 text-[10px] font-extrabold text-purple-900 hover:bg-purple-200"
                                  >
                                    Use {m.proposed_correction}?
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                aria-label={`Unit ${idx + 1}`}
                                value={m.unit || ''}
                                onChange={(e) =>
                                  handleUpdateMeasurementField(idx, 'unit', e.target.value)
                                }
                                className="w-24 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 font-semibold text-[#172b23]"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="any"
                                aria-label={`Reference Low ${idx + 1}`}
                                value={m.reference_low ?? m.reference_min ?? ''}
                                onChange={(e) =>
                                  handleUpdateMeasurementField(
                                    idx,
                                    'reference_low',
                                    e.target.value === '' ? null : Number(e.target.value)
                                  )
                                }
                                className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[#566960]"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="number"
                                step="any"
                                aria-label={`Reference High ${idx + 1}`}
                                value={m.reference_high ?? m.reference_max ?? ''}
                                onChange={(e) =>
                                  handleUpdateMeasurementField(
                                    idx,
                                    'reference_high',
                                    e.target.value === '' ? null : Number(e.target.value)
                                  )
                                }
                                className="w-20 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-[#566960]"
                              />
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex flex-wrap gap-1">
                                {m.printed_flag && (
                                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-[#172b23]">
                                    Flag: {m.printed_flag}
                                  </span>
                                )}
                                {(m.visual_indicators || []).map((vi: string) => (
                                  <span
                                    key={vi}
                                    className="rounded bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900"
                                  >
                                    {vi.replace(/_/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <span
                                className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                  STATUS_BADGE_STYLES[m.status_flag] ||
                                  STATUS_BADGE_STYLES[m.range_status] ||
                                  STATUS_BADGE_STYLES.reference_unavailable
                                }`}
                              >
                                {m.status_label ||
                                  STATUS_LABELS[m.status_flag] ||
                                  STATUS_LABELS[m.range_status] ||
                                  m.status_flag}
                              </span>
                            </td>
                            <td className="py-2 pl-2 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveMeasurementRow(idx)}
                                className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          {/* ================================================================= */}
          {/* STEP 3: FULL-WIDTH BLOOD REPORT ANALYSIS & FOOD RECOMMENDATIONS   */}
          {/* ================================================================= */}
          {confirmedReports.length > 0 && (
            <div
              data-testid="confirmed-reports-fullwidth-workspace"
              className="w-full space-y-6"
            >
              {/* COMPACT HORIZONTAL SAVED REPORTS SELECTOR & COLLAPSIBLE DRAWER */}
              <section
                data-testid="saved-reports-compact-bar"
                className="gp-surface rounded-3xl p-4 sm:p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl bg-[#e8f2e9] text-sm text-[#087153]">
                      🗂️
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold text-[#172b23]">
                        Saved Reports ({confirmedReports.length})
                      </h3>
                      <p className="text-[11px] text-[#566960]">
                        Select a confirmed report below to inspect its analysis and food options
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    data-testid="toggle-saved-reports-drawer-btn"
                    onClick={() => setShowSavedReportsList((prev) => !prev)}
                    className="rounded-xl border border-emerald-900/15 bg-white px-3 py-1.5 text-xs font-extrabold text-[#087153] hover:bg-emerald-50 transition"
                  >
                    {showSavedReportsList
                      ? '▴ Hide Saved Reports'
                      : `▾ Manage Saved Reports (${confirmedReports.length})`}
                  </button>
                </div>

                {/* Horizontal Compact Report Selector Pills */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {confirmedReports.map((rep) => {
                    const isSel = activeConfirmedReport?.id === rep.id;
                    return (
                      <div
                        key={rep.id}
                        data-testid={`saved-report-card-${rep.id}`}
                        onClick={() => {
                          selectConfirmedReport(rep);
                          setShowAllTestResults(false);
                        }}
                        className={`group flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 transition cursor-pointer ${
                          isSel
                            ? 'border-[#087153] bg-[#e8f2e9]/95 shadow-2xs'
                            : 'border-emerald-900/12 bg-white hover:bg-emerald-50/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-[#172b23] truncate max-w-[260px]">
                            {rep.report_title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#566960]">
                            <span>{rep.report_date || 'Date not listed'}</span>
                            <span>•</span>
                            <span className="font-semibold text-[#087153]">
                              {rep.measurement_count} reviewed
                            </span>
                            <span>•</span>
                            <span className="font-bold text-amber-900">
                              {rep.results_requiring_attention ?? rep.flagged_count ?? 0} attention
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          aria-label={`Delete report ${rep.report_title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDeleteSavedReport(rep.id);
                          }}
                          className="rounded-lg px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-50 hover:underline shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                    );
                  })}
                </div>

                {showSavedReportsList && (
                  <div
                    data-testid="saved-reports-expanded-list"
                    className="pt-2 border-t border-emerald-900/10 text-xs text-[#566960] flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      Active report:{' '}
                      <strong className="text-[#172b23]">
                        {activeConfirmedReport?.report_title || 'None selected'}
                      </strong>{' '}
                      ({activeConfirmedReport?.laboratory_name || 'Clinical Lab'})
                    </span>
                    <span>Click any report card above to switch or click Delete to remove it.</span>
                  </div>
                )}
              </section>

              {activeConfirmedReport && (
                <>
                  {/* SECTION 1 — REPORT OVERVIEW & IMPORTANT RESULTS */}
                  <section
                    data-testid="active-confirmed-report-detail"
                    className="w-full gp-surface-elevated rounded-3xl p-6 space-y-6"
                  >
                    {/* Report Overview Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-emerald-900/10 pb-4">
                      <div>
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#087153]">
                          Report Overview • {activeConfirmedReport.report_date} •{' '}
                          {activeConfirmedReport.laboratory_name || 'Clinical Laboratory'}
                        </div>
                        <h2 className="mt-0.5 text-xl sm:text-2xl font-extrabold text-[#172b23]">
                          {activeConfirmedReport.report_title}
                        </h2>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2.5 text-xs">
                          <span
                            data-testid="report-measurements-reviewed-badge"
                            className="rounded-xl bg-[#e8f2e9] px-3 py-1 font-extrabold text-[#064d3c]"
                          >
                            Measurements reviewed: {activeConfirmedReport.measurement_count}
                          </span>
                          <span
                            data-testid="report-results-attention-badge"
                            className="rounded-xl bg-amber-100 px-3 py-1 font-extrabold text-amber-950"
                          >
                            Results requiring attention: {confirmedAttentionMeasurements.length}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid="report-ask-assistant-btn"
                        onClick={() =>
                          openAssistantWorkspace({
                            initialPrompt: `Which of my results in ${activeConfirmedReport.report_title} are below or above range, what possible nutritional concerns do they suggest, and which foods in GharPlate provide those nutrients?`,
                          })
                        }
                        className="gp-sidebar-ai-btn rounded-xl px-4 py-2.5 text-xs font-extrabold text-white shadow-sm shrink-0"
                      >
                        🤖 Ask GharPlate about my report
                      </button>
                    </div>

                    {/* Kidney Safety Alert if Triggered */}
                    {activeConfirmedReport.lab_to_plate?.kidney_safety_triggered && (
                      <div
                        role="alert"
                        data-testid="kidney-safety-guardrail-banner"
                        className="rounded-2xl border-2 border-red-500 bg-red-50 p-4 text-xs text-red-950 space-y-1.5"
                      >
                        <div className="font-black text-sm flex items-center gap-2">
                          <span>🚨</span>
                          <span>
                            Kidney &amp; Electrolyte Medical Review Notice (KDIGO 2024 / ICMR-NIN)
                          </span>
                        </div>
                        <p className="font-semibold leading-relaxed">
                          {activeConfirmedReport.lab_to_plate.kidney_safety_notice}
                        </p>
                      </div>
                    )}

                    {/* Important Results — Compact Table of Results Requiring Attention */}
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-base font-extrabold text-[#172b23]">
                          Important Results — Requiring Attention ({confirmedAttentionMeasurements.length})
                        </h3>
                        <button
                          type="button"
                          data-testid="toggle-view-all-test-results-btn"
                          onClick={() => setShowAllTestResults((prev) => !prev)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-[#f7fbf7] px-3.5 py-1.5 text-xs font-extrabold text-[#087153] hover:bg-emerald-50 transition"
                        >
                          <span>{showAllTestResults ? '▾' : '▸'}</span>
                          <span>
                            {showAllTestResults
                              ? `Hide All Test Results (${activeConfirmedReport.measurement_count})`
                              : `View All Test Results (${activeConfirmedReport.measurement_count})`}
                          </span>
                        </button>
                      </div>

                      {confirmedAttentionMeasurements.length === 0 ? (
                        <div className="rounded-2xl border border-emerald-900/12 bg-[#f7fbf7] p-4 text-xs font-semibold text-[#064d3c]">
                          All reviewed measurements with printed reference intervals are within the
                          laboratory reference range.
                        </div>
                      ) : (
                        <div className="overflow-x-auto rounded-2xl border border-emerald-900/12 bg-white">
                          <table
                            data-testid="attention-results-summary-table"
                            className="w-full text-left border-collapse text-xs"
                          >
                            <thead>
                              <tr className="border-b border-emerald-900/12 bg-[#f7fbf7] text-[11px] font-extrabold uppercase text-[#566960]">
                                <th className="py-3 px-4">Test Name</th>
                                <th className="py-3 px-4 text-right">Actual Result</th>
                                <th className="py-3 px-4">Laboratory Reference Interval</th>
                                <th className="py-3 px-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-emerald-900/10">
                              {confirmedAttentionMeasurements.map((m: any) => (
                                <tr
                                  key={m.id || m.canonical_code}
                                  className="hover:bg-emerald-50/30 transition"
                                >
                                  <td className="py-3 px-4 font-extrabold text-[#172b23]">
                                    {m.test_name}
                                  </td>
                                  <td className="py-3 px-4 text-right font-black text-[#087153] whitespace-nowrap">
                                    {m.measured_value ?? m.result_value ?? '—'} {m.unit || ''}
                                    {m.printed_flag &&
                                      !['Normal', 'within_reference'].includes(m.printed_flag) && (
                                        <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-[#172b23]">
                                          {m.printed_flag}
                                        </span>
                                      )}
                                  </td>
                                  <td className="py-3 px-4 text-[#566960] whitespace-nowrap">
                                    {m.reference_range_text || m.reference_text ? (
                                      `${m.reference_range_text || m.reference_text} ${m.unit || ''}`
                                    ) : (
                                      <span className="italic">Not listed</span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span
                                      className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${
                                        STATUS_BADGE_STYLES[m.status_flag] ||
                                        STATUS_BADGE_STYLES[m.range_status] ||
                                        STATUS_BADGE_STYLES.reference_unavailable
                                      }`}
                                    >
                                      {m.status_label ||
                                        STATUS_LABELS[m.status_flag] ||
                                        STATUS_LABELS[m.range_status] ||
                                        m.status_flag}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {showAllTestResults && (
                        <div
                          data-testid="all-test-results-expanded"
                          className="pt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                        >
                          {(activeConfirmedReport.measurements || []).map((m: any) => (
                            <div
                              key={m.id || m.canonical_code}
                              className="rounded-2xl border border-emerald-900/12 bg-white p-3.5 space-y-1.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-xs font-extrabold text-[#172b23]">
                                  {m.test_name}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                    STATUS_BADGE_STYLES[m.status_flag] ||
                                    STATUS_BADGE_STYLES[m.range_status] ||
                                    STATUS_BADGE_STYLES.reference_unavailable
                                  }`}
                                >
                                  {m.status_label ||
                                    STATUS_LABELS[m.status_flag] ||
                                    STATUS_LABELS[m.range_status] ||
                                    m.status_flag}
                                </span>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-base font-black text-[#087153]">
                                  {m.measured_value ?? m.result_value ?? '—'}
                                </span>
                                <span className="text-xs font-bold text-[#566960]">
                                  {m.unit || ''}
                                </span>
                                {(m.reference_range_text || m.reference_text) && (
                                  <span className="text-[11px] text-[#566960]">
                                    (Ref: {m.reference_range_text || m.reference_text})
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* SECTION 2 — NUTRITIONAL PRIORITIES (COMPACT, MEDICALLY CAUTIOUS) */}
                  {confirmedNutritionalConcerns.length > 0 && (
                    <section
                      data-testid="possible-nutritional-concerns-section"
                      className="w-full gp-surface-elevated rounded-3xl p-6 space-y-3.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                            Nutritional Priorities (Educational &amp; Non-Diagnostic)
                          </div>
                          <h3 className="text-base font-extrabold text-[#172b23]">
                            Possible Nutritional Concerns Supported by Your Results
                          </h3>
                        </div>
                        <span className="text-[11px] text-[#566960]">
                          Click Details on any priority to read clinical context
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {confirmedNutritionalConcerns.map((concern: any, idx: number) => {
                          const cKey = String(concern.concern_code || idx);
                          const isOpen = Boolean(expandedConcernDetails[cKey]);
                          return (
                            <div
                              key={cKey}
                              data-testid={`nutritional-priority-card-${cKey}`}
                              className="rounded-2xl border border-amber-200/90 bg-amber-50/45 p-4 flex flex-col justify-between gap-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-extrabold text-xs sm:text-sm text-[#172b23]">
                                  {concern.title}
                                </div>
                                <button
                                  type="button"
                                  data-testid={`toggle-concern-details-${cKey}`}
                                  onClick={() =>
                                    setExpandedConcernDetails((prev) => ({
                                      ...prev,
                                      [cKey]: !prev[cKey],
                                    }))
                                  }
                                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-950 hover:bg-amber-100 shrink-0 transition"
                                >
                                  {isOpen ? 'Hide details' : 'Details'}
                                </button>
                              </div>

                              {isOpen && (
                                <p
                                  data-testid={`concern-explanation-${cKey}`}
                                  className="text-xs text-[#566960] leading-relaxed border-t border-amber-200/70 pt-2"
                                >
                                  {concern.explanation}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* SECTION 3 — RECOMMENDED FOODS (DEDUPLICATED, IMAGE-LED, FULL-WIDTH GRID) */}
                  <section
                    data-testid="lab-to-plate-section"
                    className="w-full gp-surface-elevated rounded-3xl p-6 space-y-5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-900/10 pb-4">
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-extrabold text-[#064d3c]">
                          🥗 Recommended Foods (GharPlate Database)
                        </span>
                        <h3 className="mt-1.5 text-lg sm:text-xl font-extrabold text-[#172b23]">
                          Recommended Indian Foods by Nutritional Priority
                        </h3>
                        <p className="text-xs text-[#566960]">
                          Click any food card to inspect its complete nutritional composition,
                          serving size, data source, and Daily Tracker options.
                        </p>
                      </div>
                    </div>

                    {activeConfirmedReport.lab_to_plate?.allergy_cross_contact_warning && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50/90 px-3.5 py-2 text-xs font-semibold text-amber-950">
                        ⚠️ {activeConfirmedReport.lab_to_plate.allergy_cross_contact_warning}
                      </div>
                    )}

                    {trackerFoodBanner && (
                      <div
                        data-testid="report-food-logged-banner"
                        className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-[#064d3c] flex items-center justify-between gap-2"
                      >
                        <span>✅ {trackerFoodBanner}</span>
                        <Link
                          to="/fitness/tracker"
                          className="underline font-extrabold text-[#087153]"
                        >
                          Open Daily Tracker →
                        </Link>
                      </div>
                    )}

                    {/* Confirmation Box for "Add to Daily Tracker" */}
                    {pendingTrackerFood && (
                      <div
                        data-testid="confirm-add-to-tracker-card"
                        className="rounded-2xl border-2 border-[#087153] bg-[#e8f2e9]/90 p-4 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-extrabold text-[#172b23]">
                            Confirm Adding Food to Daily Tracker:{' '}
                            <span className="text-[#087153]">{pendingTrackerFood.name_en}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPendingTrackerFood(null)}
                            className="text-xs font-bold text-[#566960] hover:underline"
                          >
                            Cancel
                          </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[11px] font-bold text-[#566960] mb-1">
                              Meal
                            </label>
                            <select
                              aria-label="Meal Category"
                              value={pendingTrackerFood.meal_category}
                              onChange={(e) =>
                                setPendingTrackerFood({
                                  ...pendingTrackerFood,
                                  meal_category: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-emerald-900/20 bg-white px-2.5 py-1.5 font-bold text-[#172b23]"
                            >
                              <option value="breakfast">Breakfast</option>
                              <option value="lunch">Lunch</option>
                              <option value="snack">Snack</option>
                              <option value="dinner">Dinner</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-[#566960] mb-1">
                              Servings ({pendingTrackerFood.standard_serving_name})
                            </label>
                            <input
                              type="number"
                              min={0.25}
                              step={0.25}
                              value={pendingTrackerFood.quantity}
                              onChange={(e) =>
                                setPendingTrackerFood({
                                  ...pendingTrackerFood,
                                  quantity: Math.max(0.25, Number(e.target.value) || 1),
                                })
                              }
                              className="w-full rounded-lg border border-emerald-900/20 bg-white px-2.5 py-1.5 font-bold text-[#172b23]"
                            />
                          </div>
                          <div className="flex items-end">
                            <button
                              type="button"
                              data-testid="confirm-save-food-to-tracker-btn"
                              disabled={loggingTrackerFood}
                              onClick={() => void handleConfirmAddFoodToTracker()}
                              className="w-full rounded-xl bg-[#087153] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[#064d3c] disabled:opacity-50"
                            >
                              {loggingTrackerFood ? 'Saving...' : '✅ Confirm & Add to Tracker'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {deduplicatedPriorityGroups.length === 0 ? (
                      <p className="text-xs text-[#566960]">
                        All confirmed markers are within reference ranges or under renal clinician
                        precaution. Continue a balanced Indian thali with diverse dals, seasonal
                        greens, and whole grains.
                      </p>
                    ) : (
                      <div className="space-y-6">
                        {deduplicatedPriorityGroups.map((group) => {
                          const allFoods = group.foods;
                          const isExpanded = Boolean(
                            expandedFoodCardsByMarker[group.priorityKey]
                          );
                          const visibleFoods = isExpanded ? allFoods : allFoods.slice(0, 4);

                          return (
                            <div
                              key={group.priorityKey}
                              data-testid={`lab-to-plate-card-${group.priorityKey}`}
                              className="rounded-2xl border border-emerald-900/15 bg-[#f7fbf7] p-5 space-y-4"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                  <h4 className="text-base font-extrabold text-[#172b23]">
                                    {group.title}
                                  </h4>
                                  <div className="text-xs font-semibold text-[#566960]">
                                    Supporting results: {group.supportingMarkers.join(' • ')}
                                  </div>
                                </div>
                                {group.linkedConditionCode && (
                                  <Link
                                    to={`/conditions/${group.linkedConditionCode}`}
                                    className="rounded-xl border border-emerald-800/20 bg-white px-3 py-1.5 text-[11px] font-bold text-[#087153] hover:bg-emerald-50 shrink-0"
                                  >
                                    Condition Guidance →
                                  </Link>
                                )}
                              </div>

                              {visibleFoods.length > 0 && (
                                <div
                                  data-testid={`priority-food-grid-${group.priorityKey}`}
                                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
                                >
                                  {visibleFoods.map((f: any) => (
                                    <div
                                      key={f.slug}
                                      role="button"
                                      tabIndex={0}
                                      data-testid={`report-food-card-${f.slug}`}
                                      onClick={() => {
                                        setSelectedReportFoodDetail(f);
                                        setDetailBasisMode('serving');
                                        setDetailServingQty(1);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          setSelectedReportFoodDetail(f);
                                          setDetailBasisMode('serving');
                                          setDetailServingQty(1);
                                        }
                                      }}
                                      className="group cursor-pointer overflow-hidden rounded-2xl border border-emerald-900/12 bg-white shadow-2xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#087153] hover:shadow-md flex flex-col justify-between text-left"
                                    >
                                      <FoodImage
                                        src={f.image_url}
                                        foodName={f.name_en}
                                        foodSlug={f.slug}
                                        aspectClass="aspect-[16/10] w-full"
                                      />
                                      <div className="p-4 flex flex-1 flex-col justify-between gap-2.5">
                                        <div className="space-y-1">
                                          <div className="text-sm font-extrabold text-[#172b23] group-hover:text-[#087153] line-clamp-1">
                                            {f.name_en}
                                          </div>
                                          <div
                                            data-testid={`report-food-relevance-${f.slug}`}
                                            className="text-xs font-semibold text-[#087153]"
                                          >
                                            {f.concise_relevance_label}
                                          </div>
                                        </div>

                                        <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                                          <span
                                            data-testid={`view-food-details-link-${f.slug}`}
                                            className="text-xs font-extrabold text-[#087153] group-hover:translate-x-0.5 transition-transform"
                                          >
                                            View Details →
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {allFoods.length > 4 && (
                                <div>
                                  <button
                                    type="button"
                                    data-testid={`view-more-food-options-btn-${group.priorityKey}`}
                                    onClick={() =>
                                      setExpandedFoodCardsByMarker((prev) => ({
                                        ...prev,
                                        [group.priorityKey]: !prev[group.priorityKey],
                                      }))
                                    }
                                    className="rounded-xl border border-emerald-900/15 bg-white px-4 py-2 text-xs font-extrabold text-[#087153] hover:bg-emerald-50 transition"
                                  >
                                    {isExpanded
                                      ? 'Show Fewer Foods'
                                      : `View More Foods (${allFoods.length - 4} more)`}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {/* ================================================================= */}
          {/* INTERACTIVE FOOD DETAILS MODAL (OPENED ONLY ON CARD CLICK)        */}
          {/* ================================================================= */}
          {selectedReportFoodDetail && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Nutritional Details for ${selectedReportFoodDetail.name_en}`}
              data-testid="report-food-detail-modal"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
              onClick={() => setSelectedReportFoodDetail(null)}
            >
              <div
                className="w-full max-w-2xl rounded-3xl border border-emerald-900/20 bg-white shadow-2xl overflow-hidden my-8"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 bg-[#f7fbf7] border-b border-emerald-900/10">
                  <div className="sm:col-span-5">
                    <FoodImage
                      src={selectedReportFoodDetail.image_url}
                      foodName={selectedReportFoodDetail.name_en}
                      foodSlug={selectedReportFoodDetail.slug}
                      aspectClass="h-48 sm:h-full w-full"
                    />
                  </div>
                  <div className="sm:col-span-7 p-5 flex flex-col justify-between gap-3">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-[#064d3c]">
                          {selectedReportFoodDetail.concise_relevance_label || 'Nutrient source'}
                        </span>
                        <button
                          type="button"
                          data-testid="close-food-detail-modal-btn"
                          onClick={() => setSelectedReportFoodDetail(null)}
                          className="rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-xs font-bold text-[#172b23] hover:bg-stone-100"
                        >
                          ✕ Back to Report
                        </button>
                      </div>
                      <h3 className="mt-2 text-xl font-black text-[#172b23]">
                        {selectedReportFoodDetail.name_en}
                      </h3>
                      <p className="mt-1 text-xs text-[#566960]">
                        {(selectedReportFoodDetail.combined_reasons || []).join(' ') ||
                          selectedReportFoodDetail.short_reason}
                      </p>
                      {selectedReportFoodDetail.supporting_tests?.length > 0 && (
                        <div className="mt-2 text-[11px] text-[#087153] font-semibold">
                          Relevant to: {selectedReportFoodDetail.supporting_tests.join(', ')}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#566960] pt-2 border-t border-emerald-900/10">
                      <span>
                        Serving:{' '}
                        <strong className="text-[#172b23]">
                          {selectedReportFoodDetail.standard_serving_name} (
                          {selectedReportFoodDetail.standard_serving_grams || 100}g)
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Basis:{' '}
                        <strong className="text-[#172b23]">
                          {selectedReportFoodDetail.default_basis || '100g'}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-4">
                  {/* Serving vs Per 100g Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f7fbf7] p-3 border border-emerald-900/10 text-xs">
                    <div className="inline-flex rounded-xl bg-stone-200/80 p-1 font-extrabold">
                      <button
                        type="button"
                        data-testid="modal-basis-serving-btn"
                        onClick={() => setDetailBasisMode('serving')}
                        className={`rounded-lg px-3 py-1.5 transition ${
                          detailBasisMode === 'serving'
                            ? 'bg-[#087153] text-white shadow-2xs'
                            : 'text-[#172b23]'
                        }`}
                      >
                        Selected Serving (
                        {Math.round(
                          (selectedReportFoodDetail.standard_serving_grams || 100) *
                            detailServingQty
                        )}
                        g)
                      </button>
                      <button
                        type="button"
                        data-testid="modal-basis-100g-btn"
                        onClick={() => setDetailBasisMode('100g')}
                        className={`rounded-lg px-3 py-1.5 transition ${
                          detailBasisMode === '100g'
                            ? 'bg-[#087153] text-white shadow-2xs'
                            : 'text-[#172b23]'
                        }`}
                      >
                        Per {selectedReportFoodDetail.default_basis || '100g'}
                      </button>
                    </div>

                    {detailBasisMode === 'serving' && (
                      <div className="inline-flex items-center rounded-xl border border-stone-300 bg-white">
                        <button
                          type="button"
                          onClick={() => setDetailServingQty((q) => Math.max(0.5, q - 0.5))}
                          className="px-2.5 py-1 font-bold text-[#172b23] hover:bg-stone-100"
                        >
                          −
                        </button>
                        <span className="px-2.5 font-extrabold">
                          {detailServingQty} × {selectedReportFoodDetail.standard_serving_name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDetailServingQty((q) => q + 0.5)}
                          className="px-2.5 py-1 font-bold text-[#172b23] hover:bg-stone-100"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Complete Available Nutritional Composition (NULL preserved as Unavailable) */}
                  {(() => {
                    const srvGrams = selectedReportFoodDetail.standard_serving_grams || 100;
                    const scale =
                      detailBasisMode === '100g' ? 1.0 : (srvGrams / 100.0) * detailServingQty;
                    const fmtVal = (rawVal: number | null | undefined, unit: string) => {
                      if (rawVal === null || rawVal === undefined) {
                        return 'Unavailable (NULL)';
                      }
                      return `${Number((rawVal * scale).toFixed(2))} ${unit}`;
                    };
                    const nutrientRows = [
                      {
                        label: 'Energy (Calories)',
                        val: selectedReportFoodDetail.energy_kcal,
                        unit: 'kcal',
                      },
                      { label: 'Protein', val: selectedReportFoodDetail.protein_g, unit: 'g' },
                      {
                        label: 'Carbohydrates',
                        val: selectedReportFoodDetail.carbs_g,
                        unit: 'g',
                      },
                      {
                        label: 'Total Fat',
                        val: selectedReportFoodDetail.fat_total_g,
                        unit: 'g',
                      },
                      {
                        label: 'Dietary Fibre',
                        val: selectedReportFoodDetail.fibre_g,
                        unit: 'g',
                      },
                      { label: 'Iron', val: selectedReportFoodDetail.iron_mg, unit: 'mg' },
                      { label: 'Calcium', val: selectedReportFoodDetail.calcium_mg, unit: 'mg' },
                      { label: 'Folate', val: selectedReportFoodDetail.folate_ug, unit: 'µg' },
                      {
                        label: 'Vitamin C',
                        val: selectedReportFoodDetail.vitamin_c_mg,
                        unit: 'mg',
                      },
                      {
                        label: 'Vitamin B12',
                        val: selectedReportFoodDetail.vitamin_b12_mcg,
                        unit: 'µg',
                      },
                      {
                        label: 'Vitamin D',
                        val: selectedReportFoodDetail.vitamin_d_mcg,
                        unit: 'µg',
                      },
                    ];

                    return (
                      <div
                        data-testid="modal-nutrient-composition-grid"
                        className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs"
                      >
                        {nutrientRows.map((nr) => (
                          <div
                            key={nr.label}
                            className="rounded-xl border border-emerald-900/10 bg-white p-2.5"
                          >
                            <div className="text-[11px] font-semibold text-[#566960]">
                              {nr.label}
                            </div>
                            <div
                              className={`mt-0.5 font-extrabold ${
                                nr.val === null || nr.val === undefined
                                  ? 'text-stone-400 italic text-[11px]'
                                  : 'text-[#172b23]'
                              }`}
                            >
                              {fmtVal(nr.val, nr.unit)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Data Source & Completeness */}
                  <div
                    data-testid="modal-food-source-metadata"
                    className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5 text-xs text-[#566960] flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      Source:{' '}
                      {selectedReportFoodDetail.source_url ? (
                        <a
                          href={selectedReportFoodDetail.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-extrabold text-[#087153] underline"
                        >
                          {selectedReportFoodDetail.source_name || 'ICMR-NIN IFCT 2017'} ↗
                        </a>
                      ) : (
                        <strong className="text-[#172b23]">
                          {selectedReportFoodDetail.source_name || 'ICMR-NIN IFCT 2017'}
                        </strong>
                      )}
                    </div>
                    {selectedReportFoodDetail.completeness_pct != null && (
                      <div>
                        Data Completeness:{' '}
                        <strong className="text-[#172b23]">
                          {selectedReportFoodDetail.completeness_pct}%
                        </strong>
                      </div>
                    )}
                  </div>

                  {selectedReportFoodDetail.dietary_mismatch_note && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs font-semibold text-amber-950">
                      {selectedReportFoodDetail.dietary_mismatch_note}
                    </div>
                  )}

                  {(selectedReportFoodDetail.allergen_warnings || []).map(
                    (aw: string, aIdx: number) => (
                      <div
                        key={aIdx}
                        className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-900"
                      >
                        {aw}
                      </div>
                    )
                  )}

                  {/* Footer Actions: Add to Daily Tracker (with confirmation) & Open Full Food Detail Page */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-200">
                    <button
                      type="button"
                      data-testid={`add-report-food-to-tracker-btn-${selectedReportFoodDetail.slug}`}
                      onClick={() => {
                        setPendingTrackerFood({
                          slug: selectedReportFoodDetail.slug,
                          name_en: selectedReportFoodDetail.name_en,
                          standard_serving_name:
                            selectedReportFoodDetail.standard_serving_name || '1 serving',
                          meal_category: 'lunch',
                          quantity: detailServingQty,
                        });
                        setSelectedReportFoodDetail(null);
                      }}
                      className="rounded-xl border border-emerald-800/25 bg-[#e8f2e9] px-4 py-2.5 text-xs font-extrabold text-[#064d3c] hover:bg-emerald-100 transition"
                    >
                      + Add to Daily Tracker (Requires Confirmation)
                    </button>

                    <Link
                      to={`/foods/${selectedReportFoodDetail.slug}`}
                      data-testid={`open-full-food-page-link-${selectedReportFoodDetail.slug}`}
                      className="rounded-xl bg-[#087153] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#064d3c] transition"
                    >
                      View Full Food Details Page →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: LAB REPORT HISTORY & UNIT-CONSISTENT CHRONOLOGICAL TRENDS      */}
      {/* ===================================================================== */}
      {activeTab === 'trends' && (
        <section
          data-testid="health-report-trends-section"
          className="gp-surface-elevated rounded-3xl p-6 space-y-5"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-900/10 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-[#172b23]">
                Single-Marker Chronological Laboratory Trends
              </h2>
              <p className="text-xs text-[#566960]">
                {trendsData?.unit_consistency_note ||
                  'Each chart plots one laboratory marker at a time with strictly identical measurement units and its printed reference band.'}
              </p>
            </div>
            {trendsData?.series?.length > 0 && (
              <select
                aria-label="Select Lab Marker Trend Series"
                data-testid="lab-trend-selector"
                value={selectedTrendKey}
                onChange={(e) => setSelectedTrendKey(e.target.value)}
                className="rounded-xl border border-emerald-900/20 bg-white px-3.5 py-2 text-xs font-extrabold text-[#172b23]"
              >
                {(trendsData?.series || []).map((s: any) => (
                  <option
                    key={`${s.canonical_code}::${s.unit}`}
                    value={`${s.canonical_code}::${s.unit}`}
                  >
                    {s.test_name} ({s.unit}) — {(s.points || s.data_points || []).length} reading(s)
                  </option>
                ))}
              </select>
            )}
          </div>

          {!activeTrendSeries ? (
            <div className="rounded-2xl border border-emerald-900/10 bg-[#f7fbf7] p-6 text-center space-y-2">
              <p className="text-sm font-bold text-[#172b23]">
                No Confirmed Laboratory Trend Points Yet
              </p>
              <p className="text-xs text-[#566960]">
                Upload and confirm a health report in the Lab Reports tab to track HbA1c, Fasting
                Glucose, Haemoglobin, Vitamin D, Vitamin B12, LDL, Triglycerides, Creatinine, and
                TSH over time.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#e8f2e9]/70 px-4 py-3">
                <div>
                  <span className="text-sm font-extrabold text-[#172b23]">
                    {activeTrendSeries.test_name}
                  </span>{' '}
                  <span className="text-xs font-bold text-[#087153]">
                    (Unit: {activeTrendSeries.unit})
                  </span>
                </div>
                {(activeTrendSeries.reference_low ?? activeTrendSeries.reference_min) != null &&
                  (activeTrendSeries.reference_high ?? activeTrendSeries.reference_max) != null && (
                    <span className="text-xs font-bold text-[#566960]">
                      Printed Reference Band:{' '}
                      {activeTrendSeries.reference_low ?? activeTrendSeries.reference_min} –{' '}
                      {activeTrendSeries.reference_high ?? activeTrendSeries.reference_max}{' '}
                      {activeTrendSeries.unit}
                    </span>
                  )}
              </div>

              <div className="rounded-2xl border border-emerald-900/12 bg-white p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {(activeTrendSeries.points || activeTrendSeries.data_points || []).map(
                    (pt: any, idx: number) => (
                      <div
                        key={`${pt.report_id}-${idx}`}
                        className="rounded-xl border border-emerald-900/10 bg-[#f7fbf7] p-3 space-y-1"
                      >
                        <div className="text-[11px] font-bold text-[#566960]">
                          {pt.report_date || pt.test_date}
                        </div>
                        <div className="text-lg font-black text-[#087153]">
                          {pt.measured_value ?? pt.result_value} {activeTrendSeries.unit}
                        </div>
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                            STATUS_BADGE_STYLES[pt.status_flag] ||
                            STATUS_BADGE_STYLES[pt.range_status] ||
                            STATUS_BADGE_STYLES.reference_unavailable
                          }`}
                        >
                          {STATUS_LABELS[pt.status_flag] ||
                            STATUS_LABELS[pt.range_status] ||
                            pt.status_flag ||
                            pt.range_status}
                        </span>
                        <div className="text-[10px] text-[#566960] truncate">
                          {pt.report_title || `Report #${pt.report_id}`}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: AI SYMPTOM REVIEW & CARE GUIDANCE (PART B)                     */}
      {/* ===================================================================== */}
      {activeTab === 'symptoms' && (
        <div className="space-y-6" data-testid="symptom-review-workspace">
          <div className="rounded-2xl border border-emerald-900/15 bg-[#e8f2e9]/85 p-4 text-xs text-[#172b23] flex items-start gap-3">
            <span className="text-lg shrink-0">🩺</span>
            <div>
              <div className="font-extrabold">
                AI Symptom Review &amp; Care Guidance (Educational &amp; Non-Diagnostic)
              </div>
              <p className="text-[#566960] mt-0.5">
                Describe how you are feeling in natural language or by voice. GharPlate checks for
                urgent emergency red flags first, asks 1–2 progressive clarifying questions, links
                consented health records without confusing symptoms with lab results, and suggests
                gentle Indian hydration and meal options. It never diagnoses diseases or prescribes
                medications.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-5 gp-surface-elevated rounded-3xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-extrabold text-[#172b23]">
                  Describe Your Symptoms
                </h2>
                <button
                  type="button"
                  data-testid="symptom-voice-input-btn"
                  onClick={handleVoiceSymptomCapture}
                  className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
                    voiceListening
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'border border-emerald-800/25 bg-[#e8f2e9] text-[#064d3c] hover:bg-emerald-100'
                  }`}
                >
                  {voiceListening ? '🎙️ Listening...' : '🎙️ Speak Symptoms'}
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#566960] mb-1">
                  What symptoms are you experiencing?
                </label>
                <textarea
                  rows={4}
                  data-testid="symptom-description-input"
                  value={symptomDescription}
                  onChange={(e) => setSymptomDescription(e.target.value)}
                  placeholder="Example: I have been feeling tired and dizzy in the afternoon for the past week."
                  className="w-full rounded-xl border border-emerald-900/20 bg-white p-3 text-xs font-medium text-[#172b23]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-[#566960]">
                  Quick Examples to Test:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'I have been feeling tired and dizzy in the afternoon for the past week.',
                    'Mild acidity and bloating after heavy dinner since yesterday.',
                    'Recovering from mild fever and sore throat for 2 days.',
                    'Severe chest pain spreading to my left arm and shortness of breath.',
                  ].map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      data-testid={`symptom-sample-chip-${idx}`}
                      onClick={() => {
                        setSymptomDescription(sample);
                        void handleRunSymptomReview(sample);
                      }}
                      className="rounded-lg border border-emerald-900/15 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#172b23] hover:bg-[#e8f2e9] text-left transition"
                    >
                      {sample.slice(0, 48)}...
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">Onset</label>
                  <input
                    type="text"
                    value={symptomOnset}
                    onChange={(e) => setSymptomOnset(e.target.value)}
                    className="w-full rounded-xl border border-emerald-900/15 bg-white px-2.5 py-1.5 text-xs text-[#172b23]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={symptomDuration}
                    onChange={(e) => setSymptomDuration(e.target.value)}
                    className="w-full rounded-xl border border-emerald-900/15 bg-white px-2.5 py-1.5 text-xs text-[#172b23]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    Severity
                  </label>
                  <select
                    aria-label="Symptom Severity"
                    value={symptomSeverity}
                    onChange={(e) =>
                      setSymptomSeverity(e.target.value as 'mild' | 'moderate' | 'severe')
                    }
                    className="w-full rounded-xl border border-emerald-900/15 bg-white px-2.5 py-1.5 text-xs font-bold text-[#172b23]"
                  >
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2 text-xs text-[#172b23] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeRecordsConsent}
                  onChange={(e) => setIncludeRecordsConsent(e.target.checked)}
                  className="mt-0.5 rounded border-emerald-700 text-[#087153]"
                />
                <span>
                  Include my confirmed GharPlate health records (lab reports, BP, blood glucose,
                  hydration &amp; meal logs) for educational context
                </span>
              </label>

              <button
                type="button"
                data-testid="submit-symptom-review-btn"
                disabled={evaluatingSymptoms || !symptomDescription.trim()}
                onClick={() => void handleRunSymptomReview()}
                className="w-full rounded-xl bg-[#087153] px-4 py-3 text-xs font-extrabold text-white shadow-sm hover:bg-[#064d3c] disabled:opacity-50 transition"
              >
                {evaluatingSymptoms
                  ? 'Reviewing Symptoms & Checking Safety...'
                  : '🩺 Review Symptoms & Care Guidance'}
              </button>
            </section>

            <section className="lg:col-span-7 space-y-4">
              {!symptomResult ? (
                <div className="gp-surface rounded-3xl p-8 text-center space-y-2">
                  <div className="text-3xl">🩺</div>
                  <h3 className="text-base font-extrabold text-[#172b23]">
                    Ready to Review Your Symptoms Safely
                  </h3>
                  <p className="text-xs text-[#566960] max-w-md mx-auto">
                    Enter your symptoms on the left or click one of the quick examples to view
                    structured care guidance, clinician questions, and supportive Indian hydration
                    and meal ideas.
                  </p>
                </div>
              ) : symptomResult.red_flag_detected ? (
                <div
                  role="alert"
                  data-testid="red-flag-emergency-banner"
                  className="rounded-3xl border-4 border-red-600 bg-red-50 p-6 space-y-4 text-red-950 shadow-xl"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3.5 py-1 text-xs font-black text-white">
                      🚨 EMERGENCY RED-FLAG ALERT
                    </span>
                    <span className="text-xs font-black text-red-800">
                      Emergency Numbers (India): 112 / 108
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-red-950">
                    {symptomResult.emergency_banner?.headline ||
                      'SEEK IMMEDIATE EMERGENCY MEDICAL CARE'}
                  </h3>
                  <p className="text-sm font-bold leading-relaxed">
                    {symptomResult.emergency_banner?.action_instruction}
                  </p>
                  <div className="rounded-2xl bg-white/90 border border-red-300 p-4 space-y-1.5 text-xs">
                    <div className="font-extrabold text-red-900">
                      Detected Red-Flag Warning Signs:
                    </div>
                    {(symptomResult.red_flag_reasons || []).map((r: any, idx: number) => (
                      <div key={idx} className="font-semibold">
                        • {r.reason}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-bold text-red-900">
                    {symptomResult.emergency_banner?.do_not_delay_note ||
                      'Normal food recommendations are paused during a medical emergency. Please seek urgent in-person emergency evaluation immediately.'}
                  </p>
                </div>
              ) : (
                <div
                  data-testid="symptom-guidance-result-card"
                  className="gp-surface-elevated rounded-3xl p-6 space-y-5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-900/10 pb-4">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-extrabold text-[#064d3c]">
                        {symptomResult.urgency_label}
                      </span>
                      <h3 className="mt-1.5 text-lg font-extrabold text-[#172b23]">
                        Educational Symptom &amp; Nutrition Care Review
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        openAssistantWorkspace({
                          initialPrompt: `I reviewed my symptoms (${symptomResult.reported_symptoms?.description}). What gentle Indian meals and questions for my doctor should I keep in mind?`,
                        })
                      }
                      className="gp-sidebar-ai-btn rounded-xl px-3.5 py-2 text-xs font-extrabold text-white"
                    >
                      🤖 Ask GharPlate AI
                    </button>
                  </div>

                  <p className="text-xs text-[#172b23] leading-relaxed font-medium">
                    {symptomResult.educational_overview}
                  </p>

                  {symptomResult.follow_up_questions?.length > 0 && (
                    <div className="rounded-2xl border border-emerald-900/15 bg-[#f7fbf7] p-4 space-y-2">
                      <div className="text-xs font-extrabold text-[#087153]">
                        Clarifying Questions to Narrow Context (1–2 at a time):
                      </div>
                      {symptomResult.follow_up_questions.map((q: string, idx: number) => (
                        <div key={idx} className="text-xs text-[#172b23] font-semibold">
                          {idx + 1}. {q}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-stone-200 bg-white p-3.5 space-y-1.5">
                      <div className="text-xs font-extrabold text-[#172b23]">
                        Reported Symptoms (User Input)
                      </div>
                      <p className="text-xs text-[#566960]">
                        “{symptomResult.reported_symptoms?.description}”
                      </p>
                      <div className="text-[11px] text-[#566960]">
                        Severity:{' '}
                        <span className="font-bold">
                          {symptomResult.reported_symptoms?.severity}
                        </span>{' '}
                        • Duration:{' '}
                        <span className="font-bold">
                          {symptomResult.reported_symptoms?.duration || 'Not specified'}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-900/15 bg-white p-3.5 space-y-1.5">
                      <div className="text-xs font-extrabold text-[#087153]">
                        Connected Confirmed Health Records
                      </div>
                      {(symptomResult.confirmed_health_records?.relevant_connections || [])
                        .length > 0 ? (
                        <ul className="space-y-1 text-[11px] text-[#172b23]">
                          {symptomResult.confirmed_health_records.relevant_connections.map(
                            (c: string, i: number) => (
                              <li key={i}>• {c}</li>
                            )
                          )}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-[#566960]">
                          No flagged lab or vital abnormalities linked yet, or record connection was
                          disabled.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-emerald-900/12 bg-white p-4 space-y-1.5">
                      <div className="text-xs font-extrabold text-[#172b23]">
                        Educational Nutrition &amp; Lifestyle Factors to Discuss
                      </div>
                      <ul className="space-y-1 text-xs text-[#566960]">
                        {(symptomResult.educational_possibilities || []).map(
                          (p: string, idx: number) => (
                            <li key={idx}>• {p}</li>
                          )
                        )}
                      </ul>
                    </div>

                    <div className="rounded-2xl border border-emerald-900/12 bg-white p-4 space-y-1.5">
                      <div className="text-xs font-extrabold text-[#172b23]">
                        Questions to Ask Your Doctor
                      </div>
                      <ul className="space-y-1 text-xs text-[#566960]">
                        {(symptomResult.questions_for_doctor || []).map(
                          (q: string, idx: number) => (
                            <li key={idx}>• {q}</li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>

                  {symptomResult.supportive_indian_meals_and_hydration?.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="text-xs font-extrabold text-[#172b23]">
                        Cautious Indian Hydration &amp; Gentle Meal Ideas:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {symptomResult.supportive_indian_meals_and_hydration.map((m: any) => (
                          <div
                            key={m.slug}
                            className="rounded-xl border border-emerald-900/15 bg-[#f7fbf7] p-3 flex flex-col justify-between gap-2"
                          >
                            <div>
                              <Link
                                to={`/foods/${m.slug}`}
                                className="text-xs font-extrabold text-[#087153] hover:underline"
                              >
                                {m.name_en}
                              </Link>
                              <p className="text-[11px] text-[#566960] mt-0.5">
                                {m.why_supportive}
                              </p>
                            </div>
                            <div className="flex items-center justify-between text-[10px] font-bold pt-1 border-t border-emerald-900/10">
                              <span className="text-[#566960]">{m.standard_serving_name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/food-nearby?dish=${encodeURIComponent(m.name_en)}`
                                  )
                                }
                                className="text-[#087153] hover:underline"
                              >
                                📍 Find Nearby →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {symptomResult.warning_signs_for_earlier_care?.length > 0 && (
                    <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-3.5 text-[11px] text-amber-950 space-y-1">
                      <div className="font-extrabold">
                        Warning Signs Requiring Prompt In-Person Medical Care:
                      </div>
                      {symptomResult.warning_signs_for_earlier_care.map(
                        (w: string, idx: number) => (
                          <div key={idx}>• {w}</div>
                        )
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
