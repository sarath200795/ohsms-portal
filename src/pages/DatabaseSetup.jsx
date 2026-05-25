/**
 * DatabaseSetup.jsx — Organisation Onboarding Wizard  (route: /setup)
 *
 * Step 0 — Choose Database (Firebase or Own DB)
 * Step 1 — Configure Database (form + test connection)
 * Step 2 — Upload Logo (optional)
 * Step 3 — Create Organisation & First Admin User → auto-login → /dashboard
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/auth/index.js';
import { dbSet, dbPush } from '../services/db/index.js';
import { compressImageToBase64, base64SizeKB } from '../utils/imageUtils.js';
import { normalizeSessionPermissions } from '../utils/permissions';
import { ACCOUNT_STATUS, writeStoredSession } from '../utils/session';

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

const generateJoinCode = () =>
    `JOIN-${Math.random().toString(36).slice(2, 8).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

// ─── small reusable components ────────────────────────────────────────────────

function StepBar({ steps, current }) {
    return (
        <div className="flex items-center justify-center gap-2 mb-10 flex-wrap">
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
                        <div className={`h-px w-6 transition-colors duration-500 ${i < current ? 'bg-cyan-500' : 'bg-gray-800'}`} />
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
    const navigate    = useNavigate();
    const logoFileRef = useRef(null);

    // ── wizard step: 0=Choose 1=Configure 2=Logo 3=CreateOrg ──────────────────
    const [step,        setStep       ] = useState(0);
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

    // ── Logo state ─────────────────────────────────────────────────────────────
    const [logoPreview,   setLogoPreview  ] = useState(null);
    const [logoError,     setLogoError    ] = useState('');

    // ── Create org state ───────────────────────────────────────────────────────
    const [orgName,       setOrgName      ] = useState('');
    const [userName,      setUserName     ] = useState('');
    const [regEmail,      setRegEmail     ] = useState('');
    const [regPassword,   setRegPassword  ] = useState('');
    const [showPassword,  setShowPassword ] = useState(false);
    const [createError,   setCreateError  ] = useState('');
    const [createLoading, setCreateLoading] = useState(false);
    const [createSuccess, setCreateSuccess] = useState(false);

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
        if (step === 1) { setStep(0); setDbType(null); }
        else { setStep(s => Math.max(0, s - 1)); }
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
                const { initializeApp, getApps, deleteApp } = await import('firebase/app');
                const { getDatabase, ref: rtRef, get }      = await import('firebase/database');
                const TEST_APP = '__ohsms_setup_test__';
                const existing = getApps().find(a => a.name === TEST_APP);
                if (existing) await deleteApp(existing);
                const testApp = initializeApp(cfg, TEST_APP);
                const testDb  = getDatabase(testApp);
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
        // Reload the page so the new adapter is picked up by all service modules,
        // then navigate to the logo step after reload via sessionStorage flag.
        sessionStorage.setItem('ohsms_setup_step', '2');
        window.location.reload();
    };

    // Restore step after page reload triggered by handleSave
    useEffect(() => {
        const pending = sessionStorage.getItem('ohsms_setup_step');
        if (pending) {
            sessionStorage.removeItem('ohsms_setup_step');
            setStep(parseInt(pending, 10));
        }
    }, []);

    // ── Logo handlers ──────────────────────────────────────────────────────────
    const handleLogoFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLogoError('');
        try {
            const dataUrl = await compressImageToBase64(file, 256, 0.85);
            const sizeKb  = base64SizeKB(dataUrl);
            if (sizeKb > 200) {
                setLogoError(`Image is still too large after compression (${sizeKb} KB). Please choose a smaller image.`);
                return;
            }
            setLogoPreview(dataUrl);
        } catch (err) {
            setLogoError(err.message);
        }
    };

    // ── Create Org handler ─────────────────────────────────────────────────────
    const handleCreateOrg = async (e) => {
        e.preventDefault();
        setCreateError('');

        if (orgName.trim().length < 2)  return setCreateError('Organisation name must be at least 2 characters.');
        if (userName.trim().length < 2) return setCreateError('Your full name must be at least 2 characters.');
        if (regPassword.length < 6)     return setCreateError('Password must be at least 6 characters.');

        setCreateLoading(true);
        try {
            const userEmail = regEmail.trim().toLowerCase();

            // 1. Create the Firebase Auth account via the provisioning app.
            //    createUser uses a secondary app and signs OUT of it when done,
            //    so the primary auth still has no current user at this point.
            const uid = await authService.createUser(userEmail, regPassword);

            // 2. Sign in to the PRIMARY auth instance so the Firebase security
            //    rules (auth != null) pass for all subsequent DB writes.
            await authService.signIn(userEmail, regPassword);

            // 3. Now safe to write — auth.currentUser is set.
            const orgId = await dbPush('organizations', null);
            const code      = generateJoinCode();

            await dbSet(`organizations/${orgId}`, {
                details: {
                    name:               orgName.trim(),
                    createdAt:          new Date().toISOString(),
                    ownerEmail:         userEmail,
                    joinCode:           code,
                    joinCodeUpdatedAt:  new Date().toISOString(),
                    joinCodeUpdatedBy:  userEmail,
                    ...(logoPreview ? { logoBase64: logoPreview } : {}),
                },
                sites: { 'HQ-01': { code: 'HQ-01', name: 'Headquarters' } },
                users: {
                    [uid]: {
                        name:             userName.trim(),
                        email:            userEmail,
                        role:             'Global Owner',
                        assignedSite:     'GLOBAL',
                        accessibleSites:  ['GLOBAL'],
                        status:           ACCOUNT_STATUS.ACTIVE,
                        createdAt:        new Date().toISOString(),
                    },
                },
            });

            await dbSet(`userDirectory/${uid}`, { orgId });
            await dbSet(`joinRegistry/${code}`,  orgId);

            const session = normalizeSessionPermissions({
                uid,
                email:             userEmail,
                orgId,
                name:              userName.trim(),
                role:              'Global Owner',
                status:            ACCOUNT_STATUS.ACTIVE,
                assignedSite:      'GLOBAL',
                accessibleSites:   ['GLOBAL'],
                accessibleModules: [
                    'Analytics', 'Incidents', 'Risk Assessment', 'Participation',
                    'Internal Audit', 'CAPA Manager', 'Training', 'Improvement',
                    'Record Emergency', 'OHS Tools', 'Contractors', 'MOC',
                    'Inspections', 'Sites', 'Users', 'Activity Calendar', 'Tutorials',
                ],
            });

            writeStoredSession(session);
            setCreateSuccess(true);
            setTimeout(() => navigate('/dashboard'), 1500);
        } catch (err) {
            setCreateError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setCreateLoading(false);
        }
    };

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
                    <button
                        onClick={() => navigate('/')}
                        className="inline-flex items-center gap-2 mb-5 opacity-60 hover:opacity-100 transition-opacity"
                    >
                        <img src="/we-ehs-logo.jpg" alt="OHSMS" className="h-8 w-8 rounded-xl object-cover" />
                        <span className="text-xs font-black uppercase tracking-widest text-gray-400">OHSMS Enterprise</span>
                    </button>
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-cyan-400 mb-5 block">
                        🚀 New Organisation Setup
                    </div>
                    <h1 className="text-4xl sm:text-5xl font-black text-white mb-3 leading-tight">
                        Set Up Your Workspace
                    </h1>
                    <p className="text-sm text-gray-400 max-w-lg mx-auto leading-relaxed">
                        Connect your database, brand with your logo, and create your admin account —
                        your EHS command centre will be ready in minutes.
                    </p>
                </div>

                {/* ── STEP BAR ── */}
                <StepBar steps={['Database', 'Configure', 'Upload Logo', 'Create Org']} current={step} />

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
                                        <p>Click <strong className="text-white">Test Connection</strong> → then <strong className="text-white">Save &amp; Continue</strong></p>
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
                                    Save &amp; Continue →
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
                                            name:  'FastAPI + PostgreSQL',
                                            stack: 'Python · Render / Fly.io',
                                            diff:  'Easy',
                                            color: 'border-green-500/20 bg-green-950/10',
                                            desc:  'Auto-generated OpenAPI docs. Perfect for data science teams or orgs already using Python.',
                                        },
                                        {
                                            badge: '🔵',
                                            name:  'Laravel + MySQL',
                                            stack: 'PHP · any shared hosting',
                                            diff:  'Medium',
                                            color: 'border-blue-500/20 bg-blue-950/10',
                                            desc:  'Works on even the cheapest shared hosting. Good for organisations already running PHP-based ERP systems.',
                                        },
                                        {
                                            badge: '🔵',
                                            name:  'MongoDB Atlas + API',
                                            stack: 'NoSQL · Atlas Data API',
                                            diff:  'Medium',
                                            color: 'border-blue-500/20 bg-blue-950/10',
                                            desc:  'Schema-free migration from Firebase. Atlas has a built-in Data API that can serve as your REST backend.',
                                        },
                                    ].map(opt => (
                                        <div key={opt.name} className={`rounded-xl border p-3 ${opt.color}`}>
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <p className="text-xs font-black text-white">{opt.badge} {opt.name}</p>
                                                <span className="text-[10px] text-gray-500">{opt.stack}</span>
                                            </div>
                                            <p className="text-[11px] text-gray-400 leading-relaxed">{opt.desc}</p>
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
                                    Save &amp; Continue →
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
                    STEP 2 — UPLOAD LOGO (optional)
                ═══════════════════════════════════════════════════════════ */}
                {step === 2 && (
                    <div className="max-w-md mx-auto">
                        <div className="text-center mb-8">
                            <div className="text-6xl mb-3 select-none">🏢</div>
                            <h2 className="text-2xl font-black text-white mb-2">Upload Your Logo</h2>
                            <p className="text-sm text-gray-400 leading-relaxed">
                                This logo replaces the default icon across your entire workspace.
                                You can skip this and upload it later from the dashboard.
                            </p>
                        </div>

                        {/* Preview */}
                        <div className="flex flex-col items-center gap-4 mb-6">
                            <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-gray-600 bg-gray-900/60 shadow-lg">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Logo preview" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-gray-600">
                                        <span className="text-4xl">📷</span>
                                        <span className="text-[10px] font-bold uppercase tracking-widest">No logo yet</span>
                                    </div>
                                )}
                                {logoPreview && (
                                    <span className="absolute bottom-2 right-2 rounded-lg bg-cyan-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-black">
                                        Preview
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-500 text-center">
                                {logoPreview
                                    ? `Compressed to ${base64SizeKB(logoPreview)} KB — looks great!`
                                    : 'PNG, JPG, SVG, WEBP accepted · Auto-compressed to 256×256 px'}
                            </p>
                        </div>

                        {/* File picker */}
                        <label className="mb-4 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-700 bg-gray-900/50 px-4 py-4 transition hover:border-cyan-500/50 hover:bg-cyan-950/10">
                            <span className="text-xl">📁</span>
                            <span className="text-sm text-gray-400">
                                {logoPreview ? 'Choose a different image' : 'Choose image file…'}
                            </span>
                            <input
                                ref={logoFileRef}
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={handleLogoFile}
                            />
                        </label>

                        {logoError && (
                            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs text-red-400">
                                ⚠ {logoError}
                            </div>
                        )}

                        {logoPreview && (
                            <button
                                type="button"
                                onClick={() => { setLogoPreview(null); setLogoError(''); if (logoFileRef.current) logoFileRef.current.value = ''; }}
                                className="mb-4 w-full text-center text-xs text-gray-600 hover:text-red-400 transition"
                            >
                                ✕ Remove selected image
                            </button>
                        )}

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => { setLogoPreview(null); setStep(3); }}
                                className="py-3 rounded-xl border border-gray-700 text-gray-400 text-xs font-bold hover:border-gray-500 hover:text-gray-200 transition"
                            >
                                Skip for now →
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep(3)}
                                disabled={!logoPreview}
                                className="py-3 rounded-xl bg-cyan-500 text-black text-xs font-black hover:bg-cyan-400 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Use This Logo →
                            </button>
                        </div>

                        <p className="mt-4 text-center text-[10px] text-gray-700">
                            You can change the logo any time from the dashboard (Global Owner only).
                        </p>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    STEP 3 — CREATE ORGANISATION & FIRST ADMIN USER
                ═══════════════════════════════════════════════════════════ */}
                {step === 3 && (
                    <div className="max-w-lg mx-auto">
                        {createSuccess ? (
                            /* ── Success state ── */
                            <div className="text-center py-10">
                                <div className="text-8xl mb-6 select-none animate-bounce">🎉</div>
                                <h2 className="text-3xl font-black text-white mb-3">Organisation Created!</h2>
                                <p className="text-sm text-gray-400 mb-2">
                                    Welcome aboard, Global Owner. Your EHS workspace is ready.
                                </p>
                                <p className="text-xs text-cyan-400">Redirecting to your dashboard…</p>
                            </div>
                        ) : (
                            <form onSubmit={handleCreateOrg} className="space-y-5">
                                <div className="text-center mb-8">
                                    <div className="text-6xl mb-3 select-none">👤</div>
                                    <h2 className="text-2xl font-black text-white mb-2">Create Your Organisation</h2>
                                    <p className="text-sm text-gray-400 leading-relaxed">
                                        You'll be the <strong className="text-cyan-400">Global Owner</strong> with full access to all 15+ EHS modules.
                                        Invite your team after setup.
                                    </p>
                                </div>

                                {/* Logo summary */}
                                {logoPreview && (
                                    <div className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-950/15 p-3">
                                        <img src={logoPreview} alt="Logo" className="h-10 w-10 rounded-xl object-cover border border-gray-700" />
                                        <div>
                                            <p className="text-[11px] font-bold text-cyan-400">Logo selected ✓</p>
                                            <p className="text-[10px] text-gray-500">{base64SizeKB(logoPreview)} KB · will be saved with your org</p>
                                        </div>
                                        <button type="button" onClick={() => setStep(2)} className="ml-auto text-[10px] text-gray-600 hover:text-gray-300 transition underline">
                                            Change
                                        </button>
                                    </div>
                                )}

                                {/* Organisation name */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                                        Organisation Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={orgName}
                                        onChange={e => setOrgName(e.target.value)}
                                        className={inputCls}
                                        placeholder="e.g. Acme Mining Ltd"
                                        required
                                        minLength={2}
                                    />
                                </div>

                                {/* Admin name */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                                        Your Full Name <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={userName}
                                        onChange={e => setUserName(e.target.value)}
                                        className={inputCls}
                                        placeholder="e.g. Sarah Johnson"
                                        required
                                        minLength={2}
                                    />
                                </div>

                                {/* Admin email */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                                        Email Address <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={regEmail}
                                        onChange={e => setRegEmail(e.target.value)}
                                        className={inputCls}
                                        placeholder="admin@company.com"
                                        required
                                        autoComplete="email"
                                    />
                                    <p className="text-[10px] text-gray-600 mt-1">Used to sign in to this workspace.</p>
                                </div>

                                {/* Password */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1.5">
                                        Password <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={regPassword}
                                            onChange={e => setRegPassword(e.target.value)}
                                            className={`${inputCls} pr-10`}
                                            placeholder="At least 6 characters"
                                            required
                                            minLength={6}
                                            autoComplete="new-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300 transition text-xs"
                                        >
                                            {showPassword ? '🙈' : '👁️'}
                                        </button>
                                    </div>
                                </div>

                                {/* Error */}
                                {createError && (
                                    <div className="rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-3 text-xs text-red-400">
                                        ⚠ {createError}
                                    </div>
                                )}

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={createLoading}
                                    className="w-full py-3.5 rounded-xl bg-cyan-500 text-black font-black text-sm hover:bg-cyan-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {createLoading ? '⏳ Creating Workspace…' : '🚀 Create Organisation & Launch Dashboard →'}
                                </button>

                                <p className="text-center text-[10px] text-gray-600 leading-relaxed">
                                    By creating an organisation you become its Global Owner.<br />
                                    A unique join code is generated so your team can request access.
                                </p>
                            </form>
                        )}
                    </div>
                )}

                {/* ── back button — visible on steps 1 and 2 only ── */}
                {step > 0 && step < 3 && !createSuccess && (
                    <div className="text-center mt-8">
                        <button onClick={handleBack}
                            className="text-xs text-gray-600 hover:text-gray-400 transition">
                            ← Back
                        </button>
                    </div>
                )}

                {/* ── footer ── */}
                <div className="text-center mt-12 text-[10px] text-gray-700 space-x-4">
                    <button onClick={() => navigate('/login')} className="hover:text-gray-500 transition underline">
                        Already have an account? Sign in
                    </button>
                    <span>·</span>
                    <button onClick={() => navigate('/')} className="hover:text-gray-500 transition underline">
                        Back to home
                    </button>
                    <span>·</span>
                    <button onClick={() => navigate('/login')} className="hover:text-gray-500 transition underline">
                        Skip — use current config
                    </button>
                </div>
            </div>
        </div>
    );
}
