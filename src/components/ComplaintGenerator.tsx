import React, { useState, useEffect } from 'react';
import { VaultCase } from '../lib/db.ts';
import {
  AuthorityType,
  AUTHORITIES,
  ComplaintDraftResult,
  CitedLegalCard,
} from '../types/shared.ts';
import { exportComplaintToPDF } from '../lib/pdfExport.ts';
import {
  FileText,
  Download,
  Languages,
  AlertCircle,
  Building2,
  RefreshCw,
  Copy,
  Scale,
  CheckSquare,
  Square,
  Trash2,
} from 'lucide-react';

interface ComplaintGeneratorProps {
  currentCase: VaultCase;
}

export const ComplaintGenerator: React.FC<ComplaintGeneratorProps> = ({ currentCase }) => {
  const [authority, setAuthority] = useState<AuthorityType>('fia_cybercrime');
  const [language, setLanguage] = useState<'en' | 'ur'>('en');
  const [complainantName, setComplainantName] = useState<string>('[Complainant - Redacted]');
  const [accusedInfo, setAccusedInfo] = useState<string>(
    currentCase.extractedReview?.identifiers?.join(', ') || '+92 300 4819283'
  );
  const [draft, setDraft] = useState<ComplaintDraftResult | null>(null);
  const [editableBody, setEditableBody] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // 9. Verified legal provisions state
  const [verifiedCards, setVerifiedCards] = useState<CitedLegalCard[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());

  // Load verified cards from session storage or fetch from legal endpoint
  useEffect(() => {
    loadVerifiedCards();
  }, [currentCase.id]);

  const loadVerifiedCards = async () => {
    try {
      const stored = sessionStorage.getItem(`sakhi_vault_cited_cards_${currentCase.id}`);
      if (stored) {
        const parsed: CitedLegalCard[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setVerifiedCards(parsed);
          setSelectedCardIds(new Set(parsed.map((c) => c.chunkId || `${c.act}-${c.section}`)));
          return;
        }
      }
    } catch {}

    // If not in session storage, fetch verified cards from legal endpoint
    try {
      const caseFacts =
        currentCase.extractedReview?.summary5Lines?.join(' ') ||
        currentCase.evidenceItems.map((e) => e.notes).join(' ') ||
        'Harassment and blackmail incident';
      const categories =
        currentCase.extractedReview?.classificationLabels?.map((c) => c.category) || [
          'blackmail/extortion',
          'cyber-stalking',
        ];

      const res = await fetch('/api/ai/legal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: categories,
          caseFacts,
          caseId: currentCase.id,
          classificationLabels: categories,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const cards: CitedLegalCard[] = data.citedCards || [];
        setVerifiedCards(cards);
        setSelectedCardIds(new Set(cards.map((c) => c.chunkId || `${c.act}-${c.section}`)));
      }
    } catch (err) {
      console.warn('Failed to fetch initial verified cards for complaint:', err);
    }
  };

  useEffect(() => {
    generateDraft();
  }, [authority, language, selectedCardIds]);

  const toggleCardSelection = (cardId: string) => {
    const next = new Set(selectedCardIds);
    if (next.has(cardId)) {
      next.delete(cardId);
    } else {
      next.add(cardId);
    }
    setSelectedCardIds(next);
  };

  const removeCardPermanently = (cardId: string) => {
    const nextCards = verifiedCards.filter(
      (c) => (c.chunkId || `${c.act}-${c.section}`) !== cardId
    );
    setVerifiedCards(nextCards);
    const nextSelected = new Set(selectedCardIds);
    nextSelected.delete(cardId);
    setSelectedCardIds(nextSelected);

    try {
      sessionStorage.setItem(
        `sakhi_vault_cited_cards_${currentCase.id}`,
        JSON.stringify(nextCards)
      );
    } catch {}
  };

  const generateDraft = async () => {
    setIsGenerating(true);
    try {
      const summaryFacts =
        currentCase.extractedReview?.summary5Lines?.join('\n') ||
        'The complainant was subjected to persistent intimidation and extortion ultimatums.';

      const timelineEvents = (currentCase.extractedReview?.messages || []).map((m) => ({
        timestamp: m.timestamp,
        speaker: m.speaker,
        text: m.text,
        platform: currentCase.extractedReview?.platform || 'WhatsApp',
      }));

      // 9. Complaint generator: cite ONLY verified cards and leave out any section the user removed
      const citedSections = verifiedCards.filter((c) =>
        selectedCardIds.has(c.chunkId || `${c.act}-${c.section}`)
      );

      const res = await fetch('/api/ai/complaint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authority,
          language,
          complainantName,
          accusedInfo,
          summaryFacts,
          timelineEvents,
          citedSections,
          evidenceItems: currentCase.evidenceItems,
        }),
      });

      if (!res.ok) throw new Error('Failed to generate draft');
      const data: ComplaintDraftResult = await res.json();
      setDraft(data);
      setEditableBody(data.fullDraftText);
    } catch (err) {
      console.warn('Complaint generation fallback:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportPDF = async () => {
    if (!draft) return;
    setIsExporting(true);

    try {
      const auth = AUTHORITIES[authority];
      const timelineEvents = (currentCase.extractedReview?.messages || []).map((m) => ({
        id: m.id,
        timestamp: new Date().toISOString(),
        rawTimestamp: m.timestamp,
        speaker: m.speaker,
        text: m.text,
        platform: currentCase.extractedReview?.platform || 'WhatsApp',
        sourceEvidenceId: 'ev-auto',
        sourceType: 'screenshot' as const,
        isThreat: m.isThreat,
      }));

      await exportComplaintToPDF({
        title: draft.title,
        authorityTitle: language === 'ur' ? auth.titleUr : auth.titleEn,
        recipientDesignation:
          language === 'ur' ? auth.recipientDesignationUr : auth.recipientDesignationEn,
        language,
        complainantName,
        accusedIdentifiers: accusedInfo,
        complaintBody: editableBody,
        reliefList: draft.reliefRequested,
        evidenceIndex: draft.evidenceIndex,
        timelineEvents,
      });
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Could not export PDF. Please check browser permissions.');
    } finally {
      setIsExporting(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editableBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const authMeta = AUTHORITIES[authority];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-4 bg-teal-950/40 border border-teal-800/60 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-400" />
            <span>شکایت کا مسودہ بنائیں / Complaint Draft Generator</span>
          </h2>
          <p className="text-xs text-slate-400">
            Tailored drafting with statutory citations and evidence annexures
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={generateDraft}
            disabled={isGenerating}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
            <span>{isGenerating ? 'کام جاری ہے / Working...' : 'Regenerate'}</span>
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Generating PDF...' : 'Export as PDF'}</span>
          </button>
        </div>
      </div>

      {/* Authority & Language Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
        {/* Authority Selector */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-teal-400" />
            <span>Addressed Legal Authority:</span>
          </label>
          <select
            value={authority}
            onChange={(e) => setAuthority(e.target.value as AuthorityType)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
          >
            <option value="fia_cybercrime">FIA Cyber Crime Wing (Online extortion & blackmail)</option>
            <option value="police_station">Local Police Station (SHO - Criminal intimidation)</option>
            <option value="workplace_committee">Workplace Inquiry Committee (Institutional harassment)</option>
            <option value="university_committee">University / College Committee (Campus harassment)</option>
            <option value="women_protection_cell">Women Protection Cell (District support & protection)</option>
          </select>
          <p className="text-[11px] text-slate-400 mt-1 italic">
            Scope: {authMeta.scopeNoticeEn}
          </p>
        </div>

        {/* Language Toggle */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Languages className="w-3.5 h-3.5 text-teal-400" />
            <span>Drafting Language:</span>
          </label>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                language === 'en'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLanguage('ur')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition font-urdu ${
                language === 'ur'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              اردو (Urdu)
            </button>
          </div>
        </div>

        {/* Accused Identifiers Field */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
            Accused Identifiers:
          </label>
          <input
            type="text"
            value={accusedInfo}
            onChange={(e) => setAccusedInfo(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
          />
        </div>
      </div>

      {/* 9. Referenced Legal Provisions (Verified Citations & Exclusion Control) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-teal-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Referenced Statutory Provisions
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Unchecked or removed sections will be excluded from the draft
          </span>
        </div>

        {verifiedCards.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            No statutory sections selected. The complaint will be drafted without specific legal section citations.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {verifiedCards.map((card) => {
              const cardId = card.chunkId || `${card.act}-${card.section}`;
              const isSelected = selectedCardIds.has(cardId);
              return (
                <div
                  key={cardId}
                  className={`p-3 rounded-xl border transition flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-slate-950/80 border-teal-800/60'
                      : 'bg-slate-950/40 border-slate-800 opacity-60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleCardSelection(cardId)}
                    className="flex items-start gap-2.5 text-left flex-1"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-bold text-teal-400">
                        {card.act}
                      </div>
                      <div className="text-xs font-semibold text-white">
                        {card.section}: {card.title}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => removeCardPermanently(cardId)}
                    className="text-slate-500 hover:text-rose-400 p-1 transition"
                    title="Remove this provision"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* EDITABLE DRAFT APPLICATION */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-white">
              {language === 'ur' ? authMeta.titleUr : authMeta.titleEn}
            </h3>
            <p className="text-xs text-slate-400 font-mono">
              {language === 'ur' ? authMeta.recipientDesignationUr : authMeta.recipientDesignationEn}
            </p>
          </div>
          <button
            onClick={copyToClipboard}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition flex items-center gap-1.5"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Copied!' : 'Copy Draft'}</span>
          </button>
        </div>

        {/* Interactive Textarea */}
        <textarea
          value={editableBody}
          onChange={(e) => setEditableBody(e.target.value)}
          rows={16}
          dir={language === 'ur' ? 'rtl' : 'ltr'}
          className={`w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 focus:outline-none focus:border-teal-500 resize-y leading-relaxed ${
            language === 'ur' ? 'font-urdu text-base leading-loose' : 'font-sans text-xs'
          }`}
        />

        {/* Bottom Notice */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800">
          <span>Official Annexure A (Timeline Table) will be automatically attached to PDF export.</span>
          <span className="font-semibold text-red-400 uppercase tracking-wider">
            Draft, not legal advice
          </span>
        </div>
      </div>
    </div>
  );
};
