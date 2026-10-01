import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	children: React.ReactNode;
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!isOpen || !mounted) return null;

	return createPortal(
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<button
				type="button"
				className="absolute inset-0 bg-black/60 cursor-default"
				onClick={onClose}
				aria-label="Close modal"
			/>
			<dialog
				open
				className="relative z-10 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-xl"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="mb-4 flex items-center justify-between">
					<h3 className="text-lg font-medium text-white">{title}</h3>
					<button
						type="button"
						onClick={onClose}
						className="text-neutral-400 hover:text-white"
					>
						✕
					</button>
				</div>
				{children}
			</dialog>
		</div>,
		document.body,
	);
}

interface LinkModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (url: string, text?: string) => void;
	initialUrl?: string;
	initialText?: string;
}

export function LinkModal({
	isOpen,
	onClose,
	onSubmit,
	initialUrl = "",
	initialText = "",
}: LinkModalProps) {
	const [url, setUrl] = useState(initialUrl);
	const [text, setText] = useState(initialText);
	const linkUrlId = useId();

	useEffect(() => {
		setUrl(initialUrl);
		setText(initialText);
	}, [initialUrl, initialText]);

	const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		e.stopPropagation();

		if (url) {
			onSubmit(url, text);
			onClose();
			setUrl("");
			setText("");
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Insert Link">
			<form onSubmit={handleSubmit}>
				<div className="mb-3">
					<label
						htmlFor={linkUrlId}
						className="mb-1 block text-sm text-neutral-400"
					>
						URL
					</label>
					<input
						id={linkUrlId}
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com"
						className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded px-4 py-2 text-sm text-neutral-400 hover:text-white"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!url}
						className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
					>
						Insert
					</button>
				</div>
			</form>
		</Modal>
	);
}

interface ImageModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSubmit: (url: string, alt?: string, width?: string) => void;
}

export function ImageModal({ isOpen, onClose, onSubmit }: ImageModalProps) {
	const [url, setUrl] = useState("");
	const [alt, setAlt] = useState("");
	const [width, setWidth] = useState("");
	const imageUrlId = useId();
	const imageFileId = useId();
	const imageAltId = useId();
	const imageWidthId = useId();

	const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
		e.preventDefault();
		e.stopPropagation();

		if (url) {
			onSubmit(url, alt, width);
			onClose();
			setUrl("");
			setAlt("");
			setWidth("");
		}
	};

	const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];

		if (file) {
			const reader = new FileReader();

			reader.onload = () => {
				const base64 = reader.result as string;

				setUrl(base64);

				if (!alt) {
					setAlt(file.name.replace(/\.[^/.]+$/, ""));
				}
			};

			reader.readAsDataURL(file);
		}
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} title="Insert Image">
			<form onSubmit={handleSubmit}>
				<div className="mb-3">
					<label
						htmlFor={imageUrlId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Image URL
					</label>
					<input
						id={imageUrlId}
						type="text"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com/image.jpg"
						className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
					/>
				</div>
				{url?.startsWith("data:image/") && (
					<div className="mb-3">
						<p className="mb-1 text-sm text-neutral-400">Preview:</p>
						<img
							src={url}
							alt="Preview"
							className="max-h-32 rounded border border-neutral-700"
						/>
					</div>
				)}
				<div className="mb-3">
					<label
						htmlFor={imageFileId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Or upload from your computer
					</label>
					<input
						id={imageFileId}
						type="file"
						accept="image/*"
						onChange={handleFileUpload}
						className="w-full text-sm text-neutral-400 file:mr-3 file:rounded file:border-0 file:bg-neutral-700 file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-neutral-600"
					/>
				</div>
				<div className="mb-3">
					<label
						htmlFor={imageAltId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Alt text (optional)
					</label>
					<input
						id={imageAltId}
						type="text"
						value={alt}
						onChange={(e) => setAlt(e.target.value)}
						placeholder="Describe the image"
						className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
					/>
				</div>
				<div className="mb-4">
					<label
						htmlFor={imageWidthId}
						className="mb-1 block text-sm text-neutral-400"
					>
						Width (optional)
					</label>
					<div className="flex gap-2">
						<input
							id={imageWidthId}
							type="text"
							value={width}
							onChange={(e) => setWidth(e.target.value)}
							placeholder="e.g., 500px, 50%, auto"
							className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
						/>
						<div className="flex gap-1">
							<button
								type="button"
								onClick={() => setWidth("25%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								25%
							</button>
							<button
								type="button"
								onClick={() => setWidth("50%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								50%
							</button>
							<button
								type="button"
								onClick={() => setWidth("75%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								75%
							</button>
							<button
								type="button"
								onClick={() => setWidth("100%")}
								className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-600"
							>
								100%
							</button>
						</div>
					</div>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded px-4 py-2 text-sm text-neutral-400 hover:text-white"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!url}
						className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
					>
						Insert
					</button>
				</div>
			</form>
		</Modal>
	);
}
