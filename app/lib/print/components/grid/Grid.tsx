/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import styled from "@emotion/styled";
import { Label, LabelFields } from "../label/Label";

type GridProps = {
  items: LabelFields[];
  columns: number;
  rows: number;
  labelWidthIn: number;
  labelHeightIn: number;
  hGapIn: number;
  vGapIn: number;
  pagePadding: { top: number; right: number; bottom: number; left: number };
  debug?: boolean;
};

const StyledPage = styled.section<{
  padTop: number; padRight: number; padBottom: number; padLeft: number; debug?: boolean;
}>`
  box-sizing: border-box;
  padding: ${p => p.padTop}in ${p => p.padRight}in ${p => p.padBottom}in ${p => p.padLeft}in;
  ${p => (p.debug ? "outline: 1pt solid #0c0;" : "")}
  page-break-after: always;
`;

const Grid = styled.div<{
  columns: number; rows: number; labelWidthIn: number; labelHeightIn: number; hGapIn: number; vGapIn: number;
}>`
  display: grid;
  grid-template-columns: repeat(${p => p.columns}, ${p => p.labelWidthIn}in);
  grid-template-rows: repeat(${p => p.rows}, ${p => p.labelHeightIn}in);
  column-gap: ${p => p.hGapIn}in;
  row-gap: ${p => p.vGapIn}in;
  width: 100%;
  height: 100%;
`;

const Cell = styled.div<{ labelWidthIn: number; labelHeightIn: number; }>`
  box-sizing: border-box;
  width: ${p => p.labelWidthIn}in;
  height: ${p => p.labelHeightIn}in;
`;

export const LabelGrid: React.FC<GridProps> = ({
  items,
  columns,
  rows,
  labelWidthIn,
  labelHeightIn,
  hGapIn,
  vGapIn,
  pagePadding,
  debug,
}) => {
  const perPage = columns * rows;
  const pages: LabelFields[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return (
    <>
      {pages.map((page, pi) => (
        <StyledPage
          padTop={pagePadding.top}
          padRight={pagePadding.right}
          padBottom={pagePadding.bottom}
          padLeft={pagePadding.left}
          debug={debug}
          key={pi}
        >
          <Grid
            columns={columns}
            rows={rows}
            labelWidthIn={labelWidthIn}
            labelHeightIn={labelHeightIn}
            hGapIn={hGapIn}
            vGapIn={vGapIn}
          >
            {Array.from({ length: perPage }).map((_, idx) => {
              const item = page[idx];
              return (
                <Cell labelWidthIn={labelWidthIn} labelHeightIn={labelHeightIn} key={idx}>
                  {item ? <Label item={item} /> : null}
                </Cell>
              );
            })}
          </Grid>
        </StyledPage>
      ))}
    </>
  );
};
