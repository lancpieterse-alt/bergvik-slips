/* Pure logic: statement parsing and slip matching. No DOM or network, so it can be tested directly. */
(function (root) {
  const MONTHS = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  const iso = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const dayNum = s => Math.round(Date.parse(s+'T00:00:00Z')/864e5);

  function parseCSV(text) {
    text = text.replace(/^﻿/,'');
    const first = text.split(/\r?\n/).find(l=>l.trim()) || '';
    const delim = [',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
    const rows=[]; let row=[],cell='',q=false;
    for (let i=0;i<text.length;i++){ const c=text[i];
      if(q){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++} else q=false } else cell+=c }
      else if(c==='"') q=true;
      else if(c===delim){row.push(cell);cell=''}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}
      else if(c!=='\r') cell+=c;
    }
    if(cell!==''||row.length){row.push(cell);rows.push(row)}
    return rows.filter(r=>r.some(c=>String(c).trim()!=='')).map(r=>r.map(c=>String(c).trim()));
  }

  function parseAmount(v) {
    if (typeof v==='number') return v;
    if (v==null) return null;
    let s=String(v).trim(); if(!s) return null;
    let neg=/^\(.*\)$/.test(s)||/^-/.test(s)||/-$/.test(s);
    if(/\bcr\b/i.test(s)) neg=true;
    s=s.replace(/[^0-9.,]/g,'');
    if(!/\d/.test(s)) return null;
    const lc=s.lastIndexOf(','), ld=s.lastIndexOf('.');
    if(lc>ld && s.length-lc-1<=2) s=s.replace(/\./g,'').replace(',','.'); else s=s.replace(/,/g,'');
    const n=parseFloat(s); if(!isFinite(n)) return null;
    return neg?-n:n;
  }

  function parseDate(v) {
    if (v instanceof Date && !isNaN(v)) return iso(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate());
    if (v==null) return null;
    const s=String(v).trim(); let m;
    if((m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(+m[1],+m[2]-1,+m[3]);
    if((m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) return iso(+m[3],+m[2]-1,+m[1]);
    if((m=s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4})/))&&MONTHS[m[2].toUpperCase()]!=null) return iso(+m[3],MONTHS[m[2].toUpperCase()],+m[1]);
    return null;
  }

  /* FNB card lines look like: "275.86 ADOBE ACROPR 491050*6834  25 FEB" */
  function parseDescriptor(desc, postDate) {
    const out={merchant:(desc||'').trim(),prefix:null,last4:null,txn_date:null};
    let s=out.merchant, m;
    if((m=s.match(/^(\d+\.\d{2})\s+(.*)$/))){out.prefix=parseFloat(m[1]);s=m[2]}
    if((m=s.match(/(\d{4,6})\*(\d{4})/))){out.last4=m[2];s=s.replace(m[0],' ')}
    if((m=s.match(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s*$/i))){
      const mon=MONTHS[m[2].toUpperCase()]; s=s.replace(m[0],' ');
      if(postDate){
        let y=+postDate.slice(0,4); const pm=+postDate.slice(5,7)-1;
        if(mon>pm+1) y-=1;
        out.txn_date=iso(y,mon,+m[1]);
      }
    }
    out.merchant=s.replace(/\s+/g,' ').trim();
    return out;
  }

  function guessColumns(headers) {
    const find=re=>{const i=headers.findIndex(h=>re.test(h));return i<0?null:i};
    return {
      date:find(/date/i),
      description:find(/desc|narrat|detail|reference|transaction$/i),
      amount:find(/^amount|amount$|value/i),
      debit:find(/debit|^dr$/i),
      credit:find(/credit|^cr$/i),
    };
  }

  /* Finds the header row: the first row with both a date-like and an amount-like heading. */
  function findHeaderRow(rows) {
    for(let i=0;i<Math.min(rows.length,30);i++){
      const r=rows[i].map(String);
      if(r.some(c=>/date/i.test(c))&&r.some(c=>/amount|debit|value/i.test(c))) return i;
    }
    return 0;
  }

  /* Returns normalised lines. Spend is always a positive amount; credits and payments are flagged. */
  function normaliseRows(rows, map) {
    const raw=[];
    rows.forEach((r,idx)=>{
      const post=parseDate(r[map.date]); const description=String(r[map.description]??'').trim();
      let amt=null;
      if(map.debit!=null||map.credit!=null){
        const d=map.debit!=null?parseAmount(r[map.debit]):null, c=map.credit!=null?parseAmount(r[map.credit]):null;
        if(d) amt=Math.abs(d); else if(c) amt=-Math.abs(c);
      } else amt=parseAmount(r[map.amount]);
      if(post&&description&&amt) raw.push({row_no:idx+1,post,description,amt});
    });
    const neg=raw.filter(x=>x.amt<0).length, flip=map.debit==null&&map.credit==null&&neg>raw.length/2;
    return raw.map(x=>{
      const signed=flip?-x.amt:x.amt, d=parseDescriptor(x.description,x.post), amount=Math.round(Math.abs(signed)*100)/100;
      const foreign=d.prefix!=null&&Math.abs(d.prefix-amount)>0.005?d.prefix:null;
      return {row_no:x.row_no,post_date:x.post,txn_date:d.txn_date,description:x.description,merchant:d.merchant,
        last4:d.last4,amount,foreign_amount:foreign,is_credit:signed<0};
    });
  }

  function dedupeKeys(lines) {
    const seen={};
    return lines.map(l=>{
      const base=[l.card_id||'nocard',l.post_date,l.description,l.amount.toFixed(2)].join('|');
      seen[base]=(seen[base]||0)+1;
      return base+'|'+seen[base];
    });
  }

  const tokens=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9 ]/g,' ').split(/\s+/).filter(t=>t.length>=3&&!/^(THE|AND|PTY|LTD|MALL|RESTAURANT)$/.test(t));
  function nameScore(a,b){
    const A=tokens(a),B=tokens(b);
    return A.some(x=>B.some(y=>x.startsWith(y)||y.startsWith(x)))?1:0;
  }

  /* Card + amount + date decide a match. The supplier name only breaks ties, because statement text is truncated. */
  function matchLines(lines, slips, opt={}) {
    const win=opt.windowDays??5, used=new Set(), res={};
    const live=slips.filter(s=>s.status==='captured'&&!s.statement_line_id);
    const anchor=l=>l.txn_date||l.post_date;
    const gap=(l,s)=>Math.abs(dayNum(s.slip_date)-dayNum(anchor(l)));
    const open=lines.filter(l=>l.status==='unmatched'||l.status==='possible'||!l.status);
    const inWin=(l,s)=>s.card_id===l.card_id&&gap(l,s)<=(l.txn_date?win:win+3);
    const exact=(l,s)=>s.currency==='ZAR'?Math.abs(+s.total-l.amount)<0.005
      :(l.foreign_amount!=null&&Math.abs(+s.total-l.foreign_amount)<0.005);
    const rank=l=>(a,b)=>(nameScore(b.supplier,l.merchant||l.description)-nameScore(a.supplier,l.merchant||l.description))||(gap(l,a)-gap(l,b));

    for(const l of open){
      if(l.is_credit||!l.card_id) continue;
      const c=live.filter(s=>!used.has(s.id)&&inWin(l,s)&&exact(l,s)).sort(rank(l));
      if(!c.length) continue;
      const clear=c.length===1||nameScore(c[0].supplier,l.merchant||l.description)>nameScore(c[1].supplier,l.merchant||l.description)||gap(l,c[0])<gap(l,c[1]);
      if(clear){res[l.id]={status:'matched',slip_id:c[0].id};used.add(c[0].id)}
      else res[l.id]={status:'possible',slip_id:null,candidates:c.map(x=>x.id)};
    }
    for(const l of open){
      if(res[l.id]||l.is_credit||!l.card_id) continue;
      const c=live.filter(s=>!used.has(s.id)&&inWin(l,s)&&(
        (s.currency==='ZAR'&&l.amount>=+s.total&&l.amount<=+s.total*1.25)||
        (s.currency==='ZAR'&&Math.abs(l.amount-+s.total)<=1)||
        (s.currency!=='ZAR'&&(l.foreign_amount==null||l.foreign_amount!==+s.total)&&nameScore(s.supplier,l.merchant||l.description))
      )).sort(rank(l));
      if(c.length) res[l.id]={status:'possible',slip_id:null,candidates:c.map(x=>x.id)};
    }
    return res;
  }

  /* FNB exports name the card once above the table, e.g. "FOR ACCOUNT NUMBER 422824******8000" */
  function accountLast4(rows,headerIdx,fileName){
    const re=/\d{4,6}[*xX_]{2,}(\d{4})/;
    for(const r of rows.slice(0,headerIdx)){const m=r.join(' ').match(re);if(m)return m[1]}
    const m=String(fileName||'').match(re);return m?m[1]:null;
  }

  /* Name matching for client and project lists */
  const norm=s=>String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
  function editDistance(a,b){
    const row=Array.from({length:b.length+1},(_,i)=>i);
    for(let i=1;i<=a.length;i++){let prev=row[0];row[0]=i;
      for(let j=1;j<=b.length;j++){const t=row[j];row[j]=Math.min(row[j]+1,row[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t}}
    return row[b.length];
  }
  const sameName=(a,b)=>norm(a)===norm(b);
  function closestName(name,list){
    const n=norm(name);let best=null,score=99;
    for(const x of list){const m=norm(x);if(m===n)return null;
      const d=editDistance(n,m),limit=n.length>=8?2:n.length>=4?1:0;
      if(d<=limit&&d<score){best=x;score=d}}
    return best;
  }
  function suggestNames(typed,list,max=6){
    const n=norm(typed);if(!n)return list.slice(0,max);
    const starts=list.filter(x=>norm(x).startsWith(n)),has=list.filter(x=>!norm(x).startsWith(n)&&norm(x).includes(n));
    const near=list.filter(x=>!norm(x).includes(n)&&closestName(typed,[x]));
    return [...starts,...has,...near].slice(0,max);
  }

  const api={parseCSV,parseAmount,parseDate,parseDescriptor,guessColumns,findHeaderRow,normaliseRows,dedupeKeys,nameScore,matchLines,accountLast4,sameName,closestName,suggestNames};
  if(typeof module!=='undefined') module.exports=api; else root.SlipLogic=api;
})(typeof window!=='undefined'?window:globalThis);
