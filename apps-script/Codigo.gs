/**
 * Central de Reservas FHOP — Etapa 1 (somente leitura)
 * Lê as 3 planilhas de respostas + a Google Agenda e entrega ao painel.
 * NÃO grava nada. Roda como a conta que autorizar (fhopchurch@fhop.com).
 *
 * Para trocar as fontes, edite FONTES abaixo (ou depois puxamos do Admin).
 */

var FONTES = {
  form1_reserva:   '1EC0qIcEng6NOqwH6bxQh2XMQBRcXbkS5vsdsYB1N7DA', // Reserva de espaço (departamentos)
  form2_pastoral:  '1Ok-fH-7QSLMcDCGlLtJStNi2KTuG-OYR07gxXi8mWts', // Atendimento pastoral
  form3_reserva:   '1pAwztDJN26Hnralm2ZpHpNqwKm0zZKPSK3a8L9pVyLk', // Reserva pastoral
  agenda:          'fhopchurch@fhop.com'
};

var TZ = 'America/Sao_Paulo';
var CORTE = '2026-08-23'; // só lê desta data em diante (evita poluir e acelera)

// E-mails que podem abrir o PAINEL da secretaria. Qualquer outro cai na página de reserva.
var ALLOWLIST = ['fhopchurch@fhop.com','paulotaborda@fhop.com','guilhermejoa11@gmail.com'];

// Dicionário de normalização de espaços (o "de-para")
var ALIASES = {
  'auditorio':'Auditório','auditório':'Auditório','novo auditorio':'Auditório','auditório principal':'Auditório','auditorio principal':'Auditório',
  'nave do templo':'Nave do Templo','templo':'Nave do Templo','nave':'Nave do Templo',
  'sala 1':'Sala 1','sala 01':'Sala 1','sala de aula 01':'Sala 1',
  'sala 2':'Sala 2','sala 02':'Sala 2','sala de aula 02':'Sala 2',
  'area gourmet':'Área Gourmet','área gourmet':'Área Gourmet','espaço gourmet':'Área Gourmet','espaco gourmet':'Área Gourmet','gourmet':'Área Gourmet',
  'sala verde':'Sala Verde/Estúdio','sala verde/estúdio':'Sala Verde/Estúdio','estúdio':'Sala Verde/Estúdio','estudio':'Sala Verde/Estúdio',
  'sala de reunião/atendimento':'Sala de reunião/atendimento','sala de reuniões':'Sala de reunião/atendimento','sala de reunioes':'Sala de reunião/atendimento','sala de reunião':'Sala de reunião/atendimento',
  'briefing':'Briefing','estacionamento':'Estacionamento'
};

// ---- Defaults para o Admin editável ----
var ESPACOS_DEF = ['Auditório','Nave do Templo','Sala 1','Sala 2','Área Gourmet','Sala Verde/Estúdio','Sala de reunião/atendimento','Briefing','Estacionamento'];
var DEPARTS_DEF = ['RESET','XTRA','ROCKTES','KIDS','ENCONTRO DELAS','HOMENS','PROFÉTICO','FHOP SOCIAL','USHERS','SALA DE ORAÇÃO','LOUVOR','ADMINISTRATIVO','FINANCEIRO','HOSPITALIDADE','FHOP BOOKS','FHOP STORE','FHOP MUSIC','FHOP SCHOOL','FASCINAÇÃO','ESCOLAS','CENTRO TREINAMENTO','TECNOLOGIAS','COMUNICAÇÃO E MARKETING','PASTORAL','EVENTOS E CONFERÊNCIAS'];
var PASTORES_DEF = ['Shalon','Camila','Cleber','Letícia','Vinicius','Emilaine','William','Nathalie','Hamilton','Brenon','Fernanda'].map(function(n){ return {nome:n, email:''}; });
var RESP_DEF = [{papel:'Patrimônio', nome:'', email:'', corpo:''},{papel:'Audiovisual', nome:'', email:'', corpo:''},{papel:'Secretaria', nome:'', email:'', corpo:''},{papel:'Departamento', nome:'', email:'', corpo:''}];
// Modelos de e-mail (HTML editável no Admin). Vazio = usa o modelo padrão abaixo.
var EMAIL_RESP_DEF = 'Olá {responsavel},<br><br>Uma reserva foi confirmada e precisa de você (<b>{area}</b>).<br><br><b>Evento:</b> {evento}<br><b>Quando:</b> {data} · {horario}<br><b>Local:</b> {local}<br>{contato}{itens}{texto}<br>— Central de Reservas FHOP';
var EMAIL_CONFIRM_DEF = 'Olá {solicitante},<br><br>Sua reserva foi <b>CONFIRMADA</b>.<br><br><b>Evento:</b> {evento}<br><b>Data:</b> {data}<br><b>Horário:</b> {horario}<br><b>Local:</b> {local}<br><br>Você também recebeu o convite na sua agenda.<br><br>— Central de Reservas FHOP';
function normResp_(rs){
  rs = (rs instanceof Array && rs.length) ? rs : RESP_DEF;
  return rs.map(function(r){ return { papel:String(r.papel||''), nome:String(r.nome||''), email:String(r.email||''), corpo:(r.corpo!=null?String(r.corpo):'') }; });
}
// Cor do evento no Google Agenda por espaço (id "1".."11" das cores do Google).
var CORES_DEF = {'Auditório':'9','Nave do Templo':'3','Sala 1':'1','Sala 2':'11','Área Gourmet':'7','Sala Verde/Estúdio':'2','Sala de reunião/atendimento':'6','Briefing':'4','Estacionamento':'8'};

// Conteúdo editável da página pública de reserva. `insumos` é uma LISTA de grupos; cada grupo
// aponta para um Responsável (por `resp` = papel) e é isso que decide o e-mail que recebe.
var PAGINA_DEF = {
  titulo: 'Reserva de espaço',
  lead: 'Preencha abaixo. Ao escolher espaço, data e horário, avisamos <b>na hora</b> se já há algo marcado. Sua solicitação vai para a secretaria aprovar.',
  rodape: '',
  insumos: [
    { rotulo:'Patrimônio', resp:'Patrimônio', texto:true, itens:['Cadeiras','Mesas','Outros objetos'] },
    { rotulo:'Audiovisual', resp:'Audiovisual', texto:true, itens:['Sistema de som','Microfone(s)','Iluminação especial'] },
    { rotulo:'Secretaria (café/insumos)', resp:'Secretaria', texto:true, itens:['Chaleira Elétrica','Garrafa Térmica','Café','Açúcar','Copos descartáveis','Geladeira','Projetor','Telão/Quadro'] }
  ]
};
function normInsumos_(ins){
  if(ins instanceof Array){
    return ins.map(function(g){ return { rotulo:String(g.rotulo||''), resp:String(g.resp||''), texto:(g.texto!==false), itens:(g.itens instanceof Array?g.itens:[]) }; })
              .filter(function(g){ return g.rotulo || g.itens.length; });
  }
  if(ins && typeof ins==='object'){ // formato antigo {patrim,av,sec} → migra p/ lista
    var out=[], map={patrim:'Patrimônio', av:'Audiovisual', sec:'Secretaria'};
    ['patrim','av','sec'].forEach(function(k){ var g=ins[k]; if(g){ out.push({ rotulo:String(g.rotulo||map[k]), resp:map[k], texto:true, itens:(g.itens instanceof Array?g.itens:[]) }); } });
    if(out.length) return out;
  }
  return PAGINA_DEF.insumos.map(function(g){ return { rotulo:g.rotulo, resp:g.resp, texto:g.texto, itens:g.itens.slice() }; });
}
function normPagina_(p){
  p = p || {};
  return {
    titulo: p.titulo!=null ? p.titulo : PAGINA_DEF.titulo,
    lead:   p.lead!=null   ? p.lead   : PAGINA_DEF.lead,
    rodape: p.rodape!=null ? p.rodape : PAGINA_DEF.rodape,
    insumos: normInsumos_(p.insumos),
    campos: (p.campos instanceof Array) ? p.campos : []
  };
}

