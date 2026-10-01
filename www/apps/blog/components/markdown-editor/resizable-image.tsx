import Image from "@tiptap/extension-image";
import {
	type NodeViewProps,
	NodeViewWrapper,
	ReactNodeViewRenderer,
} from "@tiptap/react";
import { useCallback, useRef, useState } from "react";

function ResizableImageNodeView({
	node,
	updateAttributes,
	selected,
}: NodeViewProps) {
	const [isResizing, setIsResizing] = useState(false);
	const imageRef = useRef<HTMLImageElement>(null);
	const startPos = useRef({ x: 0, y: 0, width: 0, height: 0 });

	const handleMouseDown = useCallback(
		(e: React.MouseEvent, corner: string) => {
			e.preventDefault();
			e.stopPropagation();
			setIsResizing(true);

			const img = imageRef.current;

			if (!img) return;

			startPos.current = {
				x: e.clientX,
				y: e.clientY,
				width: img.offsetWidth,
				height: img.offsetHeight,
			};

			const handleMouseMove = (moveEvent: MouseEvent) => {
				const deltaX = moveEvent.clientX - startPos.current.x;
				const deltaY = moveEvent.clientY - startPos.current.y;

				let newWidth = startPos.current.width;
				let newHeight = startPos.current.height;

				const aspectRatio = startPos.current.width / startPos.current.height;

				if (corner.includes("e")) {
					newWidth = Math.max(50, startPos.current.width + deltaX);
					newHeight = newWidth / aspectRatio;
				} else if (corner.includes("w")) {
					newWidth = Math.max(50, startPos.current.width - deltaX);
					newHeight = newWidth / aspectRatio;
				}

				if (
					corner.includes("s") &&
					!corner.includes("e") &&
					!corner.includes("w")
				) {
					newHeight = Math.max(50, startPos.current.height + deltaY);
					newWidth = newHeight * aspectRatio;
				} else if (
					corner.includes("n") &&
					!corner.includes("e") &&
					!corner.includes("w")
				) {
					newHeight = Math.max(50, startPos.current.height - deltaY);
					newWidth = newHeight * aspectRatio;
				}

				updateAttributes({
					width: Math.round(newWidth),
					height: Math.round(newHeight),
				});
			};

			const handleMouseUp = () => {
				setIsResizing(false);
				document.removeEventListener("mousemove", handleMouseMove);
				document.removeEventListener("mouseup", handleMouseUp);
			};

			document.addEventListener("mousemove", handleMouseMove);
			document.addEventListener("mouseup", handleMouseUp);
		},
		[updateAttributes],
	);

	const attrs = node.attrs as {
		src?: string;
		alt?: string;
		title?: string;
		width?: number | string;
		height?: number | string;
		align?: "left" | "center" | "right";
	};

	const width = attrs.width;
	const height = attrs.height;
	const src = attrs.src;
	const align = attrs.align || "left";

	if (!src || src === "") {
		return (
			<NodeViewWrapper className="resizable-image-wrapper">
				<div className="rounded-lg border border-dashed border-neutral-600 bg-neutral-800 p-4 text-center text-neutral-400">
					Loading image...
				</div>
			</NodeViewWrapper>
		);
	}

	return (
		<NodeViewWrapper
			className="resizable-image-wrapper"
			style={{
				display: "flex",
				justifyContent:
					align === "center"
						? "center"
						: align === "right"
							? "flex-end"
							: "flex-start",
			}}
		>
			<div
				className={`resizable-image-container ${
					selected ? "selected" : ""
				} ${isResizing ? "resizing" : ""}`}
				style={{ display: "inline-block", position: "relative" }}
			>
				{selected && (
					<div className="image-align-toolbar">
						<button
							type="button"
							onClick={() => updateAttributes({ align: "left" })}
							className={`image-align-btn ${align === "left" ? "active" : ""}`}
							aria-label="Align left"
							title="Align left"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M3 3h18v2H3V3zm0 4h12v2H3V7zm0 4h18v2H3v-2zm0 4h12v2H3v-2zm0 4h18v2H3v-2z" />
							</svg>
						</button>
						<button
							type="button"
							onClick={() => updateAttributes({ align: "center" })}
							className={`image-align-btn ${align === "center" ? "active" : ""}`}
							aria-label="Align center"
							title="Align center"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M3 3h18v2H3V3zm3 4h12v2H6V7zm-3 4h18v2H3v-2zm3 4h12v2H6v-2zm-3 4h18v2H3v-2z" />
							</svg>
						</button>
						<button
							type="button"
							onClick={() => updateAttributes({ align: "right" })}
							className={`image-align-btn ${align === "right" ? "active" : ""}`}
							aria-label="Align right"
							title="Align right"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M3 3h18v2H3V3zm6 4h12v2H9V7zm-6 4h18v2H3v-2zm6 4h12v2H9v-2zm-6 4h18v2H3v-2z" />
							</svg>
						</button>
					</div>
				)}
				<img
					ref={imageRef}
					src={src}
					alt={attrs.alt || ""}
					title={attrs.title || ""}
					width={width || undefined}
					height={height || undefined}
					className="rounded-lg max-w-full"
					style={{
						width: width ? `${width}px` : undefined,
						height: height ? `${height}px` : undefined,
						display: "block",
					}}
					draggable={false}
				/>
				{selected && (
					<>
						<button
							type="button"
							className="resize-handle resize-handle-nw"
							onMouseDown={(e) => handleMouseDown(e, "nw")}
							aria-label="Resize from top-left corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-ne"
							onMouseDown={(e) => handleMouseDown(e, "ne")}
							aria-label="Resize from top-right corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-sw"
							onMouseDown={(e) => handleMouseDown(e, "sw")}
							aria-label="Resize from bottom-left corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-se"
							onMouseDown={(e) => handleMouseDown(e, "se")}
							aria-label="Resize from bottom-right corner"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-n"
							onMouseDown={(e) => handleMouseDown(e, "n")}
							aria-label="Resize from top edge"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-s"
							onMouseDown={(e) => handleMouseDown(e, "s")}
							aria-label="Resize from bottom edge"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-e"
							onMouseDown={(e) => handleMouseDown(e, "e")}
							aria-label="Resize from right edge"
						/>
						<button
							type="button"
							className="resize-handle resize-handle-w"
							onMouseDown={(e) => handleMouseDown(e, "w")}
							aria-label="Resize from left edge"
						/>
					</>
				)}
			</div>
		</NodeViewWrapper>
	);
}

export const ResizableImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			width: {
				default: null,
				renderHTML: (attributes) => {
					if (!attributes.width) return {};

					return { width: attributes.width };
				},
				parseHTML: (element) =>
					element.getAttribute("width") ||
					element.style.width?.replace("px", ""),
			},
			height: {
				default: null,
				renderHTML: (attributes) => {
					if (!attributes.height) return {};

					return { height: attributes.height };
				},
				parseHTML: (element) =>
					element.getAttribute("height") ||
					element.style.height?.replace("px", ""),
			},
			align: {
				default: "left",
				renderHTML: (attributes) => {
					if (!attributes.align || attributes.align === "left") return {};

					return { "data-align": attributes.align };
				},
				parseHTML: (element) => element.getAttribute("data-align") || "left",
			},
		};
	},
	addNodeView() {
		return ReactNodeViewRenderer(ResizableImageNodeView);
	},
});
