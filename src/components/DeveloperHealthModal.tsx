import React, { useState, useEffect } from 'react';
import { Activity, CheckCircle2, XCircle, RefreshCw, Cpu, ShieldAlert } from 'lucide-react';

interface DeveloperHealthModalProps {
  onClose: () => void;
}

interface ModelHealthItem {
  model: string;
  task: string;
  status: 'pass' | 'fail';
  latencyMs?: number;
  responsePreview?: string;
  error?: string;
}

interface HealthResponse {
  overall: 'healthy' | 'degraded' | 'offline_or_missing_key';
  hasApiKey: boolean;
  models: ModelHealthItem[];
  timestamp: string;
}

export const DeveloperHealthModal: React.FC<DeveloperHealthModalProps> = ({ onClose }) => {
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchHealth = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setHealthData(data);
    } catch (err: any) {
      setHealthData({
        overall: 'offline_or_missing_key',
        hasApiKey: false,
        models: [
          {
            model: 'Network Check',
            task: 'Express Server Connectivity',
            status: 'fail',
            error: err.message || 'Cannot reach /api/health',
          },
        ],
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl text-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-950 border border-teal-700/80 flex items-center justify-center text-teal-400">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">System & Model Diagnostics</h3>
              <p className="text-[11px] text-slate-400 font-mono">Endpoint: /api/health</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-xs"
          >
            ✕
          </button>
        </div>

        {/* Overall Status Badge */}
        {healthData && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-semibold text-slate-300">Overall Pipeline Status:</span>
            </div>
            <span
              className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded uppercase tracking-wider ${
                healthData.overall === 'healthy'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {healthData.overall}
            </span>
          </div>
        )}

        {/* Models Listing */}
        <div className="space-y-2.5 max-h-72 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              <RefreshCw className="w-5 h-5 text-teal-400 animate-spin mx-auto mb-2" />
              <span>Pinging Gemini models (/api/health)...</span>
            </div>
          ) : healthData?.models && healthData.models.length > 0 ? (
            healthData.models.map((item, idx) => (
              <div
                key={idx}
                className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {item.status === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-xs font-mono font-bold text-white">{item.model}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.latencyMs !== undefined && (
                      <span className="text-[10px] font-mono text-slate-400">
                        {item.latencyMs}ms
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                        item.status === 'pass'
                          ? 'bg-emerald-900/60 text-emerald-300'
                          : 'bg-red-900/60 text-red-300'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">{item.task}</p>

                {item.responsePreview && (
                  <p className="text-[10px] font-mono text-slate-500 truncate">
                    Output: "{item.responsePreview}"
                  </p>
                )}

                {item.error && (
                  <p className="text-[10px] font-mono text-red-400 bg-red-950/40 p-1.5 rounded border border-red-900/50">
                    Error: {item.error}
                  </p>
                )}
              </div>
            ))
          ) : (
            <div className="p-6 text-center text-xs text-slate-500">No health data available.</div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono">
            {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleTimeString() : ''}
          </span>
          <button
            onClick={fetchHealth}
            disabled={isLoading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-teal-300 text-xs font-semibold rounded-lg border border-teal-700/60 transition flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Re-Test Live</span>
          </button>
        </div>
      </div>
    </div>
  );
};