// Config ao vivo (defaults + o que o Admin salvou na Central). Cache por execução.
var _CFG = null;
function cfg(){
  if(_CFG) return _CFG;
  var stored = {};
  try{
    var sh = getCentralSS_().getSheetByName('config');
    if(sh){ var raw = sh.getRange('A1').getValue(); if(raw) stored = JSON.parse(raw); }
  }catch(e){}
  _CFG = {
    fontes: Object.assign({}, FONTES, stored.fontes||{}),
    allowlist: (stored.allowlist && stored.allowlist.length) ? stored.allowlist : ALLOWLIST.slice(),
    espacos: stored.espacos || ESPACOS_DEF.slice(),
    departamentos: stored.departamentos || DEPARTS_DEF.slice(),
    pastores: stored.pastores || PASTORES_DEF.slice(),
    responsaveis: normResp_(stored.responsaveis),
    emailConfirmacao: stored.emailConfirmacao || EMAIL_CONFIRM_DEF,
    aliases: Object.assign({}, ALIASES, stored.aliases||{}),
    linkPainel: stored.linkPainel || '',
    painelUser: stored.painelUser || 'fhopchurch@fhop.com',
    painelPass: stored.painelPass || 'fhopchurch1234',
    recoveryEmail: stored.recoveryEmail || 'fhopchurch@fhop.com',
    cores: Object.assign({}, CORES_DEF, stored.cores||{}),
    pagina: normPagina_(stored.pagina)
  };
  return _CFG;
}
function getConfig(){ return cfg(); }
/** Conteúdo público da página de reserva (sem exigir login): textos, insumos, espaços e departamentos. */
function getPagina(){ var c = cfg(); return { pagina: c.pagina, espacos: c.espacos, departamentos: c.departamentos }; }
function getLinkPainel(){ return cfg().linkPainel || ''; } // exposto à página pública (só a URL)
function getMe(token){
  var ok = validPainelToken_(token);
  return { email: ok ? cfg().painelUser : '', admin: ok };
}
function saveConfig(novo, token){
  if(!validPainelToken_(token)) throw new Error('Sessão expirada. Entre novamente.');
  var ss = getCentralSS_();
  var sh = ss.getSheetByName('config') || ss.insertSheet('config');
  sh.getRange('A1').setValue(JSON.stringify(novo));
  _CFG = null;
  return { ok:true, token: _painelToken_() }; // devolve token novo (a senha pode ter mudado)
}
/** Esqueci a senha: envia os dados de acesso ao e-mail da secretaria (nunca ao solicitante). */
function recuperarSenha(){
  var to = cfg().recoveryEmail || cfg().painelUser;
  if(!to || !/@/.test(to)) throw new Error('Não há e-mail de recuperação configurado.');
  sendMail_(to, 'Central de Reservas — acesso da secretaria',
    'Você (ou alguém) pediu o lembrete de acesso ao painel.\n\n' +
    'E-mail: ' + cfg().painelUser + '\nSenha: ' + cfg().painelPass + '\n\n' +
    'Se não foi você, ignore este e-mail.\n\n— Central de Reservas FHOP');
  return { ok:true, hint: _maskEmail_(to) };
}
function _maskEmail_(e){
  e = String(e||''); var at = e.indexOf('@'); if(at < 1) return '***';
  var u = e.slice(0,at), d = e.slice(at);
  return (u.length<=2 ? u[0]+'*' : u.slice(0,2)+'***') + d;
}

function norm(raw){
  if(!raw) return null;
  var AL = cfg().aliases;
  var k = String(raw).toLowerCase().trim().replace(/\s+/g,' ');
  if(AL[k]) return AL[k];
  for(var a in AL){ if(k.indexOf(a) > -1) return AL[a]; }
  // fallback: o próprio nome canônico do espaço aparece no texto (ex.: "Sala 1")
  var esp = cfg().espacos || [];
  for(var i=0;i<esp.length;i++){ if(k.indexOf(String(esp[i]).toLowerCase()) > -1) return esp[i]; }
  return null;
}
/** Reconhece TODOS os espaços canônicos presentes no texto (evento com múltiplos espaços). */
function normAll(raw){
  if(!raw) return [];
  var k = String(raw).toLowerCase().trim().replace(/\s+/g,' ');
  var AL = cfg().aliases, esp = cfg().espacos || [], found = [];
  function add(v){ if(v && found.indexOf(v)<0) found.push(v); }
  for(var a in AL){ if(k.indexOf(a) > -1) add(AL[a]); }
  for(var i=0;i<esp.length;i++){ if(k.indexOf(String(esp[i]).toLowerCase()) > -1) add(esp[i]); }
  return found;
}
/** Define/edita o espaço de um evento da agenda (grava o local no próprio Google Agenda). */
function definirEspacoEvento(eventId, space){
  return editarEvento(eventId, { space: space });
}
/** Excluir um evento (ou série) direto na agenda do Google. */
function excluirEvento(eventId){
  if(!eventId) throw new Error('Evento inválido.');
  var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
  var d = null; try{ var e0 = cal.getEventById(eventId); if(e0) d = e0.getStartTime(); }catch(_){}
  apagarEvento_(cal, eventId);
  invalidarCache_();
  try{ if(d) CacheService.getScriptCache().remove('ag-'+d.getFullYear()+'-'+d.getMonth()); }catch(e){}
  return { ok:true };
}
/** Edita um evento da agenda: espaço, horário e (opcional) e-mail de confirmação. */
function editarEvento(eventId, campos){
  if(!eventId) throw new Error('Evento inválido.');
  campos = campos || {};
  var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
  var ev = cal.getEventById(eventId);
  if(!ev) throw new Error('Evento não encontrado na agenda.');
  if(campos.space != null){
    ev.setLocation(campos.space);
    var _c1 = String(campos.space).split(',')[0].trim();
    var cor = corEvento_(_c1); if(cor){ try{ ev.setColor(cor); }catch(e){} }
    // garante o espaço na descrição
    try{
      var d0 = ev.getDescription() || '';
      var d1 = d0.replace(/^Espaço:.*$/mi, '').replace(/\n{2,}/g,'\n').trim();
      ev.setDescription((campos.space ? ('Espaço: '+campos.space+'\n') : '') + d1);
    }catch(e){}
  }
  if(campos.date && campos.s && campos.e){
    ev.setTime(mkDate_(campos.date, campos.s), mkDate_(campos.date, campos.e));
  }
  if(campos.enviarEmail && campos.email && /@/.test(campos.email)){
    try{ ev.addGuest(campos.email); }catch(e){}
    var d = ev.getStartTime();
    sendMail_(campos.email, 'Reserva confirmada: ' + ev.getTitle(),
      'Sua reserva está confirmada.\n\n' +
      'Evento: ' + ev.getTitle() + '\n' +
      'Data: ' + fmtBR_(Utilities.formatDate(d, TZ, 'yyyy-MM-dd')) + '\n' +
      'Horário: ' + Utilities.formatDate(d, TZ, 'HH:mm') + '–' + Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm') + '\n' +
      'Local: ' + (campos.space || ev.getLocation() || '') + '\n\n— Central de Reservas FHOP');
  }
  invalidarCache_();
  try{ var dd = ev.getStartTime(); CacheService.getScriptCache().remove('ag-'+dd.getFullYear()+'-'+dd.getMonth()); }catch(e){}
  return { ok:true };
}

