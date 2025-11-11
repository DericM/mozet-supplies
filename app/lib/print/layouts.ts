export type PageLayout = {
  page: {
    widthIn: number;
    heightIn: number;
    marginTopIn: number;
    marginRightIn: number;
    marginBottomIn: number;
    marginLeftIn: number;
  };
  grid: {
    columns: number;
    rows: number;
    hGapIn: number; // horizontal gap between labels
    vGapIn: number; // vertical gap between labels
    labelWidthIn: number;
    labelHeightIn: number;
  };
  cutLines:boolean
};

// Uline S-7698 — 1" x 3" (18-up: 2 columns x 9 rows on US Letter)
// Matches template grid; verify at 100% scaling (no “Fit to page”).
export const LAYOUT_S7698_1x3_18UP: PageLayout = {
  page: {
    widthIn: 8.5,
    heightIn: 11,
    marginTopIn: 1.855,
    marginRightIn: 1.15,
    marginBottomIn: 1.955,
    marginLeftIn: 1.25,
  },
  grid: {
    columns: 2,
    rows: 9,
    labelWidthIn: 3.0,
    labelHeightIn: 0.8,
    hGapIn: 0.0,
    vGapIn: 0.0,
  },
  cutLines:false
};


export const LAYOUT_HANDCUT_1x3_18UP: PageLayout = {
  page: {
    widthIn: 11,
    heightIn: 8.5,
    marginTopIn: 0.25,
    marginRightIn: 1,
    marginBottomIn: 0.25, 
    marginLeftIn: 1,
  },
  grid: {
    columns: 3,
    rows: 10,
    labelWidthIn: 3.0,
    labelHeightIn: 0.8,
    hGapIn: 0.0,
    vGapIn: 0.0,
  },
  cutLines:true
};

export function cssInches(n: number): string {
  return `${n}in`;
}

// Expose a simple key -> layout mapping for route selection and settings
export type LayoutKey = "s7698" | "handcut";

export const LAYOUTS: Record<LayoutKey, { name: string; layout: PageLayout }> = {
  s7698: { name: "Uline S-7698 — 1×3in (18-up)", layout: LAYOUT_S7698_1x3_18UP },
  handcut: { name: "Hand-cut sheet — 1×3in (edge-to-edge)", layout: LAYOUT_HANDCUT_1x3_18UP },
};

export function getLayoutByKey(key: string | null | undefined): { key: LayoutKey; layout: PageLayout } {
  const k = (key || "").toLowerCase();
  if (k in LAYOUTS) {
    return { key: k as LayoutKey, layout: LAYOUTS[k as LayoutKey].layout };
  }
  return { key: "s7698", layout: LAYOUTS.s7698.layout };
}


