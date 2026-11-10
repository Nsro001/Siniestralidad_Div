import type { DocumentCell, DocumentTable, EvidenceRegion } from '../../shared/portfolio.js';
export type Word = {text:string; x:number; y:number; width:number; height:number};
const decode = (s:string) => s.replace(/&(?:amp|lt|gt|quot|apos);|&#(\d+);/g,(m,n)=>n?String.fromCodePoint(Number(n)):({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[m]??m));
export function bboxWords(xml:string): Word[] {
  const attrs=(s:string,k:string)=>Number(new RegExp(`\\b${k}="([\\d.]+)"`).exec(s)?.[1]);
  const page=/<page\b([^>]*)>/.exec(xml); if(!page)return [];
  const width=attrs(page[1],'width'),height=attrs(page[1],'height'); if(!(width>0&&height>0))return [];
  return [...xml.matchAll(/<word\b([^>]*)>([\s\S]*?)<\/word>/g)].slice(0,30000).map(m=>({text:decode(m[2]),x:attrs(m[1],'xMin')/width,y:attrs(m[1],'yMin')/height,width:(attrs(m[1],'xMax')-attrs(m[1],'xMin'))/width,height:(attrs(m[1],'yMax')-attrs(m[1],'yMin'))/height})).filter(w=>[w.x,w.y,w.width,w.height].every(Number.isFinite));
}
type Segment={position:number;start:number;end:number};
export function pgmPixels(buffer:Buffer) {
  let offset=0;
  const token=()=>{while(offset<buffer.length){if(buffer[offset]===35){while(offset<buffer.length&&buffer[offset]!==10)offset++;}else if(buffer[offset]<=32)offset++;else break;} const start=offset;while(offset<buffer.length&&buffer[offset]>32)offset++;return buffer.subarray(start,offset).toString();};
  if(token()!=='P5')throw new Error('Raster gris P5 requerido');
  const width=Number(token()),height=Number(token()),max=Number(token());
  if(buffer[offset]===13&&buffer[offset+1]===10)offset+=2;else offset++;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>5000000||max!==255||buffer.length-offset<width*height)throw new Error('Raster fuera de límites');
  return {width,height,pixels:buffer.subarray(offset,offset+width*height)};
}
function segments(pixels:Buffer,width:number,height:number,vertical:boolean):Segment[]{
  const out:Segment[]=[];const outer=vertical?width:height,inner=vertical?height:width;
  for(let p=0;p<outer;p++) {let start=-1,last=-1;for(let q=0;q<=inner+2;q++) {
    const dark=q<inner&&pixels[vertical?q*width+p:p*width+q]<140;
    if(dark){if(start<0)start=q;last=q;}else if(start>=0&&q-last>2){if(last-start>=(vertical?17:35))out.push({position:p,start,end:last});start=-1;}
  }}
  if(out.length>20000)throw new Error("Cuadrícula demasiado compleja");
  const merged:Segment[]=[];
  for(const s of out){let previous:Segment|undefined;for(let i=merged.length-1;i>=0&&s.position-merged[i].position<=2;i--){const t=merged[i];if(Math.abs(t.start-s.start)<4&&Math.abs(t.end-s.end)<4){previous=t;break;}}if(!previous)merged.push(s);else {previous.position=Math.round((previous.position+s.position)/2);previous.start=Math.min(previous.start,s.start);previous.end=Math.max(previous.end,s.end);}}
  return merged.slice(0,6000);
}
const unique=(values:number[])=>values.sort((a,b)=>a-b).filter((v,i,a)=>!i||v-a[i-1]>3);
function cellText(words:Word[]) {
  const lines:Array<{y:number;words:Word[]}>=[];
  for(const word of [...words].sort((a,b)=>a.y-b.y||a.x-b.x)){let line=lines.find(l=>Math.abs(l.y-word.y)<.004);if(!line){line={y:word.y,words:[]};lines.push(line);}line.words.push(word);}
  return lines.map(l=>l.words.sort((a,b)=>a.x-b.x).map(w=>w.text).join(' ')).join('\n');
}
export function sourceQuote(text:string, value:string, context=''):string {
  const tokens=(value+' '+context).toLowerCase().split(/\s+/).filter(t=>t.length>1);
  let best='',score=-1;
  for(const line of text.split(/\r?\n/)){const current=tokens.reduce((sum,t)=>sum+(line.toLowerCase().includes(t)?t.length:0),0);if(current>score&&line.trim().length>=3){score=current;best=line.trim();}}
  return best.slice(0,12000);
}
export function gridTables(buffer:Buffer,words:Word[],text:string,page:number):DocumentTable[]{
  const {pixels,width,height}=pgmPixels(buffer);const hs=segments(pixels,width,height,false),vs=segments(pixels,width,height,true);
  const rects:Array<{x:number;y:number;right:number;bottom:number}>=[];
  for(const top of hs){
    const xs=unique(vs.filter(v=>v.start<=top.position+3&&v.end>top.position+5&&v.position>=top.start-3&&v.position<=top.end+3).map(v=>v.position));
    for(let i=0;i<xs.length-1;i++){
      const left=xs[i],right=xs[i+1];if(right-left<12)continue;
      const bottom=hs.filter(h=>h.position>top.position+6&&h.start<=left+3&&h.end>=right-3&&vs.some(v=>Math.abs(v.position-left)<3&&v.start<=top.position+3&&v.end>=h.position-3)&&vs.some(v=>Math.abs(v.position-right)<3&&v.start<=top.position+3&&v.end>=h.position-3)).sort((a,b)=>a.position-b.position)[0];
      if(bottom&&!rects.some(r=>Math.abs(r.x-left)<3&&Math.abs(r.y-top.position)<3&&Math.abs(r.right-right)<3&&Math.abs(r.bottom-bottom.position)<3))rects.push({x:left,y:top.position,right,bottom:bottom.position});
    }
  }
  if(rects.length>2500)throw new Error("Demasiadas celdas para revisión");
  const components:typeof rects[]=[];
  for(const r of rects){const touching=components.filter(group=>group.some(s=>r.x<=s.right+4&&r.right>=s.x-4&&r.y<=s.bottom+4&&r.bottom>=s.y-4));if(!touching.length)components.push([r]);else {touching[0].push(r);for(const group of touching.slice(1)){touching[0].push(...group);components.splice(components.indexOf(group),1);}}}
  return components.filter(g=>g.length>=2).sort((a,b)=>Math.min(...a.map(r=>r.y))-Math.min(...b.map(r=>r.y))).slice(0,40).map((rects,index)=>{
    const xs=unique(rects.flatMap(r=>[r.x,r.right])),ys=unique(rects.flatMap(r=>[r.y,r.bottom]));
    const nearest=(a:number[],v:number)=>a.reduce((best,x,i)=>Math.abs(x-v)<Math.abs(a[best]-v)?i:best,0);
    const id=`p${page}-t${index}`;
    const cells:DocumentCell[]=rects.map((r,i)=>{
      const inside=words.filter(w=>(w.x+w.width/2)*width>=r.x-1&&(w.x+w.width/2)*width<=r.right+1&&(w.y+w.height/2)*height>=r.y-1&&(w.y+w.height/2)*height<=r.bottom+1);
      const value=cellText(inside);const row=nearest(ys,r.y),column=nearest(xs,r.x);
      return {id:`${id}-c${i}`,text:value,row,column,rowSpan:nearest(ys,r.bottom)-row,columnSpan:nearest(xs,r.right)-column,region:{x:r.x/width,y:r.y/height,width:(r.right-r.x)/width,height:(r.bottom-r.y)/height},quote:sourceQuote(text,value)};
    }).sort((a,b)=>a.row-b.row||a.column-b.column);
    const region:EvidenceRegion={x:xs[0]/width,y:ys[0]/height,width:(xs.at(-1)!-xs[0])/width,height:(ys.at(-1)!-ys[0])/height};
    const heading=cells.find(c=>c.row<=2&&/^(?:cobertura(?:s)?(?: vida)?|beneficio(?:s)?[ \n].*|asegurado)$/i.test(c.text));
    const headerEnd=heading?heading.row+heading.rowSpan:1;
    const headers=cells.filter(c=>c.row<headerEnd&&/reembolso|tope|capital|tasa|edad|cobertura|deducible|ingreso|permanencia|prestaci[oó]n/i.test(c.text)).map(c=>c.text);
    const notes=text.split(/\n\s*\n/).filter(l=>/^\s*(?:\(\*\)|\*|nota\b)/i.test(l)).map(l=>l.trim());
    return {id,page,cells,headers,notes,region,method:'grid' as const,warnings:[],context:cellText(words.filter(w=>w.y<region.y)).slice(-2200)};
  }).filter(t=>t.cells.some(c=>c.text));
}

