import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Sidebar from './components/Sidebar/Sidebar';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ki6.com.br/hackathon-suape-api-php/api.php';
const UPLOAD_BASE_URL = import.meta.env.VITE_UPLOAD_URL || 'https://ki6.com.br/hackathon-suape-api-php/upload.php';
const ASSET_BASE_URL = new URL('.', API_BASE_URL).href;

const RESOURCE_MAP = {
  Obras: 'obras',
  RDO: 'rdos',
  Aprovacoes: 'aprovacoes',
  Midias: 'midias',
};

const CHART_COLORS = ['#f5c518', '#0f1729', '#10b981', '#f43f5e', '#38bdf8', '#8b5cf6'];

function PageShell({ title, subtitle, action, children }) {
  return (
    <>
      <header className="border-b border-white/70 bg-white/90 px-6 py-5 shadow-[0_8px_30px_rgba(15,23,42,0.05)] backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">{subtitle}</p>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-[0.18em] text-[#0f1729] sm:text-4xl">
              {title}
            </h1>
          </div>
          {action}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
    </>
  );
}

function StatCard({ label, value, hint, tone = 'slate' }) {
  const toneClasses = {
    slate: 'from-slate-900 to-slate-700',
    amber: 'from-[#f5c518] to-[#d8a800]',
    emerald: 'from-emerald-500 to-emerald-600',
    red: 'from-rose-500 to-rose-600',
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`h-1.5 w-16 rounded-full bg-gradient-to-r ${toneClasses[tone]}`} />
      <p className="mt-4 text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <span className="text-3xl font-black text-[#0f1729]">{value}</span>
        <span className="text-right text-xs font-medium text-slate-500">{hint}</span>
      </div>
    </div>
  );
}

function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '') ?? null;
}

function toText(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toText(value);
  return date.toLocaleString('pt-BR');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return toText(value);
  return date.toLocaleDateString('pt-BR');
}

function normalizeCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return (
    payload.data ||
    payload.registros ||
    payload.items ||
    payload.resultado ||
    payload.dados ||
    []
  );
}

function statusTone(status) {
  const value = toText(status, '').toLowerCase();
  if (['atrasada', 'atrasado', 'reprovado', 'critico', 'critica', 'erro'].some((word) => value.includes(word))) {
    return 'border-rose-100 bg-rose-50 text-rose-600';
  }
  if (['iniciando', 'pendente', 'aguardando', 'rascunho', 'alerta'].some((word) => value.includes(word))) {
    return 'border-amber-100 bg-amber-50 text-amber-700';
  }
  return 'border-emerald-100 bg-emerald-50 text-emerald-600';
}

function normalizeObra(item, index) {
  const id = pick(item.id, index + 1);
  const status = pick(item.status, item.situacao, item.estado, 'Sem status');
  const equipe = pick(item.equipe, item.total_equipe, item.colaboradores, item.membros, item.tecnicos, 0);
  const rdos = pick(item.rdos, item.qtd_rdos, item.total_rdos, item.registros, 0);
  const progresso = pick(item.progresso, item.percentual, item.percentual_conclusao, item.avanco, 0);

  return {
    id,
    nome: toText(pick(item.nome, item.titulo, item.descricao, item.obra, `Obra ${id}`)),
    contrato: toText(pick(item.contrato, item.numero_contrato, item.cod_contrato, item.contrato_numero, 'Sem contrato')),
    status: toText(status),
    equipe: toText(typeof equipe === 'object' ? equipe.tecnicos ?? equipe.total ?? equipe.quantidade : equipe),
    rdos: toText(rdos),
    progresso: toText(progresso),
    cor: statusTone(status),
  };
}

function normalizeRdo(item, index) {
  const id = pick(item.id, index + 1);
  return {
    id: toText(id, `RDO-${index + 1}`),
    obraId: pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id),
    obra: toText(pick(item.obra_nome, item.obra, item.nome_obra, item.titulo, item.empreendimento, `Obra ${pick(item.obra_id, '-')}`)),
    data: formatDate(pick(item.data_rdo, item.data, item.criado_em, item.created_at, item.updated_at)),
    turno: toText(pick(item.turno, item.periodo, item.horario, item.status, 'Sem turno')),
    status: toText(pick(item.status, 'Sem status')),
    descricao: toText(pick(item.atividades, item.descricao, item.comentarios, item.observacao, 'Sem descricao')),
  };
}

function normalizeApproval(item, index) {
  const id = pick(item.id, index + 1);
  return {
    id: toText(id, `APR-${index + 1}`),
    title: toText(pick(item.titulo, item.title, item.observacao, item.descricao, `Aprovacao ${pick(item.rdo_id, id)}`)),
    owner: toText(pick(item.usuario_nome, item.owner, item.aprovador, item.usuario, item.responsavel, 'Sistema')),
    priority: toText(pick(item.prioridade, item.priority, 'Media')),
    date: formatDateTime(pick(item.aprovado_em, item.data, item.created_at, item.criado_em, item.updated_at)),
    status: toText(pick(item.status, 'Pendente')),
  };
}

function normalizeMedia(item, index) {
  const id = pick(item.id, index + 1);
  const url = resolveProductionAssetUrl(pick(item.caminho, item.url, item.arquivo, item.path));
  return {
    id: toText(id, `MID-${index + 1}`),
    title: toText(pick(item.descricao, item.nome, item.titulo, `Midia ${pick(item.tipo, id)}`)),
    type: toText(pick(item.tipo, item.type, 'Arquivo')).toUpperCase(),
    meta: [
      pick(item.obra_nome, item.obra, item.obra_id ? `Obra ${item.obra_id}` : null),
      formatDateTime(pick(item.capturado_em, item.created_at, item.data)),
    ]
      .filter(Boolean)
      .join(' • ') || 'Sem metadados',
    url,
    kind: getMediaKind(url, pick(item.tipo, item.type)),
  };
}

function resolveProductionAssetUrl(value) {
  if (!value) return '';

  const url = String(value).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;

  const cleanedPath = url.replace(/^\/+/, '');
  return `${ASSET_BASE_URL}${cleanedPath}`;
}

function getMediaKind(url, explicitType) {
  const type = toText(explicitType, '').toLowerCase();
  if (type.includes('video')) return 'video';
  if (type.includes('image') || type.includes('imagem') || type.includes('foto')) return 'image';
  if (type.includes('pdf') || type.includes('doc') || type.includes('xls')) return 'document';

  const fileName = toText(url, '').split('?')[0].toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(fileName)) return 'image';
  if (/\.(mp4|mov|webm)$/i.test(fileName)) return 'video';
  if (/\.(pdf|doc|docx|xls|xlsx|txt|dwg)$/i.test(fileName)) return 'document';
  return 'document';
}

