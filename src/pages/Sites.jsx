import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, update, remove } from 'firebase/database';
import { rtdb } from '../config/firebase'; // <-- Changed to rtdb
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
});

export default function Sites() {
    const navigate = useNavigate();
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    const [sites, setSites] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState({ code: '', name: '', city: '' });

    const [showMap, setShowMap] = useState(false);
    const [activeEditCode, setActiveEditCode] = useState(null);

    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markerInstance = useRef(null);

    useEffect(() => {
        const s = sessionStorage.getItem('isoSession');
        if (!s) {
            navigate('/');
            return;
        }

        const sess = JSON.parse(s);
        if (sess.role !== 'Owner') {
            alert("Access Denied. Only Owners can manage facilities.");
            navigate('/dashboard');
            return;
        }

        setSession(sess);

        // Fetch Sites Real-time using rtdb
        const dbRef = ref(rtdb, `organizations/${sess.orgId}/sites`); // <-- Changed to rtdb
        const unsubscribe = onValue(dbRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                const parsedSites = Object.keys(data).map(key => ({
                    code: data[key].code || key,
                    name: data[key].name || key,
                    city: data[key].city || '',
                    lat: data[key].lat || null,
                    lng: data[key].lng || null,
                    status: data[key].status || 'Active'
                }));
                setSites(parsedSites.sort((a, b) => a.name.localeCompare(b.name)));
            } else {
                setSites([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [navigate]);

    useEffect(() => {
        if (showMap && activeEditCode && mapRef.current) {
            const siteToEdit = sites.find(s => s.code === activeEditCode);
            const initialLat = siteToEdit?.lat || 20.5937;
            const initialLng = siteToEdit?.lng || 78.9629;
            const initialZoom = siteToEdit?.lat ? 13 : 4;

            if (!mapInstance.current) {
                mapInstance.current = L.map(mapRef.current).setView([initialLat, initialLng], initialZoom);

                L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; OpenStreetMap'
                }).addTo(mapInstance.current);

                markerInstance.current = L.marker([initialLat, initialLng], { draggable: true }).addTo(mapInstance.current);

                mapInstance.current.on('click', function (e) {
                    markerInstance.current.setLatLng(e.latlng);
                });
            } else {
                mapInstance.current.setView([initialLat, initialLng], initialZoom);
                markerInstance.current.setLatLng([initialLat, initialLng]);
            }
        }

        return () => {
            if (!showMap && mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
                markerInstance.current = null;
            }
        };
    }, [showMap, activeEditCode, sites]);

    const handleSaveSite = async (e) => {
        e.preventDefault();
        if (!formData.code || !formData.name) return alert("Site Code and Name are required.");

        const codeClean = formData.code.replace(/[^A-Z0-9-]/gi, '').toUpperCase();

        try {
            const updates = {};
            updates[`organizations/${session.orgId}/sites/${codeClean}`] = {
                code: codeClean,
                name: formData.name,
                city: formData.city,
                status: 'Active',
                createdAt: new Date().toISOString()
            };

            await update(ref(rtdb), updates); // <-- Changed to rtdb
            setFormData({ code: '', name: '', city: '' });
            setShowAddForm(false);
        } catch (err) {
            alert("Error saving site: " + err.message);
        }
    };

    const handleDeleteSite = async (code, name) => {
        if (window.confirm(`PERMANENT ACTION:\n\nDelete facility ${name} (${code})?\nThis may orphan associated records. Proceed?`)) {
            try {
                await remove(ref(rtdb, `organizations/${session.orgId}/sites/${code}`)); // <-- Changed to rtdb
            } catch (err) {
                alert("Error deleting site: " + err.message);
            }
        }
    };

    const saveLocation = async () => {
        if (markerInstance.current && activeEditCode) {
            const pos = markerInstance.current.getLatLng();
            try {
                const updates = {};
                updates[`organizations/${session.orgId}/sites/${activeEditCode}/lat`] = pos.lat;
                updates[`organizations/${session.orgId}/sites/${activeEditCode}/lng`] = pos.lng;

                await update(ref(rtdb), updates); // <-- Changed to rtdb
                setShowMap(false);
                setActiveEditCode(null);
            } catch (e) {
                alert("Error saving location: " + e.message);
            }
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-slate-950 text-white font-['Space_Grotesk']">
                <div className="w-12 h-12 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-400 tracking-widest uppercase text-sm">Loading Infrastructure...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-slate-950 font-['Space_Grotesk'] text-white overflow-hidden relative">
            <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-blue-600/5 rounded-full blur-[120px] pointer-events-none"></div>

            <header className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 backdrop-blur-md z-20 flex-shrink-0">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white transition-colors flex items-center gap-2">
                        <i className="fas fa-arrow-left"></i> Hub
                    </button>
                    <div className="h-6 w-px bg-slate-800 mx-2"></div>
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white font-bold shadow-lg shadow-emerald-500/20">
                        <i className="fas fa-building-shield"></i>
                    </div>
                    <h1 className="text-base font-bold text-white tracking-tight hidden md:block uppercase">Site Manager</h1>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto w-full relative z-10">
                <main className="p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">

                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-2">Facility Infrastructure</h2>
                            <p className="text-sm text-slate-400">Establish and manage physical locations across the enterprise.</p>
                        </div>
                        <button onClick={() => setShowAddForm(!showAddForm)} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform active:scale-95 flex items-center gap-2 uppercase tracking-widest text-xs">
                            <i className={`fas ${showAddForm ? 'fa-times' : 'fa-plus'}`}></i> {showAddForm ? 'Cancel Registration' : 'Register New Site'}
                        </button>
                    </div>

                    {showAddForm && (
                        <div className="bg-slate-900/40 backdrop-blur-md p-6 rounded-3xl mb-8 border border-emerald-500/30 animate-in slide-in-from-top-4 shadow-xl">
                            <form onSubmit={handleSaveSite} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Site Code (ID)</label>
                                    <div className="relative">
                                        <i className="fas fa-hashtag absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                        <input type="text" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} placeholder="e.g. WH-01" required className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-10 text-white focus:outline-none focus:border-emerald-500 transition-all uppercase font-mono placeholder:text-slate-600 placeholder:normal-case" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">Site Name</label>
                                    <div className="relative">
                                        <i className="fas fa-building absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                        <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Central Warehouse" required className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-10 text-white focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-600" />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-widest ml-1">City / Region</label>
                                    <div className="relative">
                                        <i className="fas fa-map-pin absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                        <input type="text" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} placeholder="e.g. Mumbai" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pl-10 text-white focus:outline-none focus:border-emerald-500 transition-all placeholder:text-slate-600" />
                                    </div>
                                </div>
                                <div>
                                    <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl shadow-lg transition-all uppercase tracking-widest text-xs">Create Facility</button>
                                </div>
                            </form>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {sites.length === 0 ? (
                            <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
                                <i className="fas fa-building text-4xl text-slate-700 mb-4 block"></i>
                                <p className="text-slate-500 font-bold uppercase tracking-widest text-sm">No facilities established</p>
                            </div>
                        ) : (
                            sites.map(s => (
                                <div key={s.code} className="glass-panel p-6 rounded-3xl relative group border border-slate-800 hover:border-emerald-500/30 transition-all hover:shadow-[0_10px_30px_-10px_rgba(16,185,129,0.2)] flex flex-col justify-between h-56 overflow-hidden">
                                    <div className="card-glow bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_70%)]"></div>

                                    <button onClick={() => handleDeleteSite(s.code, s.name)} className="absolute top-4 right-4 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-2 bg-slate-950/80 rounded-lg shadow-lg z-20 border border-slate-800">
                                        <i className="fas fa-trash"></i>
                                    </button>

                                    <div className="mb-6 relative z-10">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-lg shadow-inner text-emerald-400">
                                                <i className="fas fa-industry"></i>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest bg-slate-800 px-2 py-0.5 rounded border border-slate-700">{s.code}</span>
                                            </div>
                                        </div>
                                        <h3 className="font-bold text-white text-xl pr-8 leading-tight mb-1 truncate">{s.name}</h3>
                                        <div className="text-xs text-slate-400">
                                            {s.status === 'Active' ? <span className="text-emerald-400 font-medium"><i className="fas fa-circle text-[8px] mr-1 animate-pulse"></i> Operational</span> : 'Inactive'}
                                        </div>
                                    </div>

                                    <div className="border-t border-slate-800/50 pt-4 flex justify-between items-center bg-slate-900/80 -mx-6 -mb-6 p-4 rounded-b-3xl relative z-10 backdrop-blur-sm">
                                        <div className="flex items-center">
                                            {s.lat && s.lng ? (
                                                <div className="flex flex-col">
                                                    <div className="text-xs font-bold text-slate-300 truncate pr-2"><i className="fas fa-map-marker-alt text-red-400 mr-2"></i>{s.city || 'Coordinates Set'}</div>
                                                    <div className="text-[9px] font-mono text-emerald-500 mt-1">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</div>
                                                </div>
                                            ) : (
                                                <div className="text-xs font-bold text-orange-400 bg-orange-950/30 px-3 py-1.5 rounded-lg border border-orange-500/20 italic flex items-center gap-2">
                                                    <i className="fas fa-location-crosshairs animate-pulse"></i> Location Pending
                                                </div>
                                            )}
                                        </div>
                                        <button onClick={() => { setActiveEditCode(s.code); setShowMap(true); }} className="text-[10px] font-bold uppercase bg-slate-950 text-emerald-400 px-3 py-2 rounded-lg border border-emerald-500/30 hover:bg-emerald-600 hover:text-white hover:border-emerald-500 transition-all shadow-lg">
                                            {s.lat ? 'Update Pin' : 'Set Pin'}
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </main>
            </div>

            {showMap && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
                    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-4xl w-full shadow-2xl relative flex flex-col h-[85vh]">
                        <div className="flex justify-between items-center mb-4 flex-shrink-0 border-b border-slate-800 pb-4">
                            <div>
                                <h2 className="text-xl font-bold text-white mb-1"><i className="fas fa-map-marked-alt text-emerald-400 mr-2"></i> Set Geo-Location</h2>
                                <p className="text-xs text-slate-400">Click anywhere on the map or drag the pin to set coordinates for <span className="font-mono text-emerald-400">{activeEditCode}</span></p>
                            </div>
                            <button onClick={() => { setShowMap(false); setActiveEditCode(null); }} className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-500/20 hover:text-red-400 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="flex-1 w-full bg-slate-950 rounded-xl overflow-hidden mb-4 border border-slate-800 relative z-0 shadow-inner">
                            <div ref={mapRef} style={{ height: '100%', width: '100%' }}></div>
                        </div>

                        <div className="flex justify-end gap-3 flex-shrink-0 pt-2">
                            <button onClick={() => { setShowMap(false); setActiveEditCode(null); }} className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-sm">Cancel</button>
                            <button onClick={saveLocation} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm uppercase tracking-widest">
                                <i className="fas fa-location-arrow"></i> Save Coordinates
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}