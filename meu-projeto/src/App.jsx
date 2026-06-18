import React, { useState } from 'react';
import Sidebar from './components/Sidebar/Sidebar';

export default function App() {
  const [expandedObra, setExpandedObra] = useState(null);

  const obras = [
    { id: 1, nome: 'BOA VISTA', contrato: 'XXX-XX/2020', status: 'Em Andamento', equipe: 12, rdos: 45, progresso: 65 },
    { id: 2, nome: 'PORTO SUL', contrato: 'YYY-ABC/2022', status: 'Iniciando', equipe: 8, rdos: 12, progresso: 15 },
    { id: 3, nome: 'TERMINAL SUAPE', contrato: 'ZZZ-999/2021', status: 'Atrasada', equipe: 25, rdos: 156, progresso: 90 },
  ];

  const toggleObra = (id) => {
    setExpandedObra(expandedObra === id ? null : id);
  };

  return (
    <div className="flex min-h-screen bg-[#f1f5f9] w-full text-[#334155] font-sans overflow-hidden text-left">
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        
        {/* Header Minimalista - Altura Reduzida */}
        <header className="bg-white border-b border-gray-100 px-8 py-2.5 flex justify-between items-center z-10 shadow-sm">
          <div className="flex flex-col">
            <h1 className="text-[6px] font-black text-[#0f1729] tracking-widest m-0 uppercase leading-tight">
              Gestão de Obras
            </h1>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight m-0 leading-none mt-0.5">
              Status Operacional / RDO
            </p>
          </div>
          <button className="bg-[#0f1729] text-white text-[9px] font-black px-5 py-2 rounded-sm border border-[#0f1729] hover:bg-black transition-all active:scale-95 uppercase tracking-widest">
            + Nova Obra
          </button>
        </header>

        {/* Área da lista */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="flex flex-col border border-gray-200 bg-white shadow-sm">
            {obras.map((obra) => {
              const isExpanded = expandedObra === obra.id;
              return (
                <div 
                  key={obra.id} 
                  className={`border-b border-gray-100 transition-all duration-200 ${
                    isExpanded ? 'bg-gray-50/40' : 'hover:bg-gray-50/50'
                  }`}
                >
                  {/* Linha Principal */}
                  <div 
                    onClick={() => toggleObra(obra.id)}
                    className="p-5 cursor-pointer flex items-center justify-between group relative"
                  >
                    {isExpanded && <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#f5c518]"></div>}
                    
                    <div className="flex items-center gap-8 flex-1">
                      <div>
                        <span className={`text-[8px] px-1.5 py-0.5 font-bold uppercase tracking-tighter border mb-1.5 inline-block ${
                          obra.status === 'Atrasada' ? 'border-red-100 text-red-500 bg-red-50' : 'border-emerald-100 text-emerald-600 bg-emerald-50'
                        }`}>
                          {obra.status}
                        </span>
                        <h2 className={`text-base font-black tracking-tight m-0 transition-colors ${isExpanded ? 'text-[#f5c518]' : 'text-[#0f1729]'}`}>
                          {obra.nome}
                        </h2>
                        <p className="text-[10px] text-gray-400 font-bold mt-0.5 tracking-tight uppercase">C: {obra.contrato}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-12 text-right">
                      <div className="hidden lg:block lg:w-28">
                        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest m-0 leading-none mb-1">Equipe</p>
                        <p className="text-[11px] font-bold text-[#0f1729] m-0 underline decoration-[#f5c518] decoration-2 underline-offset-4">{obra.equipe} Integrantes</p>
                      </div>
                      <div className="hidden lg:block lg:w-28 text-center border-l border-gray-100">
                        <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest m-0 leading-none mb-1">Registros</p>
                        <p className="text-[11px] font-bold text-[#0f1729] m-0">{obra.rdos} RDOs</p>
                      </div>
                      <div className="w-7 h-7 flex items-center justify-center border border-gray-100 rounded-sm group-hover:border-[#f5c518] transition-colors">
                        <i className={`fa-solid ${isExpanded ? 'fa-minus' : 'fa-plus'} text-[9px] text-gray-300 group-hover:text-[#f5c518]`}></i>
                      </div>
                    </div>
                  </div>

                  {/* Ações Retilíneas */}
                  <div className={`overflow-hidden transition-all duration-300 ${isExpanded ? 'max-h-48 border-t border-gray-50' : 'max-h-0'}`}>
                    <div className="grid grid-cols-4 divide-x divide-gray-100 bg-gray-50/30">
                      
                      <button className="flex flex-col items-center justify-center gap-2 p-6 hover:bg-white transition-all group border-b-2 border-transparent hover:border-b-[#f5c518]">
                        <i className="fa-solid fa-file-circle-plus text-sm text-gray-400 group-hover:text-[#f5c518]"></i>
                        <span className="text-[9px] font-black text-[#0f1729] uppercase tracking-widest">Novo RDO</span>
                      </button>

                      <button className="flex flex-col items-center justify-center gap-2 p-6 hover:bg-white transition-all group border-b-2 border-transparent hover:border-b-[#f5c518]">
                        <i className="fa-solid fa-clock-rotate-left text-sm text-gray-400 group-hover:text-[#f5c518]"></i>
                        <span className="text-[9px] font-black text-[#0f1729] uppercase tracking-widest">Histórico</span>
                      </button>

                      <button className="flex flex-col items-center justify-center gap-2 p-6 hover:bg-white transition-all group border-b-2 border-transparent hover:border-b-[#f5c518]">
                        <i className="fa-solid fa-pen-to-square text-sm text-gray-400 group-hover:text-[#f5c518]"></i>
                        <span className="text-[9px] font-black text-[#0f1729] uppercase tracking-widest">Editar Obra</span>
                      </button>

                      <button className="flex flex-col items-center justify-center gap-2 p-6 hover:bg-red-50/50 transition-all group border-b-2 border-transparent hover:border-b-red-500">
                        <i className="fa-solid fa-trash-can text-sm text-gray-400 group-hover:text-red-500"></i>
                        <span className="text-[9px] font-black text-[#0f1729] uppercase tracking-widest group-hover:text-red-500">Excluir</span>
                      </button>

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}