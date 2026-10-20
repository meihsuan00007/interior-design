import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { FadeIn } from "@/components/motion/fade-in";
import { ListItem } from "@/components/motion/list-item";

// 動畫改由 CSS（僅在 prefers-reduced-motion: no-preference 時生效）驅動，
// 元件不依賴 JS 的偏好判斷，因此伺服器與瀏覽器輸出的樹狀結構一定相同。
function render(reduced: boolean, node: () => React.ReactElement): string {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduced && q.includes("reduce"), media: q }));
  try {
    return renderToStaticMarkup(node());
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("FadeIn", () => {
  const node = () => createElement(FadeIn, { className: "x", children: "內容" });

  test("減少動態開啟與關閉時輸出完全相同", () => {
    expect(render(true, node)).toBe(render(false, node));
  });

  test("不輸出 inline opacity:0（否則沒有 JS 就永遠看不到）", () => {
    const html = render(true, node);
    expect(html).not.toMatch(/opacity/i);
    expect(html).toContain("內容");
    expect(html.startsWith("<div")).toBe(true);
  });
});

describe("ListItem", () => {
  test("li／tr 標籤固定，與減少動態無關", () => {
    const li = () => createElement(ListItem, { index: 0, children: "a" });
    const tr = () => createElement(ListItem, { index: 0, as: "tr", children: "a" });
    expect(render(true, li)).toBe(render(false, li));
    expect(render(true, li).startsWith("<li")).toBe(true);
    expect(render(true, tr)).toBe(render(false, tr));
    expect(render(true, tr).startsWith("<tr")).toBe(true);
  });

  test("前 20 筆帶 30ms 的延遲，之後不帶動畫", () => {
    const at = (i: number) => render(true, () => createElement(ListItem, { index: i, children: "a" }));
    expect(at(0)).not.toMatch(/opacity/i);
    expect(at(2)).toContain("animation-delay:0.06s");
    expect(at(19)).toContain("animation-delay:0.57s");
    expect(at(20)).not.toContain("animation-delay");
    expect(at(20)).not.toContain("fade-in");
  });
});
