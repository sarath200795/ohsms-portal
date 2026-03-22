import React from 'react';
import { getTypeConfig } from '../../../utils/constants';
import { safeArr } from '../../../utils/helpers';

export default function PrintView({ printData, qrImage }) {
    if (!printData) return null;

    return (
        <div className="hidden w-full bg-white p-8 text-black print:block" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <div className="mb-6 flex items-center justify-between border-b-2 border-black pb-4">
                <div className="w-3/4 text-left">
                    <div className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500">OHSMS - FORMAL RECORD (ISO 45001)</div>
                    <h1 className="m-0 p-0 text-2xl font-black uppercase leading-tight">{getTypeConfig(printData.typeId).label}</h1>
                </div>
                <div className="flex w-1/4 justify-end text-right">
                    {qrImage && <img src={qrImage} alt="QR Code" className="h-24 w-24 border-2 border-black p-1" />}
                </div>
            </div>

            <div className="mb-6 border border-black bg-gray-50 p-4">
                <table className="w-full border-none text-sm">
                    <tbody>
                        <tr>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 font-bold">Permit No:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-mono text-lg font-black">{printData.id}</td>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 pl-4 font-bold">Status:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-bold uppercase">{printData.status}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 font-bold">Facility:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-bold">{printData.siteId}</td>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 pl-4 font-bold">Location:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5 font-bold">{printData.location}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 font-bold">Issuing Dept:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5">{printData.issuingDept || 'N/A'}</td>
                            <td className="w-[15%] border-b border-gray-300 py-1.5 pl-4 font-bold">Equipment:</td>
                            <td className="w-[35%] border-b border-gray-300 py-1.5">{printData.equipment || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td className="w-[15%] align-top border-none py-1.5 font-bold">Execution Team:</td>
                            <td className="w-[35%] align-top border-none py-1.5 font-bold">
                                {printData.workerType === 'Contractor' ? `[Contractor] ${printData.contractorName}` : '[Internal]'} <br />
                                Supervised By: {printData.issuedToName} (Ph: {printData.issuedToPh}) <br />
                                Workers: {safeArr(printData.entrantNames).join(', ') || 'None Assigned'}
                            </td>
                            <td className="w-[15%] align-top border-none py-1.5 pl-4 font-bold">Validity:</td>
                            <td className="w-[35%] align-top border-none py-1.5 font-mono font-bold">
                                {printData.validFromDate} to {printData.validToDate}
                                <br />
                                {printData.validFromTime} - {printData.validToTime}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div className="mb-6">
                <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">1. Description of Work</h2>
                <div className="min-h-[60px] border border-black p-3 text-sm leading-relaxed">{printData.description}</div>
            </div>

            <div className="page-break-inside-avoid mb-6">
                <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">2. Work Method Statement (WMS)</h2>
                <table className="m-0 w-full border-collapse border border-black text-sm">
                    <thead>
                        <tr className="bg-gray-100">
                            <th className="w-10 border border-black p-2 text-center">#</th>
                            <th className="w-1/3 border border-black p-2">Step / Activity</th>
                            <th className="w-1/3 border border-black p-2">Possible Hazard</th>
                            <th className="w-1/3 border border-black p-2">Control / Precaution</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeArr(printData.wms).map((row, index) => (
                            <tr key={index}>
                                <td className="border border-black p-2 text-center font-bold">{index + 1}</td>
                                <td className="border border-black p-2">{row?.step || ''}</td>
                                <td className="border border-black p-2">{row?.hazard || ''}</td>
                                <td className="border border-black p-2">{row?.precaution || ''}</td>
                            </tr>
                        ))}
                        {safeArr(printData.wms).length === 0 && (
                            <tr>
                                <td colSpan={4} className="border border-black p-2 text-center italic">
                                    No steps recorded.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="page-break-inside-avoid mb-6 flex gap-6">
                <div className="w-1/2">
                    <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">3. Required PPE</h2>
                    <div className="min-h-[100px] border border-black p-4 text-sm leading-loose">
                        {safeArr(printData.ppe).length > 0 ? safeArr(printData.ppe).join(', ') : 'Standard PPE Only'}
                    </div>
                </div>
                <div className="w-1/2">
                    <h2 className="mb-2 inline-block border border-black bg-gray-200 p-1.5 text-sm font-bold uppercase">4. Pre-Work Verification</h2>
                    <div className="min-h-[100px] space-y-2 border border-black p-4 text-xs">
                        {safeArr(printData.checklist).map((check, index) => (
                            <div key={index} className="flex items-start gap-2">
                                <div className="mt-0.5 h-3 w-3 shrink-0 border border-black" style={{ backgroundColor: check?.checked ? 'black' : 'transparent' }}></div>
                                <span>{check?.label || ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {(printData.typeId === 'HOT' || printData.typeId === 'CSE' || printData.typeId === 'ELE' || printData.typeId === 'WAH') && (
                <div className="page-break-inside-avoid mb-6 border-2 border-black bg-gray-50 p-4">
                    <h2 className="mb-3 text-sm font-bold uppercase underline">Specialized Controls</h2>
                    <table className="w-full border-none text-sm">
                        <tbody>
                            {printData.typeId === 'HOT' && (
                                <tr>
                                    <td className="w-1/4 py-1 font-bold">Fire Watcher Name:</td>
                                    <td className="py-1">{printData.fireWatcherName || 'N/A'}</td>
                                </tr>
                            )}
                            {printData.typeId === 'ELE' && (
                                <tr>
                                    <td className="w-1/4 py-1 font-bold">LOTO Procedure Ref:</td>
                                    <td className="py-1 font-mono font-bold">{printData.lotoRef || 'N/A'}</td>
                                </tr>
                            )}
                            {printData.typeId === 'WAH' && (
                                <tr>
                                    <td className="w-1/4 align-top py-1 font-bold">Height Access Equip:</td>
                                    <td className="py-1">{safeArr(printData.wahEquipment).join(', ')}</td>
                                </tr>
                            )}
                            {printData.typeId === 'CSE' && (
                                <>
                                    <tr>
                                        <td className="border-b border-gray-300 py-1 font-bold">Attendant:</td>
                                        <td className="border-b border-gray-300 py-1">{printData.attendantName}</td>
                                        <td className="border-b border-gray-300 py-1 pl-4 font-bold">Supervisor:</td>
                                        <td className="border-b border-gray-300 py-1">{printData.entrySupervisorName}</td>
                                    </tr>
                                    <tr>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 font-bold">Oxygen:</td>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 font-mono">{printData.oxygenLevel}</td>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 pl-4 font-bold">Toxic Gas:</td>
                                        <td className="mt-1 border-b border-gray-300 py-1 pt-1 font-mono">{printData.toxicGas}</td>
                                    </tr>
                                    <tr>
                                        <td className="border-none py-1 font-bold">Flammability:</td>
                                        <td colSpan={3} className="border-none py-1 font-mono">
                                            {printData.flammability}
                                        </td>
                                    </tr>
                                </>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="page-break-inside-avoid mt-8 border-2 border-black">
                <h2 className="border-b-2 border-black bg-gray-200 p-2 text-center text-sm font-bold uppercase">5. Dual Authorization Signatures</h2>
                <p className="border-b border-gray-300 bg-gray-50 p-1.5 text-center text-[10px] italic">By signing, I confirm the area is safe, precautions are implemented, and workers are briefed.</p>
                <table className="w-full border-none text-sm">
                    <tbody>
                        <tr>
                            <td className="h-32 w-1/3 border-r border-black p-4 align-top">
                                <strong className="mb-6 block text-xs uppercase tracking-widest text-gray-500">Requested By:</strong>
                                Name: <strong className="text-base">{printData.creatorEmail || printData.requestedBy}</strong>
                                <br />
                                <br />
                                <br />
                                Sign: __________________
                            </td>
                            <td className="h-32 w-1/3 border-r border-black p-4 align-top">
                                <strong className="mb-6 block text-xs uppercase tracking-widest text-gray-500">Engineering Approval:</strong>
                                Name: <strong className="text-base">{printData.engApproverEmail || '________________'}</strong>
                                <br />
                                Status: {printData.engStatus}
                                <br />
                                <br />
                                Sign: __________________
                            </td>
                            <td className="h-32 w-1/3 p-4 align-top">
                                <strong className="mb-6 block text-xs uppercase tracking-widest text-gray-500">Production Approval:</strong>
                                Name: <strong className="text-base">{printData.prodApproverEmail || '________________'}</strong>
                                <br />
                                Status: {printData.prodStatus}
                                <br />
                                <br />
                                Sign/Time: __________________
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-gray-500">
                System Generated Document - Verify Live Status via QR Code
            </div>
        </div>
    );
}
