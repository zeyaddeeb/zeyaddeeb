"use client";

import type { ReactNode } from "react";
import { signOutAction } from "@/lib/actions/auth";
import { getFullPath } from "@/lib/redirect-utils";
import type { User } from "./types";

interface PageHeaderProps {
	title: string;
	user: User;
	actions?: ReactNode;
}

export function PageHeader({ title, user, actions }: PageHeaderProps) {
	const handleSignOut = async () => {
		await signOutAction();
		window.location.href = getFullPath("/write/login");
	};

	return (
		<div className="flex justify-between items-center mb-8">
			<h1 className="text-3xl font-bold">{title}</h1>
			<div className="flex items-center gap-4">
				{actions}
				<span className="text-neutral-400 text-sm">
					Signed in as {user.name}
				</span>
				<button
					type="button"
					onClick={handleSignOut}
					className="text-sm text-neutral-400 hover:text-white transition-colors"
				>
					Sign out
				</button>
			</div>
		</div>
	);
}

interface ErrorAlertProps {
	error: string | null;
}

export function ErrorAlert({ error }: ErrorAlertProps) {
	if (!error) return null;

	return (
		<div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
			{error}
		</div>
	);
}

interface FormActionsProps {
	isSubmitting: boolean;
	submitLabel: string;
	submittingLabel: string;
	onCancel: () => void;
	deleteButton?: ReactNode;
}

export function FormActions({
	isSubmitting,
	submitLabel,
	submittingLabel,
	onCancel,
	deleteButton,
}: FormActionsProps) {
	return (
		<div className={deleteButton ? "flex justify-between" : "flex gap-4"}>
			<div className="flex gap-4">
				<button
					type="submit"
					disabled={isSubmitting}
					className="px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? submittingLabel : submitLabel}
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="px-6 py-3 border border-neutral-700 rounded-lg hover:bg-neutral-900 transition-colors"
				>
					Cancel
				</button>
			</div>
			{deleteButton}
		</div>
	);
}

interface DeleteButtonProps {
	onClick: () => void;
	isDeleting: boolean;
	label?: string;
	deletingLabel?: string;
}

export function DeleteButton({
	onClick,
	isDeleting,
	label = "Delete",
	deletingLabel = "Deleting...",
}: DeleteButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isDeleting}
			className="px-6 py-3 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
		>
			{isDeleting ? deletingLabel : label}
		</button>
	);
}

interface PreviewToggleProps {
	showPreview: boolean;
	onToggle: () => void;
}

export function PreviewToggle({ showPreview, onToggle }: PreviewToggleProps) {
	return (
		<button
			type="button"
			onClick={onToggle}
			className={`px-4 py-2 rounded-lg transition-colors ${
				showPreview
					? "bg-white text-black"
					: "border border-neutral-700 hover:bg-neutral-900"
			}`}
		>
			{showPreview ? "Hide Preview" : "Show Preview"}
		</button>
	);
}
