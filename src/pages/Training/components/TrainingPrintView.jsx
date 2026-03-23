import React from 'react';
import { safeArr } from '../utils';

export default function TrainingPrintView({ printData }) {
    if (!printData) return null;

    return (
        <div className="hidden print:block print-content p-10 bg-white text-black absolute inset-0 z-[9999]" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <div className="flex justify-between items-end border-b-4 border-black pb-4 mb-8">
                <div>
                    <div className="text-sm font-bold text-gray-500 mb-1 tracking-widest uppercase">ISO 45001 OHSMS - Document Control</div>
                    <h1 className="text-3xl font-black uppercase tracking-tighter m-0 p-0 leading-none">Training Attendance Record</h1>
                </div>
                <div className="text-right">
                    <p className="text-sm font-bold font-mono">Record ID: {printData.id || 'DRAFT'}</p>
                    <p className="text-sm font-bold mt-1 uppercase">Date: {printData.date}</p>
                </div>
            </div>

            <div className="border border-black p-6 bg-gray-50 mb-8">
                <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-gray-400 inline-block">1. Session Information</h2>
                <table className="w-full text-sm border-none">
                    <tbody>
                        <tr>
                            <td className="w-[20%] font-bold py-2 border-b border-gray-300">Topic / Course:</td>
                            <td colSpan="3" className="text-lg font-bold py-2 border-b border-gray-300">{printData.topic}</td>
                        </tr>
                        <tr>
                            <td className="font-bold py-2 align-top border-b border-gray-300">Content / Agenda:</td>
                            <td colSpan="3" className="py-2 border-b border-gray-300 whitespace-pre-wrap leading-relaxed">{printData.content || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td className="font-bold py-2 border-b border-gray-300">Site / Location:</td>
                            <td className="w-[30%] py-2 border-b border-gray-300">{printData.siteId}</td>
                            <td className="w-[20%] font-bold py-2 pl-4 border-b border-gray-300">Expiry / Renewal:</td>
                            <td className="py-2 border-b border-gray-300 text-red-600 font-bold font-mono">{printData.expiryDate || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td className="font-bold py-2 border-b border-gray-300">Trainer Name:</td>
                            <td className="py-2 border-b border-gray-300">{printData.trainer || 'N/A'}</td>
                            <td className="font-bold py-2 pl-4 border-b border-gray-300">Training Type:</td>
                            <td className="py-2 border-b border-gray-300">{printData.type || 'Internal'} ({printData.duration})</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {printData.sourceCapaRef && (
                <div className="border-2 border-dashed border-black p-4 mb-8 bg-gray-100 flex items-start gap-4">
                    <i className="fas fa-link text-2xl mt-1"></i>
                    <div>
                        <strong className="uppercase block mb-1">Cross-Module Compliance Note:</strong>
                        <span className="text-sm">This specific training session was conducted to fulfill and close an active Corrective/Preventive Action (CAPA) originating from another safety module (Reference ID: <strong>{printData.sourceCapaRef}</strong>).</span>
                    </div>
                </div>
            )}

            <div className="page-break-inside-avoid">
                <h2 className="text-sm font-bold mb-4 uppercase bg-gray-200 p-1 border border-black inline-block">2. Attendance Roster</h2>
                <table className="w-full text-sm border-collapse border border-black">
                    <thead>
                        <tr className="bg-gray-200">
                            <th className="border border-black p-3 text-center w-[5%]">#</th>
                            <th className="border border-black p-3 text-left w-[35%]">Full Name</th>
                            <th className="border border-black p-3 text-left w-[30%]">Role / Affiliation</th>
                            <th className="border border-black p-3 text-center w-[30%]">Signature (Acknowledged)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {safeArr(printData.attendees).filter((attendee) => attendee.status !== 'Absent').map((attendee, idx) => (
                            <tr key={idx}>
                                <td className="border border-black p-3 text-center font-bold">{idx + 1}</td>
                                <td className="border border-black p-3 font-bold">{attendee.name} {attendee.userId === 'External' ? '(Contractor/EXT)' : ''}</td>
                                <td className="border border-black p-3">{attendee.role}</td>
                                <td className="border border-black p-3 h-[40px]"></td>
                            </tr>
                        ))}
                        {(!printData.attendees || safeArr(printData.attendees).length === 0) && (
                            <tr><td colSpan="4" className="border border-black p-8 text-center italic text-gray-500">No attendees recorded for this session.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <table className="w-full border-none mt-20 text-sm page-break-inside-avoid">
                <tbody>
                    <tr>
                        <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Trainer Signature</td>
                        <td className="w-[10%] border-none"></td>
                        <td className="w-[45%] border-none border-t-2 border-black pt-2 text-center font-bold uppercase tracking-widest">Site Manager / EHS Lead Verification</td>
                    </tr>
                </tbody>
            </table>
            <div className="text-center text-xs text-gray-500 mt-12 border-t border-gray-300 pt-4 font-mono">Generated by OHSMS Enterprise Portal | Document Control Timestamp: {new Date().toLocaleString()}</div>
        </div>
    );
}
