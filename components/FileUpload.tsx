import React, { useState, useCallback } from 'react';

interface FileUploadProps {
    onFileUpload: (file: File) => void;
    isBusy: boolean;
    isApiKeySet: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, isBusy, isApiKeySet }) => {
    const [dragActive, setDragActive] = useState(false);
    
    const isUploadDisabled = !isApiKeySet;

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (isUploadDisabled) return;
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, [isUploadDisabled]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (isUploadDisabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileUpload(e.dataTransfer.files[0]);
        }
    }, [onFileUpload, isUploadDisabled]);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (isUploadDisabled) return;
        if (e.target.files && e.target.files[0]) {
            onFileUpload(e.target.files[0]);
        }
    };

    return (
        <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-lg transition-colors duration-300 ${dragActive ? 'border-blue-500 bg-gray-800' : 'border-gray-600 hover:border-blue-600'} ${isUploadDisabled ? 'cursor-not-allowed opacity-60' : ''}`}
        >
            <svg className="w-16 h-16 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V7a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2z"></path>
            </svg>
            <p className="text-xl text-gray-400 mb-2">Drag & drop your CSV file here</p>
            <p className="text-gray-500">or</p>
            <label htmlFor="file-upload" className={`mt-4 cursor-pointer bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors ${isUploadDisabled ? '!bg-gray-500 !cursor-not-allowed' : ''}`}>
                Select a file
            </label>
            <input id="file-upload" type="file" accept=".csv" onChange={handleChange} className="hidden" disabled={isBusy || isUploadDisabled} />
            {isBusy && <p className="mt-4 text-blue-400">Processing...</p>}
            
            {isUploadDisabled && (
                <div className="mt-4 text-center text-sm text-yellow-400 bg-yellow-900/30 p-3 rounded-md">
                    <p>No API key is set.</p>
                    <p>Please add your key in the Assistant's settings (⚙️) to begin.</p>
                </div>
            )}
            
            <p className="mt-4 text-xs text-gray-500">All processing is done locally in your browser. Your data stays private.</p>
        </div>
    );
};