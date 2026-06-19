import { useState } from 'react';

const menuItems = [
  { name: 'Obras', icon: 'fa-user-gear' },
  { name: 'RDO', icon: 'fa-file-lines' },
  { name: 'Aprovacoes', icon: 'fa-square-check' },
  { name: 'Midias', icon: 'fa-image' },
  { name: 'Mapa', icon: 'fa-map-location-dot' },
  { name: 'Graficos', icon: 'fa-chart-column' },
  { name: 'Relatorio PDF', icon: 'fa-file-pdf' },
  { name: 'Log de erros', icon: 'fa-circle-exclamation' },
];

export default function Sidebar({ activeItem, onSelectItem }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <aside
      className={`sticky top-0 z-50 flex h-screen flex-col overflow-hidden border-r border-[#1a2540] bg-[#0f1729] py-6 text-white transition-all duration-300 ${
        isOpen ? 'w-[260px] px-4' : 'w-[80px] px-2'
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`mb-8 flex shrink-0 items-center justify-between ${isOpen ? 'px-2' : 'flex-col gap-4'}`}>
          {isOpen ? (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#1a2e5e] text-white shadow-sm">
                <i className="fa-solid fa-sun text-xl text-[#f5c518]" />
              </div>
              <div className="text-left leading-tight">
                <p className="m-0 text-base font-bold uppercase tracking-tight text-white">Suape RDO</p>
                <p className="m-0 text-[9px] font-semibold uppercase tracking-[0.3em] text-[#f5c518]">Diario agil</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a2e5e] text-white">
              <i className="fa-solid fa-sun text-xl text-[#f5c518]" />
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsOpen((current) => !current)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1a2e5e]/30 bg-[#162040] text-gray-400 transition-colors hover:text-white"
          >
            <i className={`fa-solid ${isOpen ? 'fa-chevron-left' : 'fa-bars'} text-[10px]`} />
          </button>
        </div>

        <nav className="flex flex-col gap-2 overflow-y-auto overflow-x-hidden">
          {menuItems.map((item) => {
            const isActive = activeItem === item.name;

            return (
              <button
                key={item.name}
                type="button"
                onClick={() => onSelectItem(item.name)}
                className={`group relative flex h-12 w-full items-center rounded-xl border-l-[3px] transition-all duration-200 ${
                  isActive
                    ? 'border-[#f5c518] bg-[#1e2840] text-[#f5c518]'
                    : 'border-transparent text-gray-400 hover:bg-[#162040] hover:text-white'
                } ${isOpen ? 'gap-4 px-4' : 'justify-center'}`}
              >
                <span className={`flex min-w-[20px] items-center justify-center ${isActive ? 'text-[#f5c518]' : 'text-gray-500'}`}>
                  <i className={`fa-solid ${item.icon} text-lg`} />
                </span>

                {isOpen && <span className="whitespace-nowrap text-[15px]">{item.name}</span>}

                {!isOpen && (
                  <div className="pointer-events-none absolute left-[85px] origin-left whitespace-nowrap rounded-md border border-[#1e3470] bg-[#1a2e5e] px-3 py-2 text-xs text-[#f5c518] opacity-0 shadow-2xl transition-all group-hover:scale-100 group-hover:opacity-100">
                    {item.name}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-4 border-t border-white/10 pt-6">
        <div className={`flex items-center font-medium text-emerald-400 ${isOpen ? 'gap-4 px-4' : 'justify-center'}`}>
          <div className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          {isOpen && <span className="text-[13px]">Online</span>}
        </div>

        <button
          type="button"
          className={`flex w-full items-center text-gray-400 transition-colors hover:text-red-400 ${isOpen ? 'gap-4 px-4' : 'justify-center'}`}
        >
          <span className="flex min-w-[20px] items-center justify-center">
            <i className="fa-solid fa-right-from-bracket text-lg" />
          </span>
          {isOpen && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}


