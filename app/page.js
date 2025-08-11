"use client";
import { useEffect, useMemo, useState } from "react";
import "./styles/global.css";

const CATEGORIAS = ["PROJETOS PROMOS","PROJETOS PUB","PROJETOS ÓBVIO"];
const ESTADOS = ["Em Curso","Finalizado"];
const STORAGE_KEY = "projetos_mvp_next_v1";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const fmt = d => d ? new Date(d).toLocaleDateString() : "Sem data";
const hojeISO = () => new Date().toISOString().slice(0,10);

const AMOSTRA = [
  { id: uid(), titulo: "Nova Temporada SIC 2025", categoria: "PROJETOS PROMOS", estado: "Em Curso",
    responsaveis:["Miguel Barriga","Joana"], proximosPassos:["Fechar packshot final","Confirmar Bento para VT Abertura"],
    timeline:[{id:uid(), etiqueta:"Evento", data:"2025-09-07", status:"PREVISTA"},{id:uid(), etiqueta:"Cromas", data:"2025-08-18", status:"PREVISTA"}],
    prioridade:"Alta", notas:"Cromas atrasados. Bento a confirmar.", tags:["VT Abertura","Cromas","Evento"], historico:[]
  },
  { id: uid(), titulo: "IEGCQT – Promo versão curta", categoria: "PROJETOS PROMOS", estado: "Em Curso",
    responsaveis:["Miguel Barriga","Franck","Joana"], proximosPassos:["Produzir spots de áudio","Integrar packshot"],
    timeline:[{id:uid(), etiqueta:"Entrega TV", data:"2025-08-17", status:"PREVISTA"}],
    prioridade:"Média", notas:"Música enviada. Áudio com Franck e Joana.", tags:["Rádio","Podcasts","Packshot"], historico:[]
  },
  { id: uid(), titulo: "Vitória – Promo Disney", categoria: "PROJETOS PROMOS", estado: "Em Curso",
    responsaveis:["Miguel Barriga","Duarte"], proximosPassos:["Gravar rádio com Cláudia","Fechar aprovação Disney"],
    timeline:[{id:uid(), etiqueta:"Entrega", data:"2025-08-22", status:"PREVISTA"},{id:uid(), etiqueta:"Entrega", data:"2025-08-25", status:"CONFIRMADA"}],
    prioridade:"Alta", notas:"Janela 21 a 25 agosto.", tags:["Promo","Disney","Aprovação"], historico:[]
  },
  { id: uid(), titulo: "Videocast Francisco Froes", categoria: "PROJETOS PUB", estado: "Em Curso",
    responsaveis:["Miguel Barriga"], proximosPassos:["Decidir sobre Jardim da Estrela"],
    timeline:[{id:uid(), etiqueta:"Confirmação espaço", data:"2025-08-22", status:"PREVISTA"}],
    prioridade:"Média", notas:"Vitrines impedem gravação. Aguardar Vanessa após 22 agosto.", tags:["Location","Jardim da Estrela"], historico:[]
  }
];

function detectarAtrasos(p) {
  const hoje = hojeISO();
  return (p.timeline||[]).filter(t => ["PREVISTA","CONFIRMADA"].includes(t.status) && t.data && t.data < hoje);
}
function detectarDivergencias(p){
  const by = new Map();
  (p.timeline||[]).forEach(it => {
    const k = it.etiqueta || "";
    by.set(k, [...(by.get(k)||[]), it]);
  });
  const ds = [];
  for (const [k, arr] of by){
    const datas = Array.from(new Set(arr.map(x => x.data)));
    const hasConf = arr.some(x => x.status === "CONFIRMADA");
    if (datas.length > 1 && hasConf) ds.push(k || "Sem etiqueta");
  }
  return ds;
}

