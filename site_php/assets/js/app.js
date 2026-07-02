(function () {
  const body = document.body;
  const appShell = document.getElementById('app-shell');
  const modalRoot = document.getElementById('modal-root');
  const assistantRoot = document.getElementById('assistant-root');
  const apiBase = body.dataset.apiBase;
  const uploadBase = body.dataset.uploadBase;
  const apkUrl = body.dataset.apkUrl;
  const menuItems = [
    { name: 'Obras', icon: 'fa-user-gear' },
    { name: 'RDO', icon: 'fa-file-lines' },
    { name: 'Aprovacoes', icon: 'fa-square-check' },
    { name: 'Midias', icon: 'fa-image' },
    { name: 'Mapa', icon: 'fa-map-location-dot' },
    { name: 'Graficos', icon: 'fa-chart-column' },
    { name: 'Relatorio PDF', icon: 'fa-file-pdf' },
    { name: 'Assinaturas', icon: 'fa-signature' },
    { name: 'Log de erros', icon: 'fa-circle-exclamation' },
  ];
  const chartColors = ['#f5c518', '#0f1729', '#10b981', '#f43f5e', '#38bdf8', '#8b5cf6'];

  const state = {
    activeItem: body.dataset.page || 'Obras',
    sidebarOpen: window.innerWidth > 991,
    loading: true,
    errors: { obras: '', rdos: '', aprovacoes: '', midias: '' },
    collections: { obras: [], rdos: [], aprovacoes: [], midias: [] },
    requestLogs: [],
    expandedObra: null,
    mapFocus: null,
    workModal: null,
    workModalTab: 'rdo',
    assistantOpen: false,
    assistantNotification: null,
    midiasDraft: { file: null, obraId: '', rdoId: '', submitting: false, feedback: '', dropActive: false },
    selectedDocumentId: null,
    documentOverrides: {},
    authModal: { open: false, documentId: null, step: 'access' },
    authFeedback: '',
    charts: [],
    map: null,
    mapMarkerLayer: null,
    assistantTimer: null,
  };

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
    if (['atrasada', 'atrasado', 'reprovado', 'critico', 'critica', 'erro'].some((w) => v.includes(w))) return 'red';
    if (['iniciando', 'pendente', 'aguardando', 'rascunho', 'alerta'].some((w) => v.includes(w))) return 'amber';
    if (['aprovado', 'concluido', 'assinado', 'signed'].some((w) => v.includes(w))) return 'emerald';
    return 'slate';
  }

  function toCoordinate(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(String(value).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  function resolveAssetUrl(value) {
    if (!value) return '';
    const url = String(value).trim();
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return `https:${url}`;
    const base = new URL('.', apiBase).href;
    return `${base}${url.replace(/^\/+/, '')}`;
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

  function resourceLabel(r) {
    return r.charAt(0).toUpperCase() + r.slice(1);
  }

  function getApiErrorMessage(error) {
    return error?.message || 'Falha na API';
  }

  function normalizeObra(item, index) {
    const id = pick(item.id, index + 1);
    const status = pick(item.status, item.situacao, item.estado, 'Sem status');
    const equipe = pick(item.equipe, item.total_equipe, item.colaboradores, item.membros, item.tecnicos, 0);
    return {
      id,
      nome: toText(pick(item.nome, item.titulo, item.descricao, item.obra, `Obra ${id}`)),
      contrato: toText(pick(item.contrato, item.numero_contrato, item.cod_contrato, 'Sem contrato')),
      status: toText(status),
      equipe: toText(typeof equipe === 'object' ? equipe.tecnicos ?? equipe.total ?? equipe.quantidade : equipe),
      rdos: toText(pick(item.rdos, item.qtd_rdos, item.total_rdos, item.registros, 0)),
      progresso: toText(pick(item.progresso, item.percentual, item.percentual_conclusao, item.avanco, 0)),
      tone: statusTone(status),
    };
  }

  function normalizeRdo(item, index) {
    const id = pick(item.id, index + 1);
    return {
      id: toText(id, `RDO-${index + 1}`),
      obraId: pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id),
      obra: toText(pick(item.obra_nome, item.obra, item.nome_obra, item.titulo, `Obra ${pick(item.obra_id, '-')}`)),
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
    const url = resolveAssetUrl(pick(item.caminho, item.url, item.arquivo, item.path));
    const previewUrl = resolveAssetUrl(
      pick(item.miniatura_caminho, item.miniaturaUrl, item.miniatura_url, item.miniatura_nome_arquivo, item.caminho, item.url, item.arquivo, item.path),
    );
    return {
      id: toText(id, `MID-${index + 1}`),
      title: toText(pick(item.descricao, item.nome, item.titulo, `Midia ${pick(item.tipo, id)}`)),
      type: toText(pick(item.tipo, item.type, 'Arquivo')).toUpperCase(),
      meta: [pick(item.obra_nome, item.obra, item.obra_id ? `Obra ${item.obra_id}` : null), formatDateTime(pick(item.capturado_em, item.created_at, item.data))]
        .filter(Boolean)
        .join(' • ') || 'Sem metadados',
      url,
      previewUrl,
      kind: getMediaKind(url, pick(item.tipo, item.type)),
      owner: toText(pick(item.usuario_nome, item.usuario, item.responsavel, item.autor, 'Equipe de campo')),
      rdoId: toText(pick(item.rdo_id, item.rdoId, item.rdo, '')),
    };
  }

  function buildRdoRanking(obras, rdos) {
    const counts = new Map();
    rdos.forEach((rdo) => {
      const key = rdo.obraId ? String(rdo.obraId) : rdo.obra;
      const label = rdo.obraId ? obras.find((o) => String(o.id) === String(rdo.obraId))?.nome || rdo.obra : rdo.obra;
      const cur = counts.get(key) || { name: label, count: 0 };
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
      ? report.rdos.map((rdo) => `<li><strong>${escapeHtml(rdo.id)}</strong> - ${escapeHtml(rdo.data)} - ${escapeHtml(rdo.turno)} - ${escapeHtml(rdo.status)}<br>${escapeHtml(rdo.descricao)}</li>`).join('')
      : '<li>Nenhum RDO relacionado.</li>';

    const mediaMarkup = report.midias.length
      ? report.midias.map((midia) => {
        const imageUrl = midia.previewUrl || midia.url;
        const imageBlock = midia.kind === 'image' && imageUrl
          ? `<div class="my-2"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(midia.title)}" style="width:100%;max-width:320px;border-radius:14px;border:1px solid #e2e8f0;object-fit:cover;"></div>`
          : '';
        const linkBlock = midia.url
          ? `<a href="${escapeHtml(midia.url)}" target="_blank" rel="noreferrer">${escapeHtml(midia.url)}</a>`
          : '<span>Sem link disponivel</span>';
        return `<li class="mb-3">${imageBlock}<strong>${escapeHtml(midia.title)}</strong><br>${escapeHtml(midia.meta)} - ${escapeHtml(midia.kind)}<br>${linkBlock}</li>`;
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

  function randomFrom(list) {
    if (!Array.isArray(list) || list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function buildAssistantNotifications({ obras, rdos, midias, aprovacoes }) {
    const obra = randomFrom(obras);
    const rdo = randomFrom(rdos);
    const media = randomFrom(midias);
    const approval = randomFrom(aprovacoes);
    const obraName = obra?.nome || 'obra sem identificacao';
    const rdoName = rdo?.id || 'RDO sem identificacao';
    const mediaName = media?.title || 'arquivo de midia';
    const approvalOwner = approval?.owner || 'Fiscalizacao';
    const approvalName = approval?.title || 'aprovacao em andamento';

    return [
      { id: `obra-avaliacao-${obra?.id ?? 'x'}`, title: 'Avaliacao pendente', body: `A obra ${obraName} esta faltando avaliacao operacional no painel.`, ctaLabel: 'Abrir obra', action: { kind: 'obra', obraId: obra?.id } },
      { id: `obra-midia-${obra?.id ?? 'x'}`, title: 'Midia pendente', body: `A obra ${obraName} ainda nao recebeu arquivo de midia no acompanhamento.`, ctaLabel: 'Ver obra', action: { kind: 'obra', obraId: obra?.id } },
      { id: `obra-supervisao-${obra?.id ?? 'x'}`, title: 'Supervisao faltando', body: `A obra ${obraName} esta aguardando supervisao registrada no sistema.`, ctaLabel: 'Abrir obra', action: { kind: 'obra', obraId: obra?.id } },
      { id: `obra-fiscalizacao-${obra?.id ?? 'x'}`, title: 'Fiscalizacao pendente', body: `A obra ${obraName} ainda nao teve fiscalizacao confirmada nesta rodada.`, ctaLabel: 'Ir para obra', action: { kind: 'obra', obraId: obra?.id } },
      { id: `rdo-pendente-${rdo?.id ?? 'x'}`, title: 'RDO aguardando', body: `O ${rdoName} da obra ${rdo?.obra || obraName} precisa de revisao.`, ctaLabel: 'Abrir RDO', action: { kind: 'screen', screen: 'RDO' } },
      { id: `apr-pendente-${approval?.id ?? 'x'}`, title: 'Aprovacao pendente', body: `${approvalName} ainda depende de validacao de ${approvalOwner}.`, ctaLabel: 'Abrir aprovacoes', action: { kind: 'screen', screen: 'Aprovacoes' } },
      { id: `arquivo-recente-${media?.id ?? 'x'}`, title: 'Arquivo pronto para consulta', body: `O arquivo ${mediaName} pode ser aberto agora para conferencia rapida.`, ctaLabel: 'Abrir arquivo', action: { kind: 'media', screen: 'Midias', url: media?.url } },
    ].filter((n) => {
      if (['obra'].includes(n.action.kind)) return Boolean(n.action.obraId);
      if (n.action.kind === 'media') return Boolean(n.action.url);
      return true;
    });
  }

  function currentCollections() {
    const obras = state.collections.obras.map(normalizeObra);
    const rdos = state.collections.rdos.map(normalizeRdo);
    const aprovacoes = state.collections.aprovacoes.map((item, index) => ({
      ...normalizeApproval(item, index),
      obraId: pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id),
      obra: toText(pick(item.obra_nome, item.obra, item.nome_obra, item.empreendimento, item.titulo), `Obra ${pick(item.obra_id, '-')}`),
      latitude: toCoordinate(pick(item.latitude, item.lat, item.gps_latitude, item.gpsLatitude)),
      longitude: toCoordinate(pick(item.longitude, item.lng, item.lon, item.gps_longitude, item.gpsLongitude)),
    }));
    const midias = state.collections.midias.map((item, index) => ({
      ...normalizeMedia(item, index),
      obraId: pick(item.obra_id, item.obraId, item.obra, item.empreendimento_id),
      obra: toText(pick(item.obra_nome, item.obra, item.nome_obra, item.empreendimento, item.titulo), `Obra ${pick(item.obra_id, '-')}`),
      latitude: toCoordinate(pick(item.latitude, item.lat, item.gps_latitude, item.gpsLatitude)),
      longitude: toCoordinate(pick(item.longitude, item.lng, item.lon, item.gps_longitude, item.gpsLongitude)),
    }));
    return { obras, rdos, aprovacoes, midias };
  }

  function buildDocuments(obras, rdos, midias) {
    const reports = buildPdfReports(obras, rdos, midias);
    return reports.map((report, index) => {
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
        ...(state.documentOverrides[baseDocument.id] || {}),
      };
    });
  }

  function setActiveItem(next) {
    state.activeItem = next;
    const url = new URL(window.location.href);
    url.searchParams.set('page', next);
    window.history.pushState({}, '', url);
    render();
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!response.ok) {
      const err = new Error((data && data.erro) || response.statusText || 'Erro de rede');
      err.payload = data;
      throw err;
    }
    return data;
  }

  async function loadAllCollections() {
    state.loading = true;
    state.errors = { obras: '', rdos: '', aprovacoes: '', midias: '' };
    render();

    const resources = ['obras', 'rdos', 'aprovacoes', 'midias'];
    const startedAt = new Date();
    const results = await Promise.all(resources.map(async (resource) => {
      try {
        const data = await fetchJson(`${apiBase}?resource=${encodeURIComponent(resource)}`);
        return { resource, status: 'fulfilled', rows: normalizeCollection(data) };
      } catch (error) {
        return { resource, status: 'rejected', error: getApiErrorMessage(error) };
      }
    }));

    const nextCollections = { obras: [], rdos: [], aprovacoes: [], midias: [] };
    const nextErrors = { obras: '', rdos: '', aprovacoes: '', midias: '' };
    const nextLogs = results.map((result, index) => {
      const time = new Date(startedAt.getTime() + index * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      if (result.status === 'fulfilled') {
        nextCollections[result.resource] = result.rows;
        return { id: `${result.resource}-${index + 1}`, level: 'Info', origin: result.resource.toUpperCase(), message: `${result.rows.length} registros carregados com sucesso.`, time };
      }
      nextErrors[result.resource] = result.error;
      return { id: `${result.resource}-${index + 1}`, level: 'Critico', origin: result.resource.toUpperCase(), message: `Falha ao carregar ${resourceLabel(result.resource)}: ${result.error}`, time };
    });

    state.collections = nextCollections;
    state.errors = nextErrors;
    state.requestLogs = nextLogs;
    state.loading = false;
    render();
  }

  async function handleMediaUpload(payload) {
    const formData = new FormData();
    formData.append('arquivo', payload.file);
    formData.append('descricao', payload.file.name);
    if (payload.obraId) formData.append('obra_id', payload.obraId);
    if (payload.rdoId) formData.append('rdo_id', payload.rdoId);
    const mime = payload.file.type?.toLowerCase() || '';
    formData.append('tipo', mime.startsWith('image/') ? 'IMAGEM' : mime.startsWith('video/') ? 'VIDEO' : 'DOCUMENTO');
    await fetchJson(uploadBase, { method: 'POST', body: formData });
    await loadAllCollections();
  }

  async function handleCreateRdo(payload) {
    await fetchJson(`${apiBase}?resource=rdos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await loadAllCollections();
  }

  async function handleCreateApproval(payload) {
    await fetchJson(`${apiBase}?resource=aprovacoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await loadAllCollections();
  }

  async function handleUpdateObra(id, payload) {
    await fetchJson(`${apiBase}?resource=obras&id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await loadAllCollections();
  }

  function openWorkModal(mode, obra) {
    state.workModal = { mode, obra };
    state.workModalTab = mode === 'history' ? 'history' : 'rdo';
    render();
  }

  function closeWorkModal() {
    state.workModal = null;
    state.authFeedback = '';
    render();
  }

  function openMediaMap(mediaItem) {
    if (!mediaItem?.latitude || !mediaItem?.longitude) {
      state.mapFocus = null;
    } else {
      state.mapFocus = {
        latitude: mediaItem.latitude,
        longitude: mediaItem.longitude,
        label: mediaItem.title,
        sublabel: mediaItem.meta,
        kind: 'media',
      };
    }
    setActiveItem('Mapa');
  }

  function navigateFromAssistant(action) {
    if (!action) return;
    if (action.kind === 'screen' && action.screen) {
      setActiveItem(action.screen);
      return;
    }
    if (action.kind === 'media') {
      if (action.url) window.open(action.url, '_blank', 'noopener,noreferrer');
      state.assistantNotification = null;
      render();
      return;
    }
    if (action.kind === 'obra') {
      setActiveItem('Obras');
      state.expandedObra = action.obraId;
      render();
    }
  }

  function renderSidebar() {
    const isMobile = window.innerWidth <= 991;
    const visible = isMobile && state.sidebarOpen ? 'is-open' : '';
    const collapsed = !isMobile && !state.sidebarOpen ? 'is-collapsed' : '';
    const items = menuItems.map((item) => {
      const active = state.activeItem === item.name ? 'is-active' : '';
      return `
        <button type="button" class="suape-sidebar__item ${active}" data-action="nav" data-page="${escapeHtml(item.name)}">
          <span class="suape-sidebar__icon"><i class="fa-solid ${item.icon}"></i></span>
          <span class="suape-sidebar__label ${state.sidebarOpen ? '' : 'd-none'}">${escapeHtml(item.name)}</span>
        </button>
      `;
    }).join('');

    return `
      <aside class="suape-sidebar ${collapsed} ${visible}">
        <div class="suape-sidebar__brand">
          <div class="d-flex align-items-center gap-3">
            <div class="suape-brand-dot"><i class="fa-solid fa-sun"></i></div>
            <div class="${state.sidebarOpen ? '' : 'd-none'}">
              <div class="suape-sidebar__brand-name">Suape RDO</div>
              <div class="suape-sidebar__brand-subtitle">Diario agil</div>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-outline-light rounded-circle" data-action="toggle-sidebar">
            <i class="fa-solid ${state.sidebarOpen ? 'fa-chevron-left' : 'fa-bars'}"></i>
          </button>
        </div>
        <nav class="suape-sidebar__nav d-grid gap-2">${items}</nav>
        <div class="suape-sidebar__footer">
          <div class="d-flex align-items-center gap-3 text-success ${state.sidebarOpen ? '' : 'justify-content-center'}">
            <span class="position-relative d-inline-flex" style="width:12px;height:12px;">
              <span class="position-absolute rounded-circle bg-success opacity-50" style="inset:0; animation: pulse 1.5s infinite;"></span>
              <span class="position-relative rounded-circle bg-success" style="width:12px;height:12px;"></span>
            </span>
            <span class="${state.sidebarOpen ? '' : 'd-none'} small fw-bold">Online</span>
          </div>
          <button type="button" class="btn btn-link text-light text-decoration-none p-0 mt-3 ${state.sidebarOpen ? '' : 'd-none'}" data-action="logout">
            <i class="fa-solid fa-right-from-bracket me-2"></i>Sair
          </button>
        </div>
      </aside>
    `;
  }

  function renderHeader() {
    return `
      <header class="suape-header">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-3">
          <div>
            <p class="suape-header__subtitle mb-1">${escapeHtml(headerSubtitleForPage(state.activeItem))}</p>
            <h1 class="suape-header__title">${escapeHtml(state.activeItem)}</h1>
          </div>
          <div class="d-flex flex-wrap gap-2 align-items-center">
            <button type="button" class="btn btn-outline-secondary suape-mobile-toggle" data-action="toggle-sidebar">
              <i class="fa-solid fa-bars"></i>
            </button>
            <a class="suape-action suape-action--gold" href="${escapeHtml(apkUrl)}" download>
              <i class="fa-solid fa-download"></i>Baixar app
            </a>
          </div>
        </div>
      </header>
    `;
  }

  function headerSubtitleForPage(page) {
    const map = {
      Obras: 'Status operacional / RDO',
      RDO: 'Diario de obras',
      Aprovacoes: 'Fila de validacao',
      Midias: 'Banco visual',
      Mapa: 'Localizacao geografica',
      Graficos: 'RDO e midias por obra',
      'Relatorio PDF': 'Lista simples por obra',
      Assinaturas: 'Fluxo mockado estilo Clicksign',
      'Log de erros': 'Saude da aplicacao',
    };
    return map[page] || 'Suape RDO';
  }

  function statCard(label, value, hint, tone = 'slate') {
    return `
      <div class="suape-card suape-stat p-4 is-${tone}">
        <div class="suape-stat__label">${escapeHtml(label)}</div>
        <div class="d-flex align-items-end justify-content-between gap-3 mt-2">
          <div class="suape-stat__value">${escapeHtml(value)}</div>
          ${hint ? `<small class="text-end text-muted fw-semibold">${escapeHtml(hint)}</small>` : ''}
        </div>
      </div>
    `;
  }

  function badge(label, tone = 'slate') {
    return `<span class="suape-badge suape-badge--${tone}">${escapeHtml(label)}</span>`;
  }

  function loadingRow(label) {
    return `<div class="suape-loading-row d-flex align-items-center gap-3"><span class="spinner-border spinner-border-sm text-warning"></span>${escapeHtml(label)}</div>`;
  }

  function emptyRow(label) {
    return `<div class="suape-empty"><i class="fa-solid fa-inbox text-3xl d-block mb-2"></i>${escapeHtml(label)}</div>`;
  }

  function renderObrasScreen(obras, loading, error) {
    const activeCount = obras.length;
    const totalRdos = obras.reduce((s, o) => s + (Number(o.rdos) || 0), 0);
    const pendingCount = obras.filter((o) => ['pendente', 'atras', 'aguard'].some((w) => o.status.toLowerCase().includes(w))).length;

    return `
      <div class="d-grid gap-3">
        <div class="d-grid gap-3" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
          ${statCard('Obras ativas', String(activeCount).padStart(2, '0'), 'Carregadas da API', 'amber')}
          ${statCard('RDOs totais', String(totalRdos), 'Somatorio dos registros', 'emerald')}
          ${statCard('Pendencias', String(pendingCount).padStart(2, '0'), 'Status em alerta', 'red')}
        </div>

        ${error ? `<div class="alert alert-danger border-0 shadow-sm rounded-4">${escapeHtml(error)}</div>` : ''}

        <div class="suape-panel">
          <div class="suape-panel__body p-0">
            ${loading ? loadingRow('Sincronizando obras com Suape...') : ''}
            ${!loading && obras.length === 0 && !error ? emptyRow('Nenhuma obra retornada pela API.') : ''}
            <div class="accordion accordion-flush" id="obrasAccordion">
              ${obras.map((obra) => {
                const expanded = state.expandedObra === obra.id;
                const collapseId = `obra-${String(obra.id).replace(/[^a-z0-9]+/gi, '-')}`;
                return `
                  <div class="border-bottom">
                    <div class="p-3 p-md-4 ${expanded ? 'bg-light' : ''}">
                      <div class="d-flex flex-wrap justify-content-between gap-3 align-items-center">
                        <div class="min-w-0">
                          ${badge(obra.status, obra.tone)}
                          <h2 class="h4 fw-black mt-2 mb-1 text-uppercase">${escapeHtml(obra.nome)}</h2>
                          <div class="text-uppercase small fw-bold text-muted">Contrato: ${escapeHtml(obra.contrato)}</div>
                        </div>
                        <div class="d-flex gap-2 flex-wrap">
                          <div class="text-center border rounded-4 p-3 bg-white">
                            <div class="small text-uppercase text-muted fw-black" style="font-size:10px;">Equipe</div>
                            <div class="fw-black">${escapeHtml(obra.equipe)} <span class="text-muted small">integrantes</span></div>
                          </div>
                          <div class="text-center border rounded-4 p-3 bg-white">
                            <div class="small text-uppercase text-muted fw-black" style="font-size:10px;">RDOs</div>
                            <div class="fw-black">${escapeHtml(obra.rdos)} <span class="text-muted small">registros</span></div>
                          </div>
                          <div class="text-center border rounded-4 p-3 bg-white">
                            <div class="small text-uppercase text-muted fw-black" style="font-size:10px;">Progresso</div>
                            <div class="fw-black">${escapeHtml(obra.progresso)} <span class="text-muted small">%</span></div>
                          </div>
                          <button type="button" class="btn btn-sm btn-light rounded-circle" data-action="toggle-obra" data-id="${escapeHtml(obra.id)}">
                            <i class="fa-solid fa-chevron-down ${expanded ? 'rotate-180' : ''}"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="collapse ${expanded ? 'show' : ''}" id="${collapseId}">
                      <div class="row g-0 border-top bg-white">
                        <div class="col-md-3">
                          <button type="button" class="w-100 btn btn-light border-0 rounded-0 py-4" data-action="open-rdo" data-id="${escapeHtml(obra.id)}">
                            <i class="fa-solid fa-file-circle-plus text-warning d-block mb-2 fs-5"></i><small class="fw-black text-uppercase">Novo RDO</small>
                          </button>
                        </div>
                        <div class="col-md-3">
                          <button type="button" class="w-100 btn btn-light border-0 rounded-0 py-4" data-action="open-history" data-id="${escapeHtml(obra.id)}">
                            <i class="fa-solid fa-clock-rotate-left text-muted d-block mb-2 fs-5"></i><small class="fw-black text-uppercase">Historico</small>
                          </button>
                        </div>
                        <div class="col-md-3">
                          <button type="button" class="w-100 btn btn-light border-0 rounded-0 py-4" data-action="open-edit" data-id="${escapeHtml(obra.id)}">
                            <i class="fa-solid fa-pen-to-square text-muted d-block mb-2 fs-5"></i><small class="fw-black text-uppercase">Editar obra</small>
                          </button>
                        </div>
                        <div class="col-md-3">
                          <button type="button" class="w-100 btn btn-light border-0 rounded-0 py-4" disabled>
                            <i class="fa-solid fa-trash-can text-danger-emphasis d-block mb-2 fs-5"></i><small class="fw-black text-uppercase">Excluir</small>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderRdoScreen(rdos, loading, error) {
    const processedCount = rdos.filter((r) => ['enviado', 'aprov', 'concl'].some((w) => r.status.toLowerCase().includes(w))).length;
    return `
      <div class="row g-4">
        <div class="col-lg-8">
          <div class="suape-panel">
            <div class="suape-panel__header d-flex justify-content-between align-items-center">
              <div>
                <div class="suape-header__subtitle mb-1">Lista recente</div>
                <h2 class="h3 fw-black mb-0">Registros da API</h2>
              </div>
              <span class="badge text-bg-light rounded-pill">${rdos.length} registros</span>
            </div>
            <div class="suape-panel__body">
              ${error ? `<div class="alert alert-danger border-0">${escapeHtml(error)}</div>` : ''}
              ${loading ? loadingRow('Carregando RDOs da API...') : ''}
              ${!loading && rdos.length === 0 && !error ? emptyRow('Nenhum RDO retornado pela API.') : ''}
              <div class="d-grid gap-2">
                ${rdos.map((item) => `
                  <article class="suape-list__item">
                    <div class="d-flex flex-wrap justify-content-between gap-3">
                      <div>
                        <div class="d-flex gap-2 flex-wrap">${badge(item.id)}${badge(item.status, 'amber')}</div>
                        <h3 class="h5 fw-black text-uppercase mt-2 mb-1">${escapeHtml(item.obra)}</h3>
                        <div class="text-muted">${escapeHtml(item.descricao)}</div>
                      </div>
                      <div class="text-end">
                        <div class="small text-uppercase text-muted fw-black">${escapeHtml(item.data)}</div>
                        <div class="fw-bold">${escapeHtml(item.turno)}</div>
                      </div>
                    </div>
                  </article>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="suape-panel mb-4">
            <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Resumo</div></div>
            <div class="suape-panel__body">
              <div class="d-grid gap-3">
                <div>
                  <div class="d-flex justify-content-between"><span class="fw-bold text-muted">Processados</span><strong>${processedCount}</strong></div>
                  <div class="progress mt-2" style="height:6px;"><div class="progress-bar bg-warning" style="width:78%"></div></div>
                </div>
                <div>
                  <div class="d-flex justify-content-between"><span class="fw-bold text-muted">Pendentes</span><strong>${Math.max(rdos.length - processedCount, 0)}</strong></div>
                  <div class="progress mt-2" style="height:6px;"><div class="progress-bar bg-secondary" style="width:22%"></div></div>
                </div>
              </div>
            </div>
          </div>
          <div class="suape-panel suape-footer-card">
            <div class="suape-panel__header border-0"><div class="text-white-50 small text-uppercase fw-black" style="letter-spacing:.35em;">Fluxo rapido</div></div>
            <div class="suape-panel__body">
              <div class="d-grid gap-2">
                ${['Coletar dados da obra', 'Registrar equipe e ocorrencias', 'Enviar para aprovacao'].map((s, i) => `
                  <div class="d-flex align-items-center gap-3 p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10">
                    <span class="badge rounded-circle text-dark bg-warning" style="width:24px;height:24px;display:grid;place-items:center;">${i + 1}</span>
                    <span class="text-white-75">${escapeHtml(s)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAprovacoesScreen(aprovacoes, loading, error) {
    const waitingCount = aprovacoes.filter((a) => ['pend', 'aguard', 'rascunho'].some((w) => a.status.toLowerCase().includes(w))).length;
    return `
      <div class="row g-4">
        <div class="col-lg-5">
          <div class="suape-panel">
            <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Pendencias</div></div>
            <div class="suape-panel__body">
              ${error ? `<div class="alert alert-danger border-0">${escapeHtml(error)}</div>` : ''}
              ${loading ? loadingRow('Carregando aprovacoes...') : ''}
              ${!loading && aprovacoes.length === 0 && !error ? emptyRow('Nenhuma aprovacao retornada.') : ''}
              <div class="d-grid gap-2">
                ${aprovacoes.map((item) => `
                  <div class="suape-list__item">
                    <div class="d-flex justify-content-between gap-3">
                      <div>
                        ${badge(item.id)}
                        <h3 class="h6 fw-black mt-2 mb-1">${escapeHtml(item.title)}</h3>
                        <div class="text-muted small">${escapeHtml(item.owner)}</div>
                      </div>
                      ${badge(item.status, 'amber')}
                    </div>
                    <div class="d-flex justify-content-between border-top pt-2 mt-2 small text-muted fw-bold">
                      <span>Prioridade: ${escapeHtml(item.priority)}</span>
                      <span>${escapeHtml(item.date)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="suape-panel mb-4">
            <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Painel de status</div></div>
            <div class="suape-panel__body">
              <div class="row g-3">
                <div class="col-md-4">${statCard('Esperando', String(waitingCount), 'Na fila', 'amber')}</div>
                <div class="col-md-4">${statCard('Aprovados', String(aprovacoes.length - waitingCount), 'Concluidos', 'emerald')}</div>
                <div class="col-md-4">${statCard('Total', String(aprovacoes.length), 'Registros API', 'red')}</div>
              </div>
            </div>
          </div>
          <div class="suape-panel suape-footer-card">
            <div class="suape-panel__header border-0"><div class="text-white-50 small text-uppercase fw-black" style="letter-spacing:.35em;">Checklist de validacao</div></div>
            <div class="suape-panel__body">
              <div class="d-grid gap-2">
                ${['Conferir assinaturas', 'Validar fotos obrigatorias', 'Cruzar medicao e contrato', 'Liberar para proxima etapa'].map((step, i) => `
                  <div class="d-flex align-items-center gap-3 p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10">
                    <span class="badge rounded-circle text-dark bg-warning" style="width:24px;height:24px;display:grid;place-items:center;">${i + 1}</span>
                    <span class="text-white-75">${escapeHtml(step)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMidiasScreen(midias, loading, error, obras, rdos) {
    const draft = state.midiasDraft;
    const optionsObras = obras.map((o) => `<option value="${escapeHtml(o.id)}" ${String(draft.obraId) === String(o.id) ? 'selected' : ''}>${escapeHtml(o.nome)}</option>`).join('');
    const optionsRdos = rdos.map((r) => `<option value="${escapeHtml(r.id)}" ${String(draft.rdoId) === String(r.id) ? 'selected' : ''}>${escapeHtml(r.id)} • ${escapeHtml(r.obra)}</option>`).join('');

    return `
      <div class="row g-4">
        <div class="col-lg-7">
          <div class="suape-gallery">
            ${error ? `<div class="suape-card p-3">${escapeHtml(error)}</div>` : ''}
            ${loading ? `<div class="suape-card p-3">${loadingRow('Carregando midias da API...')}</div>` : ''}
            ${!loading && midias.length === 0 && !error ? `<div class="suape-card p-3">${emptyRow('Nenhuma midia retornada.')}</div>` : ''}
            ${midias.map((item) => `
              <article class="suape-card suape-gallery__card">
                <a href="${item.url || '#'}" target="${item.url ? '_blank' : '_self'}" rel="noreferrer" class="text-decoration-none text-dark">
                  <div class="suape-gallery__media">
                    ${item.kind === 'image' && (item.previewUrl || item.url) ? `<img src="${escapeHtml(item.previewUrl || item.url)}" alt="${escapeHtml(item.title)}">` : ''}
                    ${item.kind === 'video' && item.url ? `<video src="${escapeHtml(item.url)}" controls preload="metadata"></video>` : ''}
                    ${item.kind === 'document' ? `<div class="d-grid place-items-center h-100 text-center text-white"><div><i class="fa-solid fa-file-lines fs-1 text-warning"></i><div class="mt-3 small fw-black text-uppercase">Abrir documento</div></div></div>` : ''}
                    <div class="suape-gallery__overlay">
                      <div class="suape-gallery__meta">
                        ${badge(item.kind.toUpperCase())}
                        <div class="fw-black">${escapeHtml(item.title)}</div>
                        <div class="small text-white-50">${escapeHtml(item.meta)}</div>
                      </div>
                      <div class="text-end">
                        ${item.kind === 'image' && item.latitude && item.longitude ? `<button type="button" class="btn btn-sm btn-dark bg-opacity-50 border-white border-opacity-25 text-white" data-action="open-map-media" data-id="${escapeHtml(item.id)}"><i class="fa-solid fa-map-location-dot me-1"></i>Ver mapa</button>` : ''}
                      </div>
                    </div>
                  </div>
                </a>
                <div class="p-3">
                  <div class="fw-black text-truncate">${escapeHtml(item.title)}</div>
                  <div class="text-muted small text-truncate">${escapeHtml(item.meta)}</div>
                  ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" class="small fw-bold text-primary text-decoration-underline mt-2 d-inline-block">Abrir arquivo</a>` : '<div class="small text-muted mt-2">Sem link disponivel</div>'}
                </div>
              </article>
            `).join('')}
          </div>
        </div>
        <div class="col-lg-5">
          <div class="suape-upload ${draft.dropActive ? 'is-drop-active' : ''}" data-dropzone="media">
            <div class="small text-uppercase text-muted fw-black" style="letter-spacing:.35em;">Upload rapido</div>
            <button type="button" class="btn btn-light border rounded-4 w-100 py-4 mt-3" data-action="pick-file">
              <i class="fa-solid fa-cloud-arrow-up fs-1 ${draft.dropActive ? 'text-warning' : 'text-muted'}"></i>
              <div class="fw-black mt-3">Arraste aqui</div>
              <div class="small text-muted">Imagem, video ou documento</div>
            </button>
            <input type="file" class="d-none" id="media-file-input" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg">
            <input type="file" class="d-none" id="media-camera-input" accept="image/*,video/*" capture="environment">
            ${draft.file ? `
              <form class="mt-3 d-grid gap-3" data-form="media-upload">
                <div class="border rounded-4 p-3 bg-white">
                  <div class="small text-uppercase text-muted fw-black">Arquivo selecionado</div>
                  <div class="fw-bold text-truncate mt-1">${escapeHtml(draft.file.name)}</div>
                  <div class="small text-muted">${escapeHtml(draft.file.type || '—')} • ${(draft.file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
                <div>
                  <label class="form-label small text-uppercase text-muted fw-black" style="letter-spacing:.3em;">Obra</label>
                  <select class="form-select" name="obraId" required>${`<option value="">Selecione a obra</option>` + optionsObras}</select>
                </div>
                <div>
                  <label class="form-label small text-uppercase text-muted fw-black" style="letter-spacing:.3em;">RDO</label>
                  <select class="form-select" name="rdoId" required>${`<option value="">Selecione o RDO</option>` + optionsRdos}</select>
                </div>
                ${draft.feedback ? `<div class="alert alert-light border small mb-0">${escapeHtml(draft.feedback)}</div>` : ''}
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-outline-secondary flex-fill" data-action="clear-upload">Limpar</button>
                  <button type="submit" class="btn btn-dark flex-fill" ${draft.submitting ? 'disabled' : ''}>${draft.submitting ? 'Enviando...' : 'Enviar para API'}</button>
                </div>
              </form>
            ` : ''}
            <div class="d-grid gap-2 mt-3">
              <button type="button" class="btn btn-outline-secondary" data-action="pick-camera"><i class="fa-solid fa-camera me-2"></i>Abrir camera</button>
              <button type="button" class="btn btn-outline-secondary" data-action="pick-file"><i class="fa-solid fa-folder-open me-2"></i>Escolher arquivo</button>
            </div>
          </div>
          <div class="suape-panel suape-footer-card mt-4">
            <div class="suape-panel__header border-0"><div class="text-white-50 small text-uppercase fw-black" style="letter-spacing:.35em;">Indicadores</div></div>
            <div class="suape-panel__body">
              <div class="d-flex justify-content-between"><span class="text-white-75">Arquivos recebidos</span><strong class="fs-4">${midias.length}</strong></div>
              <div class="progress my-3" style="height:6px;"><div class="progress-bar bg-warning" style="width:68%"></div></div>
              <div class="d-flex justify-content-between"><span class="text-white-75">Origem</span><strong>API PHP</strong></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderGraficosScreen(obras, rdos, midias, loading, error) {
    const ranking = buildRdoRanking(obras, rdos);
    const mediaDist = buildMediaDistribution(midias);
    const topObra = ranking[0];
    return `
      <div class="d-grid gap-4">
        <div class="row g-3">
          <div class="col-md-4">${statCard('Total de obras', String(obras.length).padStart(2, '0'), 'Base API', 'amber')}</div>
          <div class="col-md-4">${statCard('Total de RDOs', String(rdos.length).padStart(2, '0'), 'Todos registros', 'emerald')}</div>
          <div class="col-md-4">${statCard('Top obra', topObra ? String(topObra.count) : '00', topObra?.name || 'Sem dados', 'red')}</div>
        </div>
        ${error ? `<div class="alert alert-danger border-0 shadow-sm rounded-4">${escapeHtml(error)}</div>` : ''}
        ${loading ? loadingRow('Carregando graficos da API...') : ''}
        ${!loading && ranking.length === 0 && !error ? emptyRow('Nenhum RDO encontrado para montar o grafico.') : ''}
        <div class="row g-4">
          <div class="col-xl-8">
            <div class="suape-panel">
              <div class="suape-panel__header d-flex justify-content-between align-items-center">
                <div>
                  <div class="suape-header__subtitle mb-1">Ranking de RDOs</div>
                  <h2 class="h3 fw-black mb-0">Obras com mais registros</h2>
                </div>
                ${badge(`Top ${ranking.length}`, 'slate')}
              </div>
              <div class="suape-panel__body">
                <canvas id="rdoChart" height="340"></canvas>
              </div>
            </div>
          </div>
          <div class="col-xl-4 d-grid gap-4">
            <div class="suape-panel">
              <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Distribuicao de midias</div></div>
              <div class="suape-panel__body">
                <canvas id="mediaChart" height="240"></canvas>
              </div>
            </div>
            <div class="suape-panel suape-footer-card">
              <div class="suape-panel__header border-0"><div class="text-white-50 small text-uppercase fw-black" style="letter-spacing:.35em;">Ranking de midias</div></div>
              <div class="suape-panel__body d-grid gap-2">
                ${mediaDist.map((item, i) => `
                  <div class="d-flex align-items-center gap-3 p-2 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10">
                    <div class="rounded-circle d-grid place-items-center fw-black text-dark" style="width:34px;height:34px;background:${chartColors[i % chartColors.length]};">${i + 1}</div>
                    <div class="flex-grow-1 min-w-0">
                      <div class="fw-semibold text-white text-truncate">${escapeHtml(item.name)}</div>
                      <div class="small text-white-50">${item.count} arquivos</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderMapaScreen(midias, aprovacoes, loading, error) {
    const points = buildMapPoints(midias, aprovacoes);
    const hasSelectedPoint = Boolean(state.mapFocus?.latitude && state.mapFocus?.longitude);
    const mapCenter = hasSelectedPoint
      ? [state.mapFocus.latitude, state.mapFocus.longitude]
      : points.allPoints.length
        ? [
          points.allPoints.reduce((s, p) => s + p.latitude, 0) / points.allPoints.length,
          points.allPoints.reduce((s, p) => s + p.longitude, 0) / points.allPoints.length,
        ]
        : [-8.31, -34.96];
    const mapZoom = hasSelectedPoint ? 16 : points.allPoints.length ? 10 : 8;
    const centerLabel = hasSelectedPoint
      ? 'Ponto selecionado da midia'
      : points.allPoints.length
        ? `${points.allPoints.length} pontos georreferenciados`
        : 'Sem coordenadas enviadas';

    return `
      <div class="row g-4">
        <div class="col-xl-8">
          <div class="suape-panel p-3">
            <div class="d-flex flex-wrap justify-content-between gap-3 align-items-center mb-3">
              <div>
                <div class="suape-header__subtitle mb-1">Mapa interativo</div>
                <h2 class="h4 fw-black mb-0">Midias e aprovacoes no territorio</h2>
              </div>
              <div class="d-flex gap-2 flex-wrap">
                ${badge(`Midias: ${points.mediaPoints.length}`, 'amber')}
                ${badge(`Aprovacoes: ${points.approvalPoints.length}`, 'sky')}
              </div>
            </div>
            ${error ? `<div class="alert alert-danger border-0">${escapeHtml(error)}</div>` : ''}
            ${loading ? `<div class="mb-3">${loadingRow('Carregando pontos geograficos...')}</div>` : ''}
            <div class="position-relative">
              <div id="leaflet-map" class="suape-map"></div>
              <div class="position-absolute top-0 start-0 m-3 suape-badge suape-badge--slate">${escapeHtml(centerLabel)}</div>
              ${!points.allPoints.length ? `
                <div class="position-absolute inset-0 d-flex align-items-center justify-content-center bg-dark bg-opacity-25">
                  <div class="suape-card p-4 text-center" style="max-width:320px;">
                    <i class="fa-solid fa-map fs-1 text-muted"></i>
                    <div class="small text-uppercase text-muted fw-black mt-3" style="letter-spacing:.35em;">Mapa vazio</div>
                    <div class="fw-bold mt-2">Nenhuma midia ou aprovacao trouxe coordenadas para o mapa.</div>
                  </div>
                </div>` : ''}
            </div>
          </div>
        </div>
        <div class="col-xl-4 d-grid gap-4">
          <div class="suape-panel">
            <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Legenda</div></div>
            <div class="suape-panel__body d-grid gap-2">
              <div class="d-flex align-items-center gap-3 p-3 rounded-4 border">
                <span class="rounded-circle d-inline-block" style="width:14px;height:14px;background:#f5c518;box-shadow:0 0 0 4px rgba(245,197,24,.2);"></span>
                <div><div class="fw-bold">Arquivos de midia</div><div class="small text-muted">Marcadores amarelos</div></div>
              </div>
              <div class="d-flex align-items-center gap-3 p-3 rounded-4 border">
                <span class="rounded-circle d-inline-block" style="width:14px;height:14px;background:#0ea5e9;box-shadow:0 0 0 4px rgba(14,165,233,.2);"></span>
                <div><div class="fw-bold">Aprovacoes</div><div class="small text-muted">Marcadores azuis</div></div>
              </div>
            </div>
          </div>
          <div class="suape-panel suape-footer-card">
            <div class="suape-panel__header border-0"><div class="text-white-50 small text-uppercase fw-black" style="letter-spacing:.35em;">Resumo</div></div>
            <div class="suape-panel__body d-grid gap-3">
              ${[['Pontos de midia', points.mediaPoints.length], ['Pontos de aprovacao', points.approvalPoints.length], ['Total no mapa', points.allPoints.length]].map(([k, v]) => `
                <div class="d-flex justify-content-between border-bottom border-white border-opacity-10 pb-2">
                  <span class="text-white-75">${escapeHtml(k)}</span><strong>${v}</strong>
                </div>
              `).join('')}
            </div>
          </div>
          ${points.allPoints.length ? `
            <div class="suape-panel">
              <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Ultimos pontos</div></div>
              <div class="suape-panel__body d-grid gap-2">
                ${[...points.mediaPoints.slice(0, 3), ...points.approvalPoints.slice(0, 3)].map((p) => `
                  <div class="border rounded-4 p-3">
                    <div class="fw-bold text-truncate">${escapeHtml(p.label)}</div>
                    <div class="small text-muted">${p.kind === 'media' ? 'Midia' : 'Aprovacao'} • ${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}</div>
                  </div>
                `).join('')}
              </div>
            </div>` : ''}
        </div>
      </div>
    `;
  }

  function renderRelatorioScreen(obras, rdos, midias, loading, error) {
    const reports = buildPdfReports(obras, rdos, midias);
    return `
      <div class="suape-panel">
        <div class="suape-panel__header d-flex justify-content-between align-items-center">
          <div>
            <div class="suape-header__subtitle mb-1">Lista simples por obra</div>
            <h2 class="h3 fw-black mb-0">Relatorio PDF</h2>
          </div>
          ${badge(`${reports.length} obras`, 'amber')}
        </div>
        <div class="suape-panel__body">
          ${error ? `<div class="alert alert-danger border-0">${escapeHtml(error)}</div>` : ''}
          ${loading ? loadingRow('Carregando obras para o relatorio...') : ''}
          ${!loading && reports.length === 0 && !error ? emptyRow('Nenhuma obra encontrada para gerar PDF.') : ''}
          <div class="d-grid gap-2">
            ${reports.map((report) => `
              <div class="d-flex flex-wrap justify-content-between gap-3 align-items-center border rounded-4 p-3">
                <div class="min-w-0"><div class="fw-black text-uppercase">${escapeHtml(report.nome)}</div></div>
                <button type="button" class="btn btn-dark btn-sm" data-action="print-report" data-id="${escapeHtml(report.id)}"><i class="fa-solid fa-file-pdf me-2"></i>Gerar PDF</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function toneForStatus(status) {
    if (status === 'signed') return 'emerald';
    if (status === 'sent') return 'sky';
    return 'amber';
  }

  function renderAssinaturasScreen(obras, rdos, midias, loading, error) {
    const documents = buildDocuments(obras, rdos, midias);
    const selectedDocument = documents.find((document) => document.id === state.selectedDocumentId) || documents[0] || null;
    if (!state.selectedDocumentId && selectedDocument) state.selectedDocumentId = selectedDocument.id;

    const toneForDoc = (status) => (status === 'signed' ? 'emerald' : status === 'sent' ? 'sky' : 'amber');

    return `
      <div class="row g-4">
        <div class="col-xl-5">
          <div class="suape-panel">
            <div class="suape-panel__header d-flex justify-content-between align-items-center">
              <div>
                <div class="suape-header__subtitle mb-1">Documentos</div>
                <h2 class="h4 fw-black mb-0">Fila de assinatura</h2>
              </div>
              ${badge(String(documents.length), 'sky')}
            </div>
            <div class="suape-panel__body">
              ${error ? `<div class="alert alert-danger border-0">${escapeHtml(error)}</div>` : ''}
              ${loading ? loadingRow('Montando envelopes mockados...') : ''}
              ${!loading && documents.length === 0 && !error ? emptyRow('Nenhum documento disponivel para assinatura.') : ''}
              <div class="d-grid gap-2">
                ${documents.map((document) => `
                  <button type="button" class="btn text-start border rounded-4 p-3 ${state.selectedDocumentId === document.id ? 'border-warning bg-warning-subtle' : 'bg-light'}" data-action="select-document" data-id="${escapeHtml(document.id)}">
                    <div class="d-flex justify-content-between gap-3">
                      <div class="min-w-0">
                        <div class="fw-black text-truncate">${escapeHtml(document.report.nome)}</div>
                        <div class="small text-muted">${escapeHtml(document.envelopeId)} • ${document.report.totalRdos} RDOs • ${document.report.totalMidias} midias</div>
                      </div>
                      ${badge(document.status === 'signed' ? 'Concluido' : document.status === 'sent' ? 'Enviado' : 'Pendente', toneForDoc(document.status))}
                    </div>
                  </button>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="col-xl-7 d-grid gap-4">
          ${selectedDocument ? `
            <div class="suape-panel">
              <div class="suape-panel__header d-flex flex-wrap justify-content-between align-items-start gap-3">
                <div>
                  <div class="suape-header__subtitle mb-1">Envelope mockado</div>
                  <h2 class="h3 fw-black mb-1">${escapeHtml(selectedDocument.report.nome)}</h2>
                  <div class="text-muted">Contrato: ${escapeHtml(selectedDocument.report.contrato)}</div>
                </div>
                <div class="d-flex flex-wrap gap-2">
                  <button type="button" class="btn btn-outline-secondary btn-sm" data-action="print-report" data-id="${escapeHtml(selectedDocument.report.id)}"><i class="fa-solid fa-file-pdf me-2"></i>Ver PDF</button>
                  <button type="button" class="btn btn-warning btn-sm" data-action="send-envelope" data-id="${escapeHtml(selectedDocument.id)}"><i class="fa-solid fa-paper-plane me-2"></i>Enviar envelope</button>
                  <button type="button" class="btn btn-dark btn-sm" data-action="open-auth" data-id="${escapeHtml(selectedDocument.id)}"><i class="fa-solid fa-signature me-2"></i>Assinar agora</button>
                </div>
              </div>
              <div class="suape-panel__body">
                <div class="row g-3">
                  <div class="col-md-4"><div class="border rounded-4 p-3 bg-light"><div class="small text-uppercase text-muted fw-black">Status</div><div class="fw-black mt-1">${selectedDocument.status === 'signed' ? 'Concluido' : selectedDocument.status === 'sent' ? 'Em andamento' : 'Rascunho'}</div></div></div>
                  <div class="col-md-4"><div class="border rounded-4 p-3 bg-light"><div class="small text-uppercase text-muted fw-black">Assinantes</div><div class="fw-black mt-1">${selectedDocument.signers.length}</div></div></div>
                  <div class="col-md-4"><div class="border rounded-4 p-3 bg-light"><div class="small text-uppercase text-muted fw-black">Autenticacao</div><div class="fw-black mt-1">${selectedDocument.authStatus === 'authenticated' ? 'Validada' : 'Pendente'}</div></div></div>
                </div>
              </div>
            </div>
            <div class="row g-4">
              <div class="col-lg-6">
                <div class="suape-panel">
                  <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Assinantes</div></div>
                  <div class="suape-panel__body d-grid gap-2">
                    ${selectedDocument.signers.map((signer) => `
                      <div class="border rounded-4 p-3 bg-light">
                        <div class="d-flex justify-content-between gap-3">
                          <div>
                            <div class="fw-black">${escapeHtml(signer.name)}</div>
                            <div class="small text-muted">${escapeHtml(signer.role)}</div>
                            <div class="small text-muted">${escapeHtml(signer.email)}</div>
                          </div>
                          ${badge(signer.status === 'signed' ? 'Assinado' : signer.status === 'sent' ? 'Recebido' : 'Pendente', toneForStatus(signer.status === 'pending' ? 'pending' : signer.status))}
                        </div>
                        <div class="progress mt-3" style="height:8px;">
                          <div class="progress-bar ${signer.status === 'signed' ? 'bg-success' : signer.status === 'sent' ? 'bg-info' : 'bg-warning'}" style="width:${signer.status === 'signed' ? '100%' : signer.status === 'sent' ? '66%' : '25%'}"></div>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
              <div class="col-lg-6">
                <div class="suape-panel">
                  <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Autenticacao fake</div><h3 class="h5 fw-black mb-0">Jornada completa do assinante</h3></div>
                  <div class="suape-panel__body d-grid gap-2">
                    ${['Recebe convite por email mockado', 'Abre a pagina de autenticacao fake', 'Confirma email e CPF', 'Digita codigo OTP simulado', 'Aceita o termo e conclui a assinatura'].map((step, index) => `
                      <div class="d-flex align-items-start gap-3 p-3 rounded-4 border bg-light">
                        <div class="rounded-circle bg-dark text-white d-grid place-items-center fw-black" style="width:28px;height:28px;">${index + 1}</div>
                        <div class="pt-1 small text-muted">${escapeHtml(step)}</div>
                      </div>
                    `).join('')}
                  </div>
                </div>
              </div>
            </div>
            <div class="suape-panel">
              <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Timeline mockada</div></div>
              <div class="suape-panel__body d-grid gap-2">
                ${selectedDocument.timeline.map((event) => `
                  <div class="border rounded-4 p-3 bg-light">
                    <div class="d-flex justify-content-between gap-2 align-items-center">
                      <div class="fw-black">${escapeHtml(event.label)}</div>
                      ${badge(event.tone, event.tone === 'emerald' ? 'emerald' : event.tone === 'sky' ? 'sky' : event.tone === 'amber' ? 'amber' : 'slate')}
                    </div>
                    <div class="small text-muted mt-2">${escapeHtml(event.detail)}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : emptyRow('Selecione um documento para acompanhar a assinatura.')}
        </div>
      </div>
    `;
  }

  function renderLogErrosScreen(requestLogs) {
    const critCount = requestLogs.filter((l) => l.level === 'Critico').length;
    const infoCount = requestLogs.filter((l) => l.level === 'Info').length;
    const alertCount = requestLogs.filter((l) => l.level === 'Alerta').length;
    const toneCls = (level) => (level === 'Critico' ? 'danger' : level === 'Alerta' ? 'warning' : 'success');

    return `
      <div class="row g-4">
        <div class="col-lg-7">
          <div class="suape-panel">
            <div class="suape-panel__header d-flex justify-content-between align-items-center gap-3">
              <div>
                <div class="suape-header__subtitle mb-1">Eventos recentes</div>
                <h2 class="h3 fw-black mb-0">Chamadas da API</h2>
              </div>
              ${critCount > 0 ? badge(`${critCount} erro(s)`, 'red') : ''}
            </div>
            <div class="suape-panel__body">
              ${requestLogs.length === 0 ? emptyRow('Nenhum evento de API registrado ainda.') : ''}
              <div class="d-grid gap-2">
                ${requestLogs.map((item) => `
                  <div class="border rounded-4 p-3">
                    <div class="d-flex flex-wrap justify-content-between gap-3">
                      <div>
                        <div class="d-flex flex-wrap gap-2 align-items-center">${badge(item.id)}<span class="badge text-bg-${toneCls(item.level)}">${escapeHtml(item.level)}</span></div>
                        <div class="fw-black mt-2">${escapeHtml(item.message)}</div>
                        <div class="small text-muted">Origem: ${escapeHtml(item.origin)}</div>
                      </div>
                      <div class="text-muted small fw-bold">${escapeHtml(item.time)}</div>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-5 d-grid gap-4">
          <div class="suape-panel">
            <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Status geral</div></div>
            <div class="suape-panel__body d-grid gap-3">
              <div class="suape-card p-4">${statCard('Criticos', String(critCount).padStart(2, '0'), 'Falhas na integracao', 'red')}</div>
              <div class="suape-card p-4">${statCard('Infos', String(infoCount).padStart(2, '0'), 'Chamadas bem sucedidas', 'emerald')}</div>
              <div class="suape-card p-4">${statCard('Alertas', String(alertCount).padStart(2, '0'), 'Ocorrencias intermediarias', 'amber')}</div>
            </div>
          </div>
          <div class="suape-panel suape-footer-card">
            <div class="suape-panel__header border-0"><div class="text-white-50 small text-uppercase fw-black" style="letter-spacing:.35em;">Acoes recomendadas</div></div>
            <div class="suape-panel__body d-grid gap-2">
              ${['Reprocessar chamadas com erro', 'Validar disponibilidade do endpoint', 'Revisar dados retornados pelo PHP'].map((s) => `
                <div class="d-flex align-items-center gap-3 p-3 rounded-4 bg-white bg-opacity-10 border border-white border-opacity-10">
                  <i class="fa-solid fa-chevron-right text-warning small"></i>
                  <span class="text-white-75">${escapeHtml(s)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPage() {
    const { obras, rdos, aprovacoes, midias } = currentCollections();
    switch (state.activeItem) {
      case 'RDO': return renderRdoScreen(rdos, state.loading, state.errors.rdos);
      case 'Aprovacoes': return renderAprovacoesScreen(aprovacoes, state.loading, state.errors.aprovacoes);
      case 'Midias': return renderMidiasScreen(midias, state.loading, state.errors.midias, obras, rdos);
      case 'Mapa': return renderMapaScreen(midias, aprovacoes, state.loading, state.errors.midias || state.errors.aprovacoes);
      case 'Graficos': return renderGraficosScreen(obras, rdos, midias, state.loading, state.errors.rdos || state.errors.obras || state.errors.midias);
      case 'Relatorio PDF': return renderRelatorioScreen(obras, rdos, midias, state.loading, state.errors.rdos || state.errors.obras || state.errors.midias);
      case 'Assinaturas': return renderAssinaturasScreen(obras, rdos, midias, state.loading, state.errors.rdos || state.errors.obras || state.errors.midias);
      case 'Log de erros': return renderLogErrosScreen(state.requestLogs);
      case 'Obras':
      default:
        return renderObrasScreen(obras, state.loading, state.errors.obras);
    }
  }

  function renderModal() {
    const labelCls = 'form-label small text-uppercase text-muted fw-black';
    const inputCls = 'form-control rounded-4';
    const hasWorkModal = Boolean(state.workModal && state.workModal.obra);
    const { obras, rdos, aprovacoes, midias } = currentCollections();
    const workHtml = hasWorkModal ? (() => {
      const obra = state.workModal.obra;
      const obraRdos = rdos.filter((r) => String(r.obraId) === String(obra.id) || r.obra === obra.nome);
      const obraMidias = midias.filter((m) => String(m.obraId) === String(obra.id) || m.obra === obra.nome);
      const obraAprovacoes = aprovacoes.filter((a) => String(a.obraId) === String(obra.id) || a.obra === obra.nome);
      const historyItems = [
        ...obraAprovacoes.map((a) => ({ id: `APR-${a.id}`, type: 'Aprovacao', title: a.title, date: a.date })),
        ...obraMidias.map((m) => ({ id: `MID-${m.id}`, type: 'Midia', title: m.title, date: m.meta })),
      ];
      return `
        <div class="suape-modal__backdrop">
          <div class="suape-modal__dialog">
            <div class="border-bottom px-4 py-3 d-flex justify-content-between align-items-start gap-3">
              <div>
                <div class="suape-header__subtitle mb-1">${state.workModal.mode === 'history' ? 'Historico da obra' : state.workModal.mode === 'edit' ? 'Editar obra' : 'Novo registro'}</div>
                <h2 class="h3 fw-black mb-1 text-uppercase">${escapeHtml(obra.nome)}</h2>
                <div class="text-muted">Contrato: ${escapeHtml(obra.contrato)}</div>
              </div>
              <button type="button" class="btn btn-outline-secondary rounded-circle" data-action="close-modal"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="border-bottom px-4 pt-3">
              ${state.workModal.mode === 'rdo' ? `
                <ul class="nav nav-tabs suape-pill-nav border-0">
                  <li class="nav-item"><button class="nav-link ${state.workModalTab === 'rdo' ? 'active' : ''}" data-action="set-work-tab" data-tab="rdo">Novo RDO</button></li>
                  <li class="nav-item"><button class="nav-link ${state.workModalTab === 'media' ? 'active' : ''}" data-action="set-work-tab" data-tab="media">Adicionar Midia</button></li>
                  <li class="nav-item"><button class="nav-link ${state.workModalTab === 'approval' ? 'active' : ''}" data-action="set-work-tab" data-tab="approval">Aprovacao</button></li>
                </ul>
              ` : ''}
              ${state.workModal.mode === 'history' ? `<button type="button" class="btn btn-sm btn-outline-primary mb-2" data-action="open-map-history"><i class="fa-solid fa-map-location-dot me-2"></i>Ver no mapa</button>` : ''}
            </div>
            <div class="suape-modal__body p-4">
              <div class="row g-4">
                <div class="col-lg-7">
                  ${state.workModal.mode === 'rdo' && state.workModalTab === 'rdo' ? `
                    <form class="suape-card p-4" data-form="create-rdo">
                      <div class="${labelCls}">Cadastro de RDO</div>
                      <div class="row g-3 mt-1">
                        <div class="col-md-6">
                          <label class="${labelCls}">Data</label>
                          <input type="date" name="data_rdo" class="${inputCls}" value="${new Date().toISOString().slice(0, 10)}" required>
                        </div>
                        <div class="col-md-6">
                          <label class="${labelCls}">Status</label>
                          <select name="status" class="${inputCls}">
                            <option value="RASCUNHO">Rascunho</option>
                            <option value="ENVIADO">Enviado</option>
                            <option value="APROVADO">Aprovado</option>
                          </select>
                        </div>
                        <div class="col-12">
                          <label class="${labelCls}">Atividades</label>
                          <textarea name="atividades" rows="4" class="${inputCls}" required></textarea>
                        </div>
                        <div class="col-12">
                          <label class="${labelCls}">Comentarios</label>
                          <textarea name="comentarios" rows="3" class="${inputCls}"></textarea>
                        </div>
                      </div>
                      <button type="submit" class="btn btn-dark mt-3">Salvar RDO</button>
                    </form>
                  ` : ''}
                  ${state.workModal.mode === 'rdo' && state.workModalTab === 'media' ? `
                    <form class="suape-card p-4" data-form="create-media">
                      <div class="${labelCls}">Adicionar midia</div>
                      <div class="mt-3">
                        <label class="${labelCls}">Arquivo</label>
                        <input type="file" name="arquivo" class="${inputCls}" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.dwg" required>
                      </div>
                      <div class="mt-3">
                        <label class="${labelCls}">RDO relacionado</label>
                        <select name="rdo_id" class="${inputCls}" required>
                          <option value="">Selecione um RDO</option>
                          ${obraRdos.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.id)} • ${escapeHtml(r.obra)}</option>`).join('')}
                        </select>
                      </div>
                      <button type="submit" class="btn btn-dark mt-3">Enviar midia</button>
                    </form>
                  ` : ''}
                  ${state.workModal.mode === 'rdo' && state.workModalTab === 'approval' ? `
                    <form class="suape-card p-4" data-form="create-approval">
                      <div class="${labelCls}">Adicionar aprovacao</div>
                      <div class="mt-3">
                        <label class="${labelCls}">RDO</label>
                        <select name="rdo_id" class="${inputCls}" required>
                          <option value="">Selecione um RDO</option>
                          ${obraRdos.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.id)} • ${escapeHtml(r.obra)}</option>`).join('')}
                        </select>
                      </div>
                      <div class="mt-3">
                        <label class="${labelCls}">Status</label>
                        <select name="status" class="${inputCls}">
                          <option value="APROVADO">Aprovado</option>
                          <option value="PENDENTE">Pendente</option>
                          <option value="REPROVADO">Reprovado</option>
                        </select>
                      </div>
                      <div class="mt-3">
                        <label class="${labelCls}">Observacao</label>
                        <textarea name="observacao" rows="3" class="${inputCls}"></textarea>
                      </div>
                      <button type="submit" class="btn btn-dark mt-3">Salvar aprovacao</button>
                    </form>
                  ` : ''}
                  ${state.workModal.mode === 'edit' ? `
                    <form class="suape-card p-4" data-form="update-obra">
                      <div class="${labelCls}">Informacoes da obra</div>
                      <div class="mt-3">
                        <label class="${labelCls}">Nome</label>
                        <input type="text" name="nome" class="${inputCls}" value="${escapeHtml(obra.nome)}" required>
                      </div>
                      <div class="mt-3">
                        <label class="${labelCls}">Contrato</label>
                        <input type="text" name="contrato" class="${inputCls}" value="${escapeHtml(obra.contrato)}">
                      </div>
                      <div class="mt-3">
                        <label class="${labelCls}">Status</label>
                        <input type="text" name="status" class="${inputCls}" value="${escapeHtml(obra.status)}">
                      </div>
                      <div class="mt-3">
                        <label class="${labelCls}">Progresso (%)</label>
                        <input type="number" name="progresso" min="0" max="100" class="${inputCls}" value="${escapeHtml(obra.progresso)}">
                      </div>
                      <button type="submit" class="btn btn-dark mt-3">Salvar obra</button>
                    </form>
                  ` : ''}
                  ${state.workModal.mode === 'history' ? `
                    <div class="d-grid gap-2">
                      <div class="small text-uppercase text-muted fw-black" style="letter-spacing:.35em;">Movimentacoes</div>
                      ${historyItems.length === 0 ? emptyRow('Nenhuma movimentacao encontrada.') : ''}
                      ${historyItems.map((item) => `
                        <div class="border rounded-4 p-3 bg-light">
                          ${badge(item.type)}
                          <div class="fw-bold mt-2">${escapeHtml(item.title)}</div>
                          <div class="small text-muted">${escapeHtml(item.date)}</div>
                          <button type="button" class="btn btn-sm btn-outline-primary mt-2" data-action="open-map-history">Ver mapa</button>
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
                <div class="col-lg-5 d-grid gap-4">
                  <div class="suape-panel">
                    <div class="suape-panel__header"><div class="suape-header__subtitle mb-1">Resumo da obra</div></div>
                    <div class="suape-panel__body d-grid gap-2">
                      <div class="d-flex justify-content-between border rounded-4 p-3"><span class="text-muted">RDOs</span><strong>${obraRdos.length}</strong></div>
                      <div class="d-flex justify-content-between border rounded-4 p-3"><span class="text-muted">Midias</span><strong>${obraMidias.length}</strong></div>
                      <div class="d-flex justify-content-between border rounded-4 p-3"><span class="text-muted">Aprovacoes</span><strong>${obraAprovacoes.length}</strong></div>
                    </div>
                  </div>
                  <div class="suape-footer-card suape-panel">
                    <div class="suape-panel__header border-0"><div class="text-white-50 small text-uppercase fw-black" style="letter-spacing:.35em;">Feedback</div></div>
                    <div class="suape-panel__body text-white ${state.authFeedback ? '' : 'text-white-50'}">
                      ${escapeHtml(state.authFeedback || 'Nenhuma acao enviada ainda.')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    })() : '';

    const authDoc = (() => {
      if (!state.authModal.open) return null;
      const selected = buildDocuments(obras, rdos, midias);
      return selected.find((d) => d.id === state.authModal.documentId) || selected[0] || null;
    })();

    const authHtml = authDoc ? `
      <div class="suape-modal__backdrop" style="z-index:1150;">
        <div class="suape-modal__dialog" style="width:min(760px,100%);">
          <div class="border-bottom px-4 py-3 text-white" style="background:linear-gradient(90deg,#0f1729,#1d4ed8);">
            <div class="small text-uppercase text-white-50 fw-black" style="letter-spacing:.35em;">Autenticacao fake</div>
            <h3 class="h3 fw-black mt-2 mb-1">Assinatura estilo Clicksign</h3>
            <div class="text-white-75">${escapeHtml(authDoc.report.nome)}</div>
          </div>
          <div class="suape-modal__body p-4">
            <div class="d-flex gap-2 mb-4">
              ${[['access', 'Acesso'], ['otp', 'Confirmacao'], ['done', 'Finalizar']].map(([stepId, label]) => {
                const active = state.authModal.step === stepId;
                const completed = (stepId === 'access' && state.authModal.step !== 'access') || (stepId === 'otp' && state.authModal.step === 'done');
                return `<div class="flex-fill text-center rounded-pill py-2 small fw-black text-uppercase" style="letter-spacing:.22em;background:${active ? '#0f1729' : completed ? '#ecfdf5' : '#f1f5f9'};color:${active ? '#fff' : completed ? '#047857' : '#94a3b8'}">${label}</div>`;
              }).join('')}
            </div>
            ${state.authModal.step === 'access' ? `
              <form class="d-grid gap-3" data-form="auth-access">
                <div class="border rounded-4 p-3 bg-light">
                  <div class="small text-uppercase text-muted fw-black" style="letter-spacing:.28em;">Identificacao do assinante</div>
                  <div class="small text-muted mt-2">Este fluxo simula a checagem de acesso antes de abrir o documento para assinatura.</div>
                </div>
                <div>
                  <label class="${labelCls}">Email</label>
                  <input type="email" name="email" class="${inputCls}" placeholder="assinante@mock.com">
                </div>
                <div>
                  <label class="${labelCls}">CPF</label>
                  <input type="text" name="cpf" class="${inputCls}" placeholder="000.000.000-00">
                </div>
                <label class="d-flex align-items-start gap-3 border rounded-4 p-3 bg-light">
                  <input type="checkbox" name="aceite" class="form-check-input mt-1">
                  <span class="small text-muted">Aceito este fluxo fake de autenticacao e confirmo que desejo continuar a assinatura mockada.</span>
                </label>
              </form>
            ` : ''}
            ${state.authModal.step === 'otp' ? `
              <form class="d-grid gap-3" data-form="auth-otp">
                <div class="border rounded-4 p-3 bg-info-subtle">
                  <div class="small text-uppercase text-info fw-black" style="letter-spacing:.28em;">Codigo mockado enviado</div>
                  <div class="small text-info-emphasis mt-2">Use qualquer codigo de 6 digitos para simular a validacao do token de acesso.</div>
                </div>
                <div>
                  <label class="${labelCls}">Codigo OTP</label>
                  <input type="text" name="codigo" class="${inputCls}" placeholder="123456">
                </div>
              </form>
            ` : ''}
            <div class="d-flex justify-content-end gap-2 mt-4">
              <button type="button" class="btn btn-outline-secondary" data-action="close-auth">Cancelar</button>
              ${state.authModal.step === 'access' ? `<button type="button" class="btn btn-warning" data-action="confirm-auth-access">Validar acesso</button>` : ''}
              ${state.authModal.step === 'otp' ? `<button type="button" class="btn btn-dark" data-action="complete-signature">Concluir assinatura</button>` : ''}
            </div>
            ${state.authFeedback ? `<div class="alert alert-light border mt-3 mb-0">${escapeHtml(state.authFeedback)}</div>` : ''}
          </div>
        </div>
      </div>
    ` : '';

    modalRoot.innerHTML = workHtml + authHtml;
  }

  function renderAssistant(obras, rdos, midias, aprovacoes) {
    if (state.assistantTimer) {
      // no-op, timer remains active
    }

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

    assistantRoot.innerHTML = `
      <div class="suape-assistant">
        ${state.assistantNotification && !state.assistantOpen ? `
          <div class="suape-assistant__notification">
            <button type="button" class="btn btn-sm btn-light rounded-circle float-end" data-action="dismiss-notification"><i class="fa-solid fa-xmark"></i></button>
            <div class="small text-uppercase text-muted fw-black" style="letter-spacing:.24em;">Aviso inteligente</div>
            <h3 class="suape-assistant__notification-title">${escapeHtml(state.assistantNotification.title)}</h3>
            <p class="suape-assistant__message">${escapeHtml(state.assistantNotification.body)}</p>
            <button type="button" class="suape-assistant__chip suape-assistant__chip--primary" data-action="assistant-go" data-kind="${escapeHtml(state.assistantNotification.action.kind)}" data-screen="${escapeHtml(state.assistantNotification.action.screen || '')}" data-id="${escapeHtml(state.assistantNotification.action.obraId || '')}" data-url="${escapeHtml(state.assistantNotification.action.url || '')}">
              ${escapeHtml(state.assistantNotification.ctaLabel)}
            </button>
          </div>
        ` : ''}

        ${state.assistantOpen ? `
          <div class="suape-assistant__panel">
            <div class="d-flex align-items-center gap-3">
              <div class="suape-assistant__avatar"><i class="fa-solid fa-sun"></i></div>
              <div>
                <div class="small text-uppercase text-muted fw-black" style="letter-spacing:.24em;">Assistente Suape</div>
                <div class="h5 fw-black mb-0">Suly IA</div>
              </div>
            </div>
            <p class="suape-assistant__message">${escapeHtml(hints[state.activeItem] || 'Estou por aqui para te ajudar a seguir com a obra.')}</p>
            <div class="suape-assistant__chips">
              <button class="suape-assistant__chip" type="button" data-action="assistant-go" data-kind="screen" data-screen="RDO">Abrir RDO</button>
              <button class="suape-assistant__chip" type="button" data-action="assistant-go" data-kind="screen" data-screen="Midias">Enviar midia</button>
              <button class="suape-assistant__chip" type="button" data-action="assistant-go" data-kind="screen" data-screen="Mapa">Ver mapa</button>
            </div>
          </div>
        ` : ''}

        <button type="button" class="suape-assistant__launcher" data-action="toggle-assistant">
          <div class="suape-assistant__avatar"><i class="fa-solid fa-sun"></i></div>
          <div class="suape-assistant__copy">
            <span class="suape-assistant__name">Suly IA</span>
            <span class="suape-assistant__subtitle">Vamos conversar?</span>
          </div>
          <div class="suape-assistant__bubble"><i class="fa-solid ${state.assistantOpen ? 'fa-xmark' : 'fa-comment-dots'}"></i></div>
        </button>
      </div>
    `;
  }

  function initWidgets(collections) {
    state.charts.forEach((chart) => chart.destroy());
    state.charts = [];

    if (state.activeItem === 'Graficos' && window.Chart) {
      const ranking = buildRdoRanking(collections.obras, collections.rdos);
      const mediaDist = buildMediaDistribution(collections.midias);
      const rdoCanvas = document.getElementById('rdoChart');
      const mediaCanvas = document.getElementById('mediaChart');
      if (rdoCanvas) {
        state.charts.push(new Chart(rdoCanvas, {
          type: 'bar',
          data: {
            labels: ranking.map((i) => i.name),
            datasets: [{
              label: 'RDOs',
              data: ranking.map((i) => i.count),
              backgroundColor: ranking.map((_, i) => chartColors[i % chartColors.length]),
              borderRadius: 8,
            }],
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { color: '#94a3b8' }, grid: { color: '#eef2f7' } },
              x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
            },
          },
        }));
      }
      if (mediaCanvas) {
        state.charts.push(new Chart(mediaCanvas, {
          type: 'doughnut',
          data: {
            labels: mediaDist.map((i) => i.name),
            datasets: [{
              data: mediaDist.map((i) => i.count),
              backgroundColor: mediaDist.map((_, i) => chartColors[i % chartColors.length]),
              borderWidth: 0,
            }],
          },
          options: { plugins: { legend: { display: false } }, cutout: '62%' },
        }));
      }
    }

    if (state.activeItem === 'Mapa' && window.L) {
      const { mediaPoints, approvalPoints } = buildMapPoints(collections.midias, collections.aprovacoes);
      const hasSelectedPoint = Boolean(state.mapFocus?.latitude && state.mapFocus?.longitude);
      const mapCenter = hasSelectedPoint
        ? [state.mapFocus.latitude, state.mapFocus.longitude]
        : [...mediaPoints, ...approvalPoints].length
          ? [
            [...mediaPoints, ...approvalPoints].reduce((s, p) => s + p.latitude, 0) / [...mediaPoints, ...approvalPoints].length,
            [...mediaPoints, ...approvalPoints].reduce((s, p) => s + p.longitude, 0) / [...mediaPoints, ...approvalPoints].length,
          ]
          : [-8.31, -34.96];

      const mapEl = document.getElementById('leaflet-map');
      if (mapEl) {
        if (state.map) {
          state.map.remove();
          state.map = null;
        }
        state.map = L.map(mapEl).setView(mapCenter, hasSelectedPoint ? 16 : 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(state.map);
        const layer = L.layerGroup().addTo(state.map);
        state.mapMarkerLayer = layer;
        mediaPoints.forEach((p) => {
          L.circleMarker([p.latitude, p.longitude], {
            color: '#f5c518',
            fillColor: '#f5c518',
            fillOpacity: 0.9,
            weight: 2,
            radius: 10,
          }).bindPopup(`<strong>${escapeHtml(p.label)}</strong><br><small>${escapeHtml(p.sublabel)}</small>`).addTo(layer);
        });
        approvalPoints.forEach((p) => {
          L.circleMarker([p.latitude, p.longitude], {
            color: '#0ea5e9',
            fillColor: '#0ea5e9',
            fillOpacity: 0.9,
            weight: 2,
            radius: 10,
          }).bindPopup(`<strong>${escapeHtml(p.label)}</strong><br><small>${escapeHtml(p.sublabel)}</small>`).addTo(layer);
        });
        if (hasSelectedPoint) {
          L.circleMarker([state.mapFocus.latitude, state.mapFocus.longitude], {
            color: '#16a34a',
            fillColor: '#16a34a',
            fillOpacity: 1,
            weight: 3,
            radius: 12,
          }).bindPopup(`<strong>${escapeHtml(state.mapFocus.label)}</strong><br><small>${escapeHtml(state.mapFocus.sublabel)}</small>`).addTo(layer);
        }
        if (!hasSelectedPoint && [...mediaPoints, ...approvalPoints].length) {
          state.map.fitBounds(L.latLngBounds([...mediaPoints, ...approvalPoints].map((p) => [p.latitude, p.longitude])), { padding: [40, 40] });
        }
      }
    } else if (state.map) {
      state.map.remove();
      state.map = null;
    }
  }

  function render() {
    const { obras, rdos, aprovacoes, midias } = currentCollections();
    appShell.innerHTML = `
      <div class="suape-layout">
        ${renderSidebar()}
        <main class="suape-main">
          ${renderHeader()}
          <div class="suape-content">${renderPage()}</div>
        </main>
      </div>
    `;
    renderAssistant(obras, rdos, midias, aprovacoes);
    renderModal();
    initWidgets({ obras, rdos, aprovacoes, midias });
  }

  function findWorkObra(id) {
    const { obras } = currentCollections();
    return obras.find((o) => String(o.id) === String(id));
  }

  function setUrlPage(page) {
    const url = new URL(window.location.href);
    url.searchParams.set('page', page);
    window.history.pushState({}, '', url);
  }

  function readFormValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function handleActionClick(target) {
    const action = target.dataset.action;
    if (action === 'nav') {
      state.activeItem = target.dataset.page;
      setUrlPage(state.activeItem);
      render();
      return;
    }
    if (action === 'toggle-sidebar') {
      state.sidebarOpen = !state.sidebarOpen;
      render();
      return;
    }
    if (action === 'toggle-obra') {
      const id = target.dataset.id;
      state.expandedObra = String(state.expandedObra) === String(id) ? null : id;
      render();
      return;
    }
    if (action === 'open-rdo') {
      state.workModal = { mode: 'rdo', obra: findWorkObra(target.dataset.id) };
      state.workModalTab = 'rdo';
      render();
      return;
    }
    if (action === 'open-history') {
      state.workModal = { mode: 'history', obra: findWorkObra(target.dataset.id) };
      state.workModalTab = 'history';
      render();
      return;
    }
    if (action === 'open-edit') {
      state.workModal = { mode: 'edit', obra: findWorkObra(target.dataset.id) };
      state.workModalTab = 'rdo';
      render();
      return;
    }
    if (action === 'close-modal') {
      closeWorkModal();
      return;
    }
    if (action === 'set-work-tab') {
      state.workModalTab = target.dataset.tab;
      render();
      return;
    }
    if (action === 'open-map-history') {
      state.mapFocus = null;
      state.activeItem = 'Mapa';
      setUrlPage('Mapa');
      closeWorkModal();
      render();
      return;
    }
    if (action === 'open-map-media') {
      const media = currentCollections().midias.find((m) => String(m.id) === String(target.dataset.id));
      openMediaMap(media);
      return;
    }
    if (action === 'pick-file') {
      document.getElementById('media-file-input')?.click();
      return;
    }
    if (action === 'pick-camera') {
      document.getElementById('media-camera-input')?.click();
      return;
    }
    if (action === 'clear-upload') {
      state.midiasDraft = { file: null, obraId: '', rdoId: '', submitting: false, feedback: '', dropActive: false };
      render();
      return;
    }
    if (action === 'toggle-assistant') {
      state.assistantOpen = !state.assistantOpen;
      if (state.assistantOpen) state.assistantNotification = null;
      render();
      return;
    }
    if (action === 'dismiss-notification') {
      state.assistantNotification = null;
      render();
      return;
    }
    if (action === 'assistant-go') {
      const kind = target.dataset.kind;
      const screen = target.dataset.screen;
      const url = target.dataset.url;
      const id = target.dataset.id;
      if (kind === 'screen' && screen) setActiveItem(screen);
      else if (kind === 'obra' && id) {
        state.activeItem = 'Obras';
        state.expandedObra = id;
        setUrlPage('Obras');
        render();
      } else if (kind === 'media' && url) window.open(url, '_blank', 'noopener,noreferrer');
      state.assistantNotification = null;
      state.assistantOpen = false;
      render();
      return;
    }
    if (action === 'print-report') {
      const { obras, rdos, midias } = currentCollections();
      const reports = buildPdfReports(obras, rdos, midias);
      const id = target.dataset.id;
      const report = reports.find((r) => String(r.id) === String(id));
      if (report) openReportPrint(report);
      return;
    }
    if (action === 'select-document') {
      state.selectedDocumentId = target.dataset.id;
      render();
      return;
    }
    if (action === 'send-envelope') {
      const { obras, rdos, midias } = currentCollections();
      const documents = buildDocuments(obras, rdos, midias);
      const documentId = target.dataset.id;
      const targetDocument = documents.find((document) => document.id === documentId);
      if (!targetDocument) return;
      state.documentOverrides[documentId] = {
        ...(state.documentOverrides[documentId] || {}),
        status: 'sent',
        signers: targetDocument.signers.map((signer) => ({ ...signer, status: signer.status === 'pending' ? 'sent' : signer.status })),
        timeline: [
          { id: `${documentId}-evt-send-${Date.now()}`, label: 'Envelope enviado', detail: 'Todos os assinantes receberam o convite mockado por email.', tone: 'sky' },
          ...targetDocument.timeline,
        ],
      };
      render();
      return;
    }
    if (action === 'open-auth') {
      state.authModal = { open: true, documentId: target.dataset.id, step: 'access' };
      state.authFeedback = '';
      render();
      return;
    }
    if (action === 'close-auth') {
      state.authModal = { open: false, documentId: null, step: 'access' };
      state.authFeedback = '';
      render();
      return;
    }
    if (action === 'confirm-auth-access') {
      const form = document.querySelector('[data-form="auth-access"]');
      const values = form ? readFormValues(form) : {};
      if (!values.email || !values.cpf || !values.aceite) {
        state.authFeedback = 'Preencha email, CPF e aceite o fluxo fake.';
        render();
        return;
      }
      state.authModal.step = 'otp';
      state.authFeedback = 'Acesso validado. Agora confirme o codigo OTP.';
      render();
      return;
    }
    if (action === 'complete-signature') {
      const form = document.querySelector('[data-form="auth-otp"]');
      const values = form ? readFormValues(form) : {};
      if (!values.codigo) {
        state.authFeedback = 'Informe um codigo OTP para concluir.';
        render();
        return;
      }
      const { obras, rdos, midias } = currentCollections();
      const documents = buildDocuments(obras, rdos, midias);
      const doc = documents.find((document) => document.id === state.authModal.documentId);
      if (!doc) return;
      const nextSigners = doc.signers.map((signer, index) => {
        if (index === 0) return { ...signer, status: 'signed' };
        if (index === 1 && signer.status === 'pending') return { ...signer, status: 'sent' };
        return signer;
      });
      const allSigned = nextSigners.every((signer) => signer.status === 'signed');
      state.documentOverrides[state.authModal.documentId] = {
        ...(state.documentOverrides[state.authModal.documentId] || {}),
        status: allSigned ? 'signed' : 'sent',
        authStatus: 'authenticated',
        signers: nextSigners,
        timeline: [
          { id: `${state.authModal.documentId}-evt-sign-${Date.now()}`, label: 'Autenticacao concluida', detail: 'O assinante mockado validou acesso com email, CPF e codigo de confirmacao.', tone: 'emerald' },
          { id: `${state.authModal.documentId}-evt-signature-${Date.now() + 1}`, label: 'Assinatura aplicada', detail: 'A assinatura fake foi aplicada ao documento com sucesso.', tone: 'emerald' },
          ...doc.timeline,
        ],
      };
      state.authModal = { open: false, documentId: null, step: 'access' };
      state.authFeedback = 'Assinatura concluida com sucesso.';
      render();
      return;
    }
  }

  async function handleSubmitForm(form) {
    const formType = form.dataset.form;
    if (formType === 'media-upload') {
      const file = state.midiasDraft.file;
      if (!file) return;
      const values = readFormValues(form);
      state.midiasDraft.submitting = true;
      state.midiasDraft.feedback = '';
      render();
      try {
        await handleMediaUpload({ file, obraId: values.obraId, rdoId: values.rdoId });
        state.midiasDraft = { file: null, obraId: '', rdoId: '', submitting: false, feedback: 'Arquivo enviado com sucesso para a API.', dropActive: false };
      } catch (error) {
        state.midiasDraft.submitting = false;
        state.midiasDraft.feedback = error.message || 'Falha ao enviar o arquivo.';
      }
      render();
      return;
    }

    if (!state.workModal?.obra) return;
    const obra = state.workModal.obra;
    const values = readFormValues(form);
    try {
      if (formType === 'create-rdo') {
        await handleCreateRdo({ obra_id: obra.id, data_rdo: values.data_rdo, atividades: values.atividades, comentarios: values.comentarios, status: values.status });
        state.authFeedback = 'RDO salvo com sucesso.';
      } else if (formType === 'create-media') {
        const fileInput = form.querySelector('input[type="file"]');
        const file = fileInput?.files?.[0];
        if (!file) return;
        await handleMediaUpload({ file, obraId: obra.id, rdoId: values.rdo_id });
        state.authFeedback = 'Midia enviada com sucesso.';
      } else if (formType === 'create-approval') {
        await handleCreateApproval({ obra_id: obra.id, rdo_id: values.rdo_id, status: values.status, observacao: values.observacao });
        state.authFeedback = 'Aprovacao criada com sucesso.';
      } else if (formType === 'update-obra') {
        await handleUpdateObra(obra.id, { nome: values.nome, contrato: values.contrato, status: values.status, progresso: values.progresso });
        state.authFeedback = 'Obra atualizada com sucesso.';
      }
      closeWorkModal();
    } catch (error) {
      state.authFeedback = error.message || 'Erro desconhecido.';
      render();
    }
  }

  function handleChange(target) {
    if (target.id === 'media-file-input' || target.id === 'media-camera-input') {
      const file = target.files?.[0];
      if (!file) return;
      state.midiasDraft = { ...state.midiasDraft, file, feedback: 'Arquivo selecionado. Informe a obra e o RDO antes de enviar.' };
      render();
      return;
    }
    if (target.name === 'obraId' && target.closest('[data-form="media-upload"]')) {
      state.midiasDraft.obraId = target.value;
      return;
    }
    if (target.name === 'rdoId' && target.closest('[data-form="media-upload"]')) {
      state.midiasDraft.rdoId = target.value;
      return;
    }
    if (target.name === 'codigo' && target.closest('[data-form="auth-otp"]')) {
      return;
    }
  }

  function ensureAssistantTimer() {
    if (state.assistantTimer) return;
    state.assistantTimer = window.setInterval(() => {
      if (state.assistantOpen || state.assistantNotification) return;
      const { obras, rdos, aprovacoes, midias } = currentCollections();
      const pool = buildAssistantNotifications({ obras, rdos, midias, aprovacoes });
      const next = randomFrom(pool);
      if (next) {
        state.assistantNotification = { ...next, id: `${next.id}-${Date.now()}` };
        render();
      }
    }, 60000);
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    event.preventDefault();
    void handleActionClick(target);
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    handleChange(target);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!form.dataset.form) return;
    event.preventDefault();
    void handleSubmitForm(form);
  });

  window.addEventListener('popstate', () => {
    const page = new URL(window.location.href).searchParams.get('page') || 'Obras';
    state.activeItem = page;
    render();
  });

  function initPageFromUrl() {
    const page = new URL(window.location.href).searchParams.get('page');
    if (page) state.activeItem = page;
    else setUrlPage(state.activeItem);
  }

  ensureAssistantTimer();
  initPageFromUrl();
  void loadAllCollections();
})();
