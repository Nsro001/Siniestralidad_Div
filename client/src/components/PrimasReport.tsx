
import React, { useEffect, useState } from 'react';
import api from '../api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PrimasReportProps {
    filters: {
        client: string;
        coverages: string[];
        periods: string[];
    };
    refreshTrigger: number;
}

interface ChartDataset {
    title: string;
    data: { month: string; prima: number; gasto: number }[];
}

export const PrimasReport: React.FC<PrimasReportProps> = ({ filters, refreshTrigger }) => {
    const [datasets, setDatasets] = useState<ChartDataset[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!filters.client || filters.coverages.length === 0 || filters.periods.length === 0) {
            setDatasets([]);
            return;
        }

        setLoading(true);
        const params = new URLSearchParams();
        params.append('client', filters.client);
        params.append('coverages', filters.coverages.join(','));
        params.append('periods', filters.periods.join(','));

        api.get<ChartDataset[]>('/report/primas', { params })
            .then(res => setDatasets(res.data))
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    }, [filters, refreshTrigger]);

    if (loading) return <div>Loading Primas Report...</div>;
    if (datasets.length === 0) return null;

    return (
        <div className="space-y-8 mb-12">
            <h2 className="text-2xl font-bold text-slate-800 border-l-4 border-blue-600 pl-4">Reporte de Primas vs Siniestralidad</h2>

            <div className="grid grid-cols-1 gap-8">
                {datasets.map((ds, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-lg shadow border border-slate-200">
                        <h3 className="text-lg font-semibold mb-4 text-center">{ds.title}</h3>
                        <div className="h-80 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={ds.data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="prima" name="Prima UF" fill="#3b82f6" />
                                    <Bar dataKey="gasto" name="Gasto UF" fill="#ef4444" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
