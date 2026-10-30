import palaceUrl from '../../assets/environment/aurelion-palace.png';
import kitUrl from '../../assets/environment/aurelion-city-kit.png';
import type { ObjectKindDef } from '../../core/types';
import { makeCanvas } from './canvas';

let palace: HTMLImageElement | undefined, kit: HTMLImageElement | undefined;
let loading: Promise<void> | undefined;
const frames = new Map<number, HTMLCanvasElement>();
const KIT_COLUMNS=[0,314,627,941,1254];
const KIT_ROWS=[[0,320,627,940,1254],[0,321,645,940,1254],[0,314,657,940,1254],[0,314,627,940,1254]];

export function loadAurelionArt(): Promise<void> {
  return loading ??= Promise.all([palaceUrl,kitUrl].map(url=>new Promise<HTMLImageElement>((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(`Capital artwork failed: ${url}`));image.src=url;
  }))).then(([a,b])=>{palace=a;kit=b;});
}

function trim(source:HTMLImageElement,x:number,y:number,w:number,h:number):HTMLCanvasElement {
  const sample=makeCanvas(w,h); sample.ctx.drawImage(source,x,y,w,h,0,0,w,h);
  const d=sample.ctx.getImageData(0,0,w,h).data;
  let left=w,top=h,right=-1,bottom=-1;
  for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(d[(yy*w+xx)*4+3]>24){left=Math.min(left,xx);top=Math.min(top,yy);right=Math.max(right,xx);bottom=Math.max(bottom,yy);}
  if(right<left)throw new Error('Empty capital sprite');
  const out=makeCanvas(right-left+1,bottom-top+1);out.ctx.drawImage(sample.canvas,left,top,out.canvas.width,out.canvas.height,0,0,out.canvas.width,out.canvas.height);return out.canvas;
}

/** Reviewed optical gutters preserve the cathedral steps and full ship masts. */
export function aurelionFrame(index:number):HTMLCanvasElement|null {
  if(!kit||!palace)return null;
  const cached=frames.get(index);if(cached)return cached;
  let frame:HTMLCanvasElement;
  if(index===16)frame=trim(palace,0,0,palace.width,palace.height);
  else {
    const col=index%4,row=Math.floor(index/4),x=KIT_COLUMNS[col],y=KIT_ROWS[col][row];
    frame=trim(kit,x,y,KIT_COLUMNS[col+1]-x,KIT_ROWS[col][row+1]-y);
  }
  frames.set(index,frame);return frame;
}

export const AURELION_BUILDINGS:Record<string,number>={aurelion_palace:16,aurelion_cathedral:0,aurelion_stall_red:2,aurelion_stall_gold:3,aurelion_stall_blue:4,aurelion_farmhouse:14};
export const AURELION_OBJECTS:Record<string,number>={capital_windmill:1,capital_ship:5,capital_galleon:6,capital_rowboat:7,capital_lighthouse:8,capital_training_dummy:9,capital_statue:10,capital_cave:15};

export function paintAurelionObject(kind:ObjectKindDef):HTMLCanvasElement|null {
  const index=AURELION_OBJECTS[kind.id];if(index==null)return null;
  const frame=aurelionFrame(index);if(!frame)return null;
  const {canvas,ctx}=makeCanvas(kind.spriteW,kind.spriteH);
  const scale=Math.min((canvas.width-8)/frame.width,(canvas.height-8)/frame.height);
  const w=Math.round(frame.width*scale),h=Math.round(frame.height*scale);
  ctx.drawImage(frame,Math.round((canvas.width-w)/2),canvas.height-4-h,w,h);return canvas;
}

export function paintAurelionScenery(kind:string,width:number,height:number):HTMLCanvasElement|null {
  const index=({bridge_ew:11,bridge_ns:12,dock:13} as Record<string,number>)[kind];
  if(index==null)return null;
  const frame=aurelionFrame(index);if(!frame)return null;
  const {canvas,ctx}=makeCanvas(width+8,height+8);ctx.drawImage(frame,4,4,width,height);return canvas;
}
