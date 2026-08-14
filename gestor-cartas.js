/* =========================================================================
   GESTOR DE VITRINE DE CARTAS — CHAVE Consórcios
   Controle e automação:
   1) Composição manual de até 6 cartas de imóveis + 6 de veículos (CSV)
   2) Busca e aprovação de mídia (imagem/vídeo .mp4) por categoria
   3) Geração automática de links WhatsApp com ?origem=zap e Meta Pixel 'Lead'
   ========================================================================= */
(function () {
  'use strict';

  var CHAVES = {
    composicao: 'chave_gestor_composicao_v1',
    midias: 'chave_gestor_midias_v1'
  };

  var LIMITES = { Imóvel: 6, Veículo: 6 };

  var WA = '5517996482578';

  /* ---------- Persistência local ---------- */
  function lerJSON(chave, fallback) {
    try {
      var raw = localStorage.getItem(chave);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }

  function salvarJSON(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) {}
  }

  /* Estado global */
  var composicao = lerJSON(CHAVES.composicao, { Imóvel: [], Veículo: [] });
  var midias = lerJSON(CHAVES.midias, {});

  /* ---------- Estoque completo (referência preservada) ---------- */
  // Preserva o estoque completo original do CSV para o painel de composição.
  // NUNCA é sobrescrito pelo filtro de vitrine (aplicarComposicaoNaVitrine).
  var estoqueCompleto = [];

  function garantirEstoqueCompleto() {
    if (estoqueCompleto.length) return estoqueCompleto;
    var origem = window.__ESTOQUE_COMPLETO__ || window.__CARTAS__ || window.CARTAS || [];
    if (origem && origem.length) {
      estoqueCompleto = origem;
      window.__ESTOQUE_COMPLETO__ = origem;
    }
    return estoqueCompleto;
  }

  /* ---------- Utilidades ---------- */
  function catOf(carta) {
    var c = (carta && carta.c || '').toLowerCase();
    return c.indexOf('im') === 0 ? 'Imóvel' : 'Veículo';
  }

  function obterCartaPorId(id) {
    var lista = garantirEstoqueCompleto();
    for (var i = 0; i < lista.length; i++) {
      if (String(lista[i].i) === String(id)) return lista[i];
    }
    return null;
  }

  function getComposicaoArray() {
    return (composicao.Imóvel || []).concat(composicao.Veículo || []);
  }

  function estaNaComposicao(id) {
    var ids = getComposicaoArray();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i]) === String(id)) return true;
    }
    return false;
  }

  function totalSelecionadas(categoria) {
    return (composicao[categoria] || []).length;
  }

  /* ---------- Banco de mídia padrão (fallback / sugestão rápida) ---------- */
  var MIDIA_PADRAO = {
    Imóvel: [
      { url: 'https://assets.mixkit.co/videos/43607/43607-360.mp4', tipo: 'video' },
      { url: 'https://assets.mixkit.co/videos/30461/30461-360.mp4', tipo: 'video' },
      { url: 'https://github.com/abnael-martins/ChaveConsorcios/releases/download/Midias/duplex.mp4', tipo: 'video' },
      { url: 'asset_house.png', tipo: 'image' },
      { url: 'diversos-bens.png', tipo: 'image' },
      { url: 'https://cdn.pixabay.com/photo/2016/11/18/17/20/house-1836070_1280.jpg', tipo: 'image' },
      { url: 'https://cdn.pixabay.com/photo/2016/06/24/10/47/house-1477041_1280.jpg', tipo: 'image' },
      { url: 'https://cdn.pixabay.com/photo/2017/04/10/22/28/residence-2219972_1280.jpg', tipo: 'image' }
    ],
    Veículo: [
      { url: 'https://assets.mixkit.co/videos/74/74-360.mp4', tipo: 'video' },
      { url: 'https://assets.mixkit.co/videos/71/71-360.mp4', tipo: 'video' },
      { url: 'https://assets.mixkit.co/videos/75/75-360.mp4', tipo: 'video' },
      { url: 'asset_car.png', tipo: 'image' },
      { url: 'byd azul.webp', tipo: 'image' },
      { url: 'https://cdn.pixabay.com/photo/2016/11/29/09/32/auto-1868726_1280.jpg', tipo: 'image' },
      { url: 'https://cdn.pixabay.com/photo/2012/05/29/00/43/car-49278_1280.jpg', tipo: 'image' },
      { url: 'https://cdn.pixabay.com/photo/2016/04/01/12/26/car-1300629_1280.png', tipo: 'image' }
    ]
  };

  /* ---------- Busca de mídia na web ---------- */
  // Usa o Wikimedia Commons (API pública gratuita, sem chave) para buscar
  // imagens/vídeos .mp4 relacionados à categoria da carta.
  function buscarMidiaNaWeb(categoria, offset) {
    offset = offset || 0;
    var termos = categoria === 'Imóvel'
      ? ['casa', 'apartamento', 'imovel', 'cobertura', 'residence', 'house']
      : ['carro', 'veiculo', 'automovel', 'car', 'suv', 'sedan'];

    var termo = termos[Math.floor(offset / 4) % termos.length];
    var api = 'https://commons.wikimedia.org/w/api.php' +
      '?action=query&generator=search&gsrsearch=' + encodeURIComponent(termo + ' filetype:bitmap OR filetype:video') +
      '&gsrnamespace=6&gsrlimit=8&gsroffset=' + (Math.floor(offset / 4) * 8) +
      '&prop=imageinfo&iiprop=url|mime&iiurlwidth=800' +
      '&format=json&origin=*';

    return fetch(api)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var pages = data && data.query && data.query.pages ? data.query.pages : {};
        var lista = [];
        Object.keys(pages).forEach(function (k) {
          var p = pages[k];
          var info = p.imageinfo && p.imageinfo[0];
          if (!info || !info.url) return;
          var mime = (info.mime || '').toLowerCase();
          var tipo = mime.indexOf('video') === 0 ? 'video' : 'image';
          // Filtra apenas imagens e vídeos mp4 (o <video> da vitrine usa mp4)
          if (tipo === 'video' && mime.indexOf('mp4') < 0) return;
          var thumb = info.thumburl || info.url;
          lista.push({ url: thumb, tipo: tipo, origem: 'web' });
        });
        return lista;
      })
      .catch(function () { return []; });
  }

  /* ---------- Fluxo: sugerir -> aprovar / reprovar ---------- */
  function fluxoMidiaInstantaneo(id, categoria) {
    var sugestoesWeb = MIDIA_PADRAO[categoria] || [];
    var indice = 0;
    var usadoLocal = false;

    function proxima() {
      // Primeiro: mídia padrão local
      if (!usadoLocal && sugestoesWeb.length) {
        usadoLocal = true;
        return Promise.resolve({ url: sugestoesWeb[0].url, tipo: sugestoesWeb[0].tipo, origem: 'sugestao' });
      }
      // Depois: tenta busca web via Wikimedia
      usadoLocal = true;
      indice++;
      // Rotaciona a lista padrão evitando repetir a mesma sugestão
      var candidata = sugestoesWeb[indice % sugestoesWeb.length];
      if (candidata && indice < sugestoesWeb.length * 2) {
        return Promise.resolve({ url: candidata.url, tipo: candidata.tipo, origem: 'sugestao' });
      }
      return buscarMidiaNaWeb(categoria, indice)
        .then(function (resultados) {
          if (resultados && resultados.length) {
            return resultados[0];
          }
          return {
            url: categoria === 'Imóvel' ? 'asset_house.png' : 'asset_car.png',
            tipo: 'image',
            origem: 'fallback'
          };
        });
    }

    return {
      proxima: proxima,
      aprovar: function (cartaId, midia) {
        midias[cartaId] = { url: midia.url, tipo: midia.tipo, aprovada: true, origem: midia.origem };
        salvarJSON(CHAVES.midias, midias);
      },
      reprovar: function () {
        // Reprovação: avança para a próxima sugestão
        return proxima();
      },
      sobrepor: function (cartaId, url) {
        var tipo = url && url.toLowerCase().indexOf('.mp4') >= 0 ? 'video' : 'image';
        // Caminho relativo local ou URL externa
        if (url && /^(https?:)?\/\//i.test(url) === false && url.indexOf('.') >= 0) {
          // assume caminho relativo local
          tipo = url.toLowerCase().indexOf('.mp4') >= 0 ? 'video' : 'image';
        }
        midias[cartaId] = { url: url, tipo: tipo, aprovada: true, origem: 'manual' };
        salvarJSON(CHAVES.midias, midias);
      }
    };
  }

  function getMidiaCarta(id) {
    return midias[id] || null;
  }

  /* ---------- Geração de link WhatsApp ---------- */
  var veioDoZap = new URLSearchParams(window.location.search).get('origem') === 'zap';

  function linkWhatsCarta(carta) {
    var msg = veioDoZap
      ? 'Abnael, acabei de vir do nosso atendimento no WhatsApp e vi no site a carta de ' + carta.c + ' (ID: ' + carta.i + ') com Crédito de ' + carta.cr + ' e Entrada de ' + carta.e + '. Ainda está disponível?'
      : 'Olá Martins! Vi no site a carta de ' + carta.c + ' (ID: ' + carta.i + ') com Crédito de ' + carta.cr + ' e Entrada de ' + carta.e + '. Ainda está disponível?';
    return 'https://wa.me/' + WA + '?text=' + encodeURIComponent(msg);
  }

  /* ---------- Render: miniaturas e composição ---------- */
  function renderPainelComposicao() {
    var lista = garantirEstoqueCompleto();
    if (!lista.length) lista = window.CARTAS || [];
    var grid = document.getElementById('gestor-grid-cartas');
    if (!grid) return;
    var html = '';

    ['Imóvel', 'Veículo'].forEach(function (cat) {
      html += '<div class="gestor-grupo-categoria">' +
        '<div class="gestor-titulo-categoria">' +
        '<span>' + (cat === 'Imóvel' ? '🏠' : '🚗') + ' ' + cat + 's</span>' +
        '<span class="gestor-contador" id="gestor-contador-' + cat + '">' + totalSelecionadas(cat) + ' / ' + LIMITES[cat] + '</span>' +
        '</div>';

      var cartasCat = lista.filter(function (c) { return catOf(c) === cat; });
      cartasCat.sort(function (a, b) { return toNum(b.cr) - toNum(a.cr); });

      html += '<div class="gestor-linha-cartas">';
      for (var i = 0; i < cartasCat.length; i++) {
        var c = cartasCat[i];
        var sel = estaNaComposicao(c.i);
        var isR = c.d === 'R';
        html += '<label class="gestor-carta-item' + (sel ? ' sel' : '') + '" data-id="' + c.i + '">' +
          '<input type="checkbox" class="gestor-check-carta" data-id="' + c.i + '" data-cat="' + cat + '"' + (sel ? ' checked' : '') + '>' +
          '<span class="gestor-carta-id">' + c.i + '</span>' +
          '<span class="gestor-carta-valor">' + c.cr + '</span>' +
          '<span class="gestor-carta-status ' + (isR ? 'reser' : 'disp') + '">' + (isR ? 'Reservada' : 'Disponível') + '</span>' +
          '</label>';
      }
      html += '</div></div>';
    });

    grid.innerHTML = html;

    // Bind de eventos dos checkboxes
    grid.querySelectorAll('.gestor-check-carta').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = cb.getAttribute('data-id');
        var cat = cb.getAttribute('data-cat');
        var max = LIMITES[cat];
        if (cb.checked) {
          var atual = totalSelecionadas(cat);
          if (atual >= max) {
            cb.checked = false;
            alert('Limite de ' + max + ' cartas de ' + cat + ' atingido na composição da vitrine.');
            return;
          }
          composicao[cat].push(id);
        } else {
          composicao[cat] = composicao[cat].filter(function (x) { return String(x) !== String(id); });
        }
        salvarJSON(CHAVES.composicao, composicao);
        atualizarContadores();
        atualizarCartasSelecionadasPainel();
        aplicarComposicaoNaVitrine();
        renderTabelaSeDisponivel();
      });
    });
  }

  function atualizarContadores() {
    ['Imóvel', 'Veículo'].forEach(function (cat) {
      var el = document.getElementById('gestor-contador-' + cat);
      if (el) el.textContent = totalSelecionadas(cat) + ' / ' + LIMITES[cat];
    });
  }

  function atualizarCartasSelecionadasPainel() {
    var wrap = document.getElementById('gestor-cartas-selecionadas');
    if (!wrap) return;
    var ids = getComposicaoArray();
    if (!ids.length) {
      wrap.innerHTML = '<p class="gestor-vazio">Nenhuma carta selecionada. Escolha até 6 de cada categoria abaixo.</p>';
      return;
    }
    var html = '';
    ids.forEach(function (id) {
      var carta = obterCartaPorId(id);
      if (!carta) return;
      var midia = getMidiaCarta(id);
      var thumb = midia
        ? '<img src="' + midia.url + '" alt="Mídia da carta ' + id + '" onerror="this.style.display=\'none\'">'
        : '<span class="gestor-sem-midia">Sem mídia</span>';
      var midiaUrl = midia ? midia.url : '';
      html +=
        '<div class="gestor-selecionada" data-id="' + id + '">' +
        '<div class="gestor-sel-thumb">' + thumb + '</div>' +
        '<div class="gestor-sel-info">' +
        '<strong>ID ' + id + '</strong> <span class="gestor-sel-cat">' + catOf(carta) + '</span>' +
        '<div class="gestor-sel-cr">' + carta.cr + ' | Entrada: ' + carta.e + '</div>' +
        '<div class="gestor-sel-midia-acoes">' +
        '<button type="button" class="gestor-btn gestor-btn-buscar" data-accao="buscar-midia" data-id="' + id + '" data-cat="' + catOf(carta) + '">🔍 Buscar mídia</button>' +
        '<button type="button" class="gestor-btn gestor-btn-override" data-accao="sobrepor" data-id="' + id + '">✏️ Sobrepor</button>' +
        '<button type="button" class="gestor-btn gestor-btn-remove" data-accao="remover" data-id="' + id + '">✕ Remover</button>' +
        '</div>' +
        '<div class="gestor-fluxo" data-fluxo="' + id + '"></div>' +
        '<div class="gestor-midia-atual" data-midia="' + id + '">' +
        (midia ? '<small>Mídia atual: <em>' + midia.url + '</em></small>' : '') +
        '</div>' +
        '</div></div>';
    });
    wrap.innerHTML = html;
    bindAcoesSelecionadas();
  }

  /* ---------- Fluxo de aprovação de mídia ---------- */
  function iniciarFluxoBusca(id, cat) {
    var fluxo = fluxoMidiaInstantaneo(id, cat);
    var container = document.querySelector('[data-fluxo="' + id + '"]');
    if (!container) return;

    container.innerHTML = '<p class="gestor-carregando">Buscando mídia na web para a categoria ' + cat + '...</p>';

    fluxo.proxima().then(function (midia) {
      if (!container) return;
      var isVideo = midia.tipo === 'video';
      container.innerHTML =
        '<div class="gestor-sugestao">' +
        '<div class="gestor-sugestao-media">' +
        (isVideo
          ? '<video src="' + midia.url + '" muted loop playsinline autoplay></video>'
          : '<img src="' + midia.url + '" alt="Sugestão de mídia" onerror="this.parentElement.innerHTML=\'<span class=gestor-sem-midia>Não foi possível carregar</span>\'">') +
        '</div>' +
        '<div class="gestor-sugestao-acoes">' +
        '<button type="button" class="gestor-btn gestor-btn-aprovar" data-accao="aprovar" data-id="' + id + '" data-url="' + encodeURIComponent(midia.url) + '" data-tipo="' + midia.tipo + '">✔ Aprovar</button>' +
        '<button type="button" class="gestor-btn gestor-btn-reprovar" data-accao="reprovar" data-id="' + id + '" data-cat="' + cat + '">✖ Reprovar</button>' +
        '</div>' +
        '<small class="gestor-origem">Origem: ' + (midia.origem || 'sugestão') + ' — ' + midia.url + '</small>' +
        '</div>';
    });
  }

  function bindAcoesSelecionadas() {
    var wrap = document.getElementById('gestor-cartas-selecionadas');
    if (!wrap) return;

    wrap.querySelectorAll('[data-accao="buscar-midia"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        iniciarFluxoBusca(btn.getAttribute('data-id'), btn.getAttribute('data-cat'));
      });
    });

    wrap.querySelectorAll('[data-accao="sobrepor"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var url = prompt('Cole a URL externa (https://...) ou o caminho relativo local (ex.: asset_car.png ou video.mp4) para a mídia da carta ' + id + ':');
        if (!url) return;
        fluxoMidiaInstantaneo(id).sobrepor(id, url.trim());
        atualizarCartasSelecionadasPainel();
        renderTabelaSeDisponivel();
      });
    });

    wrap.querySelectorAll('[data-accao="remover"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        composicao.Imóvel = composicao.Imóvel.filter(function (x) { return String(x) !== String(id); });
        composicao.Veículo = composicao.Veículo.filter(function (x) { return String(x) !== String(id); });
        delete midias[id];
        salvarJSON(CHAVES.composicao, composicao);
        salvarJSON(CHAVES.midias, midias);
        atualizarContadores();
        renderPainelComposicao();
        atualizarCartasSelecionadasPainel();
        aplicarComposicaoNaVitrine();
        renderTabelaSeDisponivel();
      });
    });

    // Delegação para aprovar/reprovar
    wrap.querySelectorAll('[data-accao="aprovar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var url = decodeURIComponent(btn.getAttribute('data-url'));
        var tipo = btn.getAttribute('data-tipo');
        fluxoMidiaInstantaneo(id).aprovar(id, { url: url, tipo: tipo });
        atualizarCartasSelecionadasPainel();
        renderTabelaSeDisponivel();
      });
    });

    wrap.querySelectorAll('[data-accao="reprovar"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var cat = btn.getAttribute('data-cat');
        // Reprovação: busca a próxima alternativa imediatamente
        iniciarFluxoBusca(id, cat);
      });
    });
  }

  /* ---------- Aplicar composição na vitrine (tabela) ---------- */
  function idsDisponiveis() {
    return getComposicaoArray().filter(function (id) {
      return obterCartaPorId(id) !== null;
    });
  }

  function aplicarComposicaoNaVitrine() {
    var ids = idsDisponiveis();

    // Garante o estoque completo preservado antes de qualquer filtro
    var todas = garantirEstoqueCompleto();

    // Sem composição -> restaura a vitrine completa
    if (!ids.length) {
      if (window.CARTAS && todas.length) {
        window.CARTAS = todas.slice();
        if (typeof window.filtrados !== 'undefined') window.filtrados = todas.slice();
        if (typeof window.pagAtual !== 'undefined') window.pagAtual = 0;
        if (typeof window.selecionadas !== 'undefined') window.selecionadas = {};
        if (typeof window.atualizarSoma === 'function') window.atualizarSoma();
        if (typeof window.renderTabela === 'function') window.renderTabela();
        // Restaura os botões de filtro ativos
        var btnsFiltro = document.querySelectorAll('.filter-planilha');
        for (var i = 0; i < btnsFiltro.length; i++) {
          if (btnsFiltro[i].textContent === 'Todas') {
            btnsFiltro[i].classList.add('active');
          } else {
            btnsFiltro[i].classList.remove('active');
          }
        }
      }
      return;
    }

    // Filtra a tabela de vitrine para mostrar APENAS as cartas compostas
    var compostas = todas.filter(function (c) {
      for (var i = 0; i < ids.length; i++) {
        if (String(c.i) === String(ids[i])) return true;
      }
      return false;
    });

    // Atualiza estado global da vitrine
    if (window.CARTAS && compostas.length) {
      // Preserva a seleção atual do filtro se existir
      var filtroAtual = document.querySelector('.filter-planilha.active');
      var catFiltro = filtroAtual ? filtroAtual.textContent : 'Todas';

      var todasCategorias = true;
      if (catFiltro === 'Veículo' || catFiltro === 'Imóvel') {
        todasCategorias = false;
        compostas = compostas.filter(function (c) { return c.c === catFiltro; });
      }
      window.CARTAS = compostas;
      if (typeof window.filtrados !== 'undefined') {
        window.filtrados = compostas.slice();
      }
      if (typeof window.pagAtual !== 'undefined') window.pagAtual = 0;
      if (typeof window.renderTabela === 'function') window.renderTabela();
    }
  }

  function renderTabelaSeDisponivel() {
    // Se a página principal (cartas-contempladas.html) definiu renderTabela,
    // garante que a tabela refleto a composição. Usado após mudanças de mídia
    // (a mídia não altera a tabela, mas a função é chamada por consistência).
    if (typeof window.renderTabela === 'function') window.renderTabela();
  }

  /* ---------- Modal do painel ---------- */
  function abrirPainel() {
    var modal = document.getElementById('gestor-modal');
    if (!modal) return;
    modal.classList.add('aberto');
    document.body.style.overflow = 'hidden';
    renderPainelComposicao();
    atualizarCartasSelecionadasPainel();
    atualizarContadores();
  }

  function fecharPainel() {
    var modal = document.getElementById('gestor-modal');
    if (!modal) return;
    modal.classList.remove('aberto');
    document.body.style.overflow = '';
  }

  function injetarBotaoPainel() {
    if (document.getElementById('gestor-btn-abrir')) return;
    var pontos = document.querySelectorAll('.section-header, .container-tabela');
    var alvo = pontos.length ? pontos[0] : document.body;
    var btn = document.createElement('button');
    btn.id = 'gestor-btn-abrir';
    btn.type = 'button';
    btn.className = 'gestor-btn-abrir';
    btn.innerHTML = '⚙️ Painel de Gestão da Vitrine';
    btn.addEventListener('click', abrirPainel);
    alvo.parentNode.insertBefore(btn, alvo);
  }

  function injetarModal() {
    if (document.getElementById('gestor-modal')) return;
    var modal = document.createElement('div');
    modal.id = 'gestor-modal';
    modal.className = 'gestor-modal';
    modal.innerHTML =
      '<div class="gestor-modal-backdrop" data-fechar></div>' +
      '<div class="gestor-modal-content">' +
      '<div class="gestor-modal-header">' +
      '<h3>⚙️ Painel de Gestão da Vitrine</h3>' +
      '<button type="button" class="gestor-modal-fechar" data-fechar aria-label="Fechar">✕</button>' +
      '</div>' +
      '<div class="gestor-modal-body">' +
      '<section class="gestor-secao">' +
      '<h4>📋 Cartas selecionadas para a vitrine</h4>' +
      '<div id="gestor-cartas-selecionadas"><p class="gestor-vazio">Nenhuma carta selecionada ainda.</p></div>' +
      '</section>' +
      '<section class="gestor-secao">' +
      '<h4>📦 Estoque (CSV) — selecione até 6 de cada categoria</h4>' +
      '<div id="gestor-grid-cartas"></div>' +
      '</section>' +
      '</div>' +
      '<div class="gestor-modal-footer">' +
      '<button type="button" class="gestor-btn gestor-btn-fechar" data-fechar>Fechar</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-fechar]').forEach(function (el) {
      el.addEventListener('click', fecharPainel);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fecharPainel();
    });
  }

  /* ---------- CSS do painel ---------- */
  function injetarCss() {
    if (document.getElementById('gestor-css')) return;
    var style = document.createElement('style');
    style.id = 'gestor-css';
    style.textContent = `
      /* Botão abrir painel */
      .gestor-btn-abrir{
        display:inline-flex;align-items:center;gap:8px;
        background:linear-gradient(180deg,var(--brass-light),var(--brass));
        color:#20140a;border:none;cursor:pointer;font-weight:700;
        font-family:var(--font-body);font-size:0.88rem;
        padding:12px 22px;border-radius:6px;margin:0 0 18px;
        transition:transform .2s ease,box-shadow .2s ease;
        box-shadow:0 10px 24px -10px rgba(192,139,62,.6);
      }
      .gestor-btn-abrir:hover{ transform:translateY(-2px); }

      /* Modal */
      .gestor-modal{ position:fixed;inset:0;z-index:1000;display:none; }
      .gestor-modal.aberto{ display:block; }
      .gestor-modal-backdrop{ position:absolute;inset:0;background:rgba(6,14,16,.85);backdrop-filter:blur(6px); }
      .gestor-modal-content{
        position:relative;z-index:2;width:min(1100px,95vw);max-height:88vh;
        margin:5vh auto;background:var(--surface);border:1px solid var(--line);
        border-radius:12px;overflow:hidden;display:flex;flex-direction:column;
        box-shadow:0 40px 90px -20px rgba(0,0,0,.75);
      }
      .gestor-modal-header{
        display:flex;align-items:center;justify-content:space-between;
        padding:18px 24px;border-bottom:1px solid var(--line);background:var(--bg-alt);
      }
      .gestor-modal-header h3{ font-family:var(--font-display);font-size:1.3rem;color:var(--brass-light); }
      .gestor-modal-fechar{
        background:none;border:none;color:var(--ivory);font-size:1.4rem;cursor:pointer;
        width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        transition:background .2s;
      }
      .gestor-modal-fechar:hover{ background:rgba(244,236,221,.1); }
      .gestor-modal-body{ padding:22px 24px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:26px; }
      .gestor-secao h4{
        font-family:var(--font-mono);font-size:0.78rem;letter-spacing:.1em;text-transform:uppercase;
        color:var(--brass-light);margin-bottom:14px;border-bottom:1px solid var(--line);padding-bottom:10px;
      }
      .gestor-vazio{ color:var(--muted);font-size:.9rem;padding:14px 0; }

      /* Cartas selecionadas */
      .gestor-selecionada{
        display:flex;gap:14px;background:var(--bg);border:1px solid var(--line);
        border-radius:8px;padding:12px;margin-bottom:10px;align-items:flex-start;
      }
      .gestor-sel-thumb{ width:92px;height:64px;border-radius:6px;overflow:hidden;background:var(--surface-2);flex-shrink:0;display:flex;align-items:center;justify-content:center; }
      .gestor-sel-thumb img,.gestor-sel-thumb video{ width:100%;height:100%;object-fit:cover; }
      .gestor-sem-midia{ font-size:.68rem;color:var(--muted);text-align:center;padding:6px; }
      .gestor-sel-info{ flex:1;min-width:0; }
      .gestor-sel-info strong{ font-size:.95rem; }
      .gestor-sel-cat{ font-family:var(--font-mono);font-size:.66rem;color:var(--brass-light);border:1px solid rgba(192,139,62,.4);padding:2px 8px;border-radius:12px;margin-left:8px; }
      .gestor-sel-cr{ font-family:var(--font-mono);font-size:.74rem;color:var(--muted);margin:5px 0 8px; }
      .gestor-sel-midia-acoes{ display:flex;gap:6px;flex-wrap:wrap; }
      .gestor-btn{
        font-family:var(--font-mono);font-size:.66rem;letter-spacing:.04em;text-transform:uppercase;
        padding:6px 12px;border-radius:4px;border:1px solid var(--line);background:var(--surface-2);
        color:var(--ivory);cursor:pointer;transition:all .2s;
      }
      .gestor-btn:hover{ border-color:var(--brass-light);color:var(--brass-light); }
      .gestor-btn-aprovar{ border-color:var(--emerald);color:var(--emerald); }
      .gestor-btn-aprovar:hover{ background:rgba(76,138,106,.15);color:#6ec897; }
      .gestor-btn-reprovar{ border-color:var(--stamp);color:var(--stamp); }
      .gestor-btn-reprovar:hover{ background:rgba(182,66,63,.15);color:#e07a77; }
      .gestor-btn-remove{ border-color:rgba(182,66,63,.5);color:#e07a77; }
      .gestor-fluxo{ margin-top:8px; }
      .gestor-carregando{ font-size:.8rem;color:var(--muted);font-style:italic; }
      .gestor-sugestao{ background:var(--surface-2);border:1px solid var(--line);border-radius:6px;padding:10px; }
      .gestor-sugestao-media{ max-height:140px;overflow:hidden;border-radius:4px;margin-bottom:8px;background:#000; }
      .gestor-sugestao-media img,.gestor-sugestao-media video{ width:100%;max-height:140px;object-fit:cover; }
      .gestor-sugestao-acoes{ display:flex;gap:8px; }
      .gestor-origem{ display:block;margin-top:6px;font-size:.66rem;color:var(--muted);word-break:break-all; }
      .gestor-midia-atual{ margin-top:6px; }
      .gestor-midia-atual small{ font-size:.68rem;color:var(--muted);word-break:break-all; }

      /* Grid do estoque */
      .gestor-grupo-categoria{ margin-bottom:18px; }
      .gestor-titulo-categoria{
        display:flex;justify-content:space-between;align-items:center;
        font-family:var(--font-display);font-size:1.02rem;margin-bottom:10px;
      }
      .gestor-contador{ font-family:var(--font-mono);font-size:.74rem;color:var(--brass-light); }
      .gestor-linha-cartas{
        display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px;
        max-height:290px;overflow-y:auto;padding-right:6px;
      }
      .gestor-carta-item{
        display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;
        background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:9px 10px;
        cursor:pointer;transition:border-color .2s,background .2s;
      }
      .gestor-carta-item:hover{ border-color:rgba(192,139,62,.5); }
      .gestor-carta-item.sel{ border-color:var(--brass-light);background:rgba(192,139,62,.08); }
      .gestor-carta-item input{ accent-color:var(--brass);cursor:pointer; }
      .gestor-carta-id{ font-family:var(--font-mono);font-size:.74rem;font-weight:600; }
      .gestor-carta-valor{ font-family:var(--font-mono);font-size:.68rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
      .gestor-carta-status{ font-family:var(--font-mono);font-size:.58rem;text-transform:uppercase;letter-spacing:.05em;padding:2px 6px;border-radius:10px; }
      .gestor-carta-status.disp{ background:rgba(76,138,106,.15);color:#6ec897; }
      .gestor-carta-status.reser{ background:rgba(182,66,63,.15);color:#e07a77; }

      .gestor-modal-footer{ padding:14px 24px;border-top:1px solid var(--line);background:var(--bg-alt);display:flex;justify-content:flex-end; }
      .gestor-btn-fechar{ padding:10px 22px; }

      @media(max-width:640px){
        .gestor-modal-body{ padding:16px; }
        .gestor-selecionada{ flex-direction:column; }
        .gestor-sel-thumb{ width:100%;height:90px; }
        .gestor-linha-cartas{ grid-template-columns:1fr;max-height:240px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- Monitorar novo estoque do CSV ---------- */
  // O cartas-contempladas.html pode carregar o CSV via fetch APÓS o gestor
  // iniciar. Detecta a troca de window.__CARTAS__ e reaplica a composição.
  function monitorarNovoEstoque() {
    var ultimoValor = null;
    setInterval(function () {
      var atual = window.__CARTAS__ || null;
      if (atual && atual !== ultimoValor) {
        ultimoValor = atual;
        estoqueCompleto = atual;
        window.__ESTOQUE_COMPLETO__ = atual;
        aplicarComposicaoNaVitrine();
        // Se o painel estiver aberto, re-renderiza
        var modal = document.getElementById('gestor-modal');
        if (modal && modal.classList.contains('aberto')) {
          renderPainelComposicao();
          atualizarCartasSelecionadasPainel();
          atualizarContadores();
        }
      }
    }, 700);
  }

  /* ---------- Inicialização ---------- */
  function init() {
    injetarCss();
    injetarBotaoPainel();
    injetarModal();
    monitorarNovoEstoque();

    // Se o estoque inline já estiver disponível, preserva-o imediatamente
    if (window.CARTAS && window.CARTAS.length) {
      estoqueCompleto = window.CARTAS;
      window.__ESTOQUE_COMPLETO__ = window.CARTAS;
    }
    if (window.__CARTAS__ && window.__CARTAS__.length) {
      estoqueCompleto = window.__CARTAS__;
      window.__ESTOQUE_COMPLETO__ = window.__CARTAS__;
    }

    // Aplica composição salva na vitrine após a tabela existir
    var tentativas = 0;
    function aplicarQuandoPronto() {
      if (typeof window.renderTabela === 'function' && (window.CARTAS || window.__CARTAS__)) {
        aplicarComposicaoNaVitrine();
      } else if (tentativas < 50) {
        tentativas++;
        setTimeout(aplicarQuandoPronto, 200);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', aplicarQuandoPronto);
    } else {
      aplicarQuandoPronto();
    }
  }

  // Expõe funções utilitárias para depuração/uso externo
  window.GestorCartas = {
    composicao: composicao,
    midias: midias,
    obterCartaPorId: obterCartaPorId,
    linkWhatsCarta: linkWhatsCarta,
    getMidiaCarta: getMidiaCarta,
    aplicarComposicaoNaVitrine: aplicarComposicaoNaVitrine,
    abrirPainel: abrirPainel,
    fecharPainel: fecharPainel
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Helper global de conversão numérica (usado no da página) */
function toNum(s) {
  if (!s || s === '-') return 0;
  return parseFloat(String(s).replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;
}

function fmtBRL(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}