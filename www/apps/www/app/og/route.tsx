import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const title = (searchParams.get("title") || "Zeyad Deeb").slice(0, 110);
	const section = (
		searchParams.get("section") || "Software engineer / Brooklyn, NY"
	).slice(0, 60);
	const glider = new Set([7, 14, 18, 19, 20]);

	return new ImageResponse(
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: "100%",
				height: "100%",
				padding: "52px 60px",
				background: "#f9f8f2",
				color: "#111111",
				borderTop: "8px solid #e83025",
				fontFamily: "sans-serif",
			}}
		>
			<div style={{ display: "flex", fontSize: 23, color: "#565650" }}>
				{section}
			</div>
			<div style={{ display: "flex", flex: 1, alignItems: "center", gap: 48 }}>
				<div
					style={{
						display: "flex",
						width: 780,
						fontSize: title.length > 65 ? 52 : title.length > 35 ? 64 : 80,
						fontWeight: 700,
						letterSpacing: "-3px",
						lineHeight: 1.08,
						overflowWrap: "anywhere",
					}}
				>
					{title}
				</div>
				<div style={{ display: "flex", flexWrap: "wrap", width: 252, gap: 6 }}>
					{Array.from({ length: 36 }, (_, index) => (
						<div
							key={`cell-${index}`}
							style={{
								width: 36,
								height: 36,
								background: glider.has(index) ? "#e83025" : "#e7e5dc",
							}}
						/>
					))}
				</div>
			</div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					borderTop: "1px solid #dddcd4",
					paddingTop: 24,
					fontSize: 24,
				}}
			>
				<span>Zeyad Deeb</span>
				<span style={{ color: "#565650" }}>zeyaddeeb.com</span>
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			headers: {
				"Cache-Control": "public, max-age=86400, s-maxage=604800",
				"X-Robots-Tag": "noindex",
			},
		},
	);
}