/* =========================================================
 * API (para o site hospedado no GitHub Pages chamar por fetch).
 * Responde JSON. Funções sensíveis exigem token (login por senha).
 * ========================================================= */
var API_PUBLIC = { getOcupacao:1, enviarReserva:1, recuperarSenha:1, getMe:1, getSelfUrl:1, getPagina:1 };
function _apiMap_(){
  return {
    getOcupacao:getOcupacao, enviarReserva:enviarReserva, recuperarSenha:recuperarSenha, getMe:getMe, getSelfUrl:getSelfUrl, getPagina:getPagina,
    getDados:getDados, getConfig:getConfig, saveConfig:saveConfig,
    aprovar:aprovar, recusar:recusar, desfazer:desfazer, excluir:excluir, excluirLote:excluirLote,
    editar:editar, editarAtendimento:editarAtendimento, encaminhar:encaminhar, encaminharComAgenda:encaminharComAgenda,
    adicionarOcorrencia:adicionarOcorrencia, adicionarOcorrenciasMultiplas:adicionarOcorrenciasMultiplas, getAgendaMes:getAgendaMes, getEspacosNaoReconhecidos:getEspacosNaoReconhecidos,
    definirEspacoEvento:definirEspacoEvento, editarEvento:editarEvento, excluirEvento:excluirEvento,
    migrarParaAtendimento:migrarParaAtendimento, migrarParaReserva:migrarParaReserva
  };
}
function apiCall_(fn, args, token){
  var map = _apiMap_(), f = map[fn];
  if(!f) throw new Error('Função não permitida: ' + fn);
  if(!API_PUBLIC[fn] && !validPainelToken_(token)) throw new Error('Sessão inválida — faça login novamente.');
  return f.apply(null, args || []);
}
function doPost(e){
  var res;
  try{
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    res = { result: apiCall_(body.fn, body.args || [], body.token || '') };
  }catch(err){ res = { error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

/** Um único link: a página de reserva serve todo mundo; com login (senha) abre o painel. */
function doGet(e){
  var pr = (e && e.parameter) || {};
  var p = pr.p || '';
  var autorizado = false, loginFalhou = false;
  if(p === 'painel'){
    if(validPainelToken_(pr.k)) autorizado = true;                 // token derivado no navegador (senha não trafega)
    else if(pr.k != null && pr.k !== '') loginFalhou = true;        // token veio, mas não confere
    else if(pr.pw != null){                                        // fallback antigo (senha no form)
      var okUser = String(pr.user||'').trim().toLowerCase() === String(cfg().painelUser).toLowerCase();
      var okPass = String(pr.pw) === String(cfg().painelPass);
      autorizado = okUser && okPass;
      loginFalhou = !autorizado;
    }
  }
  if(p !== 'reserva' && autorizado){
    var t = HtmlService.createTemplateFromFile('Index');
    t.AUTH = _painelToken_();
    t.BASEURL = getSelfUrl_();
    return t.evaluate()
      .setTitle('Central de Reservas FHOP')
      .addMetaTag('viewport','width=device-width, initial-scale=1');
  }
  var r = HtmlService.createTemplateFromFile('Reserva');
  r.LOGINERR = loginFalhou ? '1' : '';
  return r.evaluate()
    .setTitle('Reserva de Espaço · FHOP')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

// ---- Login por senha (mesmo link para reserva e painel) ----
function getSelfUrl_(){ try { return ScriptApp.getService().getUrl(); } catch(e){ return cfg().linkPainel || ''; } }
function getSelfUrl(){ return getSelfUrl_(); } // exposto ao formulário de login
function _painelToken_(){
  var seed = 'fhop::' + String(cfg().painelUser).toLowerCase() + '::' + String(cfg().painelPass);
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed));
}
function validPainelToken_(k){ return !!k && k === _painelToken_(); }
/** Valida e-mail+senha; devolve a URL do painel (mesmo app, com token). */
function login(email, pass){
  var okUser = String(email||'').trim().toLowerCase() === String(cfg().painelUser).toLowerCase();
  var okPass = String(pass||'') === String(cfg().painelPass);
  if(!okUser || !okPass) throw new Error('E-mail ou senha inválidos.');
  return { ok:true, url: getSelfUrl_() + '?p=painel&k=' + encodeURIComponent(_painelToken_()) };
}

/** Acha o índice da coluna cujo cabeçalho contém o texto (case-insensitive) */
function col(headers, needle){
  needle = needle.toLowerCase();
  for(var i=0;i<headers.length;i++){
    if(String(headers[i]).toLowerCase().indexOf(needle) > -1) return i;
  }
  return -1;
}

function col2(headers, needles){
  for(var n=0;n<needles.length;n++){ var i=col(headers, needles[n]); if(i>-1) return i; }
  return -1;
}

function fmtDate(v){
  if(v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if(typeof v === 'number'){ // número de série do Sheets (dias desde 1899-12-30)
    var base = new Date(Date.UTC(1899,11,30));
    base.setUTCDate(base.getUTCDate() + Math.floor(v));
    return Utilities.formatDate(base, 'UTC', 'yyyy-MM-dd');
  }
  var s = String(v||'').trim();
  var m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); // dd/mm/yyyy
  if(m) return m[3]+'-'+pad(m[2])+'-'+pad(m[1]);
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/); // já ISO
  if(m) return m[1]+'-'+m[2]+'-'+m[3];
  return s;
}
function fmtTime(v){
  if(v instanceof Date) return Utilities.formatDate(v, TZ, 'HH:mm');
  if(typeof v === 'number'){ // fração do dia (0.8125 = 19:30)
    var frac = v - Math.floor(v);
    var mins = Math.round(frac * 24 * 60);
    return pad(Math.floor(mins/60)) + ':' + pad(mins%60);
  }
  var s = String(v||'').trim();
  var m = s.match(/(\d{1,2}):(\d{2})/);
  if(m) return pad(m[1])+':'+m[2];
  return s;
}
function pad(n){ n=String(n); return n.length<2 ? '0'+n : n; }

function readSheet(id){
  var ss = SpreadsheetApp.openById(id);
  var sh = ss.getSheets()[0];
  var vals = sh.getDataRange().getValues();
  return vals;
}

/** Lê tudo e devolve ao cliente */
function getDados(){
  // Cache curto: recarregar/pollar fica instantâneo. Some ao gravar (upsertEstado_/enviarReserva).
  try{ var hit = CacheService.getScriptCache().get('dados'); if(hit) return JSON.parse(hit); }catch(_){}
  var out = _computeDados_();
  try{ CacheService.getScriptCache().put('dados', JSON.stringify(out), 40); }catch(_){}
  return out;
}
function invalidarCache_(){ try{ CacheService.getScriptCache().remove('dados'); }catch(_){} }
function _computeDados_(){
  var out = { requests: [], pastoral: [], calendar: [], erros: [] };

  // ---- Form 1: Reserva de espaço (departamentos) ----
  try{
    var v = readSheet(cfg().fontes.form1_reserva), h = v[0];
    var c = {
      nome: col(h,'respons'), dept: col(h,'departamento'), desc: col(h,'descri'),
      data: col(h,'data do evento'), ini: col(h,'início'), fim: col(h,'término'),
      esp: col(h,'espaços'), email: col(h,'e-mail')
    };
    for(var i=1;i<v.length;i++){
      var r = v[i]; if(!r[c.data] && !r[c.desc]) continue;
      var d1 = fmtDate(r[c.data]); if(d1 < CORTE) continue;
      out.requests.push({
        key:'F1-'+i,
        origem:'Form 1 · Reserva', tipo:'reserva',
        title: str(r[c.desc]) || 'Reserva',
        dept: str(r[c.dept]), solicitante: str(r[c.nome]), email: str(r[c.email]),
        date: d1, s: fmtTime(r[c.ini]), e: fmtTime(r[c.fim]),
        spaces: splitSpaces(r[c.esp])
      });
    }
  }catch(err){ out.erros.push('Form 1: '+err); }

  // ---- Form 3: Reserva pastoral ----
  try{
    var v3 = readSheet(cfg().fontes.form3_reserva), h3 = v3[0];
    var c3 = { pastor: col(h3,'pastor'), data: col(h3,'data'), ini: col(h3,'início'), fim: col(h3,'término'), esp: col(h3,'espaço'), email: col(h3,'e-mail') };
    for(var j=1;j<v3.length;j++){
      var r3 = v3[j]; if(!r3[c3.data]) continue;
      var d3 = fmtDate(r3[c3.data]); if(d3 < CORTE) continue;
      out.requests.push({
        key:'F3-'+j,
        origem:'Form 3 · Pastoral', tipo:'reserva',
        title: 'Programação pastoral', tagPastor: str(r3[c3.pastor]),
        email: str(r3[c3.email]),
        date: d3, s: fmtTime(r3[c3.ini]), e: fmtTime(r3[c3.fim]),
        spaces: splitSpaces(r3[c3.esp])
      });
    }
  }catch(err){ out.erros.push('Form 3: '+err); }

  // ---- Reservas online (página pública) ----
  try{
    var vs = getSolic_().getDataRange().getValues(), hs = vs[0], cs = {};
    SOLIC_COLS.forEach(function(name){ cs[name] = colExact(hs, name); });
    for(var w=1;w<vs.length;w++){
      var rw = vs[w]; if(!rw[cs.key]) continue;
      var dw = fmtDate(rw[cs.date]); if(dw && dw < CORTE) continue;
      var tp = str(rw[cs.tipo]) || 'reserva';
      if(tp === 'atendimento'){
        // atendimento lançado no painel → vai para a aba Atendimentos (motivo guardado na coluna dept)
        var _nd = (function(){ try{ return rw[cs.needs] ? JSON.parse(rw[cs.needs]) : null; }catch(e){ return null; } })();
        out.pastoral.push({ key: String(rw[cs.key]), nome: str(rw[cs.title]), motivo: str(rw[cs.dept]), tagPastor: str(rw[cs.tagPastor]), disp: '', date: dw, s: fmtTime(rw[cs.s]), e: fmtTime(rw[cs.e]), spaces: splitSpaces(rw[cs.spaces]), solicitante: str(rw[cs.solicitante]), email: str(rw[cs.email]), telefone: (_nd && _nd.telefone) ? String(_nd.telefone) : '', origem: str(rw[cs.dept]) ? 'Lançado no painel' : 'Migrado de solicitação' });
        continue;
      }
      out.requests.push({
        key: String(rw[cs.key]),
        origem:'Reserva online', tipo: tp,
        title: str(rw[cs.title]), dept: str(rw[cs.dept]), tagPastor: str(rw[cs.tagPastor]),
        solicitante: str(rw[cs.solicitante]), email: str(rw[cs.email]),
        date: dw, s: fmtTime(rw[cs.s]), e: fmtTime(rw[cs.e]),
        spaces: splitSpaces(rw[cs.spaces]),
        needs: (function(){ try{ return rw[cs.needs] ? JSON.parse(rw[cs.needs]) : null; }catch(e){ return null; } })()
      });
    }
  }catch(err){ out.erros.push('Reservas online: '+err); }

  // ---- Form 2: Atendimento pastoral (fila de encaminhamento) ----
  try{
    var v2 = readSheet(cfg().fontes.form2_pastoral), h2 = v2[0];
    var c2 = { carimbo: col(h2,'carimbo'), nome: col(h2,'nome completo'), motivo: col(h2,'aconselhamento'), dias: col(h2,'dias dispon'), hora: col(h2,'horário dispon'), email: col2(h2,['e-mail','email','endereço de e-mail']), tel: col2(h2,['telefone','celular','whatsapp','contato','fone']) };
    for(var k=1;k<v2.length;k++){
      var r2 = v2[k]; if(!r2[c2.nome]) continue;
      var dp = c2.carimbo>-1 ? fmtDate(r2[c2.carimbo]) : '';
      if(dp && dp < CORTE) continue;
      out.pastoral.push({
        key:'P2-'+k,
        nome: str(r2[c2.nome]),
        motivo: str(r2[c2.motivo]),
        email: c2.email>-1 ? str(r2[c2.email]) : '',
        telefone: c2.tel>-1 ? str(r2[c2.tel]) : '',
        disp: [str(r2[c2.dias]), str(r2[c2.hora])].filter(String).join(' — '),
        date: dp
      });
    }
  }catch(err){ out.erros.push('Form 2: '+err); }

  // ---- Agenda (confirmados) — só mês anterior + atual + próximo (leitura rápida) ----
  try{
    var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
    var hoje = new Date();
    var ini = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1);       // 1º dia do mês anterior
    var fim = new Date(hoje.getFullYear(), hoje.getMonth()+2, 1);       // 1º dia do mês seguinte ao próximo
    var evs = cal.getEvents(ini, fim);
    for(var m2=0; m2<evs.length; m2++){
      var ev = evs[m2];
      var _all = normAll([ev.getTitle(), ev.getDescription(), ev.getLocation()].join(' | '));
      out.calendar.push({
        id: ev.getId(),
        title: ev.getTitle(),
        date: Utilities.formatDate(ev.getStartTime(), TZ, 'yyyy-MM-dd'),
        s: Utilities.formatDate(ev.getStartTime(), TZ, 'HH:mm'),
        e: Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm'),
        space: _all[0] || null,
        spaces: _all
      });
    }
  }catch(err){ out.erros.push('Agenda: '+err); }

  // ---- Anexa o ESTADO (aprovado/recusado/encaminhado/excluído/editado) ----
  var estado = readEstado_();
  out.requests.forEach(function(r){
    var st = estado[r.key];
    if(st){
      r.status = st.status || 'pendente'; r.eventId = st.eventId; if(st.pastor) r.tagPastor = st.pastor;
      if(st.override){ var o = st.override;
        if(o.title) r.title = o.title; if(o.date) r.date = o.date;
        if(o.s) r.s = o.s; if(o.e) r.e = o.e; if(o.spaces) r.spaces = o.spaces;
        if(o.dept) r.dept = o.dept; if(o.email!=null) r.email = o.email;
        r.editado = true;
      }
    } else r.status = 'pendente';
  });
  out.pastoral.forEach(function(p){
    var st = estado[p.key];
    if(st){ p.status = st.status || 'pendente'; p.pastor = st.pastor;
      if(st.override){ var o = st.override;
        ['nome','motivo','telefone','email','disp'].forEach(function(f){ if(o[f]!=null && o[f]!=='') p[f] = o[f]; });
        p.editado = true;
      }
    } else p.status = 'pendente';
  });

  return out;
}

