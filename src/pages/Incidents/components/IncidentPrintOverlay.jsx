import React from 'react';

/* ── Visual: 5-Why chain ─────────────────────────────────────────── */
function PrintFiveWhyChain({ path, pathIndex }) {
    const validWhys = (path.whys || []).filter(Boolean);
    if (validWhys.length === 0) return null;
    return (
        <div style={{ marginBottom: 14, border: '1px solid #bbb', borderRadius: 8, padding: 14, background: '#f9f9f9', pageBreakInside: 'avoid' }}>
            <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, color: '#333', borderBottom: '1px solid #ddd', paddingBottom: 6 }}>
                {path.name || `Analysis Path ${pathIndex + 1}`}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap', gap: 0 }}>
                {validWhys.map((why, i) => {
                    const isLast = i === validWhys.length - 1;
                    return (
                        <React.Fragment key={i}>
                            <div style={{
                                border: `2px solid ${isLast ? '#111' : '#666'}`,
                                borderRadius: 6,
                                padding: '7px 10px',
                                minWidth: 90,
                                maxWidth: 160,
                                background: isLast ? '#1a1a1a' : '#fff',
                                color: isLast ? '#fff' : '#111',
                            }}>
                                <div style={{ fontSize: 8, fontWeight: 'bold', color: isLast ? '#aaa' : '#888', marginBottom: 3, letterSpacing: '0.1em' }}>WHY {i + 1}</div>
                                <div style={{ fontSize: 9.5, lineHeight: 1.4 }}>{why}</div>
                            </div>
                            {!isLast && (
                                <div style={{ display: 'flex', alignItems: 'center', padding: '0 5px', fontSize: 16, color: '#555', alignSelf: 'center' }}>→</div>
                            )}
                        </React.Fragment>
                    );
                })}
                <div style={{ display: 'flex', alignItems: 'center', padding: '0 5px', fontSize: 16, color: '#c00', alignSelf: 'center' }}>→</div>
                <div style={{ border: '2px solid #c00', borderRadius: 6, padding: '7px 10px', background: '#c00', color: '#fff', fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em', alignSelf: 'center' }}>
                    ROOT<br />CAUSE
                </div>
            </div>
        </div>
    );
}

