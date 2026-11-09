import React, { useState } from 'react';
import helplinesData from '../data/helplines.json';
import { PhoneCall, ShieldAlert, HeartHandshake, Scale, Clock, AlertCircle } from 'lucide-react';

export const HelplinesScreen: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const categories = [
    'All',
    'Law Enforcement',
    'Legal & Digital Support',
    'Emergency',
    'Crisis Intervention',
    'Mental Health',
  ];

  const filtered = helplinesData.filter(
    (h) => activeCategory === 'All' || h.category === activeCategory
  );

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <div className="p-3.5 bg-amber-950/30 border border-amber-800/60 rounded-2xl flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-200/90 leading-relaxed">
          <strong>Verification Notice:</strong> All contact numbers below are representative placeholders marked <span className="font-mono bg-amber-900/60 px-1 py-0.5 rounded text-amber-300 font-bold">VERIFY</span>. Verify with official district directories before relying on emergency response.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-teal-400" />
            <span>Emergency Helplines & Crisis Support</span>
          </h2>
          <p className="text-xs text-slate-400">
            Tap-to-call emergency lines, legal aid clinics, and psychological counselors
          </p>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
              activeCategory === cat
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Helpline Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((item) => (
          <div
            key={item.id}
            className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 md:p-5 flex flex-col justify-between gap-4 transition shadow-sm"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-400 bg-teal-950 px-2 py-0.5 rounded border border-teal-800/50">
                    {item.category}
                  </span>
                  <h3 className="text-sm font-bold text-white mt-1.5">{item.name}</h3>
                  <p className="text-xs text-slate-400 font-urdu mt-0.5 leading-relaxed">
                    {item.urduName}
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                {item.description}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{item.hours}</span>
              </div>

              <a
                href={`tel:${item.number}`}
                className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Call {item.display}</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