/* =========================================================
 * ESTADO (Etapa 2) — guardado numa planilha "Central" da fhopchurch.
 * Nada disso fica no navegador; vale em qualquer dispositivo.
 * ========================================================= */

var CENTRAL_COLS = ['key','status','pastor','eventId','override','titulo','quando','quem'];
var SOLIC_COLS = ['key','quando','title','tipo','dept','tagPastor','solicitante','email','date','s','e','spaces','needs'];

function getCentralSS_(){
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CENTRAL_ID_V2'), ss;
  if(id){ try { ss = SpreadsheetApp.openById(id); } catch(e){ id = null; } }
  if(!id){
    ss = SpreadsheetApp.create('FHOP — Central de Reservas (Estado)');
    props.setProperty('CENTRAL_ID_V2', ss.getId());
    ss.getSheets()[0].setName('estado');
  }
  return ss;
}
function getSheet_(ss, name, cols){
  var sh = ss.getSheetByName(name);
  if(!sh){ sh = ss.insertSheet(name); sh.appendRow(cols); }
  else if(sh.getLastRow()===0){ sh.appendRow(cols); }
  return sh;
}
function getCentral_(){ return getSheet_(getCentralSS_(), 'estado', CENTRAL_COLS); }
function getSolic_(){ return getSheet_(getCentralSS_(), 'solicitacoes', SOLIC_COLS); }
function colExact(headers, name){ for(var i=0;i<headers.length;i++){ if(String(headers[i]).toLowerCase()===name.toLowerCase()) return i; } return -1; }

