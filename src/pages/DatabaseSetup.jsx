/**
 * DatabaseSetup.jsx
 *
 * Full-screen database configuration wizard available at /setup.
 * Lets any deployer (or admin) switch the app between:
 *   • Firebase Realtime Database (default)
 *   • Any REST API backend (PostgreSQL, MongoDB, MySQL, Supabase, etc.)
 *
 * Configuration is persisted in localStorage and read at module-load time
 * by the service adapters — a page reload activates the new settings.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ─── localStorage keys (must match src/config/firebase.js + adapters) ─────────
const SK = {
    ADAPTER:    'ohsms_db_adapter',
    FIREBASE:   'ohsms_firebase_config',
    REST_URL:   'ohsms_rest_base_url',
    REST_SSE:   'ohsms_rest_sse',
    REST_POLL:  'ohsms_rest_poll_ms',
    DONE:       'ohsms_setup_complete',
};

const EMPTY_FB = {
    apiKey: '', authDomain: '', databaseURL: '',
    projectId: '', storageBucket: '', messagingSenderId: '', appId: '',
};

const FB_PLACEHOLDERS = {
    apiKey:            'AIzaSyBHqeQN4s9PA5UUD...',
    authDomain:        'your-project.firebaseapp.com',
    databaseURL:       'https://your-project-default-rtdb.firebaseio.com',
    projectId:         'your-project-id',
    storageBucket:     'your-project.appspot.com',
    messagingSenderId: '871919638023',
    appId:             '1:871919638023:web:abcdef...',
};

// ─── small reusable components ────────────────────────────────────────────────

function StepBar({ steps, current }) {
    return (
        <div className="flex items-center justify-center gap-2 mb-10">
            {steps.map((label, i) => (
                <React.Fragment key={i}>
                    <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all duration-300 ${
                            i < current  ? 'bg-cyan-500 text-black' :
                            i === current ? 'border-2 border-cyan-400 text-cyan-400 bg-black/40' :
                                           'border border-gray-700 text-gray-600 bg-black/10'
                        }`}>
                            {i < current ? '✓' : i + 1}
                        </div>
                        <span className={`text-xs font-semibold hidden sm:block transition-colors ${
                            i === current ? 'text-white' : i < current ? 'text-cyan-400' : 'text-gray-600'
                        }`}>{label}</span>
                    </div>
                    {i < steps.length - 1 && (
                        <div className={`h-px w-8 transition-colors duration-500 ${i < current ? 'bg-cyan-500' : 'bg-gray-800'}`} />
                    )}
                </React.Fragment>
            ))}
        </div>
    );
}

function CopyBtn({ text }) {
    const [ok, setOk] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold transition-all ${
                ok ? 'bg-green-900/50 text-green-400' : 'bg-gray-800 text-gray-500 hover:text-cyan-400'
            }`}
        >
            {ok ? '✓ Copied' : '📋 Copy'}
        </button>
    );
}

function CodeBlock({ children, lang }) {
    return (
        <div className="relative rounded-lg bg-gray-950 border border-gray-800 p-3 my-2 group">
            {lang && <span className="absolute top-2 right-2 text-[10px] text-gray-700 uppercase tracking-widest">{lang}</span>}
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all leading-relaxed pr-12">{children}</pre>
            <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <CopyBtn text={children} />
            </div>
        </div>
    );
}

function InstructStep({ n, title, children }) {
    return (
        <div className="flex gap-3 mb-4">
            <div className="w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400 text-[10px] font-black flex-shrink-0 mt-0.5">
                {n}
            </div>
            <div>
                <p className="text-xs font-bold text-white mb-1">{title}</p>
                <div className="text-xs text-gray-400 leading-relaxed space-y-1">{children}</div>
            </div>
        </div>
    );
}

function TabBar({ tabs, active, onChange, accent = 'cyan' }) {
    const colors = {
        cyan:   'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
        orange: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    };
    return (
        <div className="flex flex-wrap gap-1.5 mb-5">
            {tabs.map((tab, i) => (
                <button key={i} onClick={() => onChange(i)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                        active === i ? colors[accent] : 'border-transparent text-gray-500 hover:text-gray-300'
                    }`}>
                    {tab}
                </button>
            ))}
        </div>
    );
}

const METHOD_COLORS = {
    GET:    'bg-blue-900/50 text-blue-400',
    POST:   'bg-green-900/50 text-green-400',
    PUT:    'bg-orange-900/50 text-orange-400',
    PATCH:  'bg-yellow-900/50 text-yellow-400',
    DELETE: 'bg-red-900/50 text-red-400',
};

function EndpointRow({ method, path, desc }) {
    return (
        <div className="flex items-start gap-2 rounded-lg bg-gray-900/50 border border-gray-800/60 p-2.5 mb-1.5">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black flex-shrink-0 mt-0.5 ${METHOD_COLORS[method]}`}>{method}</span>
            <div>
                <code className="text-[11px] text-cyan-300">{path}</code>
                <p className="text-[10px] text-gray-500 mt-0.5">{desc}</p>
            </div>
        </div>
    );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function DatabaseSetup() {
    const navigate = useNavigate();

    // wizard state
    const [step,        setStep       ] = useState(0);           // 0 choose | 1 configure | 2 done
    const [dbType,      setDbType     ] = useState(null);        // 'firebase' | 'rest'
    const [configMode,  setConfigMode ] = useState('form');      // 'form' | 'json'
    const [fbConfig,    setFbConfig   ] = useState({ ...EMPTY_FB });
    const [jsonPaste,   setJsonPaste  ] = useState('');
    const [jsonErr,     setJsonErr    ] = useState('');
    const [restConfig,  setRestConfig ] = useState({ baseUrl: '', sse: false, pollMs: 5000 });
    const [showAdv,     setShowAdv    ] = useState(false);

    // test connection
    const [testState,   setTestState  ] = useState('idle');      // idle | loading | success | error
    const [testMsg,     setTestMsg    ] = useState('');

    // instruction tab per panel
    const [fbTab,  setFbTab ] = useState(0);
    const [rstTab, setRstTab] = useState(0);

    // ── load saved config ──────────────────────────────────────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem(SK.ADAPTER);
            if (saved === 'firebase') {
                setDbType('firebase');
                const fc = localStorage.getItem(SK.FIREBASE);
                if (fc) { try { setFbConfig(JSON.parse(fc)); } catch {} }
            } else if (saved === 'rest') {
                setDbType('rest');
                setRestConfig({
                    baseUrl: localStorage.getItem(SK.REST_URL) || '',
                    sse:     localStorage.getItem(SK.REST_SSE) === 'true',
                    pollMs:  parseInt(localStorage.getItem(SK.REST_POLL) || '5000', 10),
                });
            }
        } catch {}
    }, []);

    // ── helpers ────────────────────────────────────────────────────────────────
    const handleChoose = (type) => {
        setDbType(type);
        setStep(1);
        setTestState('idle');
        setTestMsg('');
        setFbTab(0);
        setRstTab(0);
    };

    const handleBack = () => {
        setStep(s => Math.max(0, s - 1));
        if (step === 1) setDbType(null);
        setTestState('idle');
        setTestMsg('');
    };

    const parseFbJson = () => {
        try {
            const raw   = jsonPaste.trim();
            const match = raw.match(/\{[\s\S]+\}/);
            if (!match) throw new Error('Could not find a JSON object in the pasted text.');
            const parsed = JSON.parse(match[0]);
            const required = ['apiKey', 'authDomain', 'projectId', 'appId'];
            const missing  = required.filter(k => !parsed[k]);
            if (missing.length) throw new Error(`Missing required fields: ${missing.join(', ')}`);
            setFbConfig({ ...EMPTY_FB, ...parsed });
            setJsonErr('');
            setConfigMode('form');
        } catch (err) {
            setJsonErr(err.message);
        }
    };

    const getActiveFbConfig = () => {
        if (configMode === 'json') {
            try {
                const m = jsonPaste.match(/\{[\s\S]+\}/);
                return m ? JSON.parse(m[0]) : fbConfig;
            } catch { return fbConfig; }
        }
        return fbConfig;
    };

    const handleTest = async () => {
        setTestState('loading');
        setTestMsg('Establishing connection…');

        try {
            if (dbType === 'firebase') {
                const cfg = getActiveFbConfig();
                if (!cfg.apiKey || !cfg.projectId) {
                    setTestState('error');
                    setTestMsg('Please fill in at least API Key and Project ID before testing.');
                    return;
                }
                // Dynamic import so this page loads even without Firebase env vars
                const { initializeApp, getApps, deleteApp } = await import('firebase/app');
                const { getDatabase, ref: rtRef, get }      = await import('firebase/database');
                const TEST_APP = '__ohsms_setup_test__';
                const existing = getApps().find(a => a.name === TEST_APP);
                if (existing) await deleteApp(existing);
                const testApp = initializeApp(cfg, TEST_APP);
                const testDb  = getDatabase(testApp);
                // /.info/connected is readable without auth rules — perfect for a ping
                await get(rtRef(testDb, '/.info/connected')).catch(() => {});
                await deleteApp(testApp);
                setTestState('success');
                setTestMsg('✅ Firebase connected! Your credentials are valid and the Realtime Database is reachable.');
            } else {
                const url = restConfig.baseUrl.replace(/\/$/, '');
                if (!url) {
                    setTestState('error');
                    setTestMsg('Please enter your API base URL before testing.');
                    return;
                }
                const res = await fetch(`${url}/health`, {
                    signal:  AbortSignal.timeout(8000),
                    headers: { Accept: 'application/json' },
                }).catch(err => {
                    throw new Error(
                        err.message.includes('Failed to fetch')
                            ? `Cannot reach ${url}. Check the URL and make sure CORS is enabled for this domain.`
                            : err.message
                    );
                });

                const ok = res.ok || res.status === 401 || res.status === 403 || res.status === 404;
                if (ok) {
                    setTestState('success');
                    setTestMsg(`✅ Server responded (HTTP ${res.status}). Your REST API is reachable!`);
                } else {
                    setTestState('error');
                    setTestMsg(`Server returned HTTP ${res.status}. Check your API URL and server configuration.`);
                }
            }
        } catch (err) {
            setTestState('error');
            setTestMsg(err.message.includes('timeout')
                ? 'Connection timed out. Is the server running and publicly accessible?'
                : err.message
            );
        }
    };

    const handleSave = () => {
        if (dbType === 'firebase') {
            const cfg = getActiveFbConfig();
            localStorage.setItem(SK.ADAPTER,  'firebase');
            localStorage.setItem(SK.FIREBASE, JSON.stringify(cfg));
        } else {
            localStorage.setItem(SK.ADAPTER,   'rest');
            localStorage.setItem(SK.REST_URL,  restConfig.baseUrl.replace(/\/$/, ''));
            localStorage.setItem(SK.REST_SSE,  restConfig.sse ? 'true' : 'false');
            localStorage.setItem(SK.REST_POLL, String(restConfig.pollMs));
        }
        localStorage.setItem(SK.DONE, 'true');
        setStep(2);
    };

    const handleLaunch = () => { window.location.href = '/'; };

    // ── shared styles ──────────────────────────────────────────────────────────
    const inputCls =
        'w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500 transition-colors';

    const testStatusCls = {
        success: 'border-green-500/30 bg-green-950/20 text-green-400',
        error:   'border-red-500/30 bg-red-950/20 text-red-400',
        loading: 'border-gray-700 bg-gray-900/50 text-gray-400',
        idle:    '',
    };

    // ── render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#080705] text-white overflow-y-auto">

            {/* subtle grid bg */}
            <div className="fixed inset-0 pointer-events-none opacity-[0.025]" style={{
                backgroundImage:
                    'linear-gradient(rgba(0,255,255,.6) 1px,transparent 1px),' +
                    'linear-gradient(90deg,rgba(0,255,255,.6) 1px,transparent 1px)',
                backgroundSize: '44px 44px',
            }} />

            <div className="relative max-w-5xl mx-auto px-4 py-10">

                {/* ── HEADER ── */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-cyan-400 mb-5">
                        🗄️ Database Configuration
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 leading-tight">
                        Connect Your<br className="sm:hidden" /> Database
                    </h1>
                    <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
                        OHSMS Enterprise works with <strong className="text-white">any database</strong>.
                        Configure your connection here — the entire app connects automatically without touching a single line of code.
                    </p>
                </div>

                {/* ── STEP BAR ── */}
                <StepBar steps={['Choose', 'Configure', 'Connected']} current={step} />

                {/* ═══════════════════════════════════════════════════════════
                    STEP 0 — CHOOSE
                ═══════════════════════════════════════════════════════════ */}
                {step === 0 && (
                    <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">

                        {/* Firebase card */}
                        <button onClick={() => handleChoose('firebase')}
                            className="group text-left rounded-2xl border border-gray-700 bg-gray-900/40 p-7 hover:border-orange-500/50 hover:bg-orange-950/20 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-orange-500/40">
                            <div className="text-5xl mb-4">🔥</div>
                            <h3 className="text-xl font-black text-white mb-2">Firebase</h3>
                            <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                                Google's managed real-time database. Free tier available. No backend server needed.
                            </p>
                            <ul className="space-y-1.5 mb-5">
                                {[
                                    '✓ Free up to 1 GB storage',
                                    '✓ Real-time updates built-in',
                                    '✓ No server to maintain',
                                    '✓ Auto-scales with usage',
                                    '✓ 5-minute setup',
                                ].map(f => <li key={f} className="text-xs text-gray-500">{f}</li>)}
                            </ul>
                            <p className="text-xs font-bold text-orange-400 mb-3">
                                Best for: Quick start, SMBs, teams without DevOps
                            </p>
                            <span className="inline-flex items-center gap-2 text-xs font-black text-orange-400 group-hover:gap-3 transition-all">
                                Select Firebase →
                            </span>
                        </button>

                        {/* Own Database card */}
                        <button onClick={() => handleChoose('rest')}
                            className="group text-left rounded-2xl border border-gray-700 bg-gray-900/40 p-7 hover:border-cyan-500/50 hover:bg-cyan-950/20 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-500/40">
                            <div className="text-5xl mb-4">🖥️</div>
                            <h3 className="text-xl font-black text-white mb-2">Your Own Database</h3>
                            <p className="text-xs text-gray-400 mb-5 leading-relaxed">
                                Connect to PostgreSQL, MongoDB, MySQL, SQLite, Supabase or any database via your own REST API.
                            </p>
                            <ul className="space-y-1.5 mb-5">
                                {[
                                    '✓ Full data sovereignty',
                                    '✓ On-premise or any cloud',
                                    '✓ Works with any SQL or NoSQL DB',
                                    '✓ GDPR / compliance ready',
                                    '✓ Unlimited storage',
                                ].map(f => <li key={f} className="text-xs text-gray-500">{f}</li>)}
                            </ul>
                            <p className="text-xs font-bold text-cyan-400 mb-3">
                                Best for: Enterprises, regulated industries, data control
                            </p>
                            <span className="inline-flex items-center gap-2 text-xs font-black text-cyan-400 group-hover:gap-3 transition-all">
                                Select Own Database →
                            </span>
                        </button>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STEP 1 — CONFIGURE FIREBASE
                ═══════════════════════════════════════════════════════════ */}
                {step === 1 && dbType === 'firebase' && (
                    <div className="grid lg:grid-cols-[1fr_1.1fr] gap-6 max-w-5xl mx-auto">

                        {/* ── Left: Instructions ── */}
                        <div>
                            <TabBar tabs={['Setup Guide', 'Security Rules', 'Env Variables']}
                                active={fbTab} onChange={setFbTab} accent="orange" />

                            {fbTab === 0 && (
                                <div>
                                    <InstructStep n={1} title="Create a Firebase Project">
                                        <p>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer"
                                            className="text-orange-400 underline hover:text-orange-300">console.firebase.google.com</a></p>
                                        <p>Click <strong className="text-white">Add Project</strong> → Enter a name → Continue → Create Project</p>
                                    </InstructStep>

                                    <InstructStep n={2} title="Enable Realtime Database">
                                        <p>In your project: <strong className="text-white">Build → Realtime Database → Create Database</strong></p>
                                        <p>Choose a server location → Select <em className="text-orange-300">Start in test mode</em> → Enable</p>
                                        <p className="text-gray-600 text-[10px] mt-1">You can tighten security rules later (see Security Rules tab)</p>
                                    </InstructStep>

                                    <InstructStep n={3} title="Enable Email/Password Auth">
                                        <p><strong className="text-white">Authentication → Get Started → Sign-in method</strong></p>
                                        <p>Click <strong className="text-white">Email/Password → Enable → Save</strong></p>
                                    </InstructStep>

                                    <InstructStep n={4} title="Get Your Config Object">
                                        <p>Go to <strong className="text-white">Project Settings ⚙️</strong> (gear icon, top-left)</p>
                                        <p>Scroll to <strong className="text-white">Your apps → Web app (&lt;/&gt;)</strong> → Register app</p>
                                        <p>Copy the <code className="bg-gray-800 px-1 rounded text-orange-300">firebaseConfig</code> object shown</p>
                                    </InstructStep>

                                    <InstructStep n={5} title="Paste or Enter Config on the Right">
                                        <p>Switch to <strong className="text-white">Paste JSON</strong> mode and paste your config, or fill each field individually</p>
                                        <p>Click <strong className="text-white">Test Connection</strong> → then <strong className="text-white">Save &amp; Connect</strong></p>
                                    </InstructStep>

                                    <div className="rounded-xl border border-orange-500/20 bg-orange-950/15 p-3 mt-2">
                                        <p className="text-[11px] font-bold text-orange-400 mb-1">🔒 Firebase Keys are Client-Safe</p>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            Firebase API keys are not secret — they identify your project, not grant access.
                                            Protect data using <strong className="text-white">Security Rules</strong>, not by hiding the key.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {fbTab === 1 && (
                                <div>
                                    <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                                        Set these rules in <strong className="text-white">Realtime Database → Rules</strong> tab.
                                        They ensure only authenticated OHSMS users can read/write data.
                                    </p>

                                    <p className="text-[11px] font-bold text-white mb-1">Recommended (requires login):</p>
                                    <CodeBlock lang="json">{`{
  "rules": {
    ".read":  "auth != null",
    ".write": "auth != null"
  }
}`}</CodeBlock>

                                    <p className="text-[11px] font-bold text-white mb-1 mt-4">Development only (open — disable for production!):</p>
                                    <CodeBlock lang="json">{`{
  "rules": {
    ".read":  true,
    ".write": true
  }
}`}</CodeBlock>

                                    <p className="text-[11px] font-bold text-white mb-1 mt-4">Production-grade (org-scoped):</p>
                                    <CodeBlock lang="json">{`{
  "rules": {
    "organizations": {
      "$orgId": {
        ".read":  "auth != null",
        ".write": "auth != null"
      }
    },
    "userDirectory": {
      ".read":  "auth != null",
      ".write": "auth != null"
    },
    "joinRegistry": {
      ".read":  "auth != null",
      ".write": "auth != null"
    }
  }
}`}</CodeBlock>
                                </div>
                            )}

                            {fbTab === 2 && (
                                <div>
                                    <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                                        For production deployments, set credentials as environment variables in Vercel/Netlify
                                        instead of storing them in localStorage. This is more secure.
                                    </p>

                                    <p className="text-[11px] font-bold text-white mb-1">Vercel: Project Settings → Environment Variables</p>
                                    <CodeBlock lang=".env">{`VITE_FIREBASE_API_KEY=AIzaSyB...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=871919638023
VITE_FIREBASE_APP_ID=1:871919638023:web:abcdef`}</CodeBlock>

                                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3 mt-3">
                                        <p className="text-[11px] font-bold text-cyan-400 mb-1">💡 Priority Order</p>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            Environment variables override this form. If env vars are set in Vercel, you don't need to enter anything here — redeploy and the app uses them automatically.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Right: Form ── */}
                        <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-5">
                            <h3 className="text-sm font-black text-white mb-4">Firebase Configuration</h3>

                            {/* mode toggle */}
                            <div className="flex gap-2 mb-4">
                                {[['form', 'Enter Fields'], ['json', 'Paste JSON']].map(([mode, label]) => (
                                    <button key={mode} onClick={() => setConfigMode(mode)}
                                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                                            configMode === mode
                                                ? 'bg-orange-500/20 border-orange-500/30 text-orange-400'
                                                : 'border-transparent text-gray-500 hover:text-gray-300'
                                        }`}>
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {configMode === 'form' ? (
                                <div className="space-y-2.5">
                                    {Object.keys(EMPTY_FB).map(key => (
                                        <div key={key}>
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">
                                                {key}
                                                {['apiKey', 'authDomain', 'projectId', 'appId'].includes(key) && (
                                                    <span className="text-red-500 ml-1">*</span>
                                                )}
                                            </label>
                                            <input
                                                type="text"
                                                value={fbConfig[key]}
                                                onChange={e => setFbConfig(prev => ({ ...prev, [key]: e.target.value }))}
                                                className={inputCls}
                                                placeholder={FB_PLACEHOLDERS[key]}
                                            />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div>
                                    <p className="text-[11px] text-gray-400 mb-2">
                                        Paste your entire <code className="bg-gray-800 px-1 rounded text-orange-300 text-[10px]">firebaseConfig</code> object
                                        (copied from Firebase Console → Project Settings → Your apps):
                                    </p>
                                    <textarea
                                        value={jsonPaste}
                                        onChange={e => { setJsonPaste(e.target.value); setJsonErr(''); }}
                                        className={`${inputCls} h-44 resize-none font-mono text-[11px] leading-relaxed`}
                                        placeholder={`const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  authDomain: "your-project.firebaseapp.com",\n  databaseURL: "https://...-rtdb.firebaseio.com",\n  projectId: "your-project-id",\n  storageBucket: "...",\n  messagingSenderId: "...",\n  appId: "1:...:web:..."\n};`}
                                    />
                                    {jsonErr && <p className="text-[11px] text-red-400 mt-1.5">⚠ {jsonErr}</p>}
                                    <button onClick={parseFbJson}
                                        className="mt-2 px-4 py-2 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[11px] font-bold hover:bg-orange-500/30 transition">
                                        ✦ Parse &amp; Apply Config
                                    </button>
                                </div>
                            )}

                            {/* test + save */}
                            <div className="mt-5 grid grid-cols-2 gap-2.5">
                                <button onClick={handleTest} disabled={testState === 'loading'}
                                    className="py-2.5 rounded-xl bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold hover:bg-orange-500/25 transition disabled:opacity-50">
                                    {testState === 'loading' ? '⏳ Testing…' : '🔌 Test Connection'}
                                </button>
                                <button onClick={handleSave}
                                    className="py-2.5 rounded-xl bg-cyan-500 text-black text-xs font-black hover:bg-cyan-400 transition">
                                    Save &amp; Connect →
                                </button>
                            </div>

                            {testState !== 'idle' && (
                                <div className={`mt-3 rounded-xl border p-3 text-xs leading-relaxed ${testStatusCls[testState]}`}>
                                    {testMsg}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STEP 1 — CONFIGURE REST / OWN DATABASE
                ═══════════════════════════════════════════════════════════ */}
                {step === 1 && dbType === 'rest' && (
                    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-6 max-w-5xl mx-auto">

                        {/* ── Left: Instructions ── */}
                        <div>
                            <TabBar tabs={['API Contract', 'Backend Options', 'Env Variables']}
                                active={rstTab} onChange={setRstTab} accent="cyan" />

                            {rstTab === 0 && (
                                <div>
                                    <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                                        Your backend must implement the following REST endpoints.
                                        <code className="bg-gray-800 px-1 rounded text-cyan-300 text-[10px] ml-1">{'{path}'}</code> is
                                        a slash-separated data path (e.g. <code className="bg-gray-800 px-1 rounded text-cyan-300 text-[10px]">organizations/org1/incidents</code>).
                                    </p>

                                    <p className="text-[11px] font-bold text-white mb-2">Data Endpoints:</p>
                                    <EndpointRow method="GET"    path="/{path}"  desc="Fetch data at path. Returns JSON value or null." />
                                    <EndpointRow method="GET"    path="/{path}?{field}={value}" desc="Query: filter by single field=value." />
                                    <EndpointRow method="POST"   path="/{path}"  desc="Create child record. Returns { id: 'generated-id' }." />
                                    <EndpointRow method="PUT"    path="/{path}"  desc="Overwrite entire record (set)." />
                                    <EndpointRow method="PATCH"  path="/{path}"  desc="Partial update — merge fields (update)." />
                                    <EndpointRow method="DELETE" path="/{path}"  desc="Delete record at path." />
                                    <EndpointRow method="GET"    path="/health"  desc="Health check. Must return HTTP 200." />

                                    <p className="text-[11px] font-bold text-white mb-2 mt-4">Auth Endpoints:</p>
                                    <EndpointRow method="POST"   path="/auth/login"          desc="Authenticate. Body: { email, password }. Returns { token, uid, email }." />
                                    <EndpointRow method="POST"   path="/auth/logout"          desc="Invalidate token. Header: Authorization: Bearer <token>." />
                                    <EndpointRow method="POST"   path="/auth/users"           desc="Admin: create user. Body: { email, password }. Returns { uid }." />
                                    <EndpointRow method="DELETE" path="/auth/users/:uid"      desc="Admin: delete user account." />
                                    <EndpointRow method="POST"   path="/auth/password-reset"  desc="Send password reset email. Body: { email }." />
                                    <EndpointRow method="PATCH"  path="/auth/password"        desc="Update password. Body: { newPassword }." />
                                    <EndpointRow method="POST"   path="/auth/reauth"          desc="Re-authenticate. Body: { email, password }." />

                                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3 mt-4">
                                        <p className="text-[11px] font-bold text-cyan-400 mb-1">🔐 Authentication Header</p>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            All data endpoints must accept <code className="bg-gray-800 px-1 rounded text-cyan-300 text-[10px]">Authorization: Bearer &lt;jwt&gt;</code>.
                                            The JWT comes from <code className="bg-gray-800 px-1 rounded text-cyan-300 text-[10px]">POST /auth/login</code>.
                                        </p>
                                    </div>

                                    <div className="rounded-xl border border-yellow-500/20 bg-yellow-950/15 p-3 mt-3">
                                        <p className="text-[11px] font-bold text-yellow-400 mb-1">⚠ CORS Required</p>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            Your server must allow CORS from your Vercel/Netlify domain. Enable all methods: GET, POST, PUT, PATCH, DELETE.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {rstTab === 1 && (
                                <div className="space-y-3">
                                    <p className="text-xs text-gray-400 leading-relaxed">
                                        Any tech stack works — you just need to implement the API contract. Here are the easiest options, ranked by setup effort:
                                    </p>

                                    {[
                                        {
                                            badge: '⭐',
                                            name:  'Supabase',
                                            stack: 'PostgreSQL + built-in REST API',
                                            diff:  'Easiest',
                                            color: 'border-yellow-500/30 bg-yellow-950/10',
                                            desc:  'Create a free project at supabase.com. You get PostgreSQL + auto-generated REST API instantly. Set the Supabase project URL as your API base URL.',
                                        },
                                        {
                                            badge: '⭐',
                                            name:  'PocketBase',
                                            stack: 'Go · single binary',
                                            diff:  'Easiest',
                                            color: 'border-yellow-500/30 bg-yellow-950/10',
                                            desc:  'A self-hosted backend in a single executable. Download, run, done. Perfect if you want full control with minimal DevOps.',
                                        },
                                        {
                                            badge: '🟢',
                                            name:  'Node.js + Express + PostgreSQL',
                                            stack: 'TypeScript · Railway / Render',
                                            diff:  'Easy',
                                            color: 'border-green-500/20 bg-green-950/10',
                                            desc:  'The most popular production stack. Deploy to Railway or Render in minutes. Full SQL power with structured EHS data.',
                                        },
                                        {
                                            badge: '🟢',
                                            name:  'Python + FastAPI + PostgreSQL',
                                            stack: 'Python · Railway / AWS',
                                            diff:  'Easy',
                                            color: 'border-green-500/20 bg-green-950/10',
                                            desc:  'FastAPI auto-generates OpenAPI docs. Perfect for teams comfortable with Python.',
                                        },
                                        {
                                            badge: '🟡',
                                            name:  'Node.js + Express + MongoDB',
                                            stack: 'MongoDB Atlas · Render',
                                            diff:  'Medium',
                                            color: 'border-gray-700 bg-gray-900/30',
                                            desc:  'Flexible document store — schema-free like Firebase. Good migration path from Firebase.',
                                        },
                                        {
                                            badge: '🟡',
                                            name:  'Laravel + MySQL',
                                            stack: 'PHP · cPanel / VPS',
                                            diff:  'Medium',
                                            color: 'border-gray-700 bg-gray-900/30',
                                            desc:  'Great if your team knows PHP. MySQL is widely supported in corporate hosting environments.',
                                        },
                                    ].map(({ badge, name, stack, diff, color, desc }) => (
                                        <div key={name} className={`rounded-xl border p-3.5 ${color}`}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-base">{badge}</span>
                                                <span className="text-sm font-black text-white">{name}</span>
                                                <span className="text-[10px] text-gray-500">{stack}</span>
                                                <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                    diff === 'Easiest' ? 'bg-yellow-900/50 text-yellow-400' :
                                                    diff === 'Easy'    ? 'bg-green-900/50 text-green-400' :
                                                                         'bg-gray-800 text-gray-400'
                                                }`}>{diff}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-400 leading-relaxed">{desc}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {rstTab === 2 && (
                                <div>
                                    <p className="text-xs text-gray-400 mb-3 leading-relaxed">
                                        For production, set these in Vercel/Netlify instead of using this form.
                                        They take priority over localStorage values.
                                    </p>

                                    <CodeBlock lang=".env">{`# Switch to REST API backend
VITE_DB_ADAPTER=rest

# Your backend API URL (no trailing slash)
VITE_API_BASE_URL=https://your-api.example.com

# Real-time: false = polling, true = Server-Sent Events
VITE_API_SSE=false

# How often to poll for changes (milliseconds)
VITE_API_POLL_MS=5000`}</CodeBlock>

                                    <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3 mt-4">
                                        <p className="text-[11px] font-bold text-cyan-400 mb-2">💡 SSE vs Polling</p>
                                        <p className="text-[10px] text-gray-400 leading-relaxed mb-2">
                                            <strong className="text-white">Polling</strong> (default): The app checks for changes every few seconds.
                                            Simple to implement — no special backend support needed.
                                        </p>
                                        <p className="text-[10px] text-gray-400 leading-relaxed">
                                            <strong className="text-white">SSE</strong>: Your server streams changes instantly via
                                            <code className="bg-gray-800 px-1 rounded text-[10px] text-cyan-300"> GET /{'{path}'}?stream=1</code>
                                            returning <code className="bg-gray-800 px-1 rounded text-[10px] text-cyan-300">text/event-stream</code>.
                                            Closer to Firebase's real-time feel.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Right: Form ── */}
                        <div className="rounded-2xl border border-gray-800 bg-gray-900/30 p-5">
                            <h3 className="text-sm font-black text-white mb-1">API Configuration</h3>
                            <p className="text-[11px] text-gray-500 mb-5">Stored in your browser. Overridden by Vercel env vars.</p>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                                        API Base URL <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="url"
                                        value={restConfig.baseUrl}
                                        onChange={e => setRestConfig(prev => ({ ...prev, baseUrl: e.target.value }))}
                                        className={inputCls}
                                        placeholder="https://your-api.example.com"
                                    />
                                    <p className="text-[10px] text-gray-600 mt-1">
                                        All requests are sent to this URL + path. No trailing slash.
                                    </p>
                                </div>

                                {/* Advanced */}
                                <div>
                                    <button onClick={() => setShowAdv(v => !v)}
                                        className="text-[11px] text-gray-500 hover:text-cyan-400 transition flex items-center gap-1">
                                        <span>{showAdv ? '▾' : '▸'}</span> Advanced Options
                                    </button>

                                    {showAdv && (
                                        <div className="mt-3 space-y-4 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                                            <div>
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">
                                                    Real-time Update Method
                                                </label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {[
                                                        { v: false, label: 'Polling', desc: 'Checks every few seconds (simple)' },
                                                        { v: true,  label: 'SSE',     desc: 'Server-Sent Events (instant)' },
                                                    ].map(({ v, label, desc }) => (
                                                        <button key={label} type="button"
                                                            onClick={() => setRestConfig(prev => ({ ...prev, sse: v }))}
                                                            className={`rounded-lg border p-2.5 text-left transition ${
                                                                restConfig.sse === v
                                                                    ? 'border-cyan-500/40 bg-cyan-950/30 text-cyan-400'
                                                                    : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                                                            }`}>
                                                            <p className="text-xs font-bold">{label}</p>
                                                            <p className="text-[10px] mt-0.5">{desc}</p>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {!restConfig.sse && (
                                                <div>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
                                                            Poll Interval
                                                        </label>
                                                        <span className="text-xs font-bold text-cyan-400">
                                                            {restConfig.pollMs / 1000}s
                                                        </span>
                                                    </div>
                                                    <input type="range" min="1000" max="30000" step="1000"
                                                        value={restConfig.pollMs}
                                                        onChange={e => setRestConfig(prev => ({ ...prev, pollMs: parseInt(e.target.value, 10) }))}
                                                        className="w-full accent-cyan-500"
                                                    />
                                                    <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                                                        <span>1s (frequent)</span>
                                                        <span>30s (less load)</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* test + save */}
                            <div className="mt-6 grid grid-cols-2 gap-2.5">
                                <button onClick={handleTest} disabled={testState === 'loading'}
                                    className="py-2.5 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-xs font-bold hover:bg-cyan-500/25 transition disabled:opacity-50">
                                    {testState === 'loading' ? '⏳ Testing…' : '🔌 Test Connection'}
                                </button>
                                <button onClick={handleSave}
                                    className="py-2.5 rounded-xl bg-cyan-500 text-black text-xs font-black hover:bg-cyan-400 transition">
                                    Save &amp; Connect →
                                </button>
                            </div>

                            {testState !== 'idle' && (
                                <div className={`mt-3 rounded-xl border p-3 text-xs leading-relaxed ${testStatusCls[testState]}`}>
                                    {testMsg}
                                </div>
                            )}

                            <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/40 p-3">
                                <p className="text-[11px] font-bold text-white mb-1">💡 Don't have a backend yet?</p>
                                <p className="text-[10px] text-gray-400 leading-relaxed">
                                    Use <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300">Supabase</a> for the easiest start — free PostgreSQL database with a built-in REST API, no backend code needed.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STEP 2 — DONE
                ═══════════════════════════════════════════════════════════ */}
                {step === 2 && (
                    <div className="text-center max-w-lg mx-auto">
                        <div className="text-8xl mb-6 select-none">✅</div>
                        <h2 className="text-3xl font-black text-white mb-3">Database Connected!</h2>
                        <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                            {dbType === 'firebase'
                                ? 'Firebase Realtime Database is now configured. All data operations in OHSMS Enterprise will route through your Firebase project.'
                                : 'Your REST API is now configured. All data operations will route through your backend server.'}
                        </p>

                        <div className="rounded-2xl border border-green-500/20 bg-green-950/15 p-5 mb-8 text-left">
                            <p className="text-xs font-black text-green-400 mb-3">What happens when you launch:</p>
                            <ul className="space-y-2 text-xs text-gray-400">
                                <li className="flex gap-2"><span className="text-green-500">→</span> The app reloads and connects using your new {dbType === 'firebase' ? 'Firebase' : 'REST API'} settings</li>
                                <li className="flex gap-2"><span className="text-green-500">→</span> Create your first organization from the login page</li>
                                <li className="flex gap-2"><span className="text-green-500">→</span> All data is stored in your {dbType === 'firebase' ? 'Firebase project' : 'database'}</li>
                                <li className="flex gap-2"><span className="text-green-500">→</span> You can reconfigure any time by visiting <code className="bg-gray-800 px-1 rounded">/setup</code></li>
                            </ul>
                        </div>

                        <button onClick={handleLaunch}
                            className="px-10 py-3.5 rounded-xl bg-cyan-500 text-black font-black text-sm hover:bg-cyan-400 active:bg-cyan-600 transition">
                            Launch OHSMS Enterprise →
                        </button>

                        <p className="mt-4 text-[11px] text-gray-600">
                            Settings saved in browser localStorage ·{' '}
                            <button onClick={() => setStep(1)} className="text-gray-500 hover:text-gray-300 underline transition">Edit configuration</button>
                        </p>
                    </div>
                )}

                {/* ── back button ── */}
                {step > 0 && step < 2 && (
                    <div className="text-center mt-8">
                        <button onClick={handleBack}
                            className="text-xs text-gray-600 hover:text-gray-400 transition">
                            ← Back
                        </button>
                    </div>
                )}

                {/* ── footer ── */}
                <div className="text-center mt-12 text-[10px] text-gray-700 space-x-3">
                    <span>OHSMS Enterprise · Database Configuration</span>
                    <span>·</span>
                    <button onClick={() => navigate('/')} className="hover:text-gray-500 transition underline">
                        Skip — use current config
                    </button>
                </div>
            </div>
        </div>
    );
}