export function tsvWords(tsv:string):Word[] {
  const lines=tsv.trim().split(/\r?\n/).slice(1).map(line=>line.split('\t'));
  const page=lines.find(cols=>cols[0]==='1');if(!page)return [];
  const width=Number(page[8]),height=Number(page[9]);if(!(width>0&&height>0))return [];
  return lines.filter(cols=>cols[0]==='5'&&Number(cols[10])>=0&&cols[11]).slice(0,30000).map(cols=>({text:cols.slice(11).join('\t'),x:Number(cols[6])/width,y:Number(cols[7])/height,width:Number(cols[8])/width,height:Number(cols[9])/height})).filter(w=>[w.x,w.y,w.width,w.height].every(Number.isFinite));
}

export function retainedLayout(text:string,page:number):DocumentTable {
  const allLines=text.split(/\r?\n/).filter(line=>line.trim());
  const lines=allLines.slice(0,2000);
  return {id:`p${page}-layout`,page,method:'layout',region:{x:0,y:0,width:1,height:1},headers:[],notes:[],warnings:[allLines.length>2000?'Vista limitada a 2.000 líneas; el texto íntegro permanece en la página.':'Respaldo del texto tabular; columnas y combinaciones no inferidas en esta vista.'],cells:lines.map((line,row)=>({id:`p${page}-line-${row}`,text:line,row,column:0,rowSpan:1,columnSpan:1,quote:line.trim(),region:{x:0,y:0,width:1,height:1}}))};
}