/** Reserva feita na página pública → cai na fila de Pendentes. */
function enviarReserva(data){
  if(!data || !data.title || !data.date) throw new Error('Preencha título e data.');
  var sh = getSolic_();
  var key = 'W-' + (new Date().getTime()) + '-' + Math.floor(Math.random()*1000);
  var quando = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  sh.appendRow([key, quando, data.title, data.tipo||'reserva', data.dept||'', data.tagPastor||'',
    data.solicitante||'', data.email||'', data.date, data.s||'', data.e||'',
    (data.spaces||[]).join(', '), data.needs?JSON.stringify(data.needs):'']);
  invalidarCache_();
  return { ok:true, key:key };
}

/** Cria a MESMA ocorrência em várias datas específicas (cada uma vira um evento). */
function adicionarOcorrenciasMultiplas(data, datas, aprovarJa){
  if(!datas || !datas.length) throw new Error('Escolha ao menos uma data.');
  var n = 0;
  datas.forEach(function(dt){
    if(!dt) return;
    var d2 = Object.assign({}, data); d2.date = dt;
    var res = enviarReserva(d2);
    if(aprovarJa){
      aprovar({ key:res.key, title:d2.title, dept:d2.dept||'', tagPastor:d2.tagPastor||'',
        solicitante:d2.solicitante||'', email:d2.email||'', date:d2.date, s:d2.s, e:d2.e,
        spaces:d2.spaces||[], needs:d2.needs, origem:'Secretaria' });
    }
    n++;
  });
  return { ok:true, n:n };
}

/** Adicionar ocorrência direto no painel (secretaria). Opcional: já aprovar → agenda. */
function adicionarOcorrencia(data, aprovarJa){
  var res = enviarReserva(data);
  if(aprovarJa){
    aprovar({ key:res.key, title:data.title, dept:data.dept||'', tagPastor:data.tagPastor||'',
      solicitante:data.solicitante||'', email:data.email||'', date:data.date, s:data.s, e:data.e,
      spaces:data.spaces||[], needs:data.needs, recorrencia:data.recorrencia, origem:'Secretaria' });
  }
  return { ok:true };
}

// ---- E-mails (só a secretaria/servidor dispara) ----
function pastorEmail_(nome){
  var ps = cfg().pastores || [];
  for(var i=0;i<ps.length;i++){ if(String(ps[i].nome||'').toLowerCase() === String(nome||'').toLowerCase()) return ps[i].email||''; }
  return '';
}
function respEmail_(sub){
  var rs = cfg().responsaveis || [];
  for(var i=0;i<rs.length;i++){ if(String(rs[i].papel||'').toLowerCase().indexOf(sub) > -1) return rs[i].email||''; }
  return '';
}
function respNome_(sub){
  var rs = cfg().responsaveis || [];
  for(var i=0;i<rs.length;i++){ if(String(rs[i].papel||'').toLowerCase().indexOf(sub) > -1) return rs[i].nome||''; }
  return '';
}
// Data ISO (yyyy-MM-dd) → DD/MM/AAAA para os e-mails.
function fmtBR_(iso){
  var s = String(iso||''); var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? (m[3]+'/'+m[2]+'/'+m[1]) : s;
}
function _esc_(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// Monta o HTML deixando o "Título:" de cada linha em negrito.
function _htmlBody_(body){
  return String(body||'').split('\n').map(function(line){
    var m = line.match(/^([^:]{1,40}):\s?(.*)$/);
    if(m) return '<b>' + _esc_(m[1]) + ':</b> ' + _esc_(m[2]);
    return _esc_(line);
  }).join('<br>');
}
function sendMail_(to, subject, body){
  if(!to || !/@/.test(to)) return;
  try{ MailApp.sendEmail({ to: to, subject: subject, body: body, htmlBody: _htmlBody_(body) }); }catch(e){}
}
// Envia um e-mail cujo corpo JÁ é HTML (modelos editáveis do Admin).
function sendMailHtml_(to, subject, html){
  if(!to || !/@/.test(to)) return;
  var plain = String(html||'').replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,'');
  try{ MailApp.sendEmail({ to: to, subject: subject, body: plain, htmlBody: html }); }catch(e){}
}
// Preenche {placeholders} de um modelo.
function _tpl_(tpl, map){ return String(tpl||'').replace(/\{(\w+)\}/g, function(_,k){ return (map[k]!=null) ? map[k] : ''; }); }
// Responsável por papel (match exato; depois por substring).
function respByPapel_(papel){
  var rs = cfg().responsaveis || []; var p = String(papel||'').toLowerCase().trim(); if(!p) return null;
  for(var i=0;i<rs.length;i++){ if(String(rs[i].papel||'').toLowerCase().trim() === p) return rs[i]; }
  for(var j=0;j<rs.length;j++){ if(String(rs[j].papel||'').toLowerCase().indexOf(p) > -1) return rs[j]; }
  return null;
}
// Normaliza os "needs" recebidos numa LISTA de grupos {resp, rotulo, itens[], texto}.
// Aceita o formato novo (needs.groups) e o antigo (chaves Patrimônio/Audiovisual/Secretaria + textos/obs).
function needsGroups_(needs){
  if(!needs) return [];
  if(needs.groups instanceof Array){
    return needs.groups.map(function(g){ return { resp:String(g.resp||''), rotulo:String(g.rotulo||g.resp||''), itens:(g.itens instanceof Array?g.itens:[]), texto:String(g.texto||'') }; });
  }
  var out=[], tx=needs.textos||{};
  function add(resp, rotulo, itens, texto){ if((itens&&itens.length)||texto) out.push({resp:resp, rotulo:rotulo, itens:itens||[], texto:texto||''}); }
  Object.keys(needs).forEach(function(cat){
    if(cat==='obs'||cat==='textos'||cat==='extras'||cat==='groups') return;
    var low=String(cat).toLowerCase(), itens=needs[cat];
    if(low.indexOf('patrim')>-1) add('Patrimônio','Patrimônio',itens,tx.patrim||'');
    else if(low.indexOf('audio')>-1) add('Audiovisual','Audiovisual',itens,tx.av||'');
    else if(low.indexOf('secret')>-1||low.indexOf('café')>-1||low.indexOf('cafe')>-1) add('Secretaria','Secretaria',itens,needs.obs||'');
  });
  // textos/obs sem itens marcados
  if(tx.patrim && !out.some(function(g){return g.resp==='Patrimônio';})) add('Patrimônio','Patrimônio',[],tx.patrim);
  if(tx.av && !out.some(function(g){return g.resp==='Audiovisual';})) add('Audiovisual','Audiovisual',[],tx.av);
  if(needs.obs && !out.some(function(g){return g.resp==='Secretaria';})) add('Secretaria','Secretaria',[],needs.obs);
  return out;
}
// Cor (id "1".."11") do evento conforme o espaço.
function corEvento_(space){
  if(!space) return '';
  var m = cfg().cores || {}; return m[space] ? String(m[space]) : '';
}
// Força o e-mail de convite (mesmo p/ mesmo domínio) via API avançada do Agenda; retorna true se conseguiu.
function forcarConvites_(calId, iCalUID, emails){
  emails = (emails||[]).filter(function(e){ return e && /@/.test(e); });
  if(!emails.length) return true;
  try{
    if(typeof Calendar === 'undefined' || !Calendar.Events) return false; // serviço avançado não habilitado
    var found = Calendar.Events.list(calId, { iCalUID: iCalUID, maxResults: 1 });
    if(!found.items || !found.items.length) return false;
    var apiId = found.items[0].id;
    var ev = Calendar.Events.get(calId, apiId);
    var att = ev.attendees || [];
    emails.forEach(function(e){ if(!att.some(function(a){ return String(a.email||'').toLowerCase() === e.toLowerCase(); })) att.push({ email: e }); });
    Calendar.Events.patch({ attendees: att }, calId, apiId, { sendUpdates: 'all' });
    return true;
  }catch(err){ return false; }
}

