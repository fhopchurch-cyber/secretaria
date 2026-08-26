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
var RESP_DEF = [{papel:'Patrimônio', nome:'Wanderson', email:'wanderson@fhop.com'},{papel:'Audiovisual', nome:'Bruna', email:'brunafbatista@fhop.com'},{papel:'Secretaria', nome:'', email:''}];

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
    responsaveis: stored.responsaveis || RESP_DEF.slice(),
    aliases: Object.assign({}, ALIASES, stored.aliases||{}),
    linkPainel: stored.linkPainel || '',
    painelUser: stored.painelUser || 'fhopchurch@fhop.com',
    painelPass: stored.painelPass || 'fhopchurch1234'
  };
  return _CFG;
}
function getConfig(){ return cfg(); }
function getLinkPainel(){ return cfg().linkPainel || ''; } // exposto à página pública (só a URL)
function getMe(token){
  var email=''; try{ email = Session.getActiveUser().getEmail()||''; }catch(_){}
  var admin = (cfg().allowlist.indexOf(email) > -1) || validPainelToken_(token);
  return { email: email || (validPainelToken_(token) ? cfg().painelUser : ''), admin: admin };
}
function saveConfig(novo, token){
  var email=''; try{ email = Session.getActiveUser().getEmail()||''; }catch(_){}
  var ok = (cfg().allowlist.indexOf(email) > -1) || validPainelToken_(token);
  if(!ok) throw new Error('Apenas a secretaria pode alterar as configurações.');
  var ss = getCentralSS_();
  var sh = ss.getSheetByName('config') || ss.insertSheet('config');
  sh.getRange('A1').setValue(JSON.stringify(novo));
  _CFG = null;
  return { ok:true };
}

function norm(raw){
  if(!raw) return null;
  var AL = cfg().aliases;
  var k = String(raw).toLowerCase().trim().replace(/\s+/g,' ');
  if(AL[k]) return AL[k];
  for(var a in AL){ if(k.indexOf(a) > -1) return AL[a]; }
  return null;
}