// ====== parsing simples para extração automática a partir de texto ======
const KW_PASSOS = ["gravar","entregar","enviar","aprovar","confirmar","agendar","editar","validar","contactar","rever","fechar"];
const RE_ISO = /\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g;
const RE_DMY = /\b(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](20\d{2})\b/g;
function extrairDatas(texto){
  const out=[]; const push=(d,lab)=>out.push({id:uid(), data:d, etiqueta:lab||"Data", status:"PREVISTA"});
  texto.replace(RE_ISO, m=>{ push(m, ctx(texto,m)); return m; });
  texto.replace(RE_DMY, m=>{ const [d,mo,y]=m.split(/[\/-]/); const dd=(d+'').padStart(2,'0'); const mm=(mo+'').padStart(2,'0'); push(`${y}-${mm}-${dd}`, ctx(texto,m)); return m; });
  return out;
}
function ctx(txt, m){
  const s=txt.toLowerCase(); const i=s.indexOf(m.toLowerCase());
  const win=s.slice(Math.max(0,i-40), i+40);
  if (win.includes("entrega")||win.includes("deadline")||win.includes("prazo")) return "Entrega";
  if (win.includes("grava")) return "Gravação";
  if (win.includes("evento")) return "Evento";
  return "Data";
}
function extrairTags(t){ const r=/#([\p{L}\d_-]+)/gu; const set=new Set(); let m; while((m=r.exec(t))) set.add(m[1]); return [...set]; }
function extrairResp(t){ const r=/@([\p{L}_.-]+(?:\s+[\p{L}_.-]+)*)/gu; const set=new Set(); let m; while((m=r.exec(t))) set.add(m[1].trim()); return [...set]; }
function extrairPassos(t){ const linhas=t.split(/\n|•|\u2022|-/).map(s=>s.trim()).filter(Boolean); return [...new Set(linhas.filter(l=>KW_PASSOS.some(k=>l.toLowerCase().startsWith(k)||l.toLowerCase().includes(` ${k} `))))].slice(0,12); }
function resumoCurto(t){ const ls=t.split(/\n/).map(s=>s.trim()).filter(Boolean); const fortes=ls.filter(l=>/(entrega|prazo|confirm|aprova|grava|bloque|pendente|datas?)/i.test(l)); return (fortes.length?fortes:ls).slice(0,5).join("\n"); }
function parseTexto(t){ return { resumo:resumoCurto(t), proximosPassos:extrairPassos(t), timeline:extrairDatas(t), responsaveis:extrairResp(t), tags:extrairTags(t) }; }

// ====== componente ======
export default function Page(){
  const [projetos, setProjetos] = useState([]);
  const [cat, setCat] = useState(CATEGORIAS[0]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [alta, setAlta] = useState(false);

  // modais
  const [editing, setEditing] = useState(null);

  const [showCapture, setShowCapture] = useState(false);
  const [captureText, setCaptureText] = useState("");
  const [captureTarget, setCaptureTarget] = useState("");

  const [showBrief, setShowBrief] = useState(false);
  const [briefProject, setBriefProject] = useState(null);

  const [showGeneral, setShowGeneral] = useState(false);

  // NOVO: modal de Reunião/Email/Nota
  const [showHist, setShowHist] = useState(false);
  const [histTarget, setHistTarget] = useState("");
  const [histTipo, setHistTipo] = useState("reunião");
  const [histData, setHistData] = useState(hojeISO());
  const [histResumo, setHistResumo] = useState("");
  const [histConteudo, setHistConteudo] = useState("");
  const [histAutoIntegrar, setHistAutoIntegrar] = useState(true);

  useEffect(()=>{
    const raw = localStorage.getItem(STORAGE_KEY);
    setProjetos(raw ? JSON.parse(raw) : AMOSTRA);
  },[]);
  useEffect(()=>{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projetos));
  },[projetos]);

  const allTags = useMemo(()=> Array.from(new Set(projetos.flatMap(p=>p.tags||[]))), [projetos]);

  const filtrados = useMemo(()=>{
    const ql = q.toLowerCase();
    return projetos.filter(p=>{
      const texto=[p.titulo,p.notas,...(p.tags||[]),...(p.responsaveis||[])].join(" ").toLowerCase();
      const okQ = q ? texto.includes(ql) : true;
      const okT = tag ? (p.tags||[]).includes(tag) : true;
      const okP = alta ? p.prioridade === "Alta" : true;
      return okQ && okT && okP;
    });
  },[projetos,q,tag,alta]);

  function novo(){
    setEditing({ id: uid(), titulo:"", categoria:cat, estado:"Em Curso", responsaveis:[], proximosPassos:[], timeline:[], prioridade:"Média", notas:"", tags:[], historico:[] });
  }
  function gravar(){
    if (!editing.titulo.trim()) { alert("Dá um título ao projeto"); return; }
    setProjetos(prev=> prev.some(x=>x.id===editing.id) ? prev.map(x=> x.id===editing.id ? editing : x) : [editing, ...prev]);
    setEditing(null);
  }
  function apagar(id){ if (!confirm("Apagar este projeto?")) return; setProjetos(prev=>prev.filter(p=>p.id!==id)); }

  // CAPTURA (continua como estava)
  function abrirCaptura(p=null){
    setCaptureText(""); setCaptureTarget(p?.id || ""); setShowCapture(true);
  }
  function analisar(){
    if (!captureText.trim()) return;
    const parsed = parseTexto(captureText);
    setCaptureText(JSON.stringify(parsed, null, 2) + "\n\n" + captureText);
  }
  function aplicarCaptura(){
    const parts = captureText.split("\n\n");
    let parsed;
    try { parsed = JSON.parse(parts[0]); } catch { alert("Clica em Analisar primeiro"); return; }
    const alvo = captureTarget || (projetos[0]?.id || "");
    if (!alvo) { alert("Escolhe um projeto"); return; }
    setProjetos(prev => prev.map(p=>{
      if (p.id !== alvo) return p;
      const setUniq = arr => Array.from(new Set((arr||[]).filter(Boolean)));
      const novo = { ...p };
      novo.proximosPassos = setUniq([...(p.proximosPassos||[]), ...(parsed.proximosPassos||[])]);
      novo.responsaveis = setUniq([...(p.responsaveis||[]), ...(parsed.responsaveis||[])]);
      novo.tags = setUniq([...(p.tags||[]), ...(parsed.tags||[])]); 
      novo.timeline = [ ...(p.timeline||[]), ...(parsed.timeline||[]) ];
      novo.notas = (p.notas||"") + `\n\n[${new Date().toLocaleString()}] Resumo da captura:\n${parsed.resumo}`;
      novo.historico = [ ...(p.historico||[]), { id: uid(), data: new Date().toISOString(), origem: "captura", conteudo: parts.slice(1).join("\n\n"), resumo: parsed.resumo } ];
      return novo;
    }));
    setShowCapture(false);
  }

  // NOVO: REUNIÃO/EMAIL
  function abrirHistorico(p=null){
    setHistTarget(p?.id || ""); setHistTipo("reunião"); setHistData(hojeISO());
    setHistResumo(""); setHistConteudo(""); setHistAutoIntegrar(true);
    setShowHist(true);
  }
  function guardarHistorico(){
    const alvo = histTarget || (projetos[0]?.id || "");
    if (!alvo) { alert("Escolhe um projeto"); return; }
    const texto = histConteudo || histResumo;
    const parsed = histAutoIntegrar ? parseTexto(texto) : null;

    setProjetos(prev => prev.map(p=>{
      if (p.id !== alvo) return p;
      const novo = { ...p };
      // 1) guardar entrada
      novo.historico = [ ...(p.historico||[]), { id: uid(), data: new Date(histData).toISOString(), origem: histTipo, resumo: histResumo, conteudo: histConteudo } ];
      // 2) integrar automaticamente (opcional)
      if (parsed){
        const setUniq = arr => Array.from(new Set((arr||[]).filter(Boolean)));
        novo.proximosPassos = setUniq([...(p.proximosPassos||[]), ...(parsed.proximosPassos||[])]);
        novo.responsaveis   = setUniq([...(p.responsaveis||[]), ...(parsed.responsaveis||[])]);
        novo.tags           = setUniq([...(p.tags||[]), ...(parsed.tags||[])]);
        novo.timeline       = [ ...(p.timeline||[]), ...(parsed.timeline||[]) ];
        novo.notas = (p.notas||"") + `\n\n[${new Date().toLocaleString()}] Resumo (${histTipo}):\n${parsed.resumo}`;
      }
      return novo;
    }));
    setShowHist(false);
  }

  function mdProjeto(p){
    const atras = detectarAtrasos(p);
    const divs = detectarDivergencias(p);
    const linhas = (p.timeline||[]).slice().sort((a,b)=>(a.data||"").localeCompare(b.data||"")).map(t=>`- [${t.status}] ${t.etiqueta||"Sem etiqueta"} em ${fmt(t.data)}`).join("\n");
    const ult = (p.historico||[]).slice(-3).reverse().map(h=>`- ${new Date(h.data).toLocaleString()} • ${h.origem} • ${h.resumo || "(sem resumo)"}`).join("\n");
    const riscos = [];
    if (divs.length) riscos.push(`Divergências: ${divs.join(", ")}`);
    if (atras.length) riscos.push(`Atrasos: ${atras.map(a=>a.etiqueta+" "+fmt(a.data)).join(", ")}`);
    return `# ${p.titulo}
Estado: ${p.estado} | Categoria: ${p.categoria} | Prioridade: ${p.prioridade}
Responsáveis: ${(p.responsaveis||[]).join(", ") || "n/d"}

## Próximos passos
${(p.proximosPassos||[]).map(s=>"- "+s).join("\n") || "- n/d"}

## Timeline
${linhas || "- n/d"}

## Riscos e alertas
${riscos.join(" | ") || "Sem alertas"}

## Notas
${p.notas || ""}

## Histórico recente
${ult || "- n/d"}`;
  }
  function mdGeral(){
    const hoje = hojeISO();
    const todos = projetos;
    const emCurso = todos.filter(p=>p.estado==="Em Curso");
    const finalizados = todos.filter(p=>p.estado==="Finalizado");
    const proximas = todos.flatMap(p => (p.timeline||[]).map(t=>({p,t})))
      .filter(({t}) => ["PREVISTA","CONFIRMADA"].includes(t.status) && t.data && t.data>=hoje)
      .sort((a,b)=>a.t.data.localeCompare(b.t.data)).slice(0,18);
    const atrasos = todos.flatMap(p=> detectarAtrasos(p).map(t=>({p,t})));

    return `# Ponto de Situação Geral
Data: ${new Date().toLocaleString()}

## Visão rápida
- Em Curso: ${emCurso.length}
- Finalizados: ${finalizados.length}

## Próximas datas
${proximas.map(({p,t})=>`- ${fmt(t.data)} • ${p.titulo} • ${t.etiqueta} [${t.status}]`).join("\n") || "- n/d"}

## Atrasos
${atrasos.map(({p,t})=>`- ${fmt(t.data)} • ${p.titulo} • ${t.etiqueta}`).join("\n") || "- n/d"}
`;
  }

  function download(name, content, type="text/markdown"){
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">Gestão de Projetos</h1>
          <div className="muted">Boards por categoria, timeline, histórico e resumos</div>
        </div>
        <div className="flex">
          <button className="btn" onClick={()=>setShowGeneral(true)}>Ponto de situação</button>
          <button className="btn primary" onClick={novo}>Novo projeto</button>
        </div>
      </div>

      <div className="tabs">
        {CATEGORIAS.map(c => (
          <button key={c} className={"tab " + (c===cat ? "active": "")} onClick={()=>setCat(c)}>{c}</button>
        ))}
      </div>

      <div className="row">
        <input className="input" placeholder="Pesquisar" value={q} onChange={e=>setQ(e.target.value)} />
        <select className="select" value={tag} onChange={e=>setTag(e.target.value)}>
          <option value="">Todas as tags</option>
          {allTags.map(t=> <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex">
          <input type="checkbox" checked={alta} onChange={e=>setAlta(e.target.checked)} />
          Só prioridade alta
        </label>
      </div>

      <div className="board">
        {ESTADOS.map(est => (
          <div className="col" key={est}>
            <div className="flex" style={{justifyContent:"space-between"}}>
              <h2>{est}</h2>
              <button className="btn" onClick={novo}>Adicionar</button>
            </div>
            <div className="list">
              {filtrados.filter(p=>p.categoria===cat && p.estado===est).length===0 && (
                <div className="muted">Sem projetos</div>
              )}
              {filtrados.filter(p=>p.categoria===cat && p.estado===est).map(p => {
                const divs = detectarDivergencias(p);
                const atras = detectarAtrasos(p);
                const ult3 = (p.historico||[]).slice(-3).reverse();
                return (
                  <div className="card" key={p.id}>
                    <div className="flex" style={{justifyContent:"space-between"}}>
                      <strong>{p.titulo}</strong>
                      <div className="flex">
                        <button className="btn" onClick={()=>setEditing({...p})}>Editar</button>
                        <button className="btn" onClick={()=>abrirHistorico(p)}>Reunião/Email</button>
                        <button className="btn" onClick={()=>abrirCaptura(p)}>Capturar</button>
                        <button className="btn" onClick={()=>{ setBriefProject(p); setShowBrief(true); }}>Brief</button>
                        <button className="btn" onClick={()=>apagar(p.id)}>Apagar</button>
                      </div>
                    </div>

                    <div className="badges">
                      <span className="badge">{p.categoria}</span>
                      <span className="badge">{p.estado}</span>
                      {p.prioridade==="Alta" && <span className="badge warn">Alta</span>}
                      {(p.tags||[]).map(t => <span key={t} className="badge">{t}</span>)}
                      {(p.historico||[]).length>0 && <span className="badge">Histórico {(p.historico||[]).length}</span>}
                      {divs.length>0 && <span className="badge warn">Divergência</span>}
                      {atras.length>0 && <span className="badge warn">Atraso</span>}
                    </div>

                    {p.notas && <div className="muted" style={{whiteSpace:"pre-wrap"}}>{p.notas}</div>}
                    <div className="muted"><strong>Responsáveis:</strong> {(p.responsaveis||[]).join(", ") || "n/d"}</div>
                    {(p.proximosP