function resourceLabel(resource) {
  return resource.charAt(0).toUpperCase() + resource.slice(1);
}

function getApiErrorMessage(error) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.erro || error.message || 'Falha na API';
  }
  return error instanceof Error ? error.message : 'Erro desconhecido';
}

function buildRdoRanking(obras, rdos) {
  const counts = new Map();

  rdos.forEach((rdo) => {
    const obraId = rdo.obraId;
    const obraKey = obraId ? String(obraId) : rdo.obra;
    const label = obraId
      ? obras.find((obra) => String(obra.id) === String(obraId))?.nome || rdo.obra
      : rdo.obra;

    const current = counts.get(obraKey) || { name: label, count: 0 };
    counts.set(obraKey, { name: current.name, count: current.count + 1 });
  });

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function buildMediaDistribution(midias) {
  const counts = new Map();

  midias.forEach((midia) => {
    const key = midia.obraId ? String(midia.obraId) : midia.obra;
    const current = counts.get(key) || { name: midia.obra, count: 0 };
    counts.set(key, { name: current.name, count: current.count + 1 });
  });

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function toCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = Number(String(value).replace(',', '.'));
  return Number.isFinite(normalized) ? normalized : null;
}

function buildMapPoints(midias, aprovacoes) {
  const mediaPoints = midias
    .map((item, index) => {
      const latitude = toCoordinate(item.latitude);
      const longitude = toCoordinate(item.longitude);

      if (latitude === null || longitude === null) return null;

      return {
        id: `media-${item.id || index}`,
        kind: 'media',
        label: item.title,
        sublabel: item.obra,
        latitude,
        longitude,
      };
    })
    .filter(Boolean);

  const approvalPoints = aprovacoes
    .map((item, index) => {
      const latitude = toCoordinate(item.latitude);
      const longitude = toCoordinate(item.longitude);

      if (latitude === null || longitude === null) return null;

      return {
        id: `approval-${item.id || index}`,
        kind: 'approval',
        label: item.title,
        sublabel: item.owner,
        latitude,
        longitude,
      };
    })
    .filter(Boolean);

  const allPoints = [...mediaPoints, ...approvalPoints];
  if (!allPoints.length) {
    return { mediaPoints, approvalPoints, allPoints, bounds: null };
  }

  const bounds = allPoints.reduce(
    (acc, point) => ({
      minLat: Math.min(acc.minLat, point.latitude),
      maxLat: Math.max(acc.maxLat, point.latitude),
      minLng: Math.min(acc.minLng, point.longitude),
      maxLng: Math.max(acc.maxLng, point.longitude),
    }),
    {
      minLat: allPoints[0].latitude,
      maxLat: allPoints[0].latitude,
      minLng: allPoints[0].longitude,
      maxLng: allPoints[0].longitude,
    },
  );

  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.001);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.001);

  const projectPoint = (point) => ({
    ...point,
    x: ((point.longitude - bounds.minLng) / lngSpan) * 100,
    y: 100 - ((point.latitude - bounds.minLat) / latSpan) * 100,
  });

  return {
    mediaPoints: mediaPoints.map(projectPoint),
    approvalPoints: approvalPoints.map(projectPoint),
    allPoints: allPoints.map(projectPoint),
    bounds,
  };
}

