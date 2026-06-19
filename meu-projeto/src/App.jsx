import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { CircleMarker, MapContainer, Popup, TileLayer } from 'react-leaflet';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Sidebar from './components/Sidebar/Sidebar';
import 'leaflet/dist/leaflet.css';

// ─────────────────────────────────────────────
// CONFIGURAÇÕES
// ─────────────────────────────────────────────
const API_BASE_URL   = import.meta.env.VITE_API_BASE_URL  || 'https://ki6.com.br/hackathon-suape-api-php/api.php';
const UPLOAD_BASE_URL = import.meta.env.VITE_UPLOAD_URL   || 'https://ki6.com.br/hackathon-suape-api-php/upload.php';
const APK_DOWNLOAD_URL = 'https://ki6.com.br/hackathon-suape-api-php/data/suape.apk';
const ASSET_BASE_URL  = new URL('.', API_BASE_URL).href;

const RESOURCE_MAP = {
  Obras: 'obras',
  RDO: 'rdos',
  Aprovacoes: 'aprovacoes',
  Midias: 'midias',
};

const CHART_COLORS = ['#f5c518', '#0f1729', '#10b981', '#f43f5e', '#38bdf8', '#8b5cf6'];

// ─────────────────────────────────────────────
// UTILITÁRIOS
// ─────────────────────────────────────────────
function randomFrom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function pick(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== '') ?? null;
}

function toText(value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? toText(value) : d.toLocaleString('pt-BR');
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? toText(value) : d.toLocaleDateString('pt-BR');
}

function normalizeCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  return payload.data || payload.registros || payload.items || payload.resultado || payload.dados || [];
}

