import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { ref, set } from 'firebase/database';
import { auth, rtdb } from '../config/firebase';

export default function Login() {
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Shared Fields
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Registration Only Fields
    const [fullName, setFullName] = useState('');
    const [organizationName, setOrganizationName] = useState('');

    // Login Only Field
    const [orgId, setOrgId] = useState('');

    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let userCredential;
            let sessionData;

            if (isRegistering) {
                userCredential = await createUserWithEmailAndPassword(auth, email, password);

                // Format the user's typed organization name into a clean ID (e.g., "Acme Corp" -> "ACME_CORP")
                const generatedOrgId = organizationName.toUpperCase().replace(/\s+/g, '_');

                // --- SECURITY SYNC ---
                // Creates the "Passport" for Firebase Security Rules
                await set(ref(rtdb, `users/${userCredential.user.uid}`), {
                    orgId: generatedOrgId,
                    role: 'Owner',
                    email: email,
                    status: 'Active'
                });

                // Initialize the organization structure
                await set(ref(rtdb, `organizations/${generatedOrgId}/info`), {
                    name: organizationName,
                    createdBy: userCredential.user.uid,
                    createdAt: new Date().toISOString()
                });

                sessionData = {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    user: fullName || userCredential.user.email.split('@')[0],
                    role: 'Owner',
                    orgId: generatedOrgId
                };
            } else {
                userCredential = await signInWithEmailAndPassword(auth, email, password);
                const finalOrgId = orgId.toUpperCase().replace(/\s+/g, '_');

                // --- SECURITY SYNC ---
                // Updates the passport on every login to ensure rules stay active
                await set(ref(rtdb, `users/${userCredential.user.uid}`), {
                    orgId: finalOrgId,
                    role: 'Owner',
                    email: email,
                    status: 'Active'
                });

                sessionData = {
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    user: userCredential.user.email.split('@')[0],
                    role: 'Owner',
                    orgId: finalOrgId
                };
            }

            sessionStorage.setItem('isoSession', JSON.stringify(sessionData));
            navigate('/dashboard');

        } catch (err) {
            console.error("Auth Error:", err);
            if (err.code === 'auth/email-already-in-use') setError("This email is already registered.");
            else if (err.code === 'auth/weak-password') setError("Password must be at least 6 characters.");
            else if (err.code === 'auth/invalid-credential') setError("Invalid security credentials.");
            else setError("Authentication failed. Please check your credentials and Organization ID.");
        } finally {
            setLoading(false);
        }
    };

    const toggleMode = () => {
        setIsRegistering(!isRegistering);
        setError('');
        setPassword('');
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-['Space_Grotesk'] relative overflow-hidden">
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-500">

                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg shadow-blue-500/20">
                        <i className="fas fa-shield-halved"></i>
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight uppercase">
                        ISO 45001 <span className="text-blue-500 ml-1">Enterprise</span>
                    </h1>
                    <p className="text-slate-400 text-sm mt-2">
                        {isRegistering ? 'Register a new enterprise domain' : 'Secure portal authentication'}
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded-xl text-xs font-bold mb-6 text-center uppercase tracking-widest animate-in slide-in-from-top-2">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">

                    {/* --- REGISTRATION SPECIFIC FIELDS --- */}
                    {isRegistering && (
                        <div className="space-y-4 animate-in slide-in-from-top-4 duration-300">
                            <div className="relative">
                                <i className="fas fa-building absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                <input
                                    type="text"
                                    placeholder="Organization Name (e.g., Acme Corp)"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600"
                                    value={organizationName}
                                    onChange={(e) => setOrganizationName(e.target.value)}
                                    required={isRegistering}
                                />
                            </div>
                            <div className="relative">
                                <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required={isRegistering}
                                />
                            </div>
                        </div>
                    )}

                    {/* --- LOGIN SPECIFIC FIELD --- */}
                    {!isRegistering && (
                        <div className="relative animate-in slide-in-from-top-4 duration-300">
                            <i className="fas fa-network-wired absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                            <input
                                type="text"
                                placeholder="Organization ID (e.g., ACME_CORP)"
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600 uppercase"
                                value={orgId}
                                onChange={(e) => setOrgId(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                                required={!isRegistering}
                            />
                        </div>
                    )}

                    {/* --- SHARED FIELDS --- */}
                    <div className="relative">
                        <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        <input
                            type="email"
                            placeholder="Enterprise ID / Email"
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="relative">
                        <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                        <input
                            type="password"
                            placeholder="Security Key"
                            className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-4 pl-12 text-white focus:outline-none focus:border-blue-500 transition-all placeholder:text-slate-600"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength="6"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all uppercase tracking-widest text-sm shadow-lg shadow-blue-600/20 disabled:bg-slate-800 disabled:text-slate-500 mt-2 flex justify-center items-center gap-2"
                    >
                        {loading ? <i className="fas fa-spinner fa-spin"></i> : null}
                        {loading ? 'Authenticating...' : (isRegistering ? 'Establish Organization' : 'Access Portal')}
                    </button>
                </form>

                <div className="mt-6 text-center">
                    <button
                        type="button"
                        onClick={toggleMode}
                        className="text-slate-400 hover:text-white text-xs transition-colors"
                    >
                        {isRegistering
                            ? "Already registered? Return to Login"
                            : "New facility? Register Organization here"}
                    </button>
                </div>
            </div>
        </div>
    );
}