
import React, { useState } from 'react';
import api from '../api';
import { UploadCloud, CheckCircle, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface FileUploadProps {
    onUploadSuccess: () => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
    const [primasStatus, setPrimasStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
    const [gastosStatus, setGastosStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');

    const handleUpload = async (file: File, type: 'primas' | 'gastos') => {
        const setStatus = type === 'primas' ? setPrimasStatus : setGastosStatus;
        setStatus('uploading');

        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post(`/upload/${type}`, formData);
            setStatus('success');
            // Check if both are done? Or just notify success.
            // Parent needs to reload filters when both are ready?
            // Or parent reloads filters whenever one is uploaded?
            onUploadSuccess();
        } catch (err) {
            console.error(err);
            setStatus('error');
        }
    };

    const UploadButton = ({ type, label, status }: { type: 'primas' | 'gastos', label: string, status: string }) => (
        <div className="flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg border-slate-300 hover:bg-slate-50 transition-colors relative w-full">
            <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer"
                accept=".xlsx, .xls"
                onChange={(e) => {
                    if (e.target.files?.[0]) handleUpload(e.target.files[0], type);
                }}
            />
            {status === 'success' ? (
                <CheckCircle className="w-8 h-8 text-green-500" />
            ) : status === 'error' ? (
                <AlertCircle className="w-8 h-8 text-red-500" />
            ) : (
                <UploadCloud className="w-8 h-8 text-slate-400" />
            )}
            <span className="font-medium text-slate-700">{label}</span>
            <span className="text-sm text-slate-500">
                {status === 'idle' && "Click or drag to upload"}
                {status === 'uploading' && "Uploading..."}
                {status === 'success' && "Uploaded"}
                {status === 'error' && "Error"}
            </span>
        </div>
    );

    return (
        <div className="flex gap-4 w-full max-w-2xl mx-auto mb-8">
            <UploadButton type="primas" label="Sábana de Primas" status={primasStatus} />
            <UploadButton type="gastos" label="Sábana de Gastos" status={gastosStatus} />
        </div>
    );
};
