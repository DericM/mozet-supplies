/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import styled from "@emotion/styled";

export type LabelFields = {
  title: string;
  sku: string;
  vendor: string;
  priceStr: string;
  adminUrl: string;
  dateStr: string;
};

const QR_BASE = "https://quickchart.io/qr";

function skuSegments(s: string): string[] {
  const base = s || "";
  if (base.length <= 7) return [base];
  const segs: string[] = [];
  segs.push(base.slice(0, 2));
  segs.push(base.slice(2, 4));
  segs.push(base.slice(4, 7));
  let i = 7;
  while (i < base.length) {
    segs.push(base.slice(i, i + 2));
    i += 2;
  }
  return segs;
}

const StyledLabel = styled.div`
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  
  position: relative;
  overflow: visible;
`;
const Left = styled.div`
  width: 72%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100% - 0.04in;
  text-align: left;
  padding: 0.02in 0.00in 0.02in 0.05in;
  position: relative;
  z-index: 1;
  overflow: visible;
`;
const Top = styled.div`
  flex: 0 0 auto;
`;
const Middle = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: center;
`;
const BottomMeta = styled.div`
  flex: 0 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
`;
const SkuP = styled.p`
  font-size: 17pt;
  font-weight: bold;
  margin: 0;
  line-height: 0.8;
  letter-spacing: 0pt;
  white-space: nowrap;
  word-break: keep-all;
  overflow: visible;
  display: block;

  .seg {
    display: inline-block;
    margin-right: 2px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.25);
  }

  .seg.opt {
    font-weight: normal;
  }
`;
const TitleP = styled.p`
  font-size: 10pt;
  margin: 0;
  line-height: 1.0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: left;
`;
const VendorSpan = styled.span`
  font-size: 8pt;
  line-height: 1.0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
`;
const DateSpan = styled.span`
  font-size: 8pt;
  line-height: 1.0;
  white-space: nowrap;
  text-align: center;
  padding: 0 4px;
`;
const PriceSpan = styled.span`
  font-size: 9pt;
  line-height: 1.0;
  font-weight: bold;
  white-space: nowrap;
`;
const Right = styled.div`
  width: 28%; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  text-align: center; 
  position: relative; 
  z-index: 2;
  padding: 0.05in;
  img{ width:0.675in; height:0.675in; display:block; }
`;

export const Label: React.FC<{ item: LabelFields }> = ({ item }) => (
  <StyledLabel>
    <Left>
      <Top>
        <SkuP>
          {skuSegments(item.sku).map((seg, i) => (
            <span key={i} className={`seg${i >= 3 ? " opt" : ""}`}>{seg}</span>
          ))}
        </SkuP>
      </Top>
      <Middle><TitleP>{item.title}</TitleP></Middle>
      <BottomMeta>
        <VendorSpan>{item.vendor}</VendorSpan>
        <DateSpan>{item.dateStr}</DateSpan>
        <PriceSpan>{item.priceStr}</PriceSpan>
      </BottomMeta>
    </Left>
    <Right>
      {(() => {
        const src = `${QR_BASE}?text=${encodeURIComponent(item.adminUrl)}&size=200&margin=0`;
        return src ? <img src={src} alt="QR" /> : null;
      })()}
    </Right>
  </StyledLabel>
);