/* ── Visual: Fishbone SVG ────────────────────────────────────────── */
function PrintFishboneSVG({ fishbone = {} }) {
    const W = 760, H = 400, spineY = 200;
    const spineX1 = 50, spineX2 = 648;

    const topCats = [
        { key: 'man', label: 'Man', spineX: 190 },
        { key: 'machine', label: 'Machine', spineX: 370 },
        { key: 'material', label: 'Material', spineX: 550 },
    ];
    const bottomCats = [
        { key: 'method', label: 'Method', spineX: 270 },
        { key: 'environment', label: 'Environment', spineX: 460 },
    ];
    const topLabelY = 38, bottomLabelY = 362;

    const renderRib = (key, label, spineX, isTop) => {
        const labelY = isTop ? topLabelY : bottomLabelY;
        const labelX = spineX - 28;
        const items = (fishbone[key] || []).filter(Boolean).slice(0, 7);

        const boneNodes = items.map((item, i) => {
            const t = (i + 1) / (items.length + 1);
            const bx = spineX + (labelX - spineX) * t;
            const by = spineY + (labelY - spineY) * t;
            return { bx, by, item };
        });

        return (
            <g key={key}>
                <line x1={spineX} y1={spineY} x2={labelX} y2={labelY}
                    stroke="#444" strokeWidth="2" />
                <rect x={labelX - 36} y={isTop ? labelY - 14 : labelY - 4}
                    width="72" height="18" rx="3" fill="#222" />
                <text x={labelX} y={isTop ? labelY - 1 : labelY + 9}
                    textAnchor="middle" fill="white" fontSize="8.5" fontWeight="bold">
                    {label.toUpperCase()}
                </text>
                {boneNodes.map(({ bx, by, item }, i) => (
                    <g key={i}>
                        <line x1={bx} y1={by} x2={bx + 42} y2={by}
                            stroke="#777" strokeWidth="1" />
                        <text x={bx + 44} y={by + 3} fontSize="7.5" fill="#222">
                            {item.length > 24 ? item.slice(0, 23) + '…' : item}
                        </text>
                    </g>
                ))}
            </g>
        );
    };

    const allEmpty = [...topCats, ...bottomCats].every(({ key }) =>
        !(fishbone[key] || []).some(Boolean)
    );

    return (
        <div style={{ border: '1px solid #ddd', borderRadius: 6, padding: 4, background: '#fafafa' }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', fontFamily: 'Arial, sans-serif' }}>
                <defs>
                    <marker id="fb-arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                        <polygon points="0 0, 8 3, 0 6" fill="#111" />
                    </marker>
                </defs>
                {/* Spine */}
                <line x1={spineX1} y1={spineY} x2={spineX2} y2={spineY}
                    stroke="#111" strokeWidth="3" markerEnd="url(#fb-arr)" />
                {/* Incident head */}
                <rect x={spineX2 + 2} y={spineY - 24} width="106" height="48" rx="5" fill="#111" />
                <text x={spineX2 + 55} y={spineY - 6} textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">INCIDENT</text>
                <text x={spineX2 + 55} y={spineY + 8} textAnchor="middle" fill="#aaa" fontSize="7">EVENT</text>
                {/* Ribs */}
                {topCats.map(({ key, label, spineX }) => renderRib(key, label, spineX, true))}
                {bottomCats.map(({ key, label, spineX }) => renderRib(key, label, spineX, false))}
                {allEmpty && (
                    <text x={W / 2} y={spineY + 4} textAnchor="middle" fontSize="11" fill="#aaa">
                        No fishbone factors recorded.
                    </text>
                )}
            </svg>
        </div>
    );
}

/* ── Visual: Fault Tree (indented boxes) ─────────────────────────── */
function PrintFaultTreeBox({ node, depth = 0 }) {
    if (!node) return null;
    const TYPE_COLOR = { AND: '#7c3aed', OR: '#ea580c', ROOT: '#16a34a', EVENT: '#1d4ed8' };
    const c = TYPE_COLOR[node.type] || TYPE_COLOR.EVENT;
    const isRoot = depth === 0;
    const hasChildren = node.children && node.children.length > 0;

    return (
        <div style={{ marginLeft: isRoot ? 0 : 20, marginTop: isRoot ? 0 : 5, position: 'relative' }}>
            {!isRoot && (
                <span style={{ position: 'absolute', left: -18, top: 6, color: '#999', fontSize: 11, userSelect: 'none' }}>└─</span>
            )}
            <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                border: `1.5px solid ${c}`, borderRadius: 5,
                padding: '4px 9px', fontSize: 9,
                background: isRoot ? '#111' : '#fff',
                color: isRoot ? '#fff' : '#111',
                maxWidth: 320,
            }}>
                <span style={{ fontSize: 7.5, fontWeight: 'bold', color: isRoot ? '#ccc' : c, border: `1px solid ${c}`, borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>
                    {node.type || 'EVENT'}
                </span>
                <span style={{ lineHeight: 1.3 }}>{node.label}</span>
            </div>
            {hasChildren && (
                <div style={{ marginLeft: 10, borderLeft: '1px dashed #ccc', paddingLeft: 6, marginTop: 3 }}>
                    {node.children.map((child, i) => (
                        <PrintFaultTreeBox key={child.id || i} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Main print overlay ──────────────────────────────────────────── */
export default function IncidentPrintOverlay({ printData }) {
    if (!printData) return null;

    const reportStage = printData.printStage === 'investigation' ? 'investigation' : 'initial';
    const isInvestigationReport = reportStage === 'investigation';
    const reportTitle = printData.reportTitle || (isInvestigationReport ? 'INCIDENT INVESTIGATION REPORT' : 'INITIAL INFORMATION REPORT');
    const reporting = printData.reporting || {};
    const recordStatus = isInvestigationReport
        ? 'Investigation Complete'
        : (reporting.investigationRequired ? 'Investigation Pending' : 'Initial Report Only');

    return (
        <div className="print-overlay p-8 bg-white text-black min-h-screen w-full absolute top-0 left-0 z-50">
            <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                <div>
                    <div className="text-sm text-gray-500 font-bold mb-1">ISO 45001 OHSMS - FORMAL RECORD</div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">{reportTitle}</h1>
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold">Ref ID: {printData.id || 'DRAFT'}</p>
                    <p className="text-sm font-bold mt-1">Status: <span className="uppercase">{recordStatus}</span></p>
                </div>
            </div>

            <div className="mb-6 border border-black p-4 bg-gray-50">
                <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Initial Details</h2>
                <table className="w-full text-sm border-none">
                    <tbody>
                        <tr>
                            <td className="w-[15%] font-bold py-1">Incident Title:</td><td colSpan="3" className="w-[85%] py-1 font-bold text-lg">{printData.title}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] font-bold py-1">Site / Location:</td><td className="w-[35%] py-1">{printData.siteId} {printData.horizontalDeployment && '(Horizontal Deployment)'}</td>
                            <td className="w-[15%] font-bold py-1">Date & Time:</td><td className="w-[35%] py-1">{printData.date} @ {printData.time || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] font-bold py-1">Incident Type:</td><td className="w-[35%] py-1">{printData.type}</td>
                            <td className="w-[15%] font-bold py-1">Severity Level:</td><td className="w-[35%] py-1">{printData.severity}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] font-bold py-1">Category:</td><td className="w-[35%] py-1">{printData.smartType}</td>
                            <td className="w-[15%] font-bold py-1">Equipment Involved:</td><td className="w-[35%] py-1">{printData.equipmentInvolved || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] font-bold py-1 border-t border-gray-300 mt-1 pt-2">Affected Person:</td>
                            <td colSpan="3" className="w-[85%] py-1 border-t border-gray-300 mt-1 pt-2">
                                {printData.affectedPersonName ? `${printData.affectedPersonName} (${printData.affectedPersonType})` : 'No Person Injured'}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mb-6 border border-black p-4">
                <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Description of Event</h2>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{printData.description || 'No description provided.'}</div>
            </div>

            <div className="mb-6 border border-black p-4">
                <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Immediate Actions Taken</h2>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{printData.immediateAction || 'No immediate actions documented.'}</div>
            </div>

            <div className="mb-6 border border-black p-4 bg-gray-50">
                <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Report Workflow Status</h2>
                <div className="text-sm leading-relaxed">
                    <p><strong>Initial Information Report Saved:</strong> {reporting.initialSubmittedAt ? new Date(reporting.initialSubmittedAt).toLocaleString() : 'Not yet saved'}</p>
                    <p className="mt-2"><strong>Investigation Report Required:</strong> {reporting.investigationRequired ? 'Yes' : 'No'}</p>
                    <p className="mt-2"><strong>Investigation Report Status:</strong> {reporting.investigationStatus || 'Pending'}</p>
                    {reporting.investigationCompletedAt && (
                        <p className="mt-2"><strong>Investigation Report Completed:</strong> {new Date(reporting.investigationCompletedAt).toLocaleString()}</p>
                    )}
                </div>
            </div>

            <div className="mb-6 page-break-inside-avoid border border-black p-4">
                <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">
                    Media Evidence {isInvestigationReport ? '(From Initial Report)' : '(Initial Report)'}
                </h2>
                {printData.imageEvidence ? (
                    <div>
                        <p className="text-sm text-gray-700 mb-3">Uploaded evidence captured with the initial report is displayed below.</p>
                        {printData.imageEvidenceName && <p className="text-xs font-mono text-gray-600 mb-2">File: {printData.imageEvidenceName}</p>}
                        <img
                            src={printData.imageEvidence}
                            className="max-h-[360px] max-w-full border-2 border-black object-contain mt-2"
                            alt={`${reportTitle} evidence`}
                        />
                    </div>
                ) : printData.videoEvidenceName ? (
                    <div className="border border-dashed border-gray-400 bg-gray-50 p-4 text-sm text-gray-700">
                        <p className="mb-2"><strong>Video evidence attached:</strong> <span className="font-mono">{printData.videoEvidenceName}</span></p>
                        <p className="italic">Video playback is not embedded in the print report, but the uploaded clip is part of the incident evidence package used for smart investigation.</p>
                    </div>
                ) : (
                    <div className="border border-dashed border-gray-400 bg-gray-50 p-4 text-sm italic text-gray-600">
                        No media evidence was attached with the initial report.
                    </div>
                )}
            </div>

            {(printData.investigation?.aiDraft?.mediaAnalysisReport || printData.evidenceObservations || printData.videoEvidenceName) && (
                <div className="mb-6 border border-black p-4 bg-gray-50">
                    <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Video / Photo Analysis Report</h2>
                    <div className="text-sm whitespace-pre-wrap leading-relaxed mb-3">
                        {printData.investigation?.aiDraft?.mediaAnalysisReport || printData.evidenceObservations || 'Media was attached but no written media observations were recorded.'}
                    </div>
                    {printData.videoEvidenceName && (
                        <div className="text-sm">
                            <strong>Video Evidence Attached:</strong> <span className="font-mono">{printData.videoEvidenceName}</span>
                        </div>
                    )}
                </div>
            )}

            {isInvestigationReport ? (
                <>
                    <div className="mb-6 border border-black p-4">
                        <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Investigation Team</h2>
                        <table className="w-full text-sm border-collapse border border-black mt-2">
                            <thead>
                                <tr className="bg-gray-100">
                                    <th className="border border-black p-2 text-left w-1/2">Name</th>
                                    <th className="border border-black p-2 text-left w-1/2">Role / Designation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(printData.investigationTeam || []).map((member, index) => (
                                    <tr key={index}>
                                        <td className="border border-black p-2 font-bold">{member.name} {member.userId === 'External' ? '(EXT)' : ''}</td>
                                        <td className="border border-black p-2">{member.role}</td>
                                    </tr>
                                ))}
                                {(!printData.investigationTeam || printData.investigationTeam.length === 0) && (
                                    <tr><td colSpan="2" className="border border-black p-4 text-center italic">No team members recorded.</td></tr>
                                )}
                            </tbody>
                        </table>

                        <h3 className="text-sm font-bold mt-4 mb-2 underline">Investigation Summary & Notes:</h3>
                        <div className="text-sm whitespace-pre-wrap">{printData.consultationSummary || 'No investigation notes recorded.'}</div>
                    </div>

                    <div className="page-break"></div>

                    <div className="mb-6">
                        <h2 className="text-lg font-black uppercase mb-4 border-b-2 border-black pb-2">3. Root Cause Analysis</h2>

                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.1 Final Root Cause Conclusion</h3>
                            <div className="border-2 border-black p-4 bg-gray-50 font-bold text-sm leading-relaxed">
                                {printData.investigation?.rootCause || 'Analysis incomplete.'}
                            </div>
                        </div>

                        {/* 3.2 5-Why — graphical chain */}
                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.2 5-Whys Logic Paths</h3>
                            {(printData.investigation?.fiveWhys || []).map((path, index) => {
                                const validWhys = (path.whys || []).filter(Boolean);
                                if (validWhys.length === 0) return null;
                                return <PrintFiveWhyChain key={index} path={path} pathIndex={index} />;
                            })}
                            {!(printData.investigation?.fiveWhys || []).some(p => (p.whys || []).some(Boolean)) && (
                                <p className="text-sm text-gray-500 italic">No 5-Why data recorded.</p>
                            )}
                        </div>

                        {/* 3.3 Fishbone — SVG diagram */}
                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.3 4M Fishbone Analysis</h3>
                            <PrintFishboneSVG fishbone={printData.investigation?.fishbone || {}} />
                            {/* Compact legend table below diagram */}
                            {Object.entries(printData.investigation?.fishbone || {}).some(([, v]) => (v || []).some(Boolean)) && (
                                <table className="w-full text-xs border-collapse border border-gray-300 mt-3">
                                    <tbody>
                                        {Object.entries(printData.investigation?.fishbone || {}).map(([key, value]) => {
                                            const valid = (value || []).filter(Boolean);
                                            if (valid.length === 0) return null;
                                            return (
                                                <tr key={key}>
                                                    <td className="border border-gray-300 p-1.5 w-[15%] font-bold uppercase bg-gray-50 text-xs">{key}</td>
                                                    <td className="border border-gray-300 p-1.5 text-xs">{valid.join(' · ')}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* 3.4 Fault Tree — visual boxes */}
                        <div className="mb-6">
                            <h3 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.4 Fault Tree Analysis</h3>
                            <div className="border border-gray-300 p-4 bg-gray-50 overflow-x-auto">
                                {printData.investigation?.faultTree
                                    ? <PrintFaultTreeBox node={printData.investigation.faultTree} />
                                    : <p className="text-sm text-gray-500 italic">No fault tree data generated.</p>
                                }
                            </div>
                        </div>
                    </div>

                    <div className="mb-6 page-break-inside-avoid">
                        <h2 className="text-lg font-black uppercase mb-4 border-b-2 border-black pb-2">4. Corrective & Preventive Actions (CAPA)</h2>
                        <table className="w-full text-sm border-collapse border border-black">
                            <thead>
                                <tr className="bg-gray-200">
                                    <th className="border border-black p-2 text-left">Action Description</th>
                                    <th className="border border-black p-2 text-left w-[15%]">Site</th>
                                    <th className="border border-black p-2 text-left w-[20%]">Owner</th>
                                    <th className="border border-black p-2 w-[15%] text-center">Due Date</th>
                                    <th className="border border-black p-2 w-[15%] text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {printData.capa && printData.capa.length > 0 ? printData.capa.map((capaItem, index) => (
                                    <tr key={index}>
                                        <td className="border border-black p-2">{capaItem.act}</td>
                                        <td className="border border-black p-2 font-bold text-gray-600">{capaItem.siteId || printData.siteId}</td>
                                        <td className="border border-black p-2 font-bold">{capaItem.own || 'Unassigned'}</td>
                                        <td className="border border-black p-2 text-center font-mono">{capaItem.due}</td>
                                        <td className="border border-black p-2 text-center font-bold uppercase">{capaItem.status}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="5" className="border border-black p-4 text-center italic">No CAPA items recorded.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mb-6 page-break-inside-avoid">
                        <h2 className="text-lg font-black uppercase mb-4 border-b-2 border-black pb-2">5. Review, Sign-Off & HIRA Linkage</h2>
                        <div className="border-2 border-black p-4 bg-gray-50 text-sm mb-12">
                            <div className="mb-4">
                                <strong className="text-base uppercase mr-2">Risk Assessment (HIRA) Reviewed & Updated:</strong>
                                <span className="font-bold border border-black px-2 py-1 bg-white">{printData.riskUpdated ? 'YES - CONFIRMED' : 'NO / PENDING'}</span>
                            </div>

                            {printData.linkedHazards && printData.linkedHazards.length > 0 && (
                                <div className="mt-4 border-t border-gray-300 pt-4">
                                    <strong className="underline uppercase block mb-2">Specific HIRA Records Updated Post-Incident:</strong>
                                    <ul className="list-disc pl-6 space-y-2">
                                        {printData.linkedHazards.map((link, index) => (
                                            <li key={index}>
                                                <strong>{link.raDocId}</strong> - {link.actName} ({link.category}).
                                                <em> New Residual Risk Score: <strong>{link.newRiskScore}</strong></em>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>

                        <table className="w-full border-none mt-16 text-sm">
                            <tbody>
                                <tr>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold">Investigator / Reporter Signature</td>
                                    <td className="w-[10%] border-none"></td>
                                    <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold">Site Manager / EHS Lead Signature</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div className="mb-6 border border-black p-4 bg-gray-50 text-sm">
                    <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">2. Next Stage Requirement</h2>
                    <p className="leading-relaxed">
                        {reporting.investigationRequired
                            ? 'A Stage 2 Incident Investigation Report is required for this incident before final closure.'
                            : 'A Stage 2 Incident Investigation Report is optional for this incident and can be completed later if a fuller investigation is needed.'}
                    </p>
                </div>
            )}
            <div className="text-center text-xs text-gray-500 mt-10 border-t border-gray-300 pt-4">Generated by WE EHS SAFETY TOOL | Document Control Date: {new Date().toLocaleString()}</div>
        </div>
    );
}