// E-mails dos responsáveis envolvidos (por grupo de insumos) que entram como CONVIDADOS na agenda.
function emailsResponsaveisEnvolvidos_(req){
  var out = [];
  needsGroups_(req.needs).forEach(function(g){
    if(!g.itens.length && !g.texto) return;
    var r = respByPapel_(g.resp);
    if(r && r.email && /@/.test(r.email) && out.indexOf(r.email) < 0) out.push(r.email);
  });
  return out;
}
function notificarResponsaveis_(req){
  var quando = fmtBR_(req.date) + ' ' + (req.s||'') + '–' + (req.e||'');
  var local = (req.spaces||[]).join(', ');
  if(req.tagPastor){ sendMail_(pastorEmail_(req.tagPastor), 'Reserva aprovada: '+req.title,
    'Olá '+req.tagPastor+',\n\nReserva aprovada:\n'+req.title+'\n'+quando+'\nLocal: '+local+'\n\n— Central de Reservas FHOP'); }
  // Aviso ao departamento responsável (e-mail configurado no Admin > Responsáveis).
  if(req.dept){
    var toDep = respEmail_('depart');
    if(toDep) sendMail_(toDep, 'Reserva confirmada · '+req.dept,
      'A reserva do departamento '+req.dept+' foi confirmada.\n\n' +
      'Evento: '+req.title+'\nQuando: '+quando+'\nLocal: '+local+'\n' +
      (req.solicitante?('Solicitante: '+req.solicitante+'\n'):'') +
      '\n— Central de Reservas FHOP');
  }
  if(!req.needs) return;
  var extras = (req.needs.extras instanceof Array) ? req.needs.extras : [];
  var extrasHtml = extras.length ? ('<br><b>Informações adicionais:</b><br>' + extras.map(function(x){ return _esc_(x.label||'') + ': ' + _esc_(x.valor||''); }).join('<br>') + '<br>') : '';
  var contatoHtml = (req.solicitante ? ('<b>Solicitante:</b> '+_esc_(req.solicitante)+'<br>') : '') + (req.email ? ('<b>Contato:</b> '+_esc_(req.email)+'<br>') : '');
  // Junta os grupos por responsável (um e-mail por responsável, com o corpo dele).
  var byResp = {};
  needsGroups_(req.needs).forEach(function(g){
    if(!g.itens.length && !g.texto) return;
    var r = respByPapel_(g.resp); if(!r || !r.email || !/@/.test(r.email)) return;
    var k = r.email.toLowerCase();
    if(!byResp[k]) byResp[k] = { resp:r, area:(g.rotulo||r.papel), itens:[], textos:[] };
    byResp[k].itens = byResp[k].itens.concat(g.itens||[]);
    if(g.texto) byResp[k].textos.push(g.texto);
  });
  Object.keys(byResp).forEach(function(k){
    var B = byResp[k], r = B.resp;
    var itensHtml = B.itens.length ? ('<br><b>Itens marcados:</b><br>• ' + B.itens.map(_esc_).join('<br>• ') + '<br>') : '';
    var textoHtml = B.textos.length ? ('<br><b>Pedido:</b><br>' + B.textos.map(_esc_).join('<br>') + '<br>') : '';
    var isSecret = String(r.papel||'').toLowerCase().indexOf('secret') > -1;
    var map = {
      responsavel: _esc_(r.nome||''), area: _esc_(B.area||r.papel||''),
      evento: _esc_(req.title||''), data: _esc_(fmtBR_(req.date)),
      horario: _esc_((req.s||'')+'–'+(req.e||'')), local: _esc_(local),
      solicitante: _esc_(req.solicitante||''), contato: contatoHtml, itens: itensHtml, texto: textoHtml
    };
    var body = _tpl_(r.corpo || EMAIL_RESP_DEF, map) + (isSecret ? extrasHtml : '');
    sendMailHtml_(r.email, (B.area||r.papel) + ' · ' + req.title, body);
  });
}

/** Encaminhar atendimento pastoral COM data/hora/local → cria evento na agenda + avisa o pastor. */
function encaminharComAgenda(item, det){
  if(!item || !item.key || !det || !det.pastor || !det.date) throw new Error('Informe pastor e data.');
  var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
  var start = mkDate_(det.date, det.s||'09:00'), end = mkDate_(det.date, det.e||det.s||'10:00');
  var titulo = 'Atendimento pastoral — ' + det.pastor;
  var local = det.local || '';
  // ÉTICA/PRIVACIDADE: o evento da agenda NÃO leva nome nem motivo do membro (fica visível na agenda).
  // Esses dados vão só no e-mail ao pastor, abaixo.
  var desc = local ? ('Espaço: ' + local) : '';
  var opts = { location: local, description: desc };
  var pe = pastorEmail_(det.pastor), guests = [];
  if(pe) guests.push(pe);
  if(det.email && /@/.test(det.email)) guests.push(det.email);
  if(guests.length){ opts.guests = guests.join(','); opts.sendInvites = true; }
  var ev = cal.createEvent(titulo, start, end, opts);
  upsertEstado_(item.key, { status:'encaminhado', pastor:det.pastor, eventId: ev.getId(), titulo:item.nome||'' });
  sendMail_(pe, 'Atendimento pastoral encaminhado',
    'Você recebeu um atendimento:\nMembro: '+(item.nome||'')+
    (item.telefone?('\nTelefone: '+item.telefone):'')+
    (det.email?('\nE-mail: '+det.email):'')+
    '\nData: '+fmtBR_(det.date)+' '+(det.s||'')+'–'+(det.e||'')+'\nLocal: '+local+
    (item.motivo?('\nMotivo: '+item.motivo):'')+'\n\n— Central de Reservas FHOP');
  return { ok:true };
}

