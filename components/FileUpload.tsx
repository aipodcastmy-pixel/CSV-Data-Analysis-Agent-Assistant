import React, { useState, useCallback } from 'react';
import { ProgressMessage } from '../types';

interface FileUploadProps {
    onFileUpload: (file: File) => void;
    isBusy: boolean;
    isApiKeySet: boolean;
    progressMessages: ProgressMessage[];
    fileName: string | null;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, isBusy, isApiKeySet, progressMessages, fileName }) => {
    const [dragActive, setDragActive] = useState(false);
    
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isApiKeySet) return;
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, [isApiKeySet]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (!isApiKeySet) return;
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileUpload(e.dataTransfer.files[0]);
        }
    }, [onFileUpload, isApiKeySet]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!isApiKeySet) return;
        if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
        }
    };

    if (isBusy && fileName) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg border-blue-600 bg-gray-800 h-full">
                <div className="flex items-center text-xl text-white mb-4">
                    <svg className="animate-spin -ml-1 mr-3 h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Processing "{fileName}"...</span>
                </div>
                <div className="w-full max-w-lg bg-gray-900 rounded-md p-4 max-h-64 overflow-y-auto">
                    <ul className="space-y-1">
                        {progressMessages.map((msg, index) => (
                            <li key={index} className={`flex text-xs ${msg.type === 'error' ? 'text-red-400' : 'text-gray-400'}`}>
                                <span className="mr-2 text-gray-500">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                <span>{msg.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <p className="mt-4 text-xs text-gray-500">All processing is done locally in your browser. Your data stays private.</p>
            </div>
        );
    }

    if (!isApiKeySet) {
        return (
             <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg border-gray-600 h-full">
                <svg className="w-16 h-16 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6.364-3.636l-1.414 1.414M21 12h-2M4 12H2m15.636-6.364l-1.414-1.414M6.364 6.364L4.95 4.95M12 3V1m0 18v-2M4.95 19.05l1.414-1.414m12.728 0l-1.414-1.414M12 6a6 6 0 100 12 6 6 0 000-12z"></path></svg>
                <h3 className="text-xl font-semibold text-white">API Key Required</h3>
                <p className="mt-2 max-w-sm text-center text-gray-400">
                    To unlock the AI analysis features, please add your Google Gemini API key in the Assistant's settings panel.
                </p>
                <p className="mt-6 text-xs text-gray-500">Your data remains local and private even when using the AI.</p>
             </div>
        );
    }

    return (
        <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg transition-colors duration-300 h-full ${dragActive ? 'border-blue-500 bg-gray-800' : 'border-gray-600 hover:border-blue-600'}`}
        >
            <svg className="w-16 h-16 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2z"></path>
            </svg>
            <p className="text-xl text-gray-400 mb-2">Drag & drop your CSV file here</p>
            <p className="text-gray-500">or</p>
            <label htmlFor="file-upload" className="mt-4 cursor-pointer bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">
                Select a file
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleChange} className="hidden" disabled={isBusy} />
            <p className="mt-4 text-xs text-gray-500">All processing is done locally in your browser. Your data stays private.</p>
        </div>
    );
};