/** Um único link: a página de reserva serve todo mundo; com login (senha) abre o painel. */
function doGet(e){
  var p = (e && e.parameter && e.parameter.p) || '';
  var k = (e && e.parameter && e.parameter.k) || '';
  var email = ''; try { email = Session.getActiveUser().getEmail() || ''; } catch(_){}
  var porGoogle = cfg().allowlist.indexOf(email) > -1;      // conta fhopchurch logada = acesso direto
  var porSenha  = (p === 'painel') && validPainelToken_(k); // login por senha na própria página
  var autorizado = porGoogle || porSenha;
  var arquivo = (p !== 'reserva' && autorizado) ? 'Index' : 'Reserva';
  if(arquivo === 'Index'){
    var t = HtmlService.createTemplateFromFile('Index');
    t.AUTH = _painelToken_(); // prova de que passou pelo login (senha) ou pela conta autorizada
    return t.evaluate()
      .setTitle('Central de Reservas FHOP')
      .addMetaTag('viewport','width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Reserva')
    .setTitle('Reserva de Espaço · FHOP')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

// ---- Login por senha (mesmo link para reserva e painel) ----
function getSelfUrl_(){ try { return ScriptApp.getService().getUrl(); } catch(e){ return cfg().linkPainel || ''; } }
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
        out.pastoral.push({ key: String(rw[cs.key]), nome: str(rw[cs.title]), motivo: str(rw[cs.dept]), tagPastor: str(rw[cs.tagPastor]), disp: '', date: dw, origem: 'Lançado no painel' });
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
    var c2 = { carimbo: col(h2,'carimbo'), nome: col(h2,'nome completo'), motivo: col(h2,'aconselhamento'), dias: col(h2,'dias dispon'), hora: col(h2,'horário dispon'), email: col2(h2,['e-mail','email','endereço de e-mail']) };
    for(var k=1;k<v2.length;k++){
      var r2 = v2[k]; if(!r2[c2.nome]) continue;
      var dp = c2.carimbo>-1 ? fmtDate(r2[c2.carimbo]) : '';
      if(dp && dp < CORTE) continue;
      out.pastoral.push({
        key:'P2-'+k,
        nome: str(r2[c2.nome]),
        motivo: str(r2[c2.motivo]),
        email: c2.email>-1 ? str(r2[c2.email]) : '',
        disp: [str(r2[c2.dias]), str(r2[c2.hora])].filter(String).join(' — '),
        date: dp
      });
    }
  }catch(err){ out.erros.push('Form 2: '+err); }

  // ---- Agenda (confirmados) ----
  try{
    var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
    var cp = CORTE.split('-');
    var ini = new Date(+cp[0], +cp[1]-1, +cp[2]);       // a partir da data de corte
    var fim = new Date(+cp[0]+1, +cp[1]-1, +cp[2]);      // +1 ano
    var evs = cal.getEvents(ini, fim);
    for(var m2=0; m2<evs.length; m2++){
      var ev = evs[m2];
      var txt = [ev.getTitle(), ev.getDescription(), ev.getLocation()].join(' | ');
      var space = norm(txt);
      out.calendar.push({
        title: ev.getTitle(),
        date: Utilities.formatDate(ev.getStartTime(), TZ, 'yyyy-MM-dd'),
        s: Utilities.formatDate(ev.getStartTime(), TZ, 'HH:mm'),
        e: Utilities.formatDate(ev.getEndTime(), TZ, 'HH:mm'),
        space: space, raw: txt
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
    if(st){ p.status = st.status || 'pendente'; p.pastor = st.pastor; }
    else p.status = 'pendente';
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
  return { ok:true, key:key };
}

/** Adicionar ocorrência direto no painel (secretaria). Opcional: já aprovar → agenda. */
function adicionarOcorrencia(data, aprovarJa){
  var res = enviarReserva(data);
  if(aprovarJa){
    aprovar({ key:res.key, title:data.title, dept:data.dept||'', tagPastor:data.tagPastor||'',
      solicitante:data.solicitante||'', email:data.email||'', date:data.date, s:data.s, e:data.e,
      spaces:data.spaces||[], needs:data.needs, origem:'Secretaria' });
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
function sendMail_(to, subject, body){
  if(!to || !/@/.test(to)) return;
  try{ MailApp.sendEmail(to, subject, body); }catch(e){}
}
function notificarResponsaveis_(req){
  var quando = req.date + ' ' + (req.s||'') + '–' + (req.e||'');
  var local = (req.spaces||[]).join(', ');
  if(req.tagPastor){ sendMail_(pastorEmail_(req.tagPastor), 'Reserva aprovada: '+req.title,
    'Olá '+req.tagPastor+',\n\nReserva aprovada:\n'+req.title+'\n'+quando+'\nLocal: '+local+'\n\n— Central de Reservas FHOP'); }
  if(!req.needs) return;
  var obs = req.needs.obs || '';
  var textos = req.needs.textos || {};
  var contato = (req.solicitante ? ('Solicitante: '+req.solicitante+'\n') : '') + (req.email ? ('Contato: '+req.email+'\n') : '');
  // Agrupa por área: cada uma recebe SÓ o que é dela (itens marcados + campo de texto próprio).
  var areas = {
    patrim: { rotulo:'Patrimônio', itens:[], txt: textos.patrim || '' },
    audio:  { rotulo:'Audiovisual', itens:[], txt: textos.av || '' },
    secret: { rotulo:'Secretaria', itens:[], txt: '' }
  };
  Object.keys(req.needs).forEach(function(cat){
    if(cat === 'obs' || cat === 'textos') return;
    var itens = req.needs[cat]; if(!itens || !itens.length) return;
    var low = String(cat).toLowerCase();
    var a = low.indexOf('patrim') > -1 ? 'patrim'
          : (low.indexOf('audio') > -1 ? 'audio'
          : ((low.indexOf('secret') > -1 || low.indexOf('café') > -1 || low.indexOf('cafe') > -1) ? 'secret' : null));
    if(a && areas[a]) areas[a].itens = areas[a].itens.concat(itens);
  });
  ['patrim','audio','secret'].forEach(function(a){
    var A = areas[a];
    if(!A.itens.length && !A.txt) return;      // nada para essa área → não envia
    var to = respEmail_(a); if(!to) return;
    var corpo = 'Uma reserva foi confirmada e precisa de você.\n\n' +
      'Evento: ' + req.title + '\nQuando: ' + quando + '\nLocal: ' + local + '\n' + contato +
      (A.itens.length ? ('\nItens marcados:\n- ' + A.itens.join('\n- ') + '\n') : '') +
      (A.txt ? ('\nPedido (' + A.rotulo + '):\n' + A.txt + '\n') : '') +
      (obs ? ('\nObservações gerais: ' + obs + '\n') : '') +
      '\n— Central de Reservas FHOP';
    sendMail_(to, A.rotulo + ' · ' + req.title, corpo);
  });
}

/** Encaminhar atendimento pastoral COM data/hora/local → cria evento na agenda + avisa o pastor. */
function encaminharComAgenda(item, det){
  if(!item || !item.key || !det || !det.pastor || !det.date) throw new Error('Informe pastor e data.');
  var cal = CalendarApp.getCalendarById(cfg().fontes.agenda);
  var start = mkDate_(det.date, det.s||'09:00'), end = mkDate_(det.date, det.e||det.s||'10:00');
  var titulo = 'Atendimento pastoral — ' + det.pastor;
  var local = det.local || '';
  var desc = ['Membro: '+(item.nome||''), item.motivo?('Motivo: '+item.motivo):'', 'Encaminhado via Central'].filter(String).join('\n');
  var opts = { location: local, description: desc };
  var pe = pastorEmail_(det.pastor), guests = [];
  if(pe) guests.push(pe);
  if(det.email && /@/.test(det.email)) guests.push(det.email);
  if(guests.length){ opts.guests = guests.join(','); opts.sendInvites = true; }
  var ev = cal.createEvent(titulo, start, end, opts);
  upsertEstado_(item.key, { status:'encaminhado', pastor:det.pastor, eventId: ev.getId(), titulo:item.nome||'' });
  sendMail_(pe, 'Atendimento pastoral encaminhado',
    'Você recebeu um atendimento:\nMembro: '+(item.nome||'')+'\nData: '+det.date+' '+(det.s||'')+'–'+(det.e||'')+'\nLocal: '+local+(item.motivo?('\nMotivo: '+item.motivo):'')+'\n\n— Central de Reservas FHOP');
  return { ok:true };
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
      var space = norm([ev.getTitle(), ev.getDescription(), ev.getLocation()].join(' | '));
      if(!space) continue;
      out.push({ date: Utilities.formatDate(ev.getStartTime(),TZ,'yyyy-MM-dd'),
        s: Utilities.formatDate(ev.getStartTime(),TZ,'HH:mm'),
        e: Utilities.formatDate(ev.getEndTime(),TZ,'HH:mm'), space: space });
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
  var desc = [quem, req.solicitante?('Solicitante: '+req.solicitante):'', 'Origem: '+(req.origem||''), 'Aprovado via Central de Reservas'].filter(String).join('\n');
  var opts = { location: local, description: desc };
  if(req.email && /@/.test(req.email)){ opts.guests = req.email; opts.sendInvites = true; }
  var ev = cal.createEvent(titulo, start, end, opts);
  upsertEstado_(req.key, { status:'aprovado', pastor:req.tagPastor||'', eventId:ev.getId(), titulo:req.title });
  try { notificarResponsaveis_(req); } catch(e){}
  return { ok:true, eventId: ev.getId() };
}

/** Recusar: marca como recusado (não cria evento). */
function recusar(req){
  if(!req || !req.key) throw new Error('Pedido inválido.');
  upsertEstado_(req.key, { status:'recusado', titulo:req.title||'' });
  return { ok:true };
}

/** Excluir/ocultar: some da lista, MAS não apaga da planilha do formulário. */
function excluir(item){
  if(!item || !item.key) throw new Error('Item inválido.');
  // se tiver evento criado, remove da agenda também
  var estado = readEstado_(), st = estado[item.key];
  if(st && st.eventId){
    try { var cal = CalendarApp.getCalendarById(cfg().fontes.agenda); var ev = cal.getEventById(st.eventId); if(ev) ev.deleteEvent(); } catch(e){}
  }
  upsertEstado_(item.key, { status:'excluido', eventId:'' });
  return { ok:true };
}

/** Excluir em lote: recebe uma lista de keys, remove eventos e marca como excluído. */
function excluirLote(keys){
  if(!keys || !keys.length) return { ok:true, n:0 };
  var estado = readEstado_(), cal = null, n = 0;
  for(var i=0;i<keys.length;i++){
    var k = keys[i]; if(!k) continue;
    var st = estado[k];
    if(st && st.eventId){
      try { if(!cal) cal = CalendarApp.getCalendarById(cfg().fontes.agenda); var ev = cal.getEventById(st.eventId); if(ev) ev.deleteEvent(); } catch(e){}
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
    try { var cal = CalendarApp.getCalendarById(cfg().fontes.agenda); var ev = cal.getEventById(st.eventId); if(ev) ev.deleteEvent(); } catch(e){}
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
