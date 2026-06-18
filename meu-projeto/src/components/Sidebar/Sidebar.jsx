import React, { useState } from 'react';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const [activeItem, setActiveItem] = useState('Obras');

  const menuItems = [
    { name: 'Obras', icon: 'fa-user-gear' },
    { name: 'RDO', icon: 'fa-file-lines' },
    { name: 'Aprovações', icon: 'fa-square-check' },
    { name: 'Mídias', icon: 'fa-image' },
    { name: 'Log de erros', icon: 'fa-circle-exclamation' },
  ];

  return (
    <aside
      className={`h-screen sticky top-0 left-0 bg-[#0f1729] text-white flex flex-col justify-between py-6 border-r border-[#1a2540] font-sans z-50 transition-all duration-300 ${
        isOpen ? 'w-[260px] px-4' : 'w-[80px] px-2'
      }`}
    >
      <div>
        <div className={`flex items-center justify-between mb-8 ${isOpen ? 'px-2' : 'flex-col gap-4'}`}>
          {isOpen && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1a2e5e] rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0">
                <i className="fa-solid fa-sun text-[#f5c518] text-xl"></i>
              </div>
              <div className="text-left leading-tight">
                <p className="text-white font-bold text-base tracking-tight m-0 uppercase">Suape RDO</p>
                <p className="text-[#f5c518] text-[9px] font-semibold tracking-widest uppercase m-0">Diário Ágil</p>
              </div>
            </div>
          )}
          {!isOpen && (
            <div className="w-10 h-10 bg-[#1a2e5e] rounded-xl flex items-center justify-center text-white mb-2 mx-auto">
              <i className="fa-solid fa-sun text-[#f5c518] text-xl"></i>
            </div>
          )}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="w-8 h-8 rounded-full bg-[#162040] border border-[#1a2e5e]/30 text-gray-400 flex items-center justify-center hover:text-white transition-colors cursor-pointer"
          >
            <i className={`fa-solid ${isOpen ? 'fa-chevron-left' : 'fa-bars'} text-[10px]`}></i>
          </button>
        </div>

        <nav className="flex flex-col gap-2">
          {menuItems.map((item) => {
            const isActive = activeItem === item.name;
            return (
              <button
                key={item.name}
                onClick={() => setActiveItem(item.name)}
                className={`w-full flex items-center h-12 rounded-xl transition-all duration-200 relative group cursor-pointer border-l-[3px] ${
                  isActive
                    ? 'bg-[#1e2840] text-[#f5c518] border-[#f5c518]'
                    : 'text-gray-400 hover:bg-[#162040] hover:text-white border-transparent'
                } ${isOpen ? 'px-4 gap-4' : 'justify-center'}`}
              >
                <div className={`flex items-center justify-center min-w-[20px] ${isActive ? 'text-[#f5c518]' : 'text-gray-500'}`}>
                  <i className={`fa-solid ${item.icon} text-lg`}></i>
                </div>
                
                {isOpen && <span className="text-[15px] whitespace-nowrap">{item.name}</span>}

                {!isOpen && (
                  <div className="absolute left-[85px] bg-[#1a2e5e] text-[#f5c518] text-xs rounded-md py-2 px-3 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100 whitespace-nowrap pointer-events-none z-50 shadow-2xl border border-[#1e3470] origin-left">
                    {item.name}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
        <div className={`flex items-center text-emerald-400 font-medium ${isOpen ? 'gap-4 px-4' : 'justify-center'}`}>
          <div className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </div>
          {isOpen && <span className="text-[13px]">Online</span>}
        </div>

        <button className={`w-full flex items-center text-gray-400 hover:text-red-400 transition-colors cursor-pointer ${isOpen ? 'gap-4 px-4' : 'justify-center'}`}>
          <div className="flex items-center justify-center min-w-[20px]">
            <i className="fa-solid fa-right-from-bracket text-lg"></i>
          </div>
          {isOpen && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}