/** Deterministic collision-aware label placement for the original graph canvas.
 * Geometry is in WORLD units, so no camera/zoom mutations are needed.
 * Only the view uses it; graph identities and stored positions are untouched.
 */
export interface LabelAnchorNode {
  id: string; x: number; y: number;
  lines: readonly string[]; width: number;
}
export interface LabelPlacement { x: number; top: number; width: number; height: number }
interface Rect { left: number; top: number; right: number; bottom: number }
const PAD = 3;
function overlaps(a: Rect, b: Rect): boolean {
  return a.left < b.right + PAD && a.right + PAD > b.left &&
    a.top < b.bottom + PAD && a.bottom + PAD > b.top;
}
function labelRect(x: number, top: number, width: number, height: number): Rect {
  return { left: x-width/2, top, right: x+width/2, bottom: top+height };
}
/** A compact grid avoids O(n²) overlap checks during live force annealing. */
class Occupancy {
  private cells = new Map<string, Rect[]>();
  constructor(private readonly cell = 48) {}
  private keys(rect: Rect): string[] {
    const a = Math.floor((rect.left-PAD)/this.cell);
    const b = Math.floor((rect.right+PAD)/this.cell);
    const c = Math.floor((rect.top-PAD)/this.cell);
    const d = Math.floor((rect.bottom+PAD)/this.cell);
    const out:string[] = [];
    for(let x=a;x<=b;x++) for(let y=c;y<=d;y++) out.push(x+":"+y);
    return out;
  }
  blocked(rect: Rect): boolean {
    for(const key of this.keys(rect)) {
      for(const other of this.cells.get(key) ?? []) if(overlaps(rect,other)) return true;
    }
    return false;
  }
  add(rect: Rect): void {
    for(const key of this.keys(rect)) {
      const list=this.cells.get(key);
      if(list) list.push(rect); else this.cells.set(key,[rect]);
    }
  }
}
/** Prefer the original below-node position, then other compass points.
 * Any label that cannot fit is omitted at rest, but hover still reveals it.
 * Labels are NEVER moved with the actual node positions, only the text. */
export function placeGraphLabels(
  nodes: readonly LabelAnchorNode[],
  radius: number,
  fontSize: number,
  gap: number,
  lineHeight: number,
): Map<string,LabelPlacement> {
  const result=new Map<string,LabelPlacement>();
  const occupancy=new Occupancy();
  // Reserve every node first so labels cannot print over another node.
  for(const n of nodes) {
    if(!Number.isFinite(n.x)||!Number.isFinite(n.y)) continue;
    occupancy.add({left:n.x-radius,top:n.y-radius,right:n.x+radius,bottom:n.y+radius});
  }
  for(const n of nodes) {
    if(!n.lines.length || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    const width=Math.max(1,n.width);
    const height=n.lines.length*fontSize*lineHeight;
    const below=n.y+radius+gap;
    const above=n.y-radius-gap-height;
    const middle=n.y-height/2;
    const side=radius+gap+width/2;
    const diagonal=side*.84;
    const candidates:[number,number][]=[
      [n.x,below], [n.x,above],
      [n.x+side,middle], [n.x-side,middle],
      [n.x+diagonal,below], [n.x-diagonal,below],
      [n.x+diagonal,above], [n.x-diagonal,above],
    ];
    for(const [x,top] of candidates) {
      const rect=labelRect(x,top,width,height);
      if(occupancy.blocked(rect)) continue;
      occupancy.add(rect);
      result.set(n.id,{x,top,width,height});
      break;
    }
  }
  return result;
}
