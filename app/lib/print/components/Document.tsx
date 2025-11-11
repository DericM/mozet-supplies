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

