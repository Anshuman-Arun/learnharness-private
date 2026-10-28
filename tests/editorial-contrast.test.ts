import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { appearanceVars, resolveAppearance } from "../components/settings/appearance.tsx";

const css = readFileSync("app/editorial.css", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const logo = readFileSync("components/lh-mark.tsx", "utf8");
const graphView = readFileSync("components/graph-view.tsx", "utf8");
const graphCanvas = readFileSync("components/graph-canvas.ts", "utf8");

const lightPrimary = ["#30312f", "#4a5d78", "#477169", "#946321", "#a74733", "#74617f", "#a65a65"];
const darkPrimary = ["#e3ddd4", "#8799b7", "#78a29a", "#c69452", "#d47760", "#a894b4", "#ce7d87"];
function luminance(color: string): number {
  const v = [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255)
    .map(x=>x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4));
  return 0.2126*v[0]!+0.7152*v[1]!+0.0722*v[2]!;
}
function contrast(a: string,b: string): number {
  const [hi,lo] = [luminance(a),luminance(b)].sort((a,b)=>b-a);
  return (hi!+0.05)/(lo!+0.05);
}
describe("editorial accessibility and palette", () => {
  it("light and dark reading ink meets WCAG contrast even at small label sizes", () => {
    assert.ok(contrast("#1a1815","#f2eddf") >= 7);
    assert.ok(contrast("#6b645a","#f2eddf") >= 4.5);
    assert.ok(contrast("#f3eee5","#2a2825") >= 7);
    assert.ok(contrast("#a9a095","#2a2825") >= 4.5);
    assert.ok(css.includes("--muted-foreground: #6b645a"));
  });
  it("all 7 accent button labels keep sufficient contrast in both modes", () => {
    for (let i=0;i<7;i++) {
      assert.ok(contrast(lightPrimary[i]!,"#fffaf1") >= 4.5,`light accent ${i}`);
      assert.ok(contrast(darkPrimary[i]!,"#211b18") >= 4.5,`dark accent ${i}`);
    }
    assert.ok(css.includes("--primary:#946321"),"corrected amber");
  });
  it("the real LearnHarness logo is accent/ink colored and offline bundled fonts are declared",()=>{
    assert.ok(logo.includes("var(--primary, #d47760)"));
    assert.ok(logo.includes("var(--foreground, #f3eee5)"));
    assert.ok(layout.includes("Newsreader"));
    assert.ok(layout.includes("IBM_Plex_Sans"));
    assert.ok(css.includes("--font-plex"));
  });
  it("graph theme switches never go through the layout-resetting data feed",()=>{
    assert.ok(graphCanvas.includes("setAppearance(colors: CanvasColors, fontFamily: string)"));
    assert.ok(graphView.includes("new MutationObserver(repaint)"));
    assert.ok(graphView.includes('attributeFilter: ["class", "style", "data-theme", "data-accent", "data-borders", "data-corners"]'));
    assert.ok(graphView.includes('rendererRef.current?.setAppearance('));
    assert.ok(css.includes("--lh-highlight-wash"));
  });
  it("custom light background respects reading-font and prose-size overrides", () => {
    const a=appearanceVars(resolveAppearance({
      mode:"light", background:"#f2eddf", fontFamily:"Georgia", proseFontSize:18,
      accent:"teal", corners:"round"
    }),"light");
    assert.equal(a["--background"],"#f2eddf");
    assert.equal(a["--font-prose"],'"Georgia", var(--font-sans3), ui-sans-serif, system-ui, sans-serif');
    assert.equal(a["--lh-prose-size"],"18px");
    assert.ok(a["--card"]);
  });
});