function statusTone(status) {
  const v = toText(status, '').toLowerCase();
  if (['atrasada','atrasado','reprovado','critico','critica','erro'].some((w) => v.includes(w)))
    return 'border-rose-200 bg-rose-50 text-rose-600';
  if (['iniciando','pendente','aguardando','rascunho','alerta'].some((w) => v.includes(w)))
    return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function toCoordinate(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function resolveProductionAssetUrl(value) {
  if (!value) return '';
  const url = String(value).trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${ASSET_BASE_URL}${url.replace(/^\/+/, '')}`;
}

function getMediaKind(url, explicitType) {
  const type = toText(explicitType, '').toLowerCase();
  if (type.includes('video')) return 'video';
  if (type.includes('image') || type.includes('imagem') || type.includes('foto')) return 'image';
  if (type.includes('pdf') || type.includes('doc') || type.includes('xls')) return 'document';
  const f = toText(url, '').split('?')[0].toLowerCase();
  if (/\.(jpg|jpeg|png|webp|gif)$/i.test(f)) return 'image';
  if (/\.(mp4|mov|webm)$/i.test(f)) return 'video';
  return 'document';
}

function resourceLabel(r) { return r.charAt(0).toUpperCase() + r.slice(1); }

function getApiErrorMessage(error) {
  if (axios.isAxiosError(error)) return error.response?.data?.erro || error.message || 'Falha na API';
  return error instanceof Error ? error.message : 'Erro desconhecido';
}

// ─────────────────────────────────────────────
// NORMALIZADORES
// ─────────────────────────────────────────────
function normalizeObra(item, index) {
  const id     = pick(item.id, index + 1);
  const status = pick(item.status, item.situacao, item.estado, 'Sem status');
  const equipe = pick(item.equipe, item.total_equipe, item.colaboradores, item.membros, item.tecnicos, 0);
  return {
    id,
    nome:      toText(pick(item.nome, item.titulo, item.descricao, item.obra, `Obra ${id}`)),
    contrato:  toText(pick(item.contrato, item.numero_contrato, item.cod_contrato, 'Sem contrato')),
    status:    toText(status),
    equipe:    toText(typeof equipe === 'object' ? equipe.tecnicos ?? equipe.total ?? equipe.quantidade : equipe),
    rdos:      toText(pick(item.rdos, item.qtd_rdos, item.total_rdos, item.registros, 0)),
    progresso: toText(pick(item.progresso, item.percentual, item.percentual_conclusao, item.avanco, 0)),
    cor:       statusTone(status),
  };
}

function normalizeRdo(item, index) {
  const id = pick(item.id, index + 1);
  return {
    id:        toText(id, `RDO-${index + 1}`),
    obraId:    pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id),
    obra:      toText(pick(item.obra_nome, item.obra, item.nome_obra, item.titulo, `Obra ${pick(item.obra_id, '-')}`)),
    data:      formatDate(pick(item.data_rdo, item.data, item.criado_em, item.created_at, item.updated_at)),
    turno:     toText(pick(item.turno, item.periodo, item.horario, item.status, 'Sem turno')),
    status:    toText(pick(item.status, 'Sem status')),
    descricao: toText(pick(item.atividades, item.descricao, item.comentarios, item.observacao, 'Sem descricao')),
  };
}

function normalizeApproval(item, index) {
  const id = pick(item.id, index + 1);
  return {
    id:       toText(id, `APR-${index + 1}`),
    title:    toText(pick(item.titulo, item.title, item.observacao, item.descricao, `Aprovacao ${pick(item.rdo_id, id)}`)),
    owner:    toText(pick(item.usuario_nome, item.owner, item.aprovador, item.usuario, item.responsavel, 'Sistema')),
    priority: toText(pick(item.prioridade, item.priority, 'Media')),
    date:     formatDateTime(pick(item.aprovado_em, item.data, item.created_at, item.criado_em, item.updated_at)),
    status:   toText(pick(item.status, 'Pendente')),
  };
}

function normalizeMedia(item, index) {
  const id       = pick(item.id, index + 1);
  const url      = resolveProductionAssetUrl(pick(item.caminho, item.url, item.arquivo, item.path));
  const previewUrl = resolveProductionAssetUrl(
    pick(item.miniatura_caminho, item.miniaturaUrl, item.miniatura_url, item.miniatura_nome_arquivo, item.caminho, item.url, item.arquivo, item.path),
  );
  return {
    id:       toText(id, `MID-${index + 1}`),
    title:    toText(pick(item.descricao, item.nome, item.titulo, `Midia ${pick(item.tipo, id)}`)),
    type:     toText(pick(item.tipo, item.type, 'Arquivo')).toUpperCase(),
    meta:     [pick(item.obra_nome, item.obra, item.obra_id ? `Obra ${item.obra_id}` : null), formatDateTime(pick(item.capturado_em, item.created_at, item.data))].filter(Boolean).join(' • ') || 'Sem metadados',
    url,
    previewUrl,
    kind:     getMediaKind(url, pick(item.tipo, item.type)),
    owner:    toText(pick(item.usuario_nome, item.usuario, item.responsavel, item.autor, 'Equipe de campo')),
    rdoId:    toText(pick(item.rdo_id, item.rdoId, item.rdo, '')),
  };
}

// ─────────────────────────────────────────────
// BUILDERS DE CHART / MAP
// ─────────────────────────────────────────────
function buildRdoRanking(obras, rdos) {
  const counts = new Map();
  rdos.forEach((rdo) => {
    const key   = rdo.obraId ? String(rdo.obraId) : rdo.obra;
    const label = rdo.obraId ? obras.find((o) => String(o.id) === String(rdo.obraId))?.nome || rdo.obra : rdo.obra;
    const cur   = counts.get(key) || { name: label, count: 0 };
    counts.set(key, { name: cur.name, count: cur.count + 1 });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);
}

function buildMediaDistribution(midias) {
  const counts = new Map();
  midias.forEach((m) => {
    const key = m.obraId ? String(m.obraId) : m.obra;
    const cur = counts.get(key) || { name: m.obra, count: 0 };
    counts.set(key, { name: cur.name, count: cur.count + 1 });
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);
}

function buildMapPoints(midias, aprovacoes) {
  const mediaPoints = midias.map((item, i) => {
    const lat = toCoordinate(item.latitude);
    const lng = toCoordinate(item.longitude);
    if (!lat || !lng) return null;
    return { id: `media-${item.id || i}`, kind: 'media', label: item.title, sublabel: item.obra, latitude: lat, longitude: lng };
  }).filter(Boolean);

  const approvalPoints = aprovacoes.map((item, i) => {
    const lat = toCoordinate(item.latitude);
    const lng = toCoordinate(item.longitude);
    if (!lat || !lng) return null;
    return { id: `approval-${item.id || i}`, kind: 'approval', label: item.title, sublabel: item.owner, latitude: lat, longitude: lng };
  }).filter(Boolean);

  return { mediaPoints, approvalPoints, allPoints: [...mediaPoints, ...approvalPoints] };
}

function buildPdfReports(obras, rdos, midias) {
  return obras.map((obra) => {
    const obraRdos = rdos.filter((rdo) => String(rdo.obraId) === String(obra.id) || rdo.obra === obra.nome);
    const obraMidias = midias.filter((midia) => String(midia.obraId) === String(obra.id) || midia.obra === obra.nome);

    return {
      ...obra,
      totalRdos: obraRdos.length,
      totalMidias: obraMidias.length,
      lastRdo: obraRdos[0] || null,
      lastMedia: obraMidias[0] || null,
      rdos: obraRdos,
      midias: obraMidias,
    };
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function openReportPrint(report) {
  if (!report) return;

  const rdoMarkup = report.rdos.length
    ? report.rdos.map((rdo) => `<li><strong>${escapeHtml(rdo.id)}</strong> - ${escapeHtml(rdo.data)} - ${escapeHtml(rdo.turno)} - ${escapeHtml(rdo.status)}<br/>${escapeHtml(rdo.descricao)}</li>`).join('')
    : '<li>Nenhum RDO relacionado.</li>';

  const mediaMarkup = report.midias.length
    ? report.midias.map((midia) => {
        const imageUrl = midia.previewUrl || midia.url;
        const imageBlock = midia.kind === 'image' && imageUrl
          ? `<div class="media-image-wrap"><img class="media-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(midia.title)}" /></div>`
          : '';
        const linkBlock = midia.url
          ? `<a class="media-link" href="${escapeHtml(midia.url)}" target="_blank" rel="noreferrer">${escapeHtml(midia.url)}</a>`
          : '<span class="media-link media-link--muted">Sem link disponivel</span>';

        return `
          <li class="media-item">
            ${imageBlock}
            <div class="media-copy">
              <strong>${escapeHtml(midia.title)}</strong><br/>
              ${escapeHtml(midia.meta)} - ${escapeHtml(midia.kind)}<br/>
              ${linkBlock}
            </div>
          </li>
        `;
      }).join('')
    : '<li>Nenhuma midia relacionada.</li>';

  const printWindow = window.open('', '_blank', 'width=960,height=720');
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>Relatorio ${escapeHtml(report.nome)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 32px; color: #0f1729; }
          h1 { font-size: 26px; margin-bottom: 4px; }
          h2 { font-size: 16px; margin-top: 28px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
          p, li { font-size: 14px; line-height: 1.5; }
          .meta { margin-bottom: 24px; color: #475569; }
          .card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; margin-bottom: 16px; }
          ul { margin: 0; padding-left: 18px; }
          .media-item { margin-bottom: 18px; }
          .media-image-wrap { margin: 12px 0; }
          .media-image { width: 100%; max-width: 320px; border-radius: 14px; border: 1px solid #e2e8f0; display: block; object-fit: cover; }
          .media-copy { color: #334155; }
          .media-link { display: inline-block; margin-top: 6px; color: #1d4ed8; word-break: break-all; }
          .media-link--muted { color: #94a3b8; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(report.nome)}</h1>
        <p class="meta">Contrato: ${escapeHtml(report.contrato)} | Status: ${escapeHtml(report.status)} | Equipe: ${escapeHtml(report.equipe)}</p>
        <div class="card">
          <h2>RDOs</h2>
          <ul>${rdoMarkup}</ul>
        </div>
        <div class="card">
          <h2>Midias</h2>
          <ul>${mediaMarkup}</ul>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

// ─────────────────────────────────────────────
// ASSISTENTE SULY IA
// ─────────────────────────────────────────────
function buildAssistantNotifications({ obras, rdos, midias, aprovacoes }) {
  const obra = randomFrom(obras); const rdo = randomFrom(rdos);
  const media = randomFrom(midias); const approval = randomFrom(aprovacoes);
  const obraName    = obra?.nome        || 'obra sem identificacao';
  const rdoName     = rdo?.id           || 'RDO sem identificacao';
  const mediaName   = media?.title      || 'arquivo de midia';
  const mediaOwner  = media?.owner      || 'Equipe de campo';
  const approvalOwner = approval?.owner || 'Fiscalizacao';
  const approvalName  = approval?.title || 'aprovacao em andamento';

  return [
    { id: `obra-avaliacao-${obra?.id ?? 'x'}`,   title: 'Avaliacao pendente',         body: `A obra ${obraName} esta faltando avaliacao operacional no painel.`,               ctaLabel: 'Abrir obra',       action: { kind: 'obra',    obraId: obra?.id } },
    { id: `obra-midia-${obra?.id ?? 'x'}`,        title: 'Midia pendente',             body: `A obra ${obraName} ainda nao recebeu arquivo de midia no acompanhamento.`,        ctaLabel: 'Ver obra',         action: { kind: 'obra',    obraId: obra?.id } },
    { id: `obra-supervisao-${obra?.id ?? 'x'}`,   title: 'Supervisao faltando',        body: `A obra ${obraName} esta aguardando supervisao registrada no sistema.`,             ctaLabel: 'Abrir obra',       action: { kind: 'obra',    obraId: obra?.id } },
    { id: `obra-fiscalizacao-${obra?.id ?? 'x'}`, title: 'Fiscalizacao pendente',      body: `A obra ${obraName} ainda nao teve fiscalizacao confirmada nesta rodada.`,          ctaLabel: 'Ir para obra',     action: { kind: 'obra',    obraId: obra?.id } },
    { id: `obra-midia-prazo-${obra?.id ?? 'x'}`,  title: 'Midia fora do prazo',        body: `A obra ${obraName} recebeu um envio de midia fora do prazo esperado.`,             ctaLabel: 'Ver midias',       action: { kind: 'screen',  screen: 'Midias' } },
    { id: `obra-fiscal-prazo-${obra?.id ?? 'x'}`, title: 'Fiscalizacao fora do prazo', body: `A obra ${obraName} teve fiscalizacao registrada apos o prazo previsto.`,           ctaLabel: 'Ver aprovacoes',   action: { kind: 'screen',  screen: 'Aprovacoes' } },
    { id: `rdo-pendente-${rdo?.id ?? 'x'}`,       title: 'RDO aguardando',             body: `O ${rdoName} da obra ${rdo?.obra || obraName} precisa de revisao.`,               ctaLabel: 'Abrir RDO',        action: { kind: 'screen',  screen: 'RDO' } },
    { id: `rdo-turno-${rdo?.id ?? 'x'}`,          title: 'Turno sem fechamento',       body: `O ${rdoName} ainda nao teve o turno ${rdo?.turno || 'principal'} finalizado.`,     ctaLabel: 'Ver RDOs',         action: { kind: 'screen',  screen: 'RDO' } },
    { id: `rdo-obra-${obra?.id ?? 'x'}`,          title: 'Novo RDO sugerido',          body: `A obra ${obraName} pode receber um novo RDO para atualizar o diario de campo.`,   ctaLabel: 'Criar RDO',        action: { kind: 'obra-rdo', obraId: obra?.id } },
    { id: `apr-pendente-${approval?.id ?? 'x'}`,  title: 'Aprovacao pendente',         body: `${approvalName} ainda depende de validacao de ${approvalOwner}.`,                  ctaLabel: 'Abrir aprovacoes', action: { kind: 'screen',  screen: 'Aprovacoes' } },
    { id: `apr-obra-${approval?.id ?? 'x'}`,      title: 'Fluxo de aprovacao',         body: `A obra ${approval?.obra || obraName} recebeu uma aprovacao para acompanhar.`,     ctaLabel: 'Ver obra',         action: { kind: 'obra',    obraId: approval?.obraId ?? obra?.id } },
    { id: `media-enviada-${media?.id ?? 'x'}`,    title: 'Nova midia enviada',         body: `${mediaOwner} enviou o arquivo ${mediaName} para a obra ${media?.obra || obraName}.`, ctaLabel: 'Abrir arquivo', action: { kind: 'media',   screen: 'Midias', url: media?.url } },
    { id: `media-mapa-${media?.id ?? 'x'}`,       title: 'Midia georreferenciada',     body: `O arquivo ${mediaName} esta pronto para consulta no mapa.`,                         ctaLabel: 'Ver no mapa',      action: { kind: 'screen',  screen: 'Mapa' } },
    { id: `media-rdo-${media?.id ?? 'x'}`,        title: 'Midia vinculada ao RDO',     body: `Uma nova evidencia foi associada ao RDO ${media?.rdoId || rdoName}.`,               ctaLabel: 'Abrir midias',     action: { kind: 'screen',  screen: 'Midias' } },
    { id: `media-ausente-${obra?.id ?? 'x'}`,     title: 'Sem evidencia recente',      body: `A obra ${obraName} esta sem evidencia visual recente no cadastro.`,                 ctaLabel: 'Enviar midia',     action: { kind: 'screen',  screen: 'Midias' } },
    { id: `obra-historico-${obra?.id ?? 'x'}`,    title: 'Historico atualizado',       body: `Ja existem novas movimentacoes registradas para a obra ${obraName}.`,              ctaLabel: 'Ver historico',    action: { kind: 'obra-history', obraId: obra?.id } },
    { id: `obra-equipe-${obra?.id ?? 'x'}`,       title: 'Equipe sem movimentacao',    body: `A obra ${obraName} esta com baixa movimentacao de equipe nos ultimos registros.`,  ctaLabel: 'Abrir obra',       action: { kind: 'obra',    obraId: obra?.id } },
    { id: `apr-fiscal-${approval?.id ?? 'x'}`,    title: 'Fiscalizacao solicitada',    body: `${approvalOwner} pediu acompanhamento adicional para ${approvalName}.`,             ctaLabel: 'Abrir aprovacoes', action: { kind: 'screen',  screen: 'Aprovacoes' } },
    { id: `rdo-descricao-${rdo?.id ?? 'x'}`,      title: 'Descricao do RDO',           body: `O ${rdoName} possui informacoes que merecem revisao antes do proximo envio.`,       ctaLabel: 'Ir para RDO',      action: { kind: 'screen',  screen: 'RDO' } },
    { id: `arquivo-recente-${media?.id ?? 'x'}`,  title: 'Arquivo pronto para consulta', body: `O arquivo ${mediaName} pode ser aberto agora para conferencia rapida.`,           ctaLabel: 'Abrir arquivo',    action: { kind: 'media',   screen: 'Midias', url: media?.url } },
  ].filter((n) => {
    if (['obra','obra-rdo','obra-history'].includes(n.action.kind)) return Boolean(n.action.obraId);
    if (n.action.kind === 'media') return Boolean(n.action.url);
    return true;
  });
}

function RelatorioPdfScreen({ obras, rdos, midias, loading, error }) {
  const reports = buildPdfReports(obras, rdos, midias);
  return (
    <PageShell
      title="Relatorio PDF"
      subtitle="Lista simples por obra"
      action={<Badge tone="amber">{reports.length} obras</Badge>}
    >
      <div className="pdf-report space-y-4">
        {error && <ErrorBanner message={error} />}
        {loading && <LoadingRow label="Carregando obras para o relatorio..." />}
        {!loading && reports.length === 0 && !error && <EmptyRow label="Nenhuma obra encontrada para gerar PDF." />}

        <div className="grid gap-3">
          {reports.map((report) => (
            <div key={report.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-lg font-black uppercase tracking-tight text-[#0f1729]">{report.nome}</p>
              </div>
              <Btn variant="dark" onClick={() => openReportPrint(report)}>
                <i className="fa-solid fa-file-pdf text-xs" />
                Gerar PDF
              </Btn>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

function AssinaturasScreen({ obras, rdos, midias, loading, error }) {
  const reports = buildPdfReports(obras, rdos, midias);
  const [documentOverrides, setDocumentOverrides] = useState({});
  const [selectedDocumentId, setSelectedDocumentId] = useState(null);
  const [authModal, setAuthModal] = useState({ open: false, documentId: null, step: 'access' });
  const [authForm, setAuthForm] = useState({ email: '', cpf: '', codigo: '', aceite: false });

  const documents = reports.map((report, index) => {
    const baseDocument = {
      id: `signature-${report.id}`,
      report,
      status: index % 3 === 0 ? 'pending' : index % 3 === 1 ? 'sent' : 'signed',
      authStatus: 'not_started',
      envelopeId: `ENV-${String(index + 1).padStart(4, '0')}`,
      signers: [
        { id: `${report.id}-1`, name: 'Eng. Responsavel', email: 'engenharia@suape.com', role: 'Assinatura tecnica', status: index % 3 === 2 ? 'signed' : 'sent' },
        { id: `${report.id}-2`, name: 'Fiscal da Obra', email: 'fiscalizacao@suape.com', role: 'Validacao de campo', status: index % 3 === 2 ? 'signed' : index % 3 === 1 ? 'sent' : 'pending' },
        { id: `${report.id}-3`, name: 'Gestor Suape', email: 'gestor@suape.com', role: 'Aprovacao final', status: index % 3 === 2 ? 'signed' : 'pending' },
      ],
      timeline: [
        { id: `${report.id}-evt-1`, label: 'Documento criado', detail: `Relatorio da obra ${report.nome} foi preparado para assinatura.`, tone: 'slate' },
        { id: `${report.id}-evt-2`, label: 'Assinantes definidos', detail: 'Fluxo mockado com tres participantes configurados.', tone: 'amber' },
      ],
    };

    return {
      ...baseDocument,
      ...documentOverrides[baseDocument.id],
    };
  });

  const selectedDocument = documents.find((document) => document.id === selectedDocumentId) || documents[0] || null;

  const toneForStatus = (status) => (
    status === 'signed'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'sent'
        ? 'border-sky-200 bg-sky-50 text-sky-700'
        : 'border-amber-200 bg-amber-50 text-amber-700'
  );

  const openAuthFlow = (document) => {
    if (!document) return;
    setAuthForm({ email: '', cpf: '', codigo: '', aceite: false });
    setAuthModal({ open: true, documentId: document.id, step: 'access' });
  };

  const closeAuthFlow = () => {
    setAuthModal({ open: false, documentId: null, step: 'access' });
    setAuthForm({ email: '', cpf: '', codigo: '', aceite: false });
  };

  const sendEnvelope = (documentId) => {
    const targetDocument = documents.find((document) => document.id === documentId);
    if (!targetDocument) return;

    setDocumentOverrides((current) => ({
      ...current,
      [documentId]: {
        ...current[documentId],
        status: 'sent',
        signers: targetDocument.signers.map((signer) => ({ ...signer, status: signer.status === 'pending' ? 'sent' : signer.status })),
        timeline: [
          { id: `${documentId}-evt-send-${Date.now()}`, label: 'Envelope enviado', detail: 'Todos os assinantes receberam o convite mockado por email.', tone: 'sky' },
          ...targetDocument.timeline,
        ],
      },
    }));
  };

  const confirmAccessStep = () => {
    if (!authForm.email || !authForm.cpf || !authForm.aceite) return;
    setAuthModal((current) => ({ ...current, step: 'otp' }));
  };

  const completeMockSignature = () => {
    if (!authModal.documentId || !authForm.codigo) return;
    const targetDocument = documents.find((document) => document.id === authModal.documentId);
    if (!targetDocument) return;

    const nextSigners = targetDocument.signers.map((signer, index) => {
      if (index === 0) return { ...signer, status: 'signed' };
      if (index === 1 && signer.status === 'pending') return { ...signer, status: 'sent' };
      return signer;
    });

    const allSigned = nextSigners.every((signer) => signer.status === 'signed');

    setDocumentOverrides((current) => ({
      ...current,
      [authModal.documentId]: {
        ...current[authModal.documentId],
        status: allSigned ? 'signed' : 'sent',
        authStatus: 'authenticated',
        signers: nextSigners,
        timeline: [
          { id: `${authModal.documentId}-evt-sign-${Date.now()}`, label: 'Autenticacao concluida', detail: 'O assinante mockado validou acesso com email, CPF e codigo de confirmacao.', tone: 'emerald' },
          { id: `${authModal.documentId}-evt-signature-${Date.now() + 1}`, label: 'Assinatura aplicada', detail: 'A assinatura fake foi aplicada ao documento com sucesso.', tone: 'emerald' },
          ...targetDocument.timeline,
        ],
      },
    }));
    closeAuthFlow();
  };

  return (
    <>
      <PageShell
        title="Assinaturas"
        subtitle="Fluxo mockado estilo Clicksign"
        action={selectedDocument ? <Badge tone="amber">{selectedDocument.envelopeId}</Badge> : null}
      >
        <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Documentos</p>
                <h2 className="mt-1 text-xl font-black text-[#0f1729]">Fila de assinatura</h2>
              </div>
              <Badge tone="sky">{documents.length}</Badge>
            </div>

            {error && <ErrorBanner message={error} className="mt-4" />}
            {loading && <LoadingRow label="Montando envelopes mockados..." className="mt-4" />}
            {!loading && documents.length === 0 && !error && <EmptyRow label="Nenhum documento disponivel para assinatura." className="mt-4" />}

            <div className="mt-4 space-y-3">
              {documents.map((document) => (
                <button
                  key={document.id}
                  type="button"
                  onClick={() => setSelectedDocumentId(document.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-all duration-150 ${
                    selectedDocumentId === document.id
                      ? 'border-[#f5c518] bg-[#fffdf3] shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-[#0f1729]">{document.report.nome}</p>
                      <p className="mt-1 text-xs text-slate-400">{document.envelopeId} · {document.report.totalRdos} RDOs · {document.report.totalMidias} midias</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${toneForStatus(document.status)}`}>
                      {document.status === 'signed' ? 'Concluido' : document.status === 'sent' ? 'Enviado' : 'Pendente'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {selectedDocument ? (
              <>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Envelope mockado</p>
                      <h2 className="mt-1 text-2xl font-black text-[#0f1729]">{selectedDocument.report.nome}</h2>
                      <p className="mt-1 text-sm text-slate-500">Contrato: {selectedDocument.report.contrato}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Btn variant="outline" onClick={() => openReportPrint(selectedDocument.report)}>
                        <i className="fa-solid fa-file-pdf text-xs" />
                        Ver PDF
                      </Btn>
                      <Btn variant="gold" onClick={() => sendEnvelope(selectedDocument.id)}>
                        <i className="fa-solid fa-paper-plane text-xs" />
                        Enviar envelope
                      </Btn>
                      <Btn variant="dark" onClick={() => openAuthFlow(selectedDocument)}>
                        <i className="fa-solid fa-signature text-xs" />
                        Assinar agora
                      </Btn>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Status</p>
                      <p className="mt-1 text-sm font-black text-[#0f1729]">{selectedDocument.status === 'signed' ? 'Concluido' : selectedDocument.status === 'sent' ? 'Em andamento' : 'Rascunho'}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Assinantes</p>
                      <p className="mt-1 text-sm font-black text-[#0f1729]">{selectedDocument.signers.length}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Autenticacao</p>
                      <p className="mt-1 text-sm font-black text-[#0f1729]">{selectedDocument.authStatus === 'authenticated' ? 'Validada' : 'Pendente'}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Assinantes</p>
                    <div className="mt-4 space-y-3">
                      {selectedDocument.signers.map((signer) => (
                        <div key={signer.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-[#0f1729]">{signer.name}</p>
                              <p className="mt-0.5 text-xs text-slate-400">{signer.role}</p>
                              <p className="mt-1 text-xs text-slate-400">{signer.email}</p>
                            </div>
                            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${toneForStatus(signer.status === 'pending' ? 'pending' : signer.status)}`}>
                              {signer.status === 'signed' ? 'Assinado' : signer.status === 'sent' ? 'Recebido' : 'Pendente'}
                            </span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-200">
                            <div className={`h-2 rounded-full ${signer.status === 'signed' ? 'w-full bg-emerald-500' : signer.status === 'sent' ? 'w-2/3 bg-sky-500' : 'w-1/4 bg-amber-400'}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Autenticacao fake</p>
                    <h3 className="mt-1 text-xl font-black text-[#0f1729]">Jornada completa do assinante</h3>
                    <div className="mt-4 space-y-3">
                      {[
                        'Recebe convite por email mockado',
                        'Abre a pagina de autenticacao fake',
                        'Confirma email e CPF',
                        'Digita codigo OTP simulado',
                        'Aceita o termo e conclui a assinatura',
                      ].map((step, index) => (
                        <div key={step} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f1729] text-[11px] font-black text-white">{index + 1}</div>
                          <p className="pt-1 text-sm text-slate-600">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-slate-400">Timeline mockada</p>
                  <div className="mt-4 space-y-3">
                    {selectedDocument.timeline.map((event) => (
                      <div key={event.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-black text-[#0f1729]">{event.label}</p>
                          <Badge tone={event.tone}>{event.tone}</Badge>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{event.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <EmptyRow label="Selecione um documento para acompanhar a assinatura." />
            )}
          </div>
        </div>
      </PageShell>

      {authModal.open && selectedDocument &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
              <div className="border-b border-slate-100 bg-gradient-to-r from-[#0f1729] to-[#1d4ed8] px-6 py-5 text-white">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-white/60">Autenticacao fake</p>
                <h3 className="mt-2 text-2xl font-black">Assinatura estilo Clicksign</h3>
                <p className="mt-1 text-sm text-white/75">{selectedDocument.report.nome}</p>
              </div>

              <div className="space-y-5 px-6 py-6">
                <div className="flex gap-2">
                  {[
                    ['access', 'Acesso'],
                    ['otp', 'Confirmacao'],
                    ['done', 'Finalizar'],
                  ].map(([stepId, label]) => {
                    const active = authModal.step === stepId;
                    const completed = (stepId === 'access' && authModal.step !== 'access') || (stepId === 'otp' && authModal.step === 'done');
                    return (
                      <div key={stepId} className={`flex-1 rounded-full px-3 py-2 text-center text-[10px] font-black uppercase tracking-[0.22em] ${active ? 'bg-[#0f1729] text-white' : completed ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {label}
                      </div>
                    );
                  })}
                </div>

                {authModal.step === 'access' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Identificacao do assinante</p>
                      <p className="mt-2 text-sm text-slate-600">Este fluxo simula a checagem de acesso antes de abrir o documento para assinatura.</p>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Email</span>
                      <input value={authForm.email} onChange={(e) => setAuthForm((current) => ({ ...current, email: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0f1729] outline-none transition-all focus:border-[#f5c518] focus:ring-2 focus:ring-[#f5c518]/20" placeholder="assinante@mock.com" />
                    </label>
                    <label className="grid gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">CPF</span>
                      <input value={authForm.cpf} onChange={(e) => setAuthForm((current) => ({ ...current, cpf: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0f1729] outline-none transition-all focus:border-[#f5c518] focus:ring-2 focus:ring-[#f5c518]/20" placeholder="000.000.000-00" />
                    </label>
                    <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input type="checkbox" checked={authForm.aceite} onChange={(e) => setAuthForm((current) => ({ ...current, aceite: e.target.checked }))} className="mt-1 h-4 w-4 rounded border-slate-300 text-[#0f1729]" />
                      <span className="text-sm text-slate-600">Aceito este fluxo fake de autenticacao e confirmo que desejo continuar a assinatura mockada.</span>
                    </label>
                  </div>
                )}

                {authModal.step === 'otp' && (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sky-700">Codigo mockado enviado</p>
                      <p className="mt-2 text-sm text-sky-800">Use qualquer codigo de 6 digitos para simular a validacao do token de acesso.</p>
                    </div>
                    <label className="grid gap-1.5">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Codigo OTP</span>
                      <input value={authForm.codigo} onChange={(e) => setAuthForm((current) => ({ ...current, codigo: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0f1729] outline-none transition-all focus:border-[#f5c518] focus:ring-2 focus:ring-[#f5c518]/20" placeholder="123456" />
                    </label>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Btn variant="outline" onClick={closeAuthFlow}>Cancelar</Btn>
                  {authModal.step === 'access' && <Btn variant="gold" onClick={confirmAccessStep}>Validar acesso</Btn>}
                  {authModal.step === 'otp' && <Btn variant="dark" onClick={completeMockSignature}>Concluir assinatura</Btn>}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function FloatingAssistant({ activeItem, obras, rdos, midias, aprovacoes, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  const hints = {
    Obras: 'Posso ajudar a abrir RDOs, revisar historico e organizar frentes.',
    RDO: 'Vamos registrar o dia com mais clareza e menos atrito.',
    Aprovacoes: 'Consigo te guiar pelas pendencias e destravar validacoes.',
    Midias: 'Posso lembrar a obra, o RDO e o tipo certo antes do upload.',
    Mapa: 'Aqui eu te ajudo a localizar rapidamente midias e aprovacoes.',
    Graficos: 'Posso resumir os numeros e apontar onde a obra mais concentra registros.',
    Assinaturas: 'Aqui acompanhamos envelopes, autenticacao fake e assinaturas mockadas.',
    'Log de erros': 'Vamos ler o que falhou e descobrir o proximo passo.',
  };

  useEffect(() => {
    const t = window.setInterval(() => {
      if (isOpen || notification) return;
      const pool = buildAssistantNotifications({ obras, rdos, midias, aprovacoes });
      const next = randomFrom(pool);
      if (next) setNotification({ ...next, id: `${next.id}-${Date.now()}` });
    }, 60000);
    return () => window.clearInterval(t);
  }, [aprovacoes, isOpen, midias, notification, obras, rdos]);

  const handleAction = (action) => { if (!action) return; onNavigate?.(action); setNotification(null); };

  return (
    <div className="suape-assistant">
      {notification && !isOpen && (
        <div className="suape-assistant__notification animate-in slide-in-from-bottom-4 fade-in duration-300">
          <button type="button" className="suape-assistant__dismiss" onClick={() => setNotification(null)}>
            <i className="fa-solid fa-xmark" />
          </button>
          <p className="suape-assistant__eyebrow">Aviso inteligente</p>
          <h3 className="suape-assistant__notificationTitle">{notification.title}</h3>
          <p className="suape-assistant__message">{notification.body}</p>
          <button type="button" className="suape-assistant__chip suape-assistant__chip--primary" onClick={() => handleAction(notification.action)}>
            {notification.ctaLabel}
          </button>
        </div>
      )}

      {isOpen && (
        <div className="suape-assistant__panel animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="suape-assistant__panelHeader">
            <div className="suape-assistant__avatar suape-assistant__avatar--large"><i className="fa-solid fa-sun" /></div>
            <div>
              <p className="suape-assistant__eyebrow">Assistente Suape</p>
              <h3 className="suape-assistant__title">Suly IA</h3>
            </div>
          </div>
          <p className="suape-assistant__message">{hints[activeItem] || 'Estou por aqui para te ajudar a seguir com a obra.'}</p>
          <div className="suape-assistant__chips">
            <button type="button" className="suape-assistant__chip" onClick={() => onNavigate?.({ kind: 'screen', screen: 'RDO' })}>Abrir RDO</button>
            <button type="button" className="suape-assistant__chip" onClick={() => onNavigate?.({ kind: 'screen', screen: 'Midias' })}>Enviar midia</button>
            <button type="button" className="suape-assistant__chip" onClick={() => onNavigate?.({ kind: 'screen', screen: 'Mapa' })}>Ver mapa</button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="suape-assistant__launcher transition-all duration-200 hover:scale-105 active:scale-95"
        onClick={() => setIsOpen((c) => !c)}
      >
        <div className="suape-assistant__avatar"><i className="fa-solid fa-sun" /></div>
        <div className="suape-assistant__copy">
          <span className="suape-assistant__name">Suly IA</span>
          <span className="suape-assistant__subtitle">Vamos conversar?</span>
        </div>
        <div className="suape-assistant__bubble">
          <i className={`fa-solid ${isOpen ? 'fa-xmark' : 'fa-comment-dots'} transition-all duration-200`} />
        </div>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTES DE LAYOUT BASE
// ─────────────────────────────────────────────
function PageShell({ title, subtitle, action, children }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 px-6 py-5 shadow-sm backdrop-blur-md">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">{subtitle}</p>
            <h1 className="mt-1.5 text-3xl font-black uppercase tracking-tight text-[#0f1729] sm:text-4xl">{title}</h1>
          </div>
          {action}
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-5 sm:p-6 animate-in fade-in duration-300">{children}</div>
    </>
  );
}

function StatCard({ label, value, hint, tone = 'slate' }) {
  const gradients = {
    slate:   'from-slate-700 to-slate-900',
    amber:   'from-[#f5c518] to-[#d4a017]',
    emerald: 'from-emerald-400 to-emerald-600',
    red:     'from-rose-400 to-rose-600',
  };
  return (
    <div className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
      <div className={`h-1 w-12 rounded-full bg-gradient-to-r ${gradients[tone]} transition-all duration-300 group-hover:w-20`} />
      <p className="mt-4 text-[9px] font-black uppercase tracking-[0.4em] text-slate-400">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <span className="text-3xl font-black tabular-nums text-[#0f1729]">{value}</span>
        {hint && <span className="mb-0.5 text-right text-[11px] font-medium leading-tight text-slate-400">{hint}</span>}
      </div>
    </div>
  );
}

function Badge({ children, tone = 'slate' }) {
  const styles = {
    slate:   'border-slate-200 bg-slate-50 text-slate-500',
    amber:   'border-amber-200 bg-amber-50 text-amber-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red:     'border-rose-200 bg-rose-50 text-rose-600',
    sky:     'border-sky-200 bg-sky-50 text-sky-700',
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] ${styles[tone]}`}>
      {children}
    </span>
  );
}

function Btn({ children, variant = 'dark', onClick, disabled, type = 'button', className = '' }) {
  const base = 'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.22em] transition-all duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
  const variants = {
    dark:    'bg-[#0f1729] text-white hover:bg-[#1a2640] focus-visible:ring-[#0f1729]',
    gold:    'bg-[#f5c518] text-[#0f1729] hover:bg-[#d4a017] focus-visible:ring-[#f5c518]',
    outline: 'border border-slate-200 bg-white text-[#0f1729] hover:border-[#f5c518] hover:text-[#9a7a00] focus-visible:ring-slate-300',
    danger:  'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-300',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────
// TELA: OBRAS
// ─────────────────────────────────────────────
function ObrasScreen({ obras, loading, error, expandedObra, onToggleObra, onOpenRdo, onOpenEdit, onOpenHistory }) {
  const activeCount  = obras.length;
  const totalRdos    = obras.reduce((s, o) => s + (Number(o.rdos) || 0), 0);
  const pendingCount = obras.filter((o) => ['pendente','atras','aguard'].some((w) => o.status.toLowerCase().includes(w))).length;

  return (
    <PageShell
      title="Gestao de Obras"
      subtitle="Status operacional / RDO"
      action={
        <div className="flex flex-wrap gap-2">
          <Btn variant="dark">
            <i className="fa-solid fa-rotate-right text-xs" />
            Atualizar obras
          </Btn>
          <a
            href={APK_DOWNLOAD_URL}
            download
            className="inline-flex items-center gap-2 rounded-xl bg-[#f5c518] px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.22em] text-[#0f1729] transition-all duration-150 hover:bg-[#d4a017] active:scale-95"
          >
            <i className="fa-solid fa-download text-xs" />
            Baixar app
          </a>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Obras ativas"  value={String(activeCount).padStart(2,'0')}  hint="Carregadas da API"     tone="amber" />
        <StatCard label="RDOs totais"   value={String(totalRdos)}                    hint="Somatorio dos registros" tone="emerald" />
        <StatCard label="Pendencias"    value={String(pendingCount).padStart(2,'0')} hint="Status em alerta"       tone="red" />
      </div>

      {error && <ErrorBanner message={error} className="mt-4" />}

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <LoadingRow label="Sincronizando obras com Suape..." />}
        {!loading && obras.length === 0 && !error && <EmptyRow label="Nenhuma obra retornada pela API." />}

        {obras.map((obra) => {
          const expanded = expandedObra === obra.id;
          return (
            <div key={obra.id} className="border-b border-slate-100 last:border-b-0">
              <div className={`relative transition-colors duration-150 ${expanded ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}>
                {expanded && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r bg-[#f5c518]" />}
                <button
                  type="button"
                  onClick={() => onToggleObra(obra.id)}
                  className="flex w-full flex-col gap-4 px-5 py-5 text-left sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <Badge tone={obra.cor.includes('rose') ? 'red' : obra.cor.includes('amber') ? 'amber' : 'emerald'}>
                      {obra.status}
                    </Badge>
                    <h2 className="mt-2.5 truncate text-xl font-black uppercase tracking-wide text-[#0f1729]">{obra.nome}</h2>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">Contrato: {obra.contrato}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <div className="grid grid-cols-3 gap-2">
                      {[['Equipe', obra.equipe, 'integrantes'], ['RDOs', obra.rdos, 'registros'], ['Progresso', obra.progresso, '%']].map(([k, v, s]) => (
                        <div key={k} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-center">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">{k}</p>
                          <p className="mt-1 text-sm font-black text-[#0f1729]">{v}<span className="ml-0.5 text-[10px] font-bold text-slate-400">{s}</span></p>
                        </div>
                      ))}
                    </div>
                    <i className={`fa-solid fa-chevron-down text-sm text-slate-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>
              </div>

              <div className={`overflow-hidden border-t border-slate-100 transition-all duration-300 ease-in-out ${expanded ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="grid gap-px bg-slate-100 sm:grid-cols-4">
                  {[
                    ['Novo RDO',   'fa-file-circle-plus',   'text-[#f5c518]', () => onOpenRdo(obra)],
                    ['Historico',  'fa-clock-rotate-left',  'text-slate-400', () => onOpenHistory(obra)],
                    ['Editar obra','fa-pen-to-square',      'text-slate-400', () => onOpenEdit(obra)],
                    ['Excluir',    'fa-trash-can',          'text-rose-300',  null],
                  ].map(([label, icon, color, action]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); action?.(); }}
                      className="group/btn flex flex-col items-center justify-center gap-2 bg-white px-4 py-5 text-center transition-colors duration-150 hover:bg-slate-50 active:bg-slate-100"
                    >
                      <i className={`fa-solid ${icon} text-base ${color} transition-transform duration-150 group-hover/btn:scale-110`} />
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</span>
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

// ─────────────────────────────────────────────
// MODAL: OBRA (RDO / HISTÓRICO / EDIÇÃO)
// ─────────────────────────────────────────────
function ObraModal({ mode, tab, obra, rdos, midias, aprovacoes, onClose, onSetTab, onCreateRdo, onCreateMedia, onCreateApproval, onUpdateObra, onOpenMap }) {
  const [rdoForm,      setRdoForm]      = useState({ data_rdo: new Date().toISOString().slice(0,10), atividades: '', comentarios: '', status: 'RASCUNHO' });
  const [approvalForm, setApprovalForm] = useState({ rdo_id: '', status: 'APROVADO', observacao: '' });
  const [editForm,     setEditForm]     = useState({ nome: obra?.nome || '', contrato: obra?.contrato || '', status: obra?.status || '', progresso: obra?.progresso || '0' });
  const [mediaFile,    setMediaFile]    = useState(null);
  const [mediaRdoId,   setMediaRdoId]   = useState('');
  const [busy,         setBusy]         = useState(false);
  const [feedback,     setFeedback]     = useState('');

  useEffect(() => { if (mode !== 'rdo') return; onSetTab(tab === 'history' ? 'rdo' : tab); }, [mode, onSetTab, tab]);
  if (!obra) return null;

  const obraRdos       = rdos.filter((r)  => String(r.obraId) === String(obra.id) || r.obra === obra.nome);
  const obraMidias     = midias.filter((m) => String(m.obraId) === String(obra.id) || m.obra === obra.nome);
  const obraAprovacoes = aprovacoes.filter((a) => String(a.obraId) === String(obra.id) || a.obra === obra.nome);
  const historyItems   = [
    ...obraAprovacoes.map((a) => ({ id: `APR-${a.id}`, type: 'Aprovacao', title: a.title,  date: a.date,  latitude: a.latitude,  longitude: a.longitude })),
    ...obraMidias.map((m)     => ({ id: `MID-${m.id}`, type: 'Midia',     title: m.title,  date: m.meta,  latitude: m.latitude,  longitude: m.longitude })),
  ];

  const wrap = async (fn) => { setBusy(true); setFeedback(''); try { await fn(); } catch (e) { setFeedback(e instanceof Error ? e.message : 'Erro desconhecido.'); } finally { setBusy(false); } };

  const submitRdo      = (e) => { e.preventDefault(); wrap(async () => { await onCreateRdo({ obra_id: obra.id, data_rdo: rdoForm.data_rdo, atividades: rdoForm.atividades, comentarios: rdoForm.comentarios, status: rdoForm.status }); setFeedback('RDO salvo com sucesso.'); }); };
  const submitMedia    = (e) => { e.preventDefault(); wrap(async () => { await onCreateMedia({ file: mediaFile, obraId: obra.id, rdoId: mediaRdoId }); setFeedback('Mídia enviada com sucesso.'); }); };
  const submitApproval = (e) => { e.preventDefault(); wrap(async () => { await onCreateApproval({ obra_id: obra.id, rdo_id: approvalForm.rdo_id, status: approvalForm.status, observacao: approvalForm.observacao }); setFeedback('Aprovação criada com sucesso.'); }); };
  const submitEdit     = (e) => { e.preventDefault(); wrap(async () => { await onUpdateObra(obra.id, { nome: editForm.nome, contrato: editForm.contrato, status: editForm.status, progresso: editForm.progresso }); setFeedback('Obra atualizada com sucesso.'); }); };

  const inputCls  = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0f1729] outline-none transition-all duration-150 focus:border-[#f5c518] focus:ring-2 focus:ring-[#f5c518]/20 placeholder:text-slate-300';
  const labelCls  = 'text-[10px] font-black uppercase tracking-[0.3em] text-slate-400';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-2xl animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">
              {mode === 'history' ? 'Historico da obra' : mode === 'edit' ? 'Editar obra' : 'Novo registro'}
            </p>
            <h2 className="mt-1.5 text-2xl font-black uppercase tracking-tight text-[#0f1729]">{obra.nome}</h2>
            <p className="mt-0.5 text-sm text-slate-400">Contrato: {obra.contrato}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-[#0f1729] active:scale-90">
            <i className="fa-solid fa-xmark text-sm" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-100 px-6 pt-3 pb-0">
          <div className="flex flex-wrap gap-1">
            {mode === 'rdo' && [['rdo','Novo RDO'],['media','Adicionar Midia'],['approval','Aprovacao']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => onSetTab(key)}
                className={`rounded-t-xl px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.22em] transition-all duration-150 ${tab === key ? 'border-b-2 border-[#f5c518] text-[#0f1729]' : 'text-slate-400 hover:text-slate-600'}`}
              >{label}</button>
            ))}
            {mode === 'history' && (
              <button type="button" onClick={() => onOpenMap()} className="mb-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-sky-700 transition-colors hover:bg-sky-100">
                <i className="fa-solid fa-map-location-dot mr-2 text-xs" />Ver no mapa
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="grid max-h-[calc(92vh-170px)] gap-5 overflow-y-auto p-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            {/* ── RDO form ── */}
            {mode === 'rdo' && tab === 'rdo' && (
              <form onSubmit={submitRdo} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <p className={labelCls}>Cadastro de RDO</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5">
                    <span className={labelCls}>Data</span>
                    <input type="date" value={rdoForm.data_rdo} onChange={(e) => setRdoForm((c) => ({...c, data_rdo: e.target.value}))} className={inputCls} required />
                  </label>
                  <label className="grid gap-1.5">
                    <span className={labelCls}>Status</span>
                    <select value={rdoForm.status} onChange={(e) => setRdoForm((c) => ({...c, status: e.target.value}))} className={inputCls}>
                      <option value="RASCUNHO">Rascunho</option>
                      <option value="ENVIADO">Enviado</option>
                      <option value="APROVADO">Aprovado</option>
                    </select>
                  </label>
                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className={labelCls}>Atividades</span>
                    <textarea value={rdoForm.atividades} onChange={(e) => setRdoForm((c) => ({...c, atividades: e.target.value}))} rows="4" className={inputCls} required />
                  </label>
                  <label className="grid gap-1.5 sm:col-span-2">
                    <span className={labelCls}>Comentarios</span>
                    <textarea value={rdoForm.comentarios} onChange={(e) => setRdoForm((c) => ({...c, comentarios: e.target.value}))} rows="3" className={inputCls} />
                  </label>
                </div>
                <Btn type="submit" variant="dark" disabled={busy}>{busy ? 'Salvando...' : 'Salvar RDO'}</Btn>
              </form>
            )}

            {/* ── Media form ── */}
            {mode === 'rdo' && tab === 'media' && (
              <form onSubmit={submitMedia} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <p className={labelCls}>Adicionar midia</p>
                <label className="grid gap-1.5">
                  <span className={labelCls}>Arquivo</span>
                  <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg" onChange={(e) => setMediaFile(e.target.files?.[0] || null)} className={inputCls} required />
                </label>
                <label className="grid gap-1.5">
                  <span className={labelCls}>RDO relacionado</span>
                  <select value={mediaRdoId} onChange={(e) => setMediaRdoId(e.target.value)} className={inputCls} required>
                    <option value="">Selecione um RDO</option>
                    {obraRdos.map((r) => <option key={r.id} value={r.id}>{r.id} • {r.obra}</option>)}
                  </select>
                </label>
                <Btn type="submit" variant="dark" disabled={busy}>{busy ? 'Enviando...' : 'Enviar midia'}</Btn>
              </form>
            )}

            {/* ── Approval form ── */}
            {mode === 'rdo' && tab === 'approval' && (
              <form onSubmit={submitApproval} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <p className={labelCls}>Adicionar aprovacao</p>
                <label className="grid gap-1.5">
                  <span className={labelCls}>RDO</span>
                  <select value={approvalForm.rdo_id} onChange={(e) => setApprovalForm((c) => ({...c, rdo_id: e.target.value}))} className={inputCls} required>
                    <option value="">Selecione um RDO</option>
                    {obraRdos.map((r) => <option key={r.id} value={r.id}>{r.id} • {r.obra}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className={labelCls}>Status</span>
                  <select value={approvalForm.status} onChange={(e) => setApprovalForm((c) => ({...c, status: e.target.value}))} className={inputCls}>
                    <option value="APROVADO">Aprovado</option>
                    <option value="PENDENTE">Pendente</option>
                    <option value="REPROVADO">Reprovado</option>
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className={labelCls}>Observacao</span>
                  <textarea value={approvalForm.observacao} onChange={(e) => setApprovalForm((c) => ({...c, observacao: e.target.value}))} rows="3" className={inputCls} />
                </label>
                <Btn type="submit" variant="dark" disabled={busy}>{busy ? 'Salvando...' : 'Salvar aprovacao'}</Btn>
              </form>
            )}

            {/* ── Edit form ── */}
            {mode === 'edit' && (
              <form onSubmit={submitEdit} className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <p className={labelCls}>Informacoes da obra</p>
                {[['Nome','nome','text',true],['Contrato','contrato','text',false]].map(([lbl, key, type, req]) => (
                  <label key={key} className="grid gap-1.5">
                    <span className={labelCls}>{lbl}</span>
                    <input type={type} value={editForm[key]} onChange={(e) => setEditForm((c) => ({...c, [key]: e.target.value}))} className={inputCls} required={req} />
                  </label>
                ))}
                <label className="grid gap-1.5">
                  <span className={labelCls}>Status</span>
                  <input value={editForm.status} onChange={(e) => setEditForm((c) => ({...c, status: e.target.value}))} className={inputCls} />
                </label>
                <label className="grid gap-1.5">
                  <span className={labelCls}>Progresso (%)</span>
                  <input type="number" min="0" max="100" value={editForm.progresso} onChange={(e) => setEditForm((c) => ({...c, progresso: e.target.value}))} className={inputCls} />
                </label>
                <Btn type="submit" variant="dark" disabled={busy}>{busy ? 'Salvando...' : 'Salvar obra'}</Btn>
              </form>
            )}

            {/* ── History ── */}
            {mode === 'history' && (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                <p className={labelCls}>Movimentacoes</p>
                {historyItems.length === 0 && <EmptyRow label="Nenhuma movimentacao encontrada." />}
                {historyItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Badge>{item.type}</Badge>
                        <h3 className="mt-2 text-sm font-bold text-[#0f1729]">{item.title}</h3>
                        <p className="mt-0.5 text-xs text-slate-400">{item.date}</p>
                      </div>
                      <button type="button" onClick={onOpenMap} className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-sky-700 transition-colors hover:bg-sky-100">
                        Ver mapa
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sidebar do modal */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className={labelCls}>Resumo da obra</p>
              <div className="mt-4 space-y-2">
                {[['RDOs', obraRdos.length], ['Midias', obraMidias.length], ['Aprovacoes', obraAprovacoes.length]].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-2.5">
                    <span className="text-sm text-slate-500">{k}</span>
                    <strong className="text-base font-black text-[#0f1729]">{v}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Feedback</p>
              <div className={`mt-3 text-sm leading-relaxed ${feedback ? 'text-white' : 'text-white/40'}`}>
                {feedback || 'Nenhuma acao enviada ainda.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TELA: RDO
// ─────────────────────────────────────────────
function RdoScreen({ rdos, loading, error }) {
  const processedCount = rdos.filter((r) => ['enviado','aprov','concl'].some((w) => r.status.toLowerCase().includes(w))).length;

  return (
    <PageShell
      title="RDO"
      subtitle="Diario de obras"
      action={<Btn variant="gold"><i className="fa-solid fa-plus text-xs" />Novo registro</Btn>}
    >
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Lista recente</p>
              <h2 className="mt-1 text-2xl font-black text-[#0f1729]">Registros da API</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">{rdos.length} registros</span>
          </div>

          {error   && <ErrorBanner message={error} className="mt-4" />}
          {loading && <LoadingRow label="Carregando RDOs da API..." className="mt-5" />}
          {!loading && rdos.length === 0 && !error && <EmptyRow label="Nenhum RDO retornado pela API." className="mt-5" />}

          <div className="mt-4 space-y-2.5">
            {rdos.map((item) => (
              <article key={item.id} className="group rounded-2xl border border-slate-100 p-4 transition-all duration-150 hover:border-[#f5c518]/50 hover:bg-[#fffef7] hover:shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{item.id}</Badge>
                      <Badge tone="amber">{item.status}</Badge>
                    </div>
                    <h3 className="mt-2.5 text-base font-black uppercase tracking-wide text-[#0f1729]">{item.obra}</h3>
                    <p className="mt-0.5 text-sm text-slate-500 line-clamp-1">{item.descricao}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">{item.data}</p>
                    <p className="mt-1 text-sm font-bold text-[#0f1729]">{item.turno}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Resumo</p>
            <div className="mt-4 space-y-4">
              {[['Processados', processedCount, 78], ['Pendentes', Math.max(rdos.length - processedCount, 0), 22]].map(([label, val, pct]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-bold text-slate-500">{label}</span>
                    <span className="font-black text-[#0f1729]">{val}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div className="h-1.5 rounded-full bg-gradient-to-r from-[#f5c518] to-[#d4a017] transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Fluxo rapido</p>
            <div className="mt-4 space-y-2">
              {['Coletar dados da obra','Registrar equipe e ocorrencias','Enviar para aprovacao'].map((s, i) => (
                <div key={s} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5c518] text-[9px] font-black text-[#0f1729]">{i + 1}</span>
                  <span className="text-sm text-white/80">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ─────────────────────────────────────────────
// TELA: APROVAÇÕES
// ─────────────────────────────────────────────
function AprovacoesScreen({ aprovacoes, loading, error }) {
  const waitingCount = aprovacoes.filter((a) => ['pend','aguard','rascunho'].some((w) => a.status.toLowerCase().includes(w))).length;

  return (
    <PageShell
      title="Aprovacoes"
      subtitle="Fila de validacao"
      action={<Btn variant="outline"><i className="fa-solid fa-list-check text-xs" />Revisar fila</Btn>}
    >
      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Pendencias</p>
          {error   && <ErrorBanner message={error} className="mt-4" />}
          {loading && <LoadingRow label="Carregando aprovacoes..." className="mt-4" />}
          {!loading && aprovacoes.length === 0 && !error && <EmptyRow label="Nenhuma aprovacao retornada." className="mt-4" />}
          <div className="mt-4 space-y-2.5">
            {aprovacoes.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 p-4 transition-shadow hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge>{item.id}</Badge>
                    <h3 className="mt-2 text-base font-black text-[#0f1729]">{item.title}</h3>
                    <p className="mt-0.5 text-sm text-slate-500">{item.owner}</p>
                  </div>
                  <Badge tone="amber">{item.status}</Badge>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-400">
                  <span>Prioridade: {item.priority}</span>
                  <span>{item.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Painel de status</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Esperando" value={String(waitingCount)}                            hint="Na fila"         tone="amber" />
              <StatCard label="Aprovados" value={String(aprovacoes.length - waitingCount)}        hint="Concluidos"      tone="emerald" />
              <StatCard label="Total"     value={String(aprovacoes.length)}                       hint="Registros API"   tone="red" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Checklist de validacao</p>
            <div className="mt-4 space-y-2">
              {['Conferir assinaturas','Validar fotos obrigatorias','Cruzar medicao e contrato','Liberar para proxima etapa'].map((step, i) => (
                <div key={step} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f5c518]/20 text-[9px] font-black text-[#f5c518]">{i + 1}</span>
                  <span className="text-sm text-white/80">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ─────────────────────────────────────────────
// TELA: MÍDIAS (com upload)
// ─────────────────────────────────────────────
void function MidiasScreen() {}; // suprimido — substituído por MidiasUploadScreen

function MidiasUploadScreen({ midias, loading, error, obras, rdos, onUpload, onOpenMap }) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [obraId,      setObraId]      = useState('');
  const [rdoId,       setRdoId]       = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [feedback,    setFeedback]    = useState('');
  const [dropActive,  setDropActive]  = useState(false);

  const reset    = () => {
    setPendingFile(null);
    setObraId('');
    setRdoId('');
    setFeedback('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };
  const openPick = () => fileInputRef.current?.click();
  const openCamera = () => cameraInputRef.current?.click();
  const onFile   = (file) => { if (!file) return; setPendingFile(file); setFeedback('Arquivo selecionado. Informe a obra e o RDO antes de enviar.'); };
  const onDrop   = (e)    => { e.preventDefault(); setDropActive(false); onFile(e.dataTransfer.files?.[0]); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pendingFile) { setFeedback('Escolha um arquivo antes de enviar.'); return; }
    setSubmitting(true); setFeedback('');
    try {
      await onUpload({ file: pendingFile, obraId, rdoId });
      setFeedback('Arquivo enviado com sucesso para a API.');
      reset();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Falha ao enviar o arquivo.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0f1729] outline-none transition-all duration-150 focus:border-[#f5c518] focus:ring-2 focus:ring-[#f5c518]/20';

  return (
    <PageShell
      title="Midias"
      subtitle="Banco visual"
      action={
        <div className="flex flex-wrap gap-2">
          <Btn variant="outline" onClick={openCamera}>
            <i className="fa-solid fa-camera text-xs" />
            Usar camera
          </Btn>
          <Btn variant="dark" onClick={openPick}>
            <i className="fa-solid fa-cloud-arrow-up text-xs" />
            Enviar midia
          </Btn>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_0.95fr]">
        {/* Gallery */}
        <div className="grid gap-4 sm:grid-cols-2 content-start">
          {error   && <div className="sm:col-span-2"><ErrorBanner message={error} /></div>}
          {loading && <div className="sm:col-span-2"><LoadingRow label="Carregando midias da API..." /></div>}
          {!loading && midias.length === 0 && !error && <div className="sm:col-span-2"><EmptyRow label="Nenhuma midia retornada." /></div>}

          {midias.map((item) => (
            <article key={item.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <a href={item.url || '#'} target={item.url ? '_blank' : undefined} rel="noreferrer" className="block">
                <div className="relative h-44 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-700 to-[#f5c518]">
                  {item.kind === 'image' && (item.previewUrl || item.url) && (
                    <img src={item.previewUrl || item.url} alt={item.title} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  )}
                  {item.kind === 'video' && item.url && (
                    <video className="absolute inset-0 h-full w-full object-cover" src={item.url} controls preload="metadata" />
                  )}
                  {item.kind === 'document' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-950/90 to-[#f5c518]/70">
                      <div className="text-center text-white">
                        <i className="fa-solid fa-file-lines text-5xl text-[#f5c518]" />
                        <p className="mt-3 text-[11px] font-black uppercase tracking-widest">Abrir documento</p>
                      </div>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="relative flex h-full items-end justify-between p-3 text-white">
                    <Badge tone="slate" className="!border-white/20 !bg-black/35 !text-white backdrop-blur">{item.kind.toUpperCase()}</Badge>
                    <div className="flex items-center gap-2">
                      {item.kind === 'image' && item.latitude && item.longitude && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/35 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white backdrop-blur transition-colors hover:bg-black/50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenMap?.(item);
                          }}
                        >
                          <i className="fa-solid fa-map-location-dot text-[11px]" />
                          Ver mapa
                        </button>
                      )}
                      <i className={`fa-solid ${item.kind === 'video' ? 'fa-circle-play' : item.kind === 'document' ? 'fa-up-right-from-square' : 'fa-camera'} text-xl opacity-80`} />
                    </div>
                  </div>
                </div>
              </a>
              <div className="p-4">
                <h3 className="font-black text-[#0f1729] line-clamp-1">{item.title}</h3>
                <p className="mt-0.5 text-xs text-slate-400 line-clamp-1">{item.meta}</p>
                {item.url
                  ? <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 block text-xs font-bold text-[#1d4ed8] underline decoration-[#f5c518] underline-offset-4 hover:decoration-2">Abrir arquivo</a>
                  : <p className="mt-2 text-xs text-slate-400">Sem link disponivel</p>
                }
              </div>
            </article>
          ))}
        </div>

        {/* Upload panel */}
        <div className="space-y-4">
          <div
            className={`rounded-2xl border-2 border-dashed bg-white p-5 shadow-sm transition-all duration-200 ${dropActive ? 'border-[#f5c518] bg-[#fffef3] scale-[1.01]' : 'border-slate-200'}`}
            onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
            onDragLeave={() => setDropActive(false)}
            onDrop={onDrop}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Upload rapido</p>
            <button type="button" onClick={openPick} className="mt-3 flex w-full flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center transition-all duration-150 hover:border-[#f5c518] hover:bg-[#fffef7] active:scale-[0.98]">
              <i className={`fa-solid fa-cloud-arrow-up text-4xl transition-all duration-200 ${dropActive ? 'text-[#f5c518] scale-110' : 'text-slate-300'}`} />
              <p className="mt-3 text-base font-black text-[#0f1729]">Arraste aqui</p>
              <p className="mt-1 text-xs text-slate-400">Imagem, video ou documento</p>
            </button>

            <input ref={fileInputRef} type="file" className="hidden" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg" onChange={(e) => onFile(e.target.files?.[0])} />
            <input
              ref={cameraInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*"
              capture="environment"
              onChange={(e) => onFile(e.target.files?.[0])}
            />

            {pendingFile && (
              <form onSubmit={handleSubmit} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 animate-in fade-in duration-200">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Arquivo selecionado</p>
                  <p className="mt-1 text-sm font-bold text-[#0f1729] truncate">{pendingFile.name}</p>
                  <p className="text-xs text-slate-400">{pendingFile.type || '—'} · {(pendingFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Obra</span>
                  <select value={obraId} onChange={(e) => setObraId(e.target.value)} className={inputCls} required>
                    <option value="">Selecione a obra</option>
                    {obras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">RDO</span>
                  <select value={rdoId} onChange={(e) => setRdoId(e.target.value)} className={inputCls} required>
                    <option value="">Selecione o RDO</option>
                    {rdos.map((r) => <option key={r.id} value={r.id}>{r.id} • {r.obra}</option>)}
                  </select>
                </label>
                {feedback && <p className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm text-slate-600">{feedback}</p>}
                <div className="flex gap-2">
                  <Btn variant="outline" onClick={reset} disabled={submitting} className="flex-1">Limpar</Btn>
                  <Btn type="submit" variant="dark" disabled={submitting} className="flex-1">{submitting ? 'Enviando...' : 'Enviar para API'}</Btn>
                </div>
                </form>
            )}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={openCamera}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.22em] text-[#0f1729] transition-all duration-150 hover:border-[#f5c518] hover:bg-[#fffef7]"
              >
                <i className="fa-solid fa-camera" />
                Abrir camera
              </button>
              <button
                type="button"
                onClick={openPick}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-[0.22em] text-[#0f1729] transition-all duration-150 hover:border-[#f5c518] hover:bg-[#fffef7]"
              >
                <i className="fa-solid fa-folder-open" />
                Escolher arquivo
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Indicadores</p>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Arquivos recebidos</span>
                <strong className="text-xl font-black">{midias.length}</strong>
              </div>
              <div className="h-1.5 rounded-full bg-white/10">
                <div className="h-1.5 rounded-full bg-gradient-to-r from-[#f5c518] to-[#d4a017]" style={{ width: '68%' }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Origem</span>
                <strong className="text-sm font-black text-white/80">API PHP</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ─────────────────────────────────────────────
// TELA: GRÁFICOS
// ─────────────────────────────────────────────
function GraficosScreen({ obras, rdos, midias, loading, error }) {
  const ranking   = buildRdoRanking(obras, rdos);
  const mediaDist = buildMediaDistribution(midias);
  const topObra   = ranking[0];
  const pieData   = mediaDist.map((i) => ({ name: i.name, value: i.count }));

  return (
    <PageShell
      title="Graficos"
      subtitle="RDO e midias por obra"
      action={<Btn variant="outline"><i className="fa-solid fa-arrows-rotate text-xs" />Atualizar dados</Btn>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total de obras" value={String(obras.length).padStart(2,'0')} hint="Base API"          tone="amber" />
        <StatCard label="Total de RDOs"  value={String(rdos.length).padStart(2,'0')}  hint="Todos registros"   tone="emerald" />
        <StatCard label="Top obra"       value={topObra ? String(topObra.count) : '00'} hint={topObra?.name || 'Sem dados'} tone="red" />
      </div>

      {error   && <ErrorBanner message={error} className="mt-4" />}
      {loading && <LoadingRow label="Carregando graficos da API..." className="mt-6" />}
      {!loading && ranking.length === 0 && !error && <EmptyRow label="Nenhum RDO encontrado para montar o grafico." className="mt-6" />}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
        {/* Bar chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Ranking de RDOs</p>
              <h2 className="mt-1 text-2xl font-black text-[#0f1729]">Obras com mais registros</h2>
            </div>
            <Badge>Top {ranking.length}</Badge>
          </div>
          <div className="mt-5 h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranking} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={80} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'rgba(245,197,24,0.07)' }} contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v) => [`${v} RDOs`, 'Quantidade']} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="count" name="RDOs" radius={[8,8,0,0]}>
                  {ranking.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie + ranking */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Distribuicao de midias</p>
            <div className="mt-3 h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={65} outerRadius={90} paddingAngle={4}>
                    {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', fontSize: 12 }} formatter={(v) => [`${v} arquivos`, 'Quantidade']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Ranking de midias</p>
            <div className="mt-3 space-y-2">
              {mediaDist.map((item, i) => (
                <div key={item.name} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-[#0f1729]" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                    <p className="text-[11px] text-white/50">{item.count} arquivos</p>
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

// ─────────────────────────────────────────────
// TELA: MAPA
// ─────────────────────────────────────────────
function MapaScreen({ midias, aprovacoes, loading, error, selectedPoint }) {
  const { mediaPoints, approvalPoints, allPoints } = buildMapPoints(midias, aprovacoes);
  const hasSelectedPoint = Boolean(selectedPoint?.latitude && selectedPoint?.longitude);
  const mapCenter = hasSelectedPoint
    ? [selectedPoint.latitude, selectedPoint.longitude]
    : allPoints.length
      ? [allPoints.reduce((s, p) => s + p.latitude, 0) / allPoints.length, allPoints.reduce((s, p) => s + p.longitude, 0) / allPoints.length]
    : [-8.31, -34.96];
  const mapZoom = hasSelectedPoint ? 16 : (allPoints.length ? 10 : 8);
  const mapBounds   = allPoints.length ? allPoints.map((p) => [p.latitude, p.longitude]) : null;
  const centerLabel = hasSelectedPoint
    ? 'Ponto selecionado da midia'
    : allPoints.length
      ? `${allPoints.length} pontos georreferenciados`
      : 'Sem coordenadas enviadas';

  return (
    <PageShell
      title="Mapa"
      subtitle="Localizacao geografica"
      action={<Btn variant="outline"><i className="fa-solid fa-location-crosshairs text-xs" />Atualizar mapa</Btn>}
    >
      <div className="grid gap-5 xl:grid-cols-[1.5fr_0.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Mapa interativo</p>
              <h2 className="mt-1 text-xl font-black text-[#0f1729]">Midias e aprovacoes no territorio</h2>
            </div>
            <div className="flex gap-2">
              <Badge tone="amber">Midias: {mediaPoints.length}</Badge>
              <Badge tone="sky">Aprovacoes: {approvalPoints.length}</Badge>
            </div>
          </div>

          {error   && <ErrorBanner message={error} className="mb-4" />}
          {loading && <LoadingRow label="Carregando pontos geograficos..." className="mb-4" />}

          <div className="relative h-[580px] overflow-hidden rounded-2xl border border-slate-200">
            <MapContainer center={mapCenter} zoom={mapZoom} scrollWheelZoom className="h-full w-full" whenReady={(map) => { if (mapBounds && !hasSelectedPoint) map.target.fitBounds(mapBounds, { padding: [40, 40] }); }}>
              <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {mediaPoints.map((p) => (
                <CircleMarker key={p.id} center={[p.latitude, p.longitude]} pathOptions={{ color: '#f5c518', fillColor: '#f5c518', fillOpacity: 0.9, weight: 2 }} radius={10}>
                  <Popup><div className="min-w-[140px]"><p className="font-black text-[#0f1729]">{p.label}</p><p className="text-xs text-slate-500">{p.sublabel}</p><Badge tone="amber" className="mt-2">Midia</Badge></div></Popup>
                </CircleMarker>
              ))}
              {approvalPoints.map((p) => (
                <CircleMarker key={p.id} center={[p.latitude, p.longitude]} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.9, weight: 2 }} radius={10}>
                  <Popup><div className="min-w-[140px]"><p className="font-black text-[#0f1729]">{p.label}</p><p className="text-xs text-slate-500">{p.sublabel}</p><Badge tone="sky" className="mt-2">Aprovacao</Badge></div></Popup>
                </CircleMarker>
              ))}
              {hasSelectedPoint && (
                <CircleMarker center={[selectedPoint.latitude, selectedPoint.longitude]} pathOptions={{ color: '#16a34a', fillColor: '#16a34a', fillOpacity: 1, weight: 3 }} radius={12}>
                  <Popup>
                    <div className="min-w-[160px]">
                      <p className="font-black text-[#0f1729]">{selectedPoint.label}</p>
                      <p className="text-xs text-slate-500">{selectedPoint.sublabel}</p>
                      <Badge tone="emerald" className="mt-2">Imagem selecionada</Badge>
                    </div>
                  </Popup>
                </CircleMarker>
              )}
            </MapContainer>

            <div className="pointer-events-none absolute left-3 top-3 z-[401] rounded-full border border-white/20 bg-[#0f1729]/80 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/80 backdrop-blur">
              {centerLabel}
            </div>

            {!allPoints.length && (
              <div className="absolute inset-0 z-[400] flex items-center justify-center bg-slate-950/30 backdrop-blur-sm">
                <div className="max-w-sm rounded-2xl border border-white/20 bg-white/90 p-6 text-center shadow-xl">
                  <i className="fa-solid fa-map text-4xl text-slate-300" />
                  <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Mapa vazio</p>
                  <p className="mt-2 text-sm font-bold text-[#0f1729]">Nenhuma midia ou aprovacao trouxe coordenadas para o mapa.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Legenda</p>
            <div className="mt-4 space-y-2.5">
              {[['bg-[#f5c518] ring-[#f5c518]/25', 'Arquivos de midia', 'Marcadores amarelos'], ['bg-sky-500 ring-sky-300/30', 'Aprovacoes', 'Marcadores azuis']].map(([cls, label, sub]) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-slate-100 px-4 py-3">
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full ring-4 ${cls}`} />
                  <div>
                    <p className="text-sm font-bold text-[#0f1729]">{label}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Resumo</p>
            <div className="mt-4 space-y-3 divide-y divide-white/10">
              {[['Pontos de midia', mediaPoints.length], ['Pontos de aprovacao', approvalPoints.length], ['Total no mapa', allPoints.length]].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between pt-3 first:pt-0">
                  <span className="text-sm text-white/60">{k}</span>
                  <strong className="text-lg font-black text-white">{v}</strong>
                </div>
              ))}
            </div>
          </div>

          {allPoints.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Ultimos pontos</p>
              <div className="mt-3 space-y-2">
                {[...mediaPoints.slice(0, 3), ...approvalPoints.slice(0, 3)].map((p) => (
                  <div key={p.id} className="rounded-xl border border-slate-100 px-4 py-2.5">
                    <p className="truncate text-sm font-bold text-[#0f1729]">{p.label}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{p.kind === 'media' ? 'Midia' : 'Aprovacao'} · {p.latitude.toFixed(4)}, {p.longitude.toFixed(4)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

// ─────────────────────────────────────────────
// TELA: LOG DE ERROS
// ─────────────────────────────────────────────
function LogErrosScreen({ requestLogs }) {
  const critCount  = requestLogs.filter((l) => l.level === 'Critico').length;
  const infoCount  = requestLogs.filter((l) => l.level === 'Info').length;
  const alertCount = requestLogs.filter((l) => l.level === 'Alerta').length;

  const toneCls = (level) =>
    level === 'Critico' ? 'border-rose-100 bg-rose-50 text-rose-600' :
    level === 'Alerta'  ? 'border-amber-100 bg-amber-50 text-amber-700' :
                          'border-emerald-100 bg-emerald-50 text-emerald-700';

  return (
    <PageShell
      title="Log de erros"
      subtitle="Saude da aplicacao"
      action={<Btn variant="danger"><i className="fa-solid fa-file-export text-xs" />Exportar log</Btn>}
    >
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Eventos recentes</p>
              <h2 className="mt-1 text-2xl font-black text-[#0f1729]">Chamadas da API</h2>
            </div>
            {critCount > 0 && <Badge tone="red">{critCount} erro(s)</Badge>}
          </div>

          {requestLogs.length === 0 && <EmptyRow label="Nenhum evento de API registrado ainda." className="mt-5" />}

          <div className="mt-4 space-y-2.5">
            {requestLogs.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 p-4 transition-shadow hover:shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{item.id}</Badge>
                      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${toneCls(item.level)}`}>{item.level}</span>
                    </div>
                    <h3 className="mt-2.5 text-base font-black text-[#0f1729]">{item.message}</h3>
                    <p className="mt-0.5 text-sm text-slate-400">Origem: {item.origin}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-slate-400">{item.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Status geral</p>
            <div className="mt-4 grid gap-3">
              <StatCard label="Criticos" value={String(critCount).padStart(2,'0')}  hint="Falhas na integracao"        tone="red" />
              <StatCard label="Infos"    value={String(infoCount).padStart(2,'0')}  hint="Chamadas bem sucedidas"      tone="emerald" />
              <StatCard label="Alertas"  value={String(alertCount).padStart(2,'0')} hint="Ocorrencias intermediarias"  tone="amber" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-[#0f1729] p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Acoes recomendadas</p>
            <div className="mt-3 space-y-2">
              {['Reprocessar chamadas com erro','Validar disponibilidade do endpoint','Revisar dados retornados pelo PHP'].map((s) => (
                <div key={s} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                  <i className="fa-solid fa-chevron-right text-[10px] text-[#f5c518]" />
                  <span className="text-sm text-white/80">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// ─────────────────────────────────────────────
// MICRO-COMPONENTES AUXILIARES
// ─────────────────────────────────────────────
function ErrorBanner({ message, className = '' }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 ${className}`}>
      <i className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" />
      {message}
    </div>
  );
}

function LoadingRow({ label, className = '' }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-400 ${className}`}>
      <i className="fa-solid fa-circle-notch fa-spin text-[#f5c518]" />
      {label}
    </div>
  );
}

function EmptyRow({ label, className = '' }) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400 ${className}`}>
      <i className="fa-solid fa-inbox mb-2 block text-2xl text-slate-200" />
      {label}
    </div>
  );
}

// ─────────────────────────────────────────────
// ROTEADOR DE TELAS
// ─────────────────────────────────────────────
function getScreen(activeItem, state, handlers) {
  switch (activeItem) {
    case 'RDO':        return <RdoScreen rdos={state.rdos} loading={state.loading} error={state.errors.rdos} />;
    case 'Aprovacoes': return <AprovacoesScreen aprovacoes={state.aprovacoes} loading={state.loading} error={state.errors.aprovacoes} />;
    case 'Midias':     return <MidiasUploadScreen midias={state.midias} loading={state.loading} error={state.errors.midias} obras={state.obras} rdos={state.rdos} onUpload={handlers.onUpload} onOpenMap={handlers.onOpenMap} />;
    case 'Mapa':       return <MapaScreen midias={state.midias} aprovacoes={state.aprovacoes} loading={state.loading} error={state.errors.midias || state.errors.aprovacoes} selectedPoint={state.mapFocus} />;
    case 'Graficos':   return <GraficosScreen obras={state.obras} rdos={state.rdos} midias={state.midias} loading={state.loading} error={state.errors.rdos || state.errors.obras || state.errors.midias} />;
    case 'Relatorio PDF': return <RelatorioPdfScreen obras={state.obras} rdos={state.rdos} midias={state.midias} loading={state.loading} error={state.errors.rdos || state.errors.obras || state.errors.midias} />;
    case 'Assinaturas': return <AssinaturasScreen obras={state.obras} rdos={state.rdos} midias={state.midias} loading={state.loading} error={state.errors.rdos || state.errors.obras || state.errors.midias} />;
    case 'Log de erros': return <LogErrosScreen requestLogs={state.requestLogs} />;
    case 'Obras': default:
      return (
        <ObrasScreen
          obras={state.obras} loading={state.loading} error={state.errors.obras}
          expandedObra={handlers.expandedObra}
          onToggleObra={handlers.onToggleObra}
          onOpenRdo={handlers.onOpenRdo}
          onOpenEdit={handlers.onOpenEdit}
          onOpenHistory={handlers.onOpenHistory}
        />
      );
  }
}

// ─────────────────────────────────────────────
// APP — COMPONENTE RAIZ
// ─────────────────────────────────────────────
export default function App() {
  const [expandedObra,   setExpandedObra]   = useState(null);
  const [activeItem,     setActiveItem]     = useState('Obras');
  const [mapFocus,       setMapFocus]       = useState(null);
  const [workModal,      setWorkModal]      = useState(null);
  const [workModalTab,   setWorkModalTab]   = useState('rdo');
  const [loading,        setLoading]        = useState(true);
  const [errors,         setErrors]         = useState({ obras: '', rdos: '', aprovacoes: '', midias: '' });
  const [collections,    setCollections]    = useState({ obras: [], rdos: [], aprovacoes: [], midias: [] });
  const [requestLogs,    setRequestLogs]    = useState([]);

  // ── Modais ──
  const openWorkModal  = useCallback((mode, obra) => { setWorkModal({ mode, obra }); setWorkModalTab(mode === 'history' ? 'history' : 'rdo'); }, []);
  const closeWorkModal = useCallback(() => setWorkModal(null), []);

  // ── Carga de dados ──
  const loadAllCollections = useCallback(async () => {
    setLoading(true);
    setErrors({ obras: '', rdos: '', aprovacoes: '', midias: '' });
    const resources  = Object.values(RESOURCE_MAP);
    const startedAt  = new Date();

    const results = await Promise.all(
      resources.map(async (resource) => {
        try {
          const response = await axios.get(API_BASE_URL, { params: { resource } });
          return { resource, status: 'fulfilled', rows: normalizeCollection(response.data) };
        } catch (error) {
          return { resource, status: 'rejected', error: getApiErrorMessage(error) };
        }
      }),
    );

    const nextCollections = { obras: [], rdos: [], aprovacoes: [], midias: [] };
    const nextErrors      = { obras: '', rdos: '', aprovacoes: '', midias: '' };

    const nextLogs = results.map((result, index) => {
      const time = new Date(startedAt.getTime() + index * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (result.status === 'fulfilled') {
        nextCollections[result.resource] = result.rows;
        return { id: `${result.resource}-${index + 1}`, level: 'Info',    origin: result.resource.toUpperCase(), message: `${result.rows.length} registros carregados com sucesso.`, time };
      }
      nextErrors[result.resource] = result.error;
      return { id: `${result.resource}-${index + 1}`, level: 'Critico', origin: result.resource.toUpperCase(), message: `Falha ao carregar ${resourceLabel(result.resource)}: ${result.error}`, time };
    });

    setCollections(nextCollections);
    setErrors(nextErrors);
    setRequestLogs(nextLogs);
    setLoading(false);
  }, []);

  const refreshData = useCallback(() => loadAllCollections(), [loadAllCollections]);

  useEffect(() => { const t = window.setTimeout(() => void loadAllCollections(), 0); return () => window.clearTimeout(t); }, [loadAllCollections]);

  // ── Handlers de API ──
  const handleMediaUpload = useCallback(async ({ file, obraId, rdoId }) => {
    const formData = new FormData();
    formData.append('arquivo', file);
    formData.append('descricao', file.name);
    if (obraId) formData.append('obra_id', obraId);
    if (rdoId)  formData.append('rdo_id', rdoId);
    const mime = file.type?.toLowerCase() || '';
    formData.append('tipo', mime.startsWith('image/') ? 'IMAGEM' : mime.startsWith('video/') ? 'VIDEO' : 'DOCUMENTO');
    await axios.post(UPLOAD_BASE_URL, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    await refreshData();
  }, [refreshData]);

  const handleCreateRdo      = useCallback(async (payload) => { await axios.post(API_BASE_URL, payload, { params: { resource: 'rdos' } }); await refreshData(); }, [refreshData]);
  const handleCreateApproval = useCallback(async (payload) => { await axios.post(API_BASE_URL, payload, { params: { resource: 'aprovacoes' } }); await refreshData(); }, [refreshData]);
  const handleUpdateObra     = useCallback(async (id, payload) => { await axios.put(API_BASE_URL, payload, { params: { resource: 'obras', id } }); await refreshData(); }, [refreshData]);
  const openMapFromHistory   = useCallback(() => { setMapFocus(null); setActiveItem('Mapa'); closeWorkModal(); }, [closeWorkModal]);

  // ── Normalização ──
  const obras = collections.obras.map(normalizeObra);
  const rdos  = collections.rdos.map(normalizeRdo);

  const aprovacoes = collections.aprovacoes.map((item, index) => {
    const base = normalizeApproval(item, index);
    return {
      ...base,
      obraId:    pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id),
      obra:      toText(pick(item.obra_nome, item.obra, item.nome_obra, item.empreendimento, item.titulo), `Obra ${pick(item.obra_id, '-')}`),
      latitude:  toCoordinate(pick(item.latitude, item.lat, item.gps_latitude, item.gpsLatitude)),
      longitude: toCoordinate(pick(item.longitude, item.lng, item.lon, item.gps_longitude, item.gpsLongitude)),
    };
  });

  const midias = collections.midias.map((item, index) => {
    const base = normalizeMedia(item, index);
    return {
      ...base,
      obraId:    pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id),
      obra:      toText(pick(item.obra_nome, item.obra, item.nome_obra, item.empreendimento, item.titulo), `Obra ${pick(item.obra_id, '-')}`),
      latitude:  toCoordinate(pick(item.latitude, item.lat, item.gps_latitude, item.gpsLatitude)),
      longitude: toCoordinate(pick(item.longitude, item.lng, item.lon, item.gps_longitude, item.gpsLongitude)),
    };
  });

  const openMediaMap = useCallback((mediaItem) => {
    if (!mediaItem?.latitude || !mediaItem?.longitude) {
      setMapFocus(null);
      setActiveItem('Mapa');
      return;
    }

    setMapFocus({
      latitude: mediaItem.latitude,
      longitude: mediaItem.longitude,
      label: mediaItem.title,
      sublabel: mediaItem.meta,
      kind: 'media',
    });
    setActiveItem('Mapa');
  }, []);

  // ── Navegação da Suly ──
  const navigateFromAssistant = useCallback((action) => {
    if (!action) return;
    if (action.kind === 'screen' && action.screen) { setActiveItem(action.screen); return; }
    if (action.kind === 'media') { if (action.screen) setActiveItem(action.screen); if (action.url) window.open(action.url, '_blank', 'noopener,noreferrer'); return; }
    if (action.kind === 'obra') { setActiveItem('Obras'); if (action.obraId) setExpandedObra(action.obraId); return; }
    const selected = obras.find((o) => String(o.id) === String(action.obraId));
    if (action.kind === 'obra-rdo'     && selected) { setActiveItem('Obras'); setExpandedObra(selected.id); openWorkModal('rdo',     selected); return; }
    if (action.kind === 'obra-history' && selected) { setActiveItem('Obras'); setExpandedObra(selected.id); openWorkModal('history', selected); }
  }, [obras, openWorkModal]);

  const toggleObra = (id) => setExpandedObra((cur) => (cur === id ? null : id));

  // ─────────────────────────────────────
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f0f4f8] text-left text-[#334155]">
      <Sidebar activeItem={activeItem} onSelectItem={setActiveItem} />

      <main className="flex min-w-0 flex-1 flex-col">
        {getScreen(
          activeItem,
          { obras, rdos, aprovacoes, midias, loading, errors, requestLogs, mapFocus },
          {
            expandedObra,
            onToggleObra: toggleObra,
            onUpload:     handleMediaUpload,
            onOpenMap:    openMediaMap,
            onOpenRdo:    (obra) => openWorkModal('rdo',     obra),
            onOpenEdit:   (obra) => openWorkModal('edit',    obra),
            onOpenHistory:(obra) => openWorkModal('history', obra),
          },
        )}
      </main>

      <FloatingAssistant
        activeItem={activeItem}
        obras={obras} rdos={rdos} midias={midias} aprovacoes={aprovacoes}
        onNavigate={navigateFromAssistant}
      />

      {workModal?.obra && createPortal(
        <ObraModal
          key={`${workModal.mode}-${workModal.obra.id}`}
          mode={workModal.mode}
          tab={workModalTab}
          obra={workModal.obra}
          rdos={rdos} midias={midias} aprovacoes={aprovacoes}
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
