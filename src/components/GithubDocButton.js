// components/GithubDocButton.js
"use client";
import { useState } from 'react';
import { Github, Check, AlertCircle } from 'lucide-react';

export default function GithubDocButton({ 
  githubUrl, 
  documentationContent,
  onSuccess 
}) {
  const [status, setStatus] = useState('idle'); // idle, loading, success, error

  const handleSendToGithub = async () => {
    setStatus('loading');
    
    try {
      const response = await fetch('/api/github-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl: githubUrl,
          content: documentationContent,
          fileName: 'CIRCUIT_DOCUMENTATION.md'
        })
      });

      if (response.ok) {
        setStatus('success');
        onSuccess?.();
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        throw new Error('Échec de l\'envoi');
      }
    } catch (error) {
      console.error('Erreur GitHub:', error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const getButtonContent = () => {
    switch (status) {
      case 'loading':
        return (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Envoi en cours...
          </>
        );
      case 'success':
        return (
          <>
            <Check className="w-4 h-4" />
            Documentation envoyée !
          </>
        );
      case 'error':
        return (
          <>
            <AlertCircle className="w-4 h-4" />
            Erreur - Réessayer
          </>
        );
      default:
        return (
          <>
            <Github className="w-4 h-4" />
            Envoyer la doc sur GitHub
          </>
        );
    }
  };

  const getButtonClass = () => {
    const base = "flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200";
    
    switch (status) {
      case 'success':
        return `${base} bg-green-500 text-white`;
      case 'error':
        return `${base} bg-red-500 text-white hover:bg-red-600`;
      case 'loading':
        return `${base} bg-gray-400 text-white cursor-not-allowed`;
      default:
        return `${base} bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl`;
    }
  };

  return (
    <div className="flex flex-col gap-2 p-4 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="mt-1">
          <Github className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800 mb-1">
            📝 Documentation complète générée
          </p>
          <p className="text-xs text-gray-600">
            La documentation technique est prête à être ajoutée à votre dépôt GitHub.
          </p>
        </div>
      </div>
      
      <button
        onClick={handleSendToGithub}
        disabled={status === 'loading' || status === 'success'}
        className={getButtonClass()}
      >
        {getButtonContent()}
      </button>
      
      {status === 'success' && (
        <p className="text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded">
          ✓ Fichier CIRCUIT_DOCUMENTATION.md créé dans votre repo
        </p>
      )}
    </div>
  );
}