
import React, { useEffect, useState } from 'react';
import api from '../api';
import { clsx } from 'clsx';
import { ChevronDown } from 'lucide-react';

interface FilterData {
    clients: string[];
    coveragesByClient: Record<string, string[]>;
    periodsByClient: Record<string, string[]>;
}

interface FilterMenuProps {
    onFilterChange: (filters: { client: string, coverages: string[], periods: string[] }) => void;
    refreshTrigger: number; // Increment to refetch
}

export const FilterMenu: React.FC<FilterMenuProps> = ({ onFilterChange, refreshTrigger }) => {
    const [data, setData] = useState<FilterData | null>(null);
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [selectedCoverages, setSelectedCoverages] = useState<string[]>([]);
    const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);

    useEffect(() => {
        api.get('/filters').then(res => {
            setData(res.data);
        }).catch(err => console.error("Error fetching filters", err));
    }, [refreshTrigger]);

    const handleClientChange = (client: string) => {
        setSelectedClient(client);
        // Reset other filters
        setSelectedCoverages([]);
        setSelectedPeriods([]);
    };

    const toggleSelection = (item: string, current: string[], setter: (v: string[]) => void) => {
        if (current.includes(item)) {
            setter(current.filter(i => i !== item));
        } else {
            setter([...current, item]);
        }
    };

    // derived options
    const startOptions = data ? data.clients : [];
    const coverageOptions = selectedClient && data ? data.coveragesByClient[selectedClient] || [] : [];
    const periodOptions = selectedClient && data ? data.periodsByClient[selectedClient] || [] : [];

    // Add Consolidado option if it's not there (it's virtual)
    // But wait, "Consolidado S+D+C" should be an option.
    // We can push it to coverageOptions if it's not present, or hardcode it.
    // The requirement says "Debe existir una opción 'Consolidado S+D+C'".
    // We'll append it to the list if user selects a client.
    const displayCoverageOptions = selectedClient ? ["Consolidado S+D+C", ...coverageOptions] : [];

    useEffect(() => {
        if (selectedClient && selectedCoverages.length && selectedPeriods.length) {
            onFilterChange({
                client: selectedClient,
                coverages: selectedCoverages,
                periods: selectedPeriods
            });
        }
    }, [selectedClient, selectedCoverages, selectedPeriods]);

    if (!data) return <div className="text-center p-4">Loading filters (please upload files first)...</div>;
    if (data.clients.length === 0) return <div className="text-center p-4 text-amber-600">No matching clients found in uploaded files.</div>;

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm w-full max-w-4xl mx-auto border border-slate-200 mb-8 space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">Report Configuration</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Client Select */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">1. Select Client</label>
                    <select
                        className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                        value={selectedClient}
                        onChange={(e) => handleClientChange(e.target.value)}
                    >
                        <option value="">-- Choose Client --</option>
                        {startOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                {/* Coverage Multi-Select */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">2. Select Coverage(s)</label>
                    <div className="border border-slate-300 rounded-md h-48 overflow-y-auto p-2 bg-slate-50">
                        {displayCoverageOptions.length === 0 && <span className="text-xs text-slate-400">Select a client first</span>}
                        {displayCoverageOptions.map(opt => (
                            <label key={opt} className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-slate-100 rounded px-1">
                                <input
                                    type="checkbox"
                                    checked={selectedCoverages.includes(opt)}
                                    onChange={() => toggleSelection(opt, selectedCoverages, setSelectedCoverages)}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Period Multi-Select */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">3. Select Period(s)</label>
                    <div className="border border-slate-300 rounded-md h-48 overflow-y-auto p-2 bg-slate-50">
                        {periodOptions.length === 0 && <span className="text-xs text-slate-400">Select a client first</span>}
                        {periodOptions.map(opt => (
                            <label key={opt} className="flex items-center space-x-2 py-1 cursor-pointer hover:bg-slate-100 rounded px-1">
                                <input
                                    type="checkbox"
                                    checked={selectedPeriods.includes(opt)}
                                    onChange={() => toggleSelection(opt, selectedPeriods, setSelectedPeriods)}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm">{opt}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
