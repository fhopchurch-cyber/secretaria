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

function norm(raw){
  if(!raw) return null;
  var k = String(raw).toLowerCase().trim().replace(/\s+/g,' ');
  if(ALIASES[k]) return ALIASES[k];
  for(var a in ALIASES){ if(k.indexOf(a) > -1) return ALIASES[a]; }
  return null;
}

/** Serve o painel (autorizados) ou a página pública de reserva (demais/param). */
function doGet(e){
  var p = (e && e.parameter && e.parameter.p) || '';
  var email = ''; try { email = Session.getActiveUser().getEmail() || ''; } catch(_){}
  var autorizado = ALLOWLIST.indexOf(email) > -1;
  var arquivo = (p === 'reserva' || !autorizado) ? 'Reserva' : 'Index';
  return HtmlService.createHtmlOutputFromFile(arquivo)
    .setTitle(arquivo === 'Reserva' ? 'Reserva de Espaço · FHOP' : 'Central de Reservas FHOP')
    .addMetaTag('viewport','width=device-width, initial-scale=1');
}

/** Acha o índice da coluna cujo cabeçalho contém o texto (case-insensitive) */
function col(headers, needle){
  needle = needle.toLowerCase();
  for(var i=0;i<headers.length;i++){
    if(String(headers[i]).toLowerCase().indexOf(needle) > -1) return i;
  }
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
    var v = readSheet(FONTES.form1_reserva), h = v[0];
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
    var v3 = readSheet(FONTES.form3_reserva), h3 = v3[0];
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

  // ---- Form 2: Atendimento pastoral (fila de encaminhamento) ----
  try{
    var v2 = readSheet(FONTES.form2_pastoral), h2 = v2[0];
    var c2 = { carimbo: col(h2,'carimbo'), nome: col(h2,'nome completo'), motivo: col(h2,'aconselhamento'), dias: col(h2,'dias dispon'), hora: col(h2,'horário dispon') };
    for(var k=1;k<v2.length;k++){
      var r2 = v2[k]; if(!r2[c2.nome]) continue;
      var dp = c2.carimbo>-1 ? fmtDate(r2[c2.carimbo]) : '';
      if(dp && dp < CORTE) continue;
      out.pastoral.push({
        key:'P2-'+k,
        nome: str(r2[c2.nome]),
        motivo: str(r2[c2.motivo]),
        disp: [str(r2[c2.dias]), str(r2[c2.hora])].filter(String).join(' — '),
        date: dp
      });
    }
  }catch(err){ out.erros.push('Form 2: '+err); }

  // ---- Agenda (confirmados) ----
  try{
    var cal = CalendarApp.getCalendarById(FONTES.agenda);
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

function getCentral_(){
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('CENTRAL_ID_V2'), ss;
  if(id){ try { ss = SpreadsheetApp.openById(id); } catch(e){ id = null; } }
  if(!id){
    ss = SpreadsheetApp.create('FHOP — Central de Reservas (Estado)');
    props.setProperty('CENTRAL_ID_V2', ss.getId());
    var sh0 = ss.getSheets()[0]; sh0.setName('estado'); sh0.appendRow(CENTRAL_COLS);
  }
  var sh = ss.getSheetByName('estado');
  if(!sh){ sh = ss.insertSheet('estado'); sh.appendRow(CENTRAL_COLS); }
  return sh;
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
  var cal = CalendarApp.getCalendarById(FONTES.agenda);
  var start = mkDate_(req.date, req.s), end = mkDate_(req.date, req.e);
  var quem = req.tagPastor ? ('Pastor: '+req.tagPastor) : (req.dept ? ('Depto: '+req.dept) : '');
  var titulo = req.title + (req.dept ? ' — '+req.dept : (req.tagPastor ? ' — '+req.tagPastor : ''));
  var local = (req.spaces||[]).join(', ');
  var desc = [quem, req.solicitante?('Solicitante: '+req.solicitante):'', 'Origem: '+(req.origem||''), 'Aprovado via Central de Reservas'].filter(String).join('\n');
  var opts = { location: local, description: desc };
  if(req.email && /@/.test(req.email)){ opts.guests = req.email; opts.sendInvites = true; }
  var ev = cal.createEvent(titulo, start, end, opts);
  upsertEstado_(req.key, { status:'aprovado', pastor:req.tagPastor||'', eventId:ev.getId(), titulo:req.title });
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
    try { var cal = CalendarApp.getCalendarById(FONTES.agenda); var ev = cal.getEventById(st.eventId); if(ev) ev.deleteEvent(); } catch(e){}
  }
  upsertEstado_(item.key, { status:'excluido', eventId:'' });
  return { ok:true };
}

/** Desfazer: remove o evento criado e volta a pendente (limpa exclusão também). */
function desfazer(req){
  if(!req || !req.key) throw new Error('Pedido inválido.');
  var estado = readEstado_(), st = estado[req.key];
  if(st && st.eventId){
    try { var cal = CalendarApp.getCalendarById(FONTES.agenda); var ev = cal.getEventById(st.eventId); if(ev) ev.deleteEvent(); } catch(e){}
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
