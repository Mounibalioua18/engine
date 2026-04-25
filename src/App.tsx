/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Play, Copy, Check, FileCode2, Network, TerminalSquare, FileJson } from 'lucide-react';
import { useState } from 'react';
import { generateOfflineEngine } from './lib/engine';

export default function App() {
  const [topology, setTopology] = useState(
    "P1 -->|TCP| P2\n" +
    "P1 -->|UDP| P3\n" +
    "P2 -->|UDP| P3\n" +
    "P3 -->|RMI| P4\n" +
    "P4 -->|TCP| P1"
  );
  
  const [roles, setRoles] = useState(
    "P1: lire un entier N a partir du clavier. envoyer N à P2 et à P3\n" +
    "P2: calculer S1 (S1=N*2). envoyer S1 à P3\n" +
    "P3: calculer S2 (S2=(S1*3)+N). envoyer S2 à P2\n" +
    "A la fin de traitement, les resultats (S2) devront etre affiches au niveau du processus P1."
  );

  const [files, setFiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('');
  const [copied, setCopied] = useState(false);
  const [showHelper, setShowHelper] = useState(true);

  const generateCode = async () => {
    setLoading(true);
    setError('');
    setFiles({});
    setActiveTab('');

    try {
      // Offline Rules Engine simulation (super fast)
      await new Promise(resolve => setTimeout(resolve, 800)); 
      
      const parsedFiles = generateOfflineEngine(topology, roles);
      if (Object.keys(parsedFiles).length === 0) {
         throw new Error("No logic or invalid topology provided.");
      }

      setFiles(parsedFiles);

      const keys = Object.keys(parsedFiles);
      if (keys.length > 0) {
        // Force l'onglet P1 à s'afficher en premier si possible
        const p1 = keys.find(k => k.includes('P1.java'));
        setActiveTab(p1 || keys[0]);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erreur lors de la génération hors-ligne. Vérifiez la syntaxe.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (!files[activeTab]) return;
    navigator.clipboard.writeText(files[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden font-sans bg-bg text-text">
      <header className="h-14 border-b border-border bg-bg2 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="w-3 h-3 rounded-full bg-accent"></div>
          <span className="text-xs font-mono tracking-widest text-accent font-bold uppercase flex items-center gap-2">
            DistriGen v1.0.4 - Distributed Code Engine
          </span>
        </div>
        <div className="flex items-center space-x-6 hidden md:flex">
          <div className="flex space-x-2 text-[10px] font-mono text-muted uppercase">
            <span>Status:</span><span className="text-gray-300">Ready</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative z-10 border-b border-border">
        
        {/* LEFT COLUMN: Input Control Panel */}
        <aside className="w-full md:w-[400px] xl:w-[420px] border-r border-border bg-bg3 flex flex-col overflow-y-auto custom-scrollbar shrink-0">
          
          {showHelper && (
            <div className="bg-blue-500/10 border-b border-blue-500/30 p-4 relative text-blue-200">
               <button 
                   onClick={() => setShowHelper(false)} 
                   className="absolute top-2 right-2 text-blue-400 hover:text-white transition-colors cursor-pointer rounded-full p-1 bg-black/20">
                 ✕
               </button>
               <h4 className="flex items-center font-bold text-xs uppercase tracking-widest mb-2 text-blue-400">
                   <TerminalSquare className="w-3 h-3 mr-2 inline-block" />
                   Erreur "ClassNotFound" ?
               </h4>
               <p className="text-[11px] leading-relaxed">
                  Si vous obtenez <code>Could not find or load main class P3</code>, c'est juste que le code <strong>n'est pas encore compilé</strong> !<br/><br/>
                  Utilisez <code>javac *.java</code> dans votre terminal pour générer les fichiers <code>.class</code> <strong>avant</strong> de lancer <code>java P3 localhost</code>.<br/><br/>
                  <em>Note: Le moteur génère désormais du code qui lit les IPs depuis la ligne de commande (comme <code>localhost</code>).</em>
               </p>
            </div>
          )}

          <div className="p-4 border-b border-border flex flex-col">
            <h2 className="text-[10px] uppercase tracking-widest text-muted mb-3 font-bold flex items-center gap-2">
              <Network size={12} className="text-accent" />
              Network Topology Input
            </h2>
            <textarea
              value={topology}
              onChange={(e) => setTopology(e.target.value)}
              className="w-full bg-black/40 border border-[#27272a] rounded p-3 text-[11px] text-accent focus:outline-none focus:border-accent resize-none font-mono leading-relaxed min-h-[140px]"
            />
          </div>

          <div className="p-4 flex-1 flex flex-col">
            <h2 className="text-[10px] uppercase tracking-widest text-muted mb-3 font-bold flex items-center gap-2">
              <TerminalSquare size={12} className="text-accent" />
              Process Roles & Logic
            </h2>
            <textarea
              value={roles}
              onChange={(e) => setRoles(e.target.value)}
              className="w-full bg-black/40 border border-[#27272a] rounded p-3 text-[11px] text-gray-300 focus:outline-none focus:border-accent resize-none font-mono leading-relaxed flex-1 min-h-[180px]"
            />
          </div>

          <div className="p-4 border-t border-border mt-auto shrink-0 bg-bg3">
            <button
              onClick={generateCode}
              disabled={loading}
              className="w-full px-4 py-3 bg-[#059669] hover:bg-accent text-white text-xs font-bold rounded uppercase tracking-tighter transition-colors flex justify-center items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <div className="flex items-center gap-3">
                   <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                   <span>Compilation en cours...</span>
                </div>
              ) : (
                <>
                  <Play size={14} className="transition-transform group-hover:scale-110" /> 
                  Generate Source Code
                </>
              )}
            </button>
          </div>
        </aside>

        {/* RIGHT COLUMN: Code View Area */}
        <div className="flex-1 flex flex-col bg-bg overflow-hidden relative">
            
            {Object.keys(files).length > 0 ? (
              <>
                {/* Code Tabs Header */}
                <div className="flex justify-between items-center bg-bg2 border-b border-border w-full overflow-x-auto custom-scrollbar shrink-0">
                  <div className="flex">
                    {Object.keys(files).map((file) => (
                      <button
                        key={file}
                        onClick={() => setActiveTab(file)}
                        className={`px-4 py-3 text-xs font-mono border-r border-border transition-colors ${
                          activeTab === file
                            ? `border-b-2 border-b-accent text-accent bg-bg`
                            : 'text-muted hover:text-gray-300 bg-bg2'
                        } cursor-pointer`}
                      >
                        {file}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={copyCode}
                    className={`flex items-center gap-2 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors ${
                      copied ? 'text-rmi' : 'text-muted hover:text-gray-300 bg-bg2'
                    } cursor-pointer`}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy Code'}
                  </button>
                </div>

                {/* Code View Canvas */}
                <div className="flex-1 p-4 md:p-6 font-mono text-[12px] leading-relaxed overflow-hidden bg-bg">
                  <div className="h-full overflow-auto text-gray-400 bg-black/20 rounded-md p-4 border border-[#27272a] relative custom-scrollbar">
                    <pre className="font-mono text-[12px] leading-relaxed whitespace-pre w-full">
                      {files[activeTab]}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              // Empty / Loading States
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted bg-bg">
                {error ? (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-6 rounded max-w-lg mb-8">
                    <p className="font-bold text-xs uppercase tracking-widest mb-2">Generation Error</p>
                    <pre className="text-[10px] whitespace-pre-wrap font-mono">{error}</pre>
                  </div>
                ) : loading ? (
                  <div className="animate-pulse flex flex-col items-center mb-8">
                    <FileCode2 size={40} className="text-accent mb-4 animate-bounce" />
                    <p className="font-bold text-sm tracking-widest uppercase text-white">Translating Topology</p>
                    <p className="text-[11px] mt-2 max-w-xs font-mono text-muted">
                      Transmitting to Gemini engine to write Java sockets and RMI infrastructure in real-time.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center mb-8">
                    <FileJson size={48} className="text-muted mb-4 opacity-40" />
                    <p className="font-bold text-[12px] uppercase tracking-widest text-gray-300">No Processes Loaded</p>
                    <p className="text-[11px] mt-2 max-w-sm font-mono text-muted">
                      Ready to ingest topology. Click <strong>Generate Source Code</strong> to begin.
                    </p>
                  </div>
                )}
              </div>
            )}
        </div>
      </main>

      <footer className="h-6 bg-[#08080A] flex items-center px-4 justify-between text-[10px] font-mono text-muted uppercase shrink-0">
        <div className="flex space-x-4">
          <span>Java JDK 17 Target</span>
          <span>Threads: 12</span>
        </div>
        <div className="flex space-x-4 hidden sm:flex">
          <span className="text-[#059669]">Network Engine: Online</span>
        </div>
      </footer>
    </div>
  );
}