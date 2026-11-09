import React, { useState, useEffect } from 'react';
import { CounselorPatternItem, CircleAuditLogItem } from '../types/shared.ts';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  LogOut,
  RefreshCw,
  Users,
  EyeOff,
  Sparkles,
  ArrowLeft,
  Calendar,
  Layers,
  FileCheck2,
} from 'lucide-react';

interface CircleCounselorPortalProps {
  onReturnToApp: () => void;
}

export const CircleCounselorPortal: React.FC<CircleCounselorPortalProps> = ({ onReturnToApp }) => {
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('sakhi_counselor_token')
  );
  const [usernameInput, setUsernameInput] = useState('counselor@sakhi.org');
  const [passwordInput, setPasswordInput] = useState('DemoCounselor2026!');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [patterns, setPatterns] = useState<CounselorPatternItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<CircleAuditLogItem[]>([]);
  const [activeTab, setActiveTab] = useState<'patterns' | 'audit'>('patterns');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadPortalData(token);
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/circle/counselor/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput.trim(),
          password: passwordInput.trim(),
        }),
      });

      if (!res.ok) {
        throw new Error('Invalid credentials. Use demo credentials shown below.');
      }

      const data = await res.json();
      const activeToken = data.token || 'demo-counselor-session-active';
      setToken(activeToken);
      localStorage.setItem('sakhi_counselor_token', activeToken);
      await loadPortalData(activeToken);
    } catch (err: any) {
      setLoginError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('sakhi_counselor_token');
    setPatterns([]);
    setAuditLogs([]);
  };

  const loadPortalData = async (activeToken: string) => {
    setLoading(true);
    try {
      const [patRes, auditRes] = await Promise.all([
        fetch('/api/circle/counselor/patterns', {
          headers: { Authorization: `Bearer ${activeToken}` },
        }),
        fetch('/api/circle/counselor/audit', {
          headers: { Authorization: `Bearer ${activeToken}` },
        }),
      ]);

      if (patRes.ok) {
        const patData = await patRes.json();
        setPatterns(patData.patterns || []);
      }
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditLogs(auditData.auditLogs || []);
      }
    } catch (err) {
      console.error('Failed to load counselor portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDemo = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/circle/seed-demo', { method: 'POST' });
      if (res.ok) {
        setActionNotice('Seeded 2 dummy independent reporters sharing fictional demo identifiers.');
        if (token) await loadPortalData(token);
      }
    } catch (err) {
      console.warn('Seeding failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // 1. Login View
  if (!token) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={onReturnToApp}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App</span>
            </button>
            <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-teal-400 border border-slate-700">
              DEMO ONLY
            </span>
          </div>

          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-teal-950 border border-teal-500/40 flex items-center justify-center text-teal-400 mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-white">Sakhi Circle Counselor Portal</h1>
            <p className="text-xs text-slate-400">
              Institutional corroboration & serial harassment triage registry.
            </p>
          </div>

          {/* Privacy Box */}
          <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-teal-300">
              <EyeOff className="w-3.5 h-3.5" />
              <span>Zero-Content Privacy Protocol</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Caseworkers cannot view names, plain phone numbers, messages, or victim identities. Only mathematical HMAC collisions (&ge;3 reports) are visible.
            </p>
          </div>

          {/* Demo Credentials Helper */}
          <div className="p-3 bg-amber-950/30 border border-amber-800/60 rounded-xl text-xs text-amber-200/90 space-y-1">
            <span className="font-semibold text-amber-300">Default Demo Credentials:</span>
            <div className="font-mono text-[11px] text-amber-200">
              User: <span className="text-white">counselor@sakhi.org</span>
              <br />
              Pass: <span className="text-white">DemoCounselor2026!</span>
            </div>
          </div>

          {loginError && (
            <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl text-xs text-red-300">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 mb-1 font-medium">Username / Email</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-teal-500 font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 mb-1 font-medium">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-teal-500 font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-semibold shadow-md transition flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Authenticating...' : 'Sign in as Counselor'}</span>
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Authenticated Dashboard View
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onReturnToApp}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 transition"
              title="Return to Vault App"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-950 border border-teal-500/40 flex items-center justify-center text-teal-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Sakhi Circle</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-teal-950 text-teal-400 border border-teal-800">
                    Counselor Portal
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">Institutional Serial Harassment Registry</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400 hidden sm:inline">counselor@sakhi.org</span>
            <button
              onClick={handleLogout}
              className="p-2 bg-slate-800 hover:bg-red-950/80 text-slate-400 hover:text-red-300 rounded-xl border border-slate-700 transition"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Institutional Safeguards Banner */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <EyeOff className="w-5 h-5 text-teal-400 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-white">Zero Raw Identifiers / Zero Case Data Access</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  This portal displays ONLY truncated hash prefixes (<code className="text-teal-400">#xxxxxx</code>) and independent device convergence counts. No names, phone numbers, or text content exist here.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => loadPortalData(token)}
                disabled={loading}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center gap-1.5 transition border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                onClick={handleSeedDemo}
                disabled={loading}
                className="px-3 py-1.5 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 rounded-xl text-xs font-medium flex items-center gap-1.5 transition border border-amber-800/80"
                title="Re-seed 2 dummy reporters sharing fictional identifiers"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Re-seed Demo</span>
              </button>
            </div>
          </div>

          {actionNotice && (
            <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-teal-300">
              {actionNotice}
            </div>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('patterns')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'patterns'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Active Patterns ({patterns.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'audit'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Content-Free Audit Trail ({auditLogs.length})</span>
          </button>
        </div>

        {/* Tab 1: Patterns Table */}
        {activeTab === 'patterns' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Cross-Case Identifier Hash Collisions
                </h3>
                <p className="text-[11px] text-slate-500">
                  Threshold: Patterns require $\ge 3$ distinct reporting devices.
                </p>
              </div>
            </div>

            {patterns.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No contributed identifier hashes recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Short Hash</th>
                      <th className="px-4 py-3">Distinct Reporters</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">First Seen</th>
                      <th className="px-4 py-3">Last Seen</th>
                      <th className="px-4 py-3">Triage Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {patterns.map((pat, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 font-mono font-bold text-teal-400">
                          {pat.shortHash}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span className="font-semibold text-white">
                              {pat.distinctReporterCount} distinct devices
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 capitalize text-slate-300">
                          {pat.category.replace(/_/g, ' ')}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {pat.firstSeenMonth}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {pat.lastSeenMonth}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {pat.isPattern ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-700/80 font-semibold text-[11px]">
                              <ShieldAlert className="w-3 h-3 text-red-400" />
                              Serial Pattern (&ge;3)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[11px]">
                              Below Threshold (&lt;3)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Audit Logs */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Immutable System Audit Trail
              </h3>
              <p className="text-[11px] text-slate-500">
                All contributions, queries, and withdrawals are recorded with actor and action only. Zero payload content.
              </p>
            </div>

            {auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No audit entries recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Payload Content</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-[11px]">
                    {auditLogs.map((log, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-2.5 text-slate-400">
                          {new Date(log.time).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-teal-400 uppercase font-bold">
                          {log.actor}
                        </td>
                        <td className="px-4 py-2.5 text-slate-200">
                          {log.action}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 italic">
                          [REDACTED / ZERO CONTENT]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