function ObrasScreen({ obras, loading, error, expandedObra, onToggleObra, onOpenRdo, onOpenEdit, onOpenHistory }) {
  const activeCount = obras.length;
  const totalRdos = obras.reduce((sum, obra) => sum + (Number(obra.rdos) || 0), 0);
  const pendingCount = obras.filter((obra) => {
    const value = obra.status.toLowerCase();
    return value.includes('pendente') || value.includes('atras') || value.includes('aguard');
  }).length;

  return (
    <PageShell
      title="Gestao de Obras"
      subtitle="Status operacional / RDO"
      action={
        <button className="rounded-xl border border-[#0f1729] bg-[#0f1729] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-black">
          Atualizar obras
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Obras ativas" value={String(activeCount).padStart(2, '0')} hint="Carregadas da API" tone="amber" />
        <StatCard label="RDOs totais" value={String(totalRdos)} hint="Somatorio dos registros" tone="emerald" />
        <StatCard label="Pendencias" value={String(pendingCount).padStart(2, '0')} hint="Status em alerta" tone="red" />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && (
          <div className="border-b border-slate-100 px-5 py-4 text-sm text-slate-500">
            Carregando obras da API...
          </div>
        )}

        {!loading && obras.length === 0 && !error && (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Nenhuma obra retornada pela API.
          </div>
        )}

        {obras.map((obra) => {
          const isExpanded = expandedObra === obra.id;
          return (
            <div key={obra.id} className="border-b border-slate-100 last:border-b-0">
              <div className={`relative flex flex-col gap-4 px-5 py-5 text-left transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between ${isExpanded ? 'bg-slate-50/70' : ''}`}>
                {isExpanded && <span className="absolute left-0 top-0 h-full w-1 bg-[#f5c518]" />}
                <button
                  type="button"
                  onClick={() => onToggleObra(obra.id)}
                  className="flex flex-1 flex-col gap-4 text-left sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span className={`inline-flex rounded-sm border px-2 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${obra.cor}`}>
                      {obra.status}
                    </span>
                    <h2 className="mt-3 text-xl font-black uppercase tracking-wide text-[#0f1729]">{obra.nome}</h2>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-400">C: {obra.contrato}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-6">
                    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300">Equipe</p>
                      <p className="mt-1 text-sm font-bold text-[#0f1729]">{obra.equipe} integrantes</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300">RDOs</p>
                      <p className="mt-1 text-sm font-bold text-[#0f1729]">{obra.rdos} registros</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300">Progresso</p>
                      <p className="mt-1 text-sm font-bold text-[#0f1729]">{obra.progresso}% concluido</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className={`overflow-hidden border-t border-slate-100 transition-all duration-300 ${isExpanded ? 'max-h-48' : 'max-h-0'}`}>
                <div className="grid gap-px bg-slate-100 sm:grid-cols-4">
                  {[
                    ['Novo RDO', 'fa-file-circle-plus', () => onOpenRdo(obra)],
                    ['Historico', 'fa-clock-rotate-left', () => onOpenHistory(obra)],
                    ['Editar obra', 'fa-pen-to-square', () => onOpenEdit(obra)],
                    ['Excluir', 'fa-trash-can'],
                  ].map(([label, icon, action]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (action) action();
                      }}
                      className="flex flex-col items-center justify-center gap-2 bg-white px-4 py-6 text-center transition hover:bg-slate-50"
                    >
                      <i className={`fa-solid ${icon} text-lg text-slate-400`} />
                      <span className="text-[10px] font-black uppercase tracking-[0.24em] text-[#0f1729]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

function ObraModal({
  mode,
  tab,
  obra,
  rdos,
  midias,
  aprovacoes,
  onClose,
  onSetTab,
  onCreateRdo,
  onCreateMedia,
  onCreateApproval,
  onUpdateObra,
  onOpenMap,
}) {
  const [rdoForm, setRdoForm] = useState({
    data_rdo: new Date().toISOString().slice(0, 10),
    atividades: '',
    comentarios: '',
    status: 'RASCUNHO',
  });
  const [approvalForm, setApprovalForm] = useState({
    rdo_id: '',
    status: 'APROVADO',
    observacao: '',
  });
  const [editForm, setEditForm] = useState({
    nome: obra?.nome || '',
    contrato: obra?.contrato || '',
    status: obra?.status || '',
    progresso: obra?.progresso || '0',
  });
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaRdoId, setMediaRdoId] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (mode !== 'rdo') return;
    onSetTab(tab === 'history' ? 'rdo' : tab);
  }, [mode, onSetTab, tab]);

  if (!obra) return null;

  const obraRdos = rdos.filter((item) => String(item.obraId) === String(obra.id) || item.obra === obra.nome);
  const obraMidias = midias.filter((item) => String(item.obraId) === String(obra.id) || item.obra === obra.nome);
  const obraAprovacoes = aprovacoes.filter((item) => String(item.obraId) === String(obra.id) || item.obra === obra.nome);
  const historyItems = [
    ...obraAprovacoes.map((item) => ({
      id: `APR-${item.id}`,
      type: 'Aprovacao',
      title: item.title,
      date: item.date,
      place: item.obra,
      latitude: item.latitude,
      longitude: item.longitude,
    })),
    ...obraMidias.map((item) => ({
      id: `MID-${item.id}`,
      type: 'Midia',
      title: item.title,
      date: item.meta,
      place: item.obra,
      latitude: item.latitude,
      longitude: item.longitude,
    })),
  ];

  const submitRdo = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback('');

    try {
      await onCreateRdo({
        obra_id: obra.id,
        data_rdo: rdoForm.data_rdo,
        atividades: rdoForm.atividades,
        comentarios: rdoForm.comentarios,
        status: rdoForm.status,
      });
      setFeedback('RDO salvo com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar RDO.');
    } finally {
      setBusy(false);
    }
  };

  const submitMedia = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback('');

    try {
      await onCreateMedia({
        file: mediaFile,
        obraId: obra.id,
        rdoId: mediaRdoId,
      });
      setFeedback('Mídia enviada com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao enviar mídia.');
    } finally {
      setBusy(false);
    }
  };

  const submitApproval = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback('');

    try {
      await onCreateApproval({
        obra_id: obra.id,
        rdo_id: approvalForm.rdo_id,
        status: approvalForm.status,
        observacao: approvalForm.observacao,
      });
      setFeedback('Aprovação criada com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao salvar aprovação.');
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFeedback('');

    try {
      await onUpdateObra(obra.id, {
        nome: editForm.nome,
        contrato: editForm.contrato,
        status: editForm.status,
        progresso: editForm.progresso,
      });
      setFeedback('Obra atualizada com sucesso.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Falha ao atualizar obra.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">
              {mode === 'history' ? 'Historico da obra' : mode === 'edit' ? 'Editar obra' : 'Novo registro'}
            </p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-wide text-[#0f1729]">{obra.nome}</h2>
            <p className="mt-1 text-sm text-slate-500">C: {obra.contrato}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-[#0f1729]"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-6 pt-4">
          <div className="flex flex-wrap gap-2">
            {mode === 'rdo' && (
              <>
                {[
                  ['rdo', 'Novo RDO'],
                  ['media', 'Adicionar mídia'],
                  ['approval', 'Adicionar aprovação'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSetTab(key)}
                    className={`rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.24em] transition ${
                      tab === key
                        ? 'bg-[#0f1729] text-white'
                        : 'border border-slate-200 bg-white text-slate-500 hover:border-[#f5c518] hover:text-[#0f1729]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
            {mode === 'history' && (
              <button
                type="button"
                onClick={() => onOpenMap()}
                className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-sky-700 transition hover:bg-sky-100"
              >
                Ver no mapa
              </button>
            )}
          </div>
        </div>

        <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            {mode === 'rdo' && tab === 'rdo' && (
              <form onSubmit={submitRdo} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Cadastro de RDO</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-2 sm:col-span-1">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Data</span>
                    <input
                      type="date"
                      value={rdoForm.data_rdo}
                      onChange={(event) => setRdoForm((current) => ({ ...current, data_rdo: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="grid gap-2 sm:col-span-1">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Status</span>
                    <select
                      value={rdoForm.status}
                      onChange={(event) => setRdoForm((current) => ({ ...current, status: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="RASCUNHO">Rascunho</option>
                      <option value="ENVIADO">Enviado</option>
                      <option value="APROVADO">Aprovado</option>
                    </select>
                  </label>
                  <label className="grid gap-2 sm:col-span-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Atividades</span>
                    <textarea
                      value={rdoForm.atividades}
                      onChange={(event) => setRdoForm((current) => ({ ...current, atividades: event.target.value }))}
                      rows="4"
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="grid gap-2 sm:col-span-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Comentarios</span>
                    <textarea
                      value={rdoForm.comentarios}
                      onChange={(event) => setRdoForm((current) => ({ ...current, comentarios: event.target.value }))}
                      rows="3"
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-4 flex gap-3">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-[#0f1729] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-black disabled:opacity-60"
                  >
                    {busy ? 'Salvando...' : 'Salvar RDO'}
                  </button>
                  <span className="self-center text-sm text-slate-500">RDO será vinculado à obra atual.</span>
                </div>
              </form>
            )}

            {mode === 'rdo' && tab === 'media' && (
              <form onSubmit={submitMedia} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Adicionar mídia</p>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Arquivo</span>
                    <input
                      type="file"
                      accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg"
                      onChange={(event) => setMediaFile(event.target.files?.[0] || null)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">RDO relacionado</span>
                    <select
                      value={mediaRdoId}
                      onChange={(event) => setMediaRdoId(event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Selecione um RDO</option>
                      {obraRdos.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id} • {item.obra}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="submit" disabled={busy} className="rounded-xl bg-[#0f1729] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white disabled:opacity-60">
                    {busy ? 'Enviando...' : 'Enviar mídia'}
                  </button>
                </div>
              </form>
            )}

            {mode === 'rdo' && tab === 'approval' && (
              <form onSubmit={submitApproval} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Adicionar aprovação</p>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">RDO</span>
                    <select
                      value={approvalForm.rdo_id}
                      onChange={(event) => setApprovalForm((current) => ({ ...current, rdo_id: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Selecione um RDO</option>
                      {obraRdos.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id} • {item.obra}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Status</span>
                    <select
                      value={approvalForm.status}
                      onChange={(event) => setApprovalForm((current) => ({ ...current, status: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="APROVADO">Aprovado</option>
                      <option value="PENDENTE">Pendente</option>
                      <option value="REPROVADO">Reprovado</option>
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Observação</span>
                    <textarea
                      value={approvalForm.observacao}
                      onChange={(event) => setApprovalForm((current) => ({ ...current, observacao: event.target.value }))}
                      rows="3"
                      className="rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="submit" disabled={busy} className="rounded-xl bg-[#0f1729] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white disabled:opacity-60">
                    {busy ? 'Salvando...' : 'Salvar aprovação'}
                  </button>
                </div>
              </form>
            )}

            {mode === 'edit' && (
              <form onSubmit={submitEdit} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Informações da obra</p>
                <div className="mt-4 grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Nome</span>
                    <input
                      value={editForm.nome}
                      onChange={(event) => setEditForm((current) => ({ ...current, nome: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      required
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Contrato</span>
                    <input
                      value={editForm.contrato}
                      onChange={(event) => setEditForm((current) => ({ ...current, contrato: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-2 sm:grid-cols-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400 sm:col-span-2">Status</span>
                    <input
                      value={editForm.status}
                      onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Progresso</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editForm.progresso}
                      onChange={(event) => setEditForm((current) => ({ ...current, progresso: event.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-4 flex gap-3">
                  <button type="submit" disabled={busy} className="rounded-xl bg-[#0f1729] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white disabled:opacity-60">
                    {busy ? 'Salvando...' : 'Salvar obra'}
                  </button>
                </div>
              </form>
            )}

            {mode === 'history' && (
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Movimentações</p>
                {historyItems.length === 0 && <div className="text-sm text-slate-500">Nenhuma movimentação encontrada.</div>}
                {historyItems.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">{item.type}</p>
                        <h3 className="mt-2 text-sm font-bold text-[#0f1729]">{item.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{item.date}</p>
                      </div>
                      <button
                        type="button"
                        onClick={onOpenMap}
                        className="rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-sky-700"
                      >
                        Ver mapa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Resumo da obra</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
                  <span className="text-slate-500">RDOs</span>
                  <strong className="text-[#0f1729]">{obraRdos.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
                  <span className="text-slate-500">Mídias</span>
                  <strong className="text-[#0f1729]">{obraMidias.length}</strong>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3">
                  <span className="text-slate-500">Aprovações</span>
                  <strong className="text-[#0f1729]">{obraAprovacoes.length}</strong>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Feedback</p>
              <div className="mt-4 text-sm text-white/85">{feedback || 'Nenhuma ação enviada ainda.'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RdoScreen({ rdos, loading, error }) {
  const processedCount = rdos.filter((item) => {
    const value = item.status.toLowerCase();
    return value.includes('enviado') || value.includes('aprov') || value.includes('concl');
  }).length;

  return (
    <PageShell
      title="RDO"
      subtitle="Diario de obras"
      action={
        <button className="rounded-xl bg-[#f5c518] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#0f1729] transition hover:brightness-95">
          Novo registro
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Lista recente</p>
              <h2 className="mt-2 text-2xl font-black text-[#0f1729]">Registros da API</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              {rdos.length} registros
            </span>
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-5 text-sm text-slate-500">Carregando RDOs da API...</div>
          )}

          {!loading && rdos.length === 0 && !error && (
            <div className="mt-5 text-sm text-slate-500">Nenhum RDO retornado pela API.</div>
          )}

          <div className="mt-5 space-y-3">
            {rdos.map((item) => (
              <article key={item.id} className="rounded-2xl border border-slate-100 p-4 transition hover:border-[#f5c518]/40 hover:bg-[#fffdf3]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                        {item.id}
                      </span>
                      <span className="rounded-sm border border-[#f5c518]/20 bg-[#f5c518]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#9a7a00]">
                        {item.status}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-black uppercase tracking-wide text-[#0f1729]">{item.obra}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.descricao}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-300">{item.data}</p>
                    <p className="mt-2 text-sm font-bold text-[#0f1729]">{item.turno}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Resumo</p>
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-500">Processados</span>
                  <span className="font-black text-[#0f1729]">{processedCount}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 w-[78%] rounded-full bg-gradient-to-r from-[#f5c518] to-[#d8a800]" />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-bold text-slate-500">Pendentes</span>
                  <span className="font-black text-[#0f1729]">{Math.max(rdos.length - processedCount, 0)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div className="h-2 w-[22%] rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600" />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Fluxo rapido</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">Coletar dados da obra</div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">Registrar equipe e ocorrencias</div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">Enviar para aprovacao</div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function AprovacoesScreen({ aprovacoes, loading, error }) {
  const waitingCount = aprovacoes.filter((item) => {
    const value = item.status.toLowerCase();
    return value.includes('pend') || value.includes('aguard') || value.includes('rascunho');
  }).length;

  return (
    <PageShell
      title="Aprovacoes"
      subtitle="Fila de validacao"
      action={
        <button className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#0f1729] transition hover:border-[#f5c518] hover:text-[#9a7a00]">
          Revisar fila
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Pendencias</p>
          {error && (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
          {loading && <div className="mt-4 text-sm text-slate-500">Carregando aprovacoes da API...</div>}
          {!loading && aprovacoes.length === 0 && !error && (
            <div className="mt-4 text-sm text-slate-500">Nenhuma aprovacao retornada pela API.</div>
          )}
          <div className="mt-4 space-y-3">
            {aprovacoes.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-300">{item.id}</p>
                    <h3 className="mt-2 text-lg font-black text-[#0f1729]">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.owner}</p>
                  </div>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-[#9a7a00]">
                    {item.status}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs font-bold text-slate-400">
                  <span>Prioridade: {item.priority}</span>
                  <span>{item.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Painel</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Esperando" value={String(waitingCount)} hint="Itens na fila" tone="amber" />
              <StatCard label="Aprovados" value={String(aprovacoes.length - waitingCount)} hint="Status concluidos" tone="emerald" />
              <StatCard label="Total" value={String(aprovacoes.length)} hint="Registros da API" tone="red" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Checklist</p>
            <div className="mt-4 space-y-3">
              {['Conferir assinaturas', 'Validar fotos obrigatorias', 'Cruzar medicao e contrato', 'Liberar para proxima etapa'].map((step) => (
                <div key={step} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f5c518] text-[10px] font-black text-[#0f1729]">•</span>
                  <span className="text-sm">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function MidiasScreen({ midias, loading, error }) {
  return (
    <PageShell
      title="Midias"
      subtitle="Banco visual"
      action={
        <button className="rounded-xl bg-[#0f1729] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-black">
          Enviar midia
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
          {loading && <div className="sm:col-span-2 text-sm text-slate-500">Carregando midias da API...</div>}
          {!loading && midias.length === 0 && !error && (
            <div className="sm:col-span-2 text-sm text-slate-500">Nenhuma midia retornada pela API.</div>
          )}
          {midias.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <a
                href={item.url || '#'}
                target={item.url ? '_blank' : undefined}
                rel={item.url ? 'noreferrer' : undefined}
                className="block"
              >
                <div className="relative h-44 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-700 to-[#f5c518] p-4">
                  {item.kind === 'image' && item.url && (
                    <img
                      src={item.url}
                      alt={item.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}

                  {item.kind === 'video' && item.url && (
                    <video
                      className="absolute inset-0 h-full w-full object-cover"
                      src={item.url}
                      controls
                      preload="metadata"
                    />
                  )}

                  {item.kind === 'document' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-950/95 via-slate-800/90 to-[#f5c518]/80 p-4 text-white">
                      <div className="text-center">
                        <i className="fa-solid fa-file-lines text-5xl text-[#f5c518]" />
                        <p className="mt-4 text-sm font-black uppercase tracking-[0.28em]">Abrir documento</p>
                      </div>
                    </div>
                  )}

                  <div className="relative flex h-full items-end justify-between text-white">
                    <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] backdrop-blur">
                      {item.kind.toUpperCase()}
                    </span>
                    <i className={`fa-solid ${item.kind === 'video' ? 'fa-circle-play' : item.kind === 'document' ? 'fa-up-right-from-square' : 'fa-camera'} text-2xl opacity-90`} />
                  </div>
                </div>
              </a>
              <div className="p-4">
                <h3 className="text-lg font-black text-[#0f1729]">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{item.meta}</p>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-xs font-medium text-[#1d4ed8] underline decoration-[#f5c518] decoration-2 underline-offset-4"
                  >
                    Abrir arquivo
                  </a>
                ) : (
                  <p className="mt-2 text-xs font-medium text-slate-400">Sem link disponível</p>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Upload rapido</p>
            <div className="mt-4 rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50 p-8 text-center">
              <i className="fa-solid fa-cloud-arrow-up text-4xl text-[#f5c518]" />
              <p className="mt-4 text-lg font-black text-[#0f1729]">Arraste as fotos aqui</p>
              <p className="mt-2 text-sm text-slate-500">JPEG, PNG e MP4 liberados para as obras ativas.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Indicadores</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Arquivos recebidos</span>
                <strong className="text-lg">{midias.length}</strong>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-[68%] rounded-full bg-gradient-to-r from-[#f5c518] to-[#d8a800]" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Origem API</span>
                <strong className="text-lg">PHP</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function MidiasUploadScreen({ midias, loading, error, obras, rdos, onUpload }) {
  const fileInputRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [obraId, setObraId] = useState('');
  const [rdoId, setRdoId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [dropActive, setDropActive] = useState(false);

  const resetUpload = () => {
    setPendingFile(null);
    setObraId('');
    setRdoId('');
    setFeedback('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openPicker = () => {
    fileInputRef.current?.click();
  };

  const handleFile = (file) => {
    if (!file) return;
    setPendingFile(file);
    setFeedback('Arquivo selecionado. Informe a obra e o RDO antes de enviar.');
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDropActive(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!pendingFile) {
      setFeedback('Escolha um arquivo antes de enviar.');
      return;
    }

    setSubmitting(true);
    setFeedback('');

    try {
      await onUpload({
        file: pendingFile,
        obraId,
        rdoId,
      });
      setFeedback('Arquivo enviado com sucesso para a API.');
      resetUpload();
    } catch (uploadError) {
      setFeedback(uploadError instanceof Error ? uploadError.message : 'Falha ao enviar o arquivo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell
      title="Midias"
      subtitle="Banco visual"
      action={
        <button
          type="button"
          onClick={openPicker}
          className="rounded-xl bg-[#0f1729] px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-black"
        >
          Enviar midia
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <div className="grid gap-4 sm:grid-cols-2">
          {error && (
            <div className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}
          {loading && <div className="sm:col-span-2 text-sm text-slate-500">Carregando midias da API...</div>}
          {!loading && midias.length === 0 && !error && (
            <div className="sm:col-span-2 text-sm text-slate-500">Nenhuma midia retornada pela API.</div>
          )}
          {midias.map((item) => (
            <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <a
                href={item.url || '#'}
                target={item.url ? '_blank' : undefined}
                rel={item.url ? 'noreferrer' : undefined}
                className="block"
              >
                <div className="relative h-44 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-700 to-[#f5c518] p-4">
                  {item.kind === 'image' && item.url && (
                    <img
                      src={item.url}
                      alt={item.title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}

                  {item.kind === 'video' && item.url && (
                    <video
                      className="absolute inset-0 h-full w-full object-cover"
                      src={item.url}
                      controls
                      preload="metadata"
                    />
                  )}

                  {item.kind === 'document' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-950/95 via-slate-800/90 to-[#f5c518]/80 p-4 text-white">
                      <div className="text-center">
                        <i className="fa-solid fa-file-lines text-5xl text-[#f5c518]" />
                        <p className="mt-4 text-sm font-black uppercase tracking-[0.28em]">Abrir documento</p>
                      </div>
                    </div>
                  )}

                  <div className="relative flex h-full items-end justify-between text-white">
                    <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-[0.28em] backdrop-blur">
                      {item.kind.toUpperCase()}
                    </span>
                    <i className={`fa-solid ${item.kind === 'video' ? 'fa-circle-play' : item.kind === 'document' ? 'fa-up-right-from-square' : 'fa-camera'} text-2xl opacity-90`} />
                  </div>
                </div>
              </a>
              <div className="p-4">
                <h3 className="text-lg font-black text-[#0f1729]">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{item.meta}</p>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all text-xs font-medium text-[#1d4ed8] underline decoration-[#f5c518] decoration-2 underline-offset-4"
                  >
                    Abrir arquivo
                  </a>
                ) : (
                  <p className="mt-2 text-xs font-medium text-slate-400">Sem link disponivel</p>
                )}
              </div>
            </article>
          ))}
        </div>

        <div className="space-y-4">
          <div
            className={`rounded-2xl border-2 border-dashed bg-white p-5 shadow-sm transition ${
              dropActive ? 'border-[#f5c518] bg-[#fff9db]' : 'border-slate-200'
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={handleDrop}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Upload rapido</p>
            <button
              type="button"
              onClick={openPicker}
              className="mt-4 flex w-full flex-col items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center transition hover:border-[#f5c518] hover:bg-[#fffdf1]"
            >
              <i className="fa-solid fa-cloud-arrow-up text-4xl text-[#f5c518]" />
              <p className="mt-4 text-lg font-black text-[#0f1729]">Arraste a imagem, video ou documento aqui</p>
              <p className="mt-2 text-sm text-slate-500">Depois vamos perguntar a obra e o RDO relacionados.</p>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />

            {pendingFile && (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">Arquivo selecionado</p>
                  <p className="mt-2 text-sm font-semibold text-[#0f1729]">{pendingFile.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {pendingFile.type || 'tipo desconhecido'} • {(pendingFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>

                <div className="grid gap-3">
                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">Obra</span>
                    <select
                      value={obraId}
                      onChange={(event) => setObraId(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0f1729]"
                      required
                    >
                      <option value="">Selecione a obra</option>
                      {obras.map((obra) => (
                        <option key={obra.id} value={obra.id}>
                          {obra.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2">
                    <span className="text-xs font-black uppercase tracking-[0.24em] text-slate-400">RDO</span>
                    <select
                      value={rdoId}
                      onChange={(event) => setRdoId(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-[#0f1729]"
                      required
                    >
                      <option value="">Selecione o RDO</option>
                      {rdos.map((rdo) => (
                        <option key={rdo.id} value={rdo.id}>
                          {rdo.id} • {rdo.obra}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {feedback && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    {feedback}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={resetUpload}
                    className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-[0.24em] text-slate-600 transition hover:bg-slate-50"
                    disabled={submitting}
                  >
                    Limpar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-xl bg-[#0f1729] px-4 py-3 text-xs font-black uppercase tracking-[0.24em] text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={submitting}
                  >
                    {submitting ? 'Enviando...' : 'Enviar para API'}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Indicadores</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Arquivos recebidos</span>
                <strong className="text-lg">{midias.length}</strong>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 w-[68%] rounded-full bg-gradient-to-r from-[#f5c518] to-[#d8a800]" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Origem API</span>
                <strong className="text-lg">PHP</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

void MidiasScreen;

function GraficosScreen({ obras, rdos, midias, loading, error }) {
  const ranking = buildRdoRanking(obras, rdos);
  const mediaDistribution = buildMediaDistribution(midias);
  const totalRdos = rdos.length;
  const totalObras = obras.length;
  const topObra = ranking[0];
  const pieData = mediaDistribution.map((item) => ({
    name: item.name,
    value: item.count,
  }));

  return (
    <PageShell
      title="Graficos"
      subtitle="RDO e midias por obra"
      action={
        <button className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#0f1729] transition hover:border-[#f5c518] hover:text-[#9a7a00]">
          Atualizar dados
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Total de obras" value={String(totalObras).padStart(2, '0')} hint="Base vinda da API" tone="amber" />
        <StatCard label="Total de RDOs" value={String(totalRdos).padStart(2, '0')} hint="Todos os registros" tone="emerald" />
        <StatCard label="Top obra" value={topObra ? String(topObra.count) : '00'} hint={topObra ? topObra.name : 'Sem dados'} tone="red" />
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          Carregando graficos da API...
        </div>
      )}

      {!loading && ranking.length === 0 && !error && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
          Nenhum RDO encontrado para montar o grafico.
        </div>
      )}

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Bar chart</p>
              <h2 className="mt-2 text-2xl font-black text-[#0f1729]">Obras com mais RDO</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              Top {ranking.length}
            </span>
          </div>

          <div className="mt-6 h-[360px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranking} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  height={80}
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(245, 197, 24, 0.08)' }}
                  contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0' }}
                  formatter={(value) => [`${value} RDOs`, 'Quantidade']}
                />
                <Legend />
                <Bar dataKey="count" name="RDOs" radius={[10, 10, 0, 0]}>
                  {ranking.map((entry, index) => (
                    <Cell key={`cell-${entry.name}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Distribuicao de midias</p>
            <div className="mt-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={95} paddingAngle={4}>
                    {pieData.map((entry, index) => (
                      <Cell key={`pie-${entry.name}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0' }}
                    formatter={(value) => [`${value} arquivos`, 'Quantidade']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Ranking de midias</p>
            <div className="mt-4 space-y-3">
              {mediaDistribution.map((item, index) => (
                <div key={item.name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-[#0f1729]"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-white/60">{item.count} arquivos</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function MapaScreen({ midias, aprovacoes, loading, error }) {
  const { mediaPoints, approvalPoints, allPoints } = buildMapPoints(midias, aprovacoes);
  const centerLabel = allPoints.length
    ? `${allPoints.length} pontos georreferenciados`
    : 'Sem coordenadas enviadas';

  return (
    <PageShell
      title="Mapa"
      subtitle="Localizacao geografica"
      action={
        <button className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-[#0f1729] transition hover:border-[#f5c518] hover:text-[#9a7a00]">
          Atualizar mapa
        </button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Mapa interativo</p>
              <h2 className="mt-2 text-2xl font-black text-[#0f1729]">Midias e aprovacoes no territorio</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className="rounded-full border border-[#f5c518]/30 bg-[#f5c518]/10 px-3 py-1 text-[#9a7a00]">Midias: {mediaPoints.length}</span>
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700">Aprovacoes: {approvalPoints.length}</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Carregando pontos geograficos...
            </div>
          )}

          <div className="relative h-[620px] overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_right,_rgba(245,197,24,0.18),_transparent_32%),linear-gradient(180deg,_#10233f_0%,_#1c355f_48%,_#d8ecff_48.5%,_#eff6fb_100%)]">
            <div className="absolute inset-0 opacity-30" style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.14) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }} />

            <div className="absolute left-4 top-4 z-10 rounded-full border border-white/20 bg-[#0f1729]/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.35em] text-white/80 backdrop-blur">
              {centerLabel}
            </div>

            {!allPoints.length && (
              <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
                <div className="max-w-md rounded-3xl border border-white/20 bg-white/85 p-6 text-[#0f1729] shadow-xl backdrop-blur">
                  <p className="text-sm font-black uppercase tracking-[0.3em] text-slate-400">Mapa vazio</p>
                  <p className="mt-3 text-lg font-bold">
                    Nenhuma midia ou aprovacao trouxe latitude e longitude para desenhar no mapa.
                  </p>
                </div>
              </div>
            )}

            {mediaPoints.map((point) => (
              <div
                key={point.id}
                className="absolute z-20"
                style={{ left: `${point.x}%`, top: `${point.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="group relative flex flex-col items-center">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[#f5c518] ring-4 ring-[#f5c518]/25 shadow-lg shadow-[#f5c518]/30" />
                  <div className="mt-2 hidden max-w-[180px] rounded-2xl border border-[#f5c518]/20 bg-white px-3 py-2 text-left text-xs shadow-xl group-hover:block">
                    <p className="font-black text-[#0f1729]">{point.label}</p>
                    <p className="mt-1 text-slate-500">{point.sublabel}</p>
                  </div>
                </div>
              </div>
            ))}

            {approvalPoints.map((point) => (
              <div
                key={point.id}
                className="absolute z-20"
                style={{ left: `${point.x}%`, top: `${point.y}%`, transform: 'translate(-50%, -50%)' }}
              >
                <div className="group relative flex flex-col items-center">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 ring-4 ring-sky-300/30 shadow-lg shadow-sky-500/30" />
                  <div className="mt-2 hidden max-w-[180px] rounded-2xl border border-sky-200 bg-white px-3 py-2 text-left text-xs shadow-xl group-hover:block">
                    <p className="font-black text-[#0f1729]">{point.label}</p>
                    <p className="mt-1 text-slate-500">{point.sublabel}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="absolute bottom-4 left-4 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#f5c518]/20 bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-[#9a7a00] backdrop-blur">
                Midias em amarelo
              </span>
              <span className="rounded-full border border-sky-200 bg-white/85 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-sky-700 backdrop-blur">
                Aprovacoes em azul
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Legenda</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3">
                <span className="h-4 w-4 rounded-full bg-[#f5c518] ring-4 ring-[#f5c518]/25" />
                <div>
                  <p className="text-sm font-semibold text-[#0f1729]">Arquivos de midia</p>
                  <p className="text-xs text-slate-500">Marcadores amarelos</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl border border-slate-100 px-4 py-3">
                <span className="h-4 w-4 rounded-full bg-sky-500 ring-4 ring-sky-300/30" />
                <div>
                  <p className="text-sm font-semibold text-[#0f1729]">Aprovacoes</p>
                  <p className="text-xs text-slate-500">Marcadores azuis</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Resumo</p>
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Pontos de midia</span>
                <strong className="text-lg">{mediaPoints.length}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Pontos de aprovacao</span>
                <strong className="text-lg">{approvalPoints.length}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">Total no mapa</span>
                <strong className="text-lg">{allPoints.length}</strong>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Ultimos pontos</p>
            <div className="mt-4 space-y-3">
              {[...mediaPoints.slice(0, 3), ...approvalPoints.slice(0, 3)].map((point) => (
                <div key={point.id} className="rounded-2xl border border-slate-100 px-4 py-3">
                  <p className="text-sm font-bold text-[#0f1729]">{point.label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {point.kind === 'media' ? 'Midia' : 'Aprovacao'} • {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function LogErrosScreen({ requestLogs }) {
  return (
    <PageShell
      title="Log de erros"
      subtitle="Saude da aplicacao"
      action={
        <button className="rounded-xl border border-rose-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.24em] text-rose-600 transition hover:bg-rose-50">
          Exportar log
        </button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Eventos recentes</p>
              <h2 className="mt-2 text-2xl font-black text-[#0f1729]">Chamadas da API</h2>
            </div>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-rose-600">
              {requestLogs.filter((log) => log.level === 'Critico').length} erro(s)
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {requestLogs.length === 0 && (
              <div className="rounded-2xl border border-slate-100 p-4 text-sm text-slate-500">
                Nenhum evento de API registrado ainda.
              </div>
            )}

            {requestLogs.map((item) => {
              const tone =
                item.level === 'Critico'
                  ? 'border-rose-100 bg-rose-50 text-rose-600'
                  : item.level === 'Alerta'
                    ? 'border-amber-100 bg-amber-50 text-amber-700'
                    : 'border-emerald-100 bg-emerald-50 text-emerald-600';

              return (
                <div key={item.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-sm border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">
                          {item.id}
                        </span>
                        <span className={`rounded-sm border px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] ${tone}`}>
                          {item.level}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-black text-[#0f1729]">{item.message}</h3>
                      <p className="mt-1 text-sm text-slate-500">Origem: {item.origin}</p>
                    </div>
                    <span className="text-sm font-bold text-slate-400">{item.time}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Status geral</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Criticos"
                value={String(requestLogs.filter((log) => log.level === 'Critico').length).padStart(2, '0')}
                hint="Falhas na integracao"
                tone="red"
              />
              <StatCard
                label="Infos"
                value={String(requestLogs.filter((log) => log.level === 'Info').length).padStart(2, '0')}
                hint="Chamadas bem sucedidas"
                tone="emerald"
              />
              <StatCard
                label="Alertas"
                value={String(requestLogs.filter((log) => log.level === 'Alerta').length).padStart(2, '0')}
                hint="Ocorrencias intermediarias"
                tone="amber"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/45">Acoes recomendadas</p>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">Reprocessar chamadas com erro</div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">Validar disponibilidade do endpoint</div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">Revisar dados retornados pelo PHP</div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function getScreen(activeItem, state, handlers) {
  switch (activeItem) {
    case 'RDO':
      return <RdoScreen rdos={state.rdos} loading={state.loading} error={state.errors.rdos} />;
    case 'Aprovacoes':
      return <AprovacoesScreen aprovacoes={state.aprovacoes} loading={state.loading} error={state.errors.aprovacoes} />;
    case 'Midias':
      return <MidiasUploadScreen midias={state.midias} loading={state.loading} error={state.errors.midias} obras={state.obras} rdos={state.rdos} onUpload={handlers.onUpload} />;
    case 'Mapa':
      return <MapaScreen midias={state.midias} aprovacoes={state.aprovacoes} loading={state.loading} error={state.errors.midias || state.errors.aprovacoes} />;
    case 'Graficos':
      return <GraficosScreen obras={state.obras} rdos={state.rdos} midias={state.midias} loading={state.loading} error={state.errors.rdos || state.errors.obras || state.errors.midias} />;
    case 'Log de erros':
      return <LogErrosScreen requestLogs={state.requestLogs} />;
    case 'Obras':
    default:
      return (
        <ObrasScreen
          obras={state.obras}
          loading={state.loading}
          error={state.errors.obras}
          expandedObra={handlers.expandedObra}
          onToggleObra={handlers.onToggleObra}
        />
      );
  }
}

export default function App() {
  const [expandedObra, setExpandedObra] = useState(null);
  const [activeItem, setActiveItem] = useState('Obras');
  const [workModal, setWorkModal] = useState(null);
  const [workModalTab, setWorkModalTab] = useState('rdo');
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({
    obras: '',
    rdos: '',
    aprovacoes: '',
    midias: '',
  });
  const [collections, setCollections] = useState({
    obras: [],
    rdos: [],
    aprovacoes: [],
    midias: [],
  });
  const [requestLogs, setRequestLogs] = useState([]);

  const openWorkModal = useCallback((mode, obra) => {
    setWorkModal({ mode, obra });
    setWorkModalTab(mode === 'history' ? 'history' : 'rdo');
  }, []);

  const closeWorkModal = useCallback(() => {
    setWorkModal(null);
  }, []);

  const loadAllCollections = useCallback(async () => {
    setLoading(true);
    setErrors({ obras: '', rdos: '', aprovacoes: '', midias: '' });

    const resources = Object.values(RESOURCE_MAP);
    const startedAt = new Date();

    const results = await Promise.all(
      resources.map(async (resource) => {
        try {
          const response = await axios.get(API_BASE_URL, { params: { resource } });
          return {
            resource,
            status: 'fulfilled',
            rows: normalizeCollection(response.data),
          };
        } catch (error) {
          return {
            resource,
            status: 'rejected',
            error: getApiErrorMessage(error),
          };
        }
      }),
    );

    const nextCollections = {
      obras: [],
      rdos: [],
      aprovacoes: [],
      midias: [],
    };

    const nextErrors = {
      obras: '',
      rdos: '',
      aprovacoes: '',
      midias: '',
    };

    const nextLogs = results.map((result, index) => {
      const time = new Date(startedAt.getTime() + index * 1000).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      if (result.status === 'fulfilled') {
        nextCollections[result.resource] = result.rows;
        return {
          id: `${result.resource}-${index + 1}`,
          level: 'Info',
          origin: result.resource.toUpperCase(),
          message: `${result.rows.length} registros carregados com sucesso.`,
          time,
        };
      }

      nextErrors[result.resource] = result.error;
      return {
        id: `${result.resource}-${index + 1}`,
        level: 'Critico',
        origin: result.resource.toUpperCase(),
        message: `Falha ao carregar ${resourceLabel(result.resource)}: ${result.error}`,
        time,
      };
    });

    setCollections(nextCollections);
    setErrors(nextErrors);
    setRequestLogs(nextLogs);
    setLoading(false);
  }, []);

  const refreshData = useCallback(async () => {
    await loadAllCollections();
  }, [loadAllCollections]);

  const handleMediaUpload = useCallback(async ({ file, obraId, rdoId }) => {
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('descricao', file.name);

    if (obraId) {
      formData.append('obra_id', obraId);
    }

    if (rdoId) {
      formData.append('rdo_id', rdoId);
    }

    const mimeType = file.type?.toLowerCase() || '';
    let tipo = 'DOCUMENTO';
    if (mimeType.startsWith('image/')) tipo = 'IMAGEM';
    else if (mimeType.startsWith('video/')) tipo = 'VIDEO';

    formData.append('tipo', tipo);

    await axios.post(UPLOAD_BASE_URL, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    await refreshData();
  }, [refreshData]);

  const handleCreateRdo = useCallback(async (payload) => {
    await axios.post(API_BASE_URL, payload, { params: { resource: 'rdos' } });
    await refreshData();
  }, [refreshData]);

  const handleCreateApproval = useCallback(async (payload) => {
    await axios.post(API_BASE_URL, payload, { params: { resource: 'aprovacoes' } });
    await refreshData();
  }, [refreshData]);

  const handleUpdateObra = useCallback(async (obraId, payload) => {
    await axios.put(API_BASE_URL, payload, { params: { resource: 'obras', id: obraId } });
    await refreshData();
  }, [refreshData]);

  const openMapFromHistory = useCallback(() => {
    setActiveItem('Mapa');
    closeWorkModal();
  }, [closeWorkModal]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAllCollections();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadAllCollections]);

  const obras = collections.obras.map(normalizeObra);
  const rdos = collections.rdos.map(normalizeRdo);
  const aprovacoes = collections.aprovacoes.map((item, index) => {
    const approval = normalizeApproval(item, index);
    const obraId = pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id);
    const obraNome = pick(item.obra_nome, item.obra, item.nome_obra, item.empreendimento, item.titulo);
    const latitude = toCoordinate(pick(item.latitude, item.lat, item.gps_latitude, item.gpsLatitude));
    const longitude = toCoordinate(pick(item.longitude, item.lng, item.lon, item.gps_longitude, item.gpsLongitude));

    return {
      ...approval,
      obraId,
      obra: toText(obraNome, obraId ? `Obra ${obraId}` : 'Sem obra'),
      latitude,
      longitude,
    };
  });
  const midias = collections.midias.map((item, index) => {
    const media = normalizeMedia(item, index);
    const obraId = pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id);
    const obraNome = pick(item.obra_nome, item.obra, item.nome_obra, item.empreendimento, item.titulo);
    const latitude = toCoordinate(pick(item.latitude, item.lat, item.gps_latitude, item.gpsLatitude));
    const longitude = toCoordinate(pick(item.longitude, item.lng, item.lon, item.gps_longitude, item.gpsLongitude));

    return {
      ...media,
      obraId,
      obra: toText(obraNome, obraId ? `Obra ${obraId}` : 'Sem obra'),
      latitude,
      longitude,
    };
  });

  const toggleObra = (id) => {
    setExpandedObra((current) => (current === id ? null : id));
  };

  return (
    <div className="flex min-h-screen w-full overflow-hidden bg-[#eef3f8] text-left text-[#334155]">
      <Sidebar activeItem={activeItem} onSelectItem={setActiveItem} />

      <main className="flex min-w-0 flex-1 flex-col">
        {getScreen(
          activeItem,
          { obras, rdos, aprovacoes, midias, loading, errors, requestLogs },
          {
            expandedObra,
            onToggleObra: toggleObra,
            onUpload: handleMediaUpload,
            onOpenRdo: (obra) => openWorkModal('rdo', obra),
            onOpenEdit: (obra) => openWorkModal('edit', obra),
            onOpenHistory: (obra) => openWorkModal('history', obra),
          },
        )}
      </main>

      {workModal?.obra &&
        createPortal(
          <ObraModal
            key={`${workModal.mode}-${workModal.obra.id}`}
            mode={workModal.mode}
            tab={workModalTab}
            obra={workModal.obra}
            rdos={rdos}
            midias={midias}
            aprovacoes={aprovacoes}
            onClose={closeWorkModal}
            onSetTab={setWorkModalTab}
            onCreateRdo={handleCreateRdo}
            onCreateMedia={handleMediaUpload}
            onCreateApproval={handleCreateApproval}
            onUpdateObra={handleUpdateObra}
            onOpenMap={openMapFromHistory}
          />,
          document.body,
        )}
    </div>
  );
}