/** Eventos da agenda de UM mês (ano, mes 0-11) — para carregar sob demanda ao navegar o calendário. */
function getAgendaMes(ano, mes){
  ano = +ano; mes = +mes;
  var ck = 'ag-' + ano + '-' + mes;
  try{ var hit = CacheService.getScriptCache().get(ck); if(hit) return JSON.parse(hit); }catch(_){}
  var out = [];
  try{
    var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
    var evs = cal.getEvents(new Date(ano, mes, 1), new Date(ano, mes+1, 1));
    for(var i=0;i<evs.length;i++){ var ev = evs[i];
      var _all = normAll([ev.getTitle(), ev.getDescription(), ev.getLocation()].join(' | '));
      out.push({
        id: ev.getId(),
        title: ev.getTitle(),
        date: Utilities.formatDate(ev.getStartTime(), TZ, 'yyyy-MM-dd'),
        s: Utilities.formatDate(ev.getStartTime(), TZ, 'HH:mm'),
        e: Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm'),
        space: _all[0] || null,
        spaces: _all
      });
    }
  }catch(e){}
  try{ CacheService.getScriptCache().put(ck, JSON.stringify(out), 120); }catch(_){}
  return out;
}

/** Lista os textos de espaço da agenda que o dicionário NÃO reconhece (para mapear no Admin). */
function getEspacosNaoReconhecidos(){
  var out = {};
  try{
    var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
    var hoje = new Date();
    var evs = cal.getEvents(new Date(hoje.getFullYear(), hoje.getMonth()-3, 1), new Date(hoje.getFullYear(), hoje.getMonth()+4, 1));
    for(var i=0;i<evs.length;i++){ var ev = evs[i];
      if(norm([ev.getTitle(), ev.getDescription(), ev.getLocation()].join(' | '))) continue; // já reconhecido
      var sample = str(ev.getLocation()) || str(ev.getTitle());
      if(!sample) continue;
      var key = sample.toLowerCase().trim();
      if(!out[key]) out[key] = { sample: sample, count: 0 };
      out[key].count++;
    }
  }catch(e){}
  return Object.keys(out).map(function(k){ return out[k]; })
    .sort(function(a,b){ return b.count - a.count; }).slice(0, 40);
}

/** Ocupação confirmada (só espaço+horário, sem nomes) para a página pública checar conflito. */
function getOcupacao(){
  var out = [];
  try{
    var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
    var cp = CORTE.split('-');
    var evs = cal.getEvents(new Date(+cp[0],+cp[1]-1,+cp[2]), new Date(+cp[0]+1,+cp[1]-1,+cp[2]));
    for(var i=0;i<evs.length;i++){
      var ev = evs[i];
      var _all = normAll([ev.getTitle(), ev.getDescription(), ev.getLocation()].join(' | '));
      if(!_all.length) continue;
      var _d = Utilities.formatDate(ev.getStartTime(),TZ,'yyyy-MM-dd'),
          _s = Utilities.formatDate(ev.getStartTime(),TZ,'HH:mm'),
          _e = Utilities.formatDate(ev.getEndTime(),TZ,'HH:mm');
      for(var _j=0;_j<_all.length;_j++){ out.push({ date:_d, s:_s, e:_e, space:_all[_j] }); }
    }
  }catch(e){}
  return out;
}

function readEstado_(){
  var sh = getCentral_(), v = sh.getDataRange().getValues(), map = {};
  for(var i=1;i<v.length;i++){
    var row = v[i]; if(!row[0]) continue;
    var ov = null; if(row[4]){ try { ov = JSON.parse(row[4]); } catch(e){} }
    map[row[0]] = { status: row[1], pastor: row[2], eventId: row[3], override: ov };
  }
  return map;
}

// upsert por key — aplica só os campos passados em patch, preserva o resto
function upsertEstado_(key, patch){
  var sh = getCentral_(), v = sh.getDataRange().getValues(), found = -1, cur = null;
  for(var i=1;i<v.length;i++){ if(v[i][0]===key){ found = i+1; cur = v[i]; break; } }
  var who = ''; try { who = Session.getActiveUser().getEmail() || ''; } catch(e){}
  var when = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var row = {
    status:  patch.status  !== undefined ? patch.status  : (cur ? cur[1] : 'pendente'),
    pastor:  patch.pastor  !== undefined ? patch.pastor  : (cur ? cur[2] : ''),
    eventId: patch.eventId !== undefined ? patch.eventId : (cur ? cur[3] : ''),
    override:patch.override!== undefined ? (patch.override?JSON.stringify(patch.override):'') : (cur ? cur[4] : ''),
    titulo:  patch.titulo  !== undefined ? patch.titulo  : (cur ? cur[5] : '')
  };
  var data = [key, row.status, row.pastor, row.eventId, row.override, row.titulo, when, who];
  if(found>0) sh.getRange(found,1,1,8).setValues([data]);
  else sh.appendRow(data);
  invalidarCache_();
}

function mkDate_(date, time){
  var d = date.split('-'), t = (time||'00:00').split(':');
  return new Date(+d[0], +d[1]-1, +d[2], +t[0], +t[1], 0);
}

/** Aprovar: cria o evento na agenda + convida o e-mail do solicitante. */
function aprovar(req){
  if(!req || !req.key) throw new Error('Pedido inválido.');
  var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
  var start = mkDate_(req.date, req.s), end = mkDate_(req.date, req.e);
  var quem = req.tagPastor ? ('Pastor: '+req.tagPastor) : (req.dept ? ('Depto: '+req.dept) : '');
  var titulo = req.title + (req.dept ? ' — '+req.dept : (req.tagPastor ? ' — '+req.tagPastor : ''));
  var local = (req.spaces||[]).join(', ');
  var desc = local ? ('Espaço: ' + local) : '';
  var opts = { location: local, description: desc };
  var ev;
  if(req.recorrencia && +req.recorrencia.vezes > 1){
    var R = CalendarApp.newRecurrence(), n = +req.recorrencia.vezes, tipo = req.recorrencia.tipo || 'semanal';
    if(tipo==='diaria') R.addDailyRule().times(n);
    else if(tipo==='mensal') R.addMonthlyRule().times(n);
    else if(tipo==='quinzenal') R.addWeeklyRule().interval(2).times(n);
    else R.addWeeklyRule().times(n);
    ev = cal.createEventSeries(titulo, start, end, R, opts);
  } else {
    ev = cal.createEvent(titulo, start, end, opts);
  }
  var cor = corEvento_((req.spaces||[])[0]); if(cor){ try{ ev.setColor(cor); }catch(e){} } // cor por espaço
  // convidados: quem solicitou + patrimônio/AV (quando houver). Força o e-mail de convite.
  var guests = [];
  if(req.email && /@/.test(req.email)) guests.push(req.email);
  emailsResponsaveisEnvolvidos_(req).forEach(function(em){ if(guests.indexOf(em) < 0) guests.push(em); });
  if(guests.length){
    var enviou = forcarConvites_(cfg().fontes.agenda, ev.getId(), guests);   // API avançada (e-mail garantido)
    if(!enviou){ guests.forEach(function(em){ try{ ev.addGuest(em); }catch(e){} }); } // fallback
  }
  upsertEstado_(req.key, { status:'aprovado', pastor:req.tagPastor||'', eventId:ev.getId(), titulo:req.title });
  try { notificarResponsaveis_(req); } catch(e){}
  // avisa o solicitante que foi confirmado (modelo editável no Admin)
  if(req.email && /@/.test(req.email)){
    var cmap = { solicitante:_esc_(req.solicitante||''), evento:_esc_(req.title||''),
      data:_esc_(fmtBR_(req.date)), horario:_esc_((req.s||'')+'–'+(req.e||'')), local:_esc_(local) };
    sendMailHtml_(req.email, 'Reserva confirmada: '+req.title, _tpl_(cfg().emailConfirmacao || EMAIL_CONFIRM_DEF, cmap));
  }
  return { ok:true, eventId: ev.getId() };
}

