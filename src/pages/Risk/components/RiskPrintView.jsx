import React from 'react';

export default function RiskPrintView({ printData, getRiskStyle }) {
    if (!printData) return null;

    return (
        <div className="hidden print:block p-8 bg-white text-black w-full absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-6">
                <div>
                    <div className="text-sm font-bold text-gray-500 mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Document Control</div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Hazard Identification & Risk Assessment</h1>
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold font-mono">Ref ID: {printData.docId}</p>
                    <p className="text-sm font-bold mt-1 uppercase">Date: {printData.date}</p>
                </div>
            </div>

            <div className="mb-6 border border-black p-4 bg-gray-50">
                <table className="w-full text-sm border-none">
                    <tbody>
                        <tr>
                            <td className="w-[15%] font-bold py-1 border-b border-gray-300">Assessment Name:</td>
                            <td colSpan="3" className="text-lg font-bold py-1 border-b border-gray-300">{printData.assessmentName}</td>
                        </tr>
                        <tr>
                            <td className="font-bold py-2 border-none">Site / Location:</td>
                            <td className="w-[35%] py-2 border-none">{printData.siteId}</td>
                            <td className="w-[15%] font-bold py-2 pl-4 border-none">Status:</td>
                            <td className="w-[35%] py-2 border-none font-bold uppercase">{printData.status}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mb-6 border border-black p-4">
                <h2 className="text-sm font-bold mb-3 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">Assessment Team</h2>
                <div className="text-sm flex flex-wrap gap-x-8 gap-y-2">
                    {printData.team && printData.team.map((member, i) => (
                        <span key={i}><strong>{member.name}</strong> ({member.role})</span>
                    ))}
                </div>
            </div>

            {printData.activities && printData.activities.map((activity, i) => (
                <div key={i} className="mb-8 page-break-inside-avoid">
                    <h2 className="text-base font-black mb-2 uppercase bg-gray-800 text-white p-2">Activity {i + 1}: {activity.name}</h2>
                    <table className="w-full text-[10px] border-collapse border border-black">
                        <thead>
                            <tr className="bg-gray-200">
                                <th className="border border-black p-2 w-[15%]">Category / Type</th>
                                <th className="border border-black p-2 w-[25%] text-left">Hazard Event</th>
                                <th className="border border-black p-2 w-[5%] text-center">R1</th>
                                <th className="border border-black p-2 w-[25%] text-left">Current Controls</th>
                                <th className="border border-black p-2 w-[5%] text-center">R2</th>
                                <th className="border border-black p-2 w-[25%] text-left">Additional Actions (CAPA)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activity.hazards && activity.hazards.map((hazard, hazardIndex) => (
                                <tr key={hazardIndex}>
                                    <td className="border border-black p-2 font-bold">{hazard.category}<br /><span className="font-normal italic text-gray-600">{hazard.subCategory}</span></td>
                                    <td className="border border-black p-2">{hazard.desc}</td>
                                    <td className="border border-black p-2 text-center font-bold text-sm" style={getRiskStyle(hazard.r1)}>{hazard.r1}</td>
                                    <td className="border border-black p-2">
                                        <ul className="list-disc pl-3 m-0">
                                            {(hazard.existingControls || []).map((control, controlIndex) => <li key={controlIndex}>[{control.type}] {control.desc}</li>)}
                                        </ul>
                                    </td>
                                    <td className="border border-black p-2 text-center font-bold text-sm" style={getRiskStyle(hazard.r2)}>{hazard.r2}</td>
                                    <td className="border border-black p-2">
                                        {hazard.alarp ? (
                                            <div><strong className="text-red-600">ALARP Declared:</strong><br />{hazard.alarpJustification}</div>
                                        ) : hazard.additionalControls && hazard.additionalControls.length > 0 ? (
                                            <ul className="list-disc pl-3 m-0">
                                                {hazard.additionalControls.map((control, controlIndex) => (
                                                    <li key={controlIndex} className="mb-1"><strong>[{control.category}]</strong> {control.desc} <em>(Owner: {control.owner || 'TBA'})</em></li>
                                                ))}
                                            </ul>
                                        ) : <span className="italic text-gray-500">None required.</span>}
                                    </td>
                                </tr>
                            ))}
                            {(!activity.hazards || activity.hazards.length === 0) && <tr><td colSpan="6" className="border border-black p-4 text-center italic text-gray-500">No hazards assessed for this activity.</td></tr>}
                        </tbody>
                    </table>
                </div>
            ))}

            <div className="mt-8 text-[10px] border-t border-dashed border-gray-400 pt-4 page-break-inside-avoid">
                <strong>Risk Matrix Legend:</strong> P = Probability (1-5), S = Severity (1-5), R = Risk Score (P x S). R1 = Initial Score, R2 = Residual Score. <br />
                <span className="inline-block w-3 h-3 border border-black mr-1 align-middle" style={{ backgroundColor: '#10b981' }}></span>Low (1-4) |
                <span className="inline-block w-3 h-3 border border-black ml-4 mr-1 align-middle" style={{ backgroundColor: '#eab308' }}></span>Medium (5-9) |
                <span className="inline-block w-3 h-3 border border-black ml-4 mr-1 align-middle" style={{ backgroundColor: '#ef4444' }}></span>High (10-16) |
                <span className="inline-block w-3 h-3 border border-black ml-4 mr-1 align-middle" style={{ backgroundColor: '#7f1d1d' }}></span>Extreme (17-25)
            </div>

            <table className="w-full border-none mt-16 text-sm page-break-inside-avoid">
                <tbody>
                    <tr>
                        <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Lead Assessor Signature</td>
                        <td className="w-[10%] border-none"></td>
                        <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Site Manager Approval</td>
                    </tr>
                </tbody>
            </table>
            <div className="text-center text-xs text-gray-500 mt-10 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
        </div>
    );
}
