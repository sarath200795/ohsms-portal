import React from 'react';

function renderPrintFaultTree(node) {
    if (!node) return null;
    return (
        <li key={node.id} style={{ marginBottom: '4px' }}>
            <strong>{node.label}</strong> <span style={{ fontSize: '10px', color: '#555' }}>[{node.type}]</span>
            {node.children && node.children.length > 0 && (
                <ul style={{ listStyleType: 'circle', paddingLeft: '20px', marginTop: '4px' }}>
                    {node.children.map((child) => renderPrintFaultTree(child))}
                </ul>
            )}
        </li>
    );
}

export default function IncidentPrintOverlay({ printData }) {
    if (!printData) return null;

    return (
        <div className="print-overlay p-8 bg-white text-black min-h-screen w-full absolute top-0 left-0 z-50">
            <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                <div>
                    <div className="text-sm text-gray-500 font-bold mb-1">ISO 45001 OHSMS - FORMAL RECORD</div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">INCIDENT INVESTIGATION REPORT</h1>
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold">Ref ID: {printData.id || 'DRAFT'}</p>
                    <p className="text-sm font-bold mt-1">Status: <span className="uppercase">{printData.capa && printData.capa.length > 0 && printData.capa.every((c) => c.status === 'Closed') ? 'Closed' : 'Open'}</span></p>
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

            {printData.imageEvidence && (
                <div className="mb-6 page-break-inside-avoid">
                    <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Photographic Evidence</h2>
                    <img src={printData.imageEvidence} className="max-h-[300px] border-2 border-black object-contain mt-2" alt="Evidence" />
                </div>
            )}

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

                <div className="mb-6">
                    <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.2 The 5-Whys Logic Paths</h3>
                    {printData.investigation?.fiveWhys?.map((path, index) => {
                        const validWhys = path.whys.filter(Boolean);
                        if (validWhys.length === 0) return null;
                        return (
                            <div key={index} className="border border-gray-400 p-4 mb-4">
                                <strong className="underline text-sm uppercase">{path.name}</strong>
                                <ol className="list-decimal ml-6 mt-2 text-sm space-y-1">
                                    {validWhys.map((why, whyIndex) => <li key={whyIndex}>{why}</li>)}
                                </ol>
                            </div>
                        );
                    })}
                </div>

                <div className="mb-6">
                    <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.3 Fishbone Data Extracted</h3>
                    <table className="w-full text-sm border-collapse border border-black mt-2">
                        <tbody>
                            {Object.entries(printData.investigation?.fishbone || {}).map(([key, value]) => {
                                const valid = value.filter(Boolean);
                                if (valid.length === 0) return null;
                                return (
                                    <tr key={key}>
                                        <td className="border border-black p-2 w-1/4 font-bold uppercase bg-gray-50">{key}</td>
                                        <td className="border border-black p-2">{valid.join('; ')}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="mb-6">
                    <h3 className="text-sm font-bold mb-2 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">3.4 Fault Tree Analysis</h3>
                    <div className="border border-black p-4 bg-gray-50 text-sm">
                        <ul className="list-none p-0 m-0">
                            {printData.investigation?.faultTree ? renderPrintFaultTree(printData.investigation.faultTree) : <li>No fault tree data generated.</li>}
                        </ul>
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
            <div className="text-center text-xs text-gray-500 mt-10 border-t border-gray-300 pt-4">Generated by WE EHS SAFETY TOOL | Document Control Date: {new Date().toLocaleString()}</div>
        </div>
    );
}