/** Recusar: marca como recusado (não cria evento) + avisa o solicitante (com motivo opcional). */
function recusar(req, motivo){
  if(!req || !req.key) throw new Error('Pedido inválido.');
  motivo = (motivo && String(motivo).trim()) ? String(motivo).trim() : '';
  upsertEstado_(req.key, { status:'recusado', titulo:req.title||'' });
  if(req.email && /@/.test(req.email)){
    sendMail_(req.email, 'Reserva não confirmada: '+req.title,
      'Olá'+(req.solicitante?(' '+req.solicitante):'')+',\n\nInfelizmente sua reserva NÃO pôde ser confirmada.\n\n' +
      'Evento: '+req.title+'\nData: '+fmtBR_(req.date)+'\nHorário: '+(req.s||'')+'–'+(req.e||'')+'\nLocal: '+(req.spaces||[]).join(', ')+'\n' +
      (motivo ? ('\nMotivo: '+motivo+'\n') : '') +
      '\nFale com a secretaria para verificar outra data/horário.\n\n— Central de Reservas FHOP');
  }
  return { ok:true };
}
/** Converte um ATENDIMENTO de volta em SOLICITAÇÃO de reserva (desfaz uma migração feita por engano). */
function migrarParaReserva(pas){
  if(!pas || !pas.key) throw new Error('Atendimento inválido.');
  var novo = {
    title: pas.motivo || pas.nome || 'Reserva',
    tipo: 'reserva',
    dept: '',
    tagPastor: pas.tagPastor || '',
    solicitante: pas.nome || pas.solicitante || '',
    email: pas.email || '',
    date: pas.date || '', s: pas.s || '', e: pas.e || '',
    spaces: pas.spaces || [],
    needs: (pas.telefone ? { telefone: pas.telefone } : null)
  };
  var res = enviarReserva(novo);
  excluir(pas);
  invalidarCache_();
  return { ok:true, key: res.key };
}

/** Remove da agenda um evento único OU uma série recorrente, pelo id. */
function apagarEvento_(cal, id){
  if(!id) return;
  try{ var ev = cal.getEventById(id); if(ev){ ev.deleteEvent(); return; } }catch(e){}
  try{ var s = cal.getEventSeriesById(id); if(s){ s.deleteEventSeries(); } }catch(e){}
}

/** Excluir/ocultar: some da lista, MAS não apaga da planilha do formulário. */
function excluir(item){
  if(!item || !item.key) throw new Error('Item inválido.');
  var estado = readEstado_(), st = estado[item.key];
  if(st && st.eventId){
    try { apagarEvento_(CalendarApp.getCalendarById(cfg().fontes.agenda), st.eventId); } catch(e){}
  }
  upsertEstado_(item.key, { status:'excluido', eventId:'' });
  return { ok:true };
}

/** Converte uma SOLICITAÇÃO de reserva em ATENDIMENTO pastoral (casos em que o pastor usou o form de reserva). */
function migrarParaAtendimento(req){
  if(!req || !req.key) throw new Error('Solicitação inválida.');
  var novo = {
    title: req.solicitante || req.title || 'Atendimento',   // nome da pessoa
    tipo: 'atendimento',
    dept: req.title || '',                                    // vira o "motivo"
    tagPastor: req.tagPastor || '',
    solicitante: req.solicitante || '',
    email: req.email || '',
    date: req.date || '', s: req.s || '', e: req.e || '',
    spaces: req.spaces || [],
    needs: req.needs || null
  };
  var res = enviarReserva(novo);      // cria o atendimento (linha tipo=atendimento)
  excluir(req);                       // tira a solicitação original da fila
  invalidarCache_();
  return { ok:true, key: res.key };
}

/** Excluir em lote: recebe uma lista de keys, remove eventos e marca como excluído. */
function excluirLote(keys){
  if(!keys || !keys.length) return { ok:true, n:0 };
  var estado = readEstado_(), cal = null, n = 0;
  for(var i=0;i<keys.length;i++){
    var k = keys[i]; if(!k) continue;
    var st = estado[k];
    if(st && st.eventId){
      try { if(!cal) cal = CalendarApp.getCalendarById(cfg().fontes.agenda); apagarEvento_(cal, st.eventId); } catch(e){}
    }
    upsertEstado_(k, { status:'excluido', eventId:'' });
    n++;
  }
  return { ok:true, n:n };
}

/** Desfazer: remove o evento criado e volta a pendente (limpa exclusão também). */
function desfazer(req){
  if(!req || !req.key) throw new Error('Pedido inválido.');
  var estado = readEstado_(), st = estado[req.key];
  if(st && st.eventId){
    try { apagarEvento_(CalendarApp.getCalendarById(cfg().fontes.agenda), st.eventId); } catch(e){}
  }
  upsertEstado_(req.key, { status:'pendente', eventId:'' });
  return { ok:true };
}

/** Editar: guarda uma correção (título/data/hora/espaços/depto/email) sem mexer na planilha do formulário. */
function editar(req, campos){
  if(!req || !req.key || !campos) throw new Error('Dados inválidos.');
  upsertEstado_(req.key, { override: campos });
  return { ok:true };
}

/** Editar um atendimento (nome/motivo/telefone/email/disp) — guarda como override no estado. */
function editarAtendimento(key, campos){
  if(!key || !campos) throw new Error('Dados inválidos.');
  upsertEstado_(key, { override: campos });
  return { ok:true };
}

/** Encaminhar atendimento pastoral a um pastor (sem criar evento). */
function encaminhar(item, pastor){
  if(!item || !item.key || !pastor) throw new Error('Dados inválidos.');
  upsertEstado_(item.key, { status:'encaminhado', pastor:pastor, titulo:item.nome||'' });
  return { ok:true };
}

function str(v){ return v==null ? '' : String(v).trim(); }
function splitSpaces(v){
  var s = str(v); if(!s) return [];
  return s.split(',').map(function(x){ return norm(x); }).filter(function(x){ return !!x; });
}

/** Teste rápido no editor: veja os números no log */
function _teste(){
  var d = getDados();
  Logger.log('Requests: ' + d.requests.length);
  Logger.log('Pastoral: ' + d.pastoral.length);
  Logger.log('Agenda: '   + d.calendar.length);
  Logger.log('Erros: '    + JSON.stringify(d.erros));
}
