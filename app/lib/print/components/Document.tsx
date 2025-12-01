import React from "react";
import styled from "@emotion/styled";
import { Global, css } from "@emotion/react";
import { cssInches, type PageLayout } from "../layouts";
import { LabelGrid } from "./grid/Grid";
import type { LabelFields } from "./label/Label";


export const PrintLabelGridDocument: React.FC<{
	items: LabelFields[];
	layout: PageLayout;
}> = ({ items, layout }) => {
	const { widthIn, heightIn, marginTopIn, marginRightIn, marginBottomIn, marginLeftIn } = layout.page;
	const { columns, rows, labelWidthIn, labelHeightIn, hGapIn, vGapIn } = layout.grid;

	const GlobalStyles = (
		<Global
			styles={css`
				@page { size: ${cssInches(widthIn)} ${cssInches(heightIn)}; margin: 0; }
				html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; }
			`}
		/>
	);

	const PageWrapper = styled.div`
		/* Ensure children stack above overlay */
		> * { position: relative; z-index: 1; }
	`;

	return (
			<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<title>Labels</title>
					{GlobalStyles}
				<script
					dangerouslySetInnerHTML={{
						__html: `(() => {
						  function ptToPx(pt){ return pt * (96/72); }
						  function computeLineHeightPx(el, testPx){
						    var cs = window.getComputedStyle(el);
						    var lh = parseFloat(cs.lineHeight);
						    if (!isFinite(lh)) return testPx * 1.0; // fallback to 1.0
						    return lh;
						  }
						  function fitsAtPx(clone, lineHeightPx, px){
						    clone.style.fontSize = px + 'px';
						    // ensure layout flush
						    clone.style.maxHeight = 'unset';
						    var maxH = 3 * lineHeightPx;
						    return clone.scrollHeight <= maxH + 0.5;
						  }
						  function fitNode(el){
						    var rect = el.getBoundingClientRect();
						    if (!rect || rect.width <= 0) return;
						    var maxPx = ptToPx(10), minPx = ptToPx(6);
						    // Build a measuring clone
						    var clone = el.cloneNode(true);
						    clone.style.position = 'absolute';
						    clone.style.visibility = 'hidden';
						    clone.style.pointerEvents = 'none';
						    clone.style.zIndex = '-1';
						    clone.style.width = rect.width + 'px';
						    clone.style.display = 'block';
						    clone.style.overflow = 'visible';
						    clone.style.webkitLineClamp = 'unset';
						    clone.style.WebkitLineClamp = 'unset';
						    document.body.appendChild(clone);
						    // Use current font to compute line height at max
						    clone.style.fontSize = maxPx + 'px';
						    var lineHeightPx = computeLineHeightPx(el, maxPx);
						    var low = minPx, high = maxPx, best = low;
						    for (var i=0;i<16;i++){
						      var mid = (low + high) / 2;
						      if (fitsAtPx(clone, lineHeightPx, mid)) { best = mid; low = mid; } else { high = mid; }
						      if (high - low < 0.5) break;
						    }
						    // Apply to real element (keep -webkit-box and clamp)
						    el.style.fontSize = best.toFixed(2) + 'px';
						    // cleanup
						    clone.remove();
						  }
						  function fitAll(){
						    var nodes = document.querySelectorAll('.fit-title');
						    nodes.forEach(function(el){ try { fitNode(el); } catch(_){} });
						  }
						  if (document.readyState === 'complete') { fitAll(); }
						  else { window.addEventListener('load', fitAll, { once: true }); }
						  window.addEventListener('beforeprint', fitAll);
						})();`
					}}
				/>
			</head>
			<body>
					<PageWrapper>
						<LabelGrid
							items={items}
							columns={columns}
							rows={rows}
							labelWidthIn={labelWidthIn}
							labelHeightIn={labelHeightIn}
							hGapIn={hGapIn}
							vGapIn={vGapIn}
							pagePadding={{ top: marginTopIn, right: marginRightIn, bottom: marginBottomIn, left: marginLeftIn }}
							showCutLines={!!layout.cutLines}
						/>
					</PageWrapper>
			</body>
		</html>
	);
};

export default PrintLabelGridDocument;

