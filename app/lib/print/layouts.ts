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
};

// Uline S-7698 — 1" x 3" (18-up: 2 columns x 9 rows on US Letter)
// Matches template grid; verify at 100% scaling (no “Fit to page”).
export const LAYOUT_S7698_1x3_18UP: PageLayout = {
  page: {
    widthIn: 8.5,
    heightIn: 11,
    marginTopIn: 1.855,     // fixed by template math
    marginRightIn: 1.15, // ← corrected
    marginBottomIn: 1.955,  // fixed by template math
    marginLeftIn: 1.25,  // ← corrected
  },
  grid: {
    columns: 2,
    rows: 9,
    labelWidthIn: 3.0,
    labelHeightIn: 0.8,
    hGapIn: 0.0,         // single column gutter
    vGapIn: 0.0,        // inter-row gap
  },
};

export function cssInches(n: number): string {
  return `${n}in`;
}


