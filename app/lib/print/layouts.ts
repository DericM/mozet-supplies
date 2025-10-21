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

// Default 18-up on US Letter (3 columns x 6 rows). These are safe starter values.
// You should tune margins, label sizes, and gaps to match your perforated cardstock.
export const LAYOUT_18UP_LETTER_DEFAULT: PageLayout = {
  page: {
    widthIn: 8.5,
    heightIn: 11,
    marginTopIn: 0.5,
    marginRightIn: 0.5,
    marginBottomIn: 0.5,
    marginLeftIn: 0.5,
  },
  grid: {
    columns: 3,
    rows: 6,
    hGapIn: 0.25,
    vGapIn: 0.25,
    // A rough starting point; adjust to your sheet's spec
    labelWidthIn: (8.5 - 0.5 - 0.5 - (3 - 1) * 0.25) / 3, // total width minus margins and gaps, divided by 3
    labelHeightIn: (11 - 0.5 - 0.5 - (6 - 1) * 0.25) / 6, // total height minus margins and gaps, divided by 6
  },
};

export function cssInches(n: number): string {
  return `${n}in`;
}

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
