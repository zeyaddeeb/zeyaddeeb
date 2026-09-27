"use client";

import { type ReactNode, useId } from "react";

const inputBaseClass =
	"w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 transition-colors";

interface FormFieldProps {
	label: string;
	htmlFor: string;
	required?: boolean;
	children: ReactNode;
}

export function FormField({
	label,
	htmlFor,
	required,
	children,
}: FormFieldProps) {
	return (
		<div>
			<label htmlFor={htmlFor} className="block text-sm font-medium mb-2">
				{label}
				{required && <span className="text-red-400 ml-1">*</span>}
			</label>
			{children}
		</div>
	);
}

interface TextInputProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	required?: boolean;
	type?: "text" | "url" | "number";
}

export function TextInput({
	label,
	value,
	onChange,
	placeholder,
	required,
	type = "text",
}: TextInputProps) {
	const id = useId();
	return (
		<FormField label={label} htmlFor={id} required={required}>
			<input
				id={id}
				type={type}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className={inputBaseClass}
				placeholder={placeholder}
				required={required}
			/>
		</FormField>
	);
}

interface TextAreaInputProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	required?: boolean;
	className?: string;
}

export function TextAreaInput({
	label,
	value,
	onChange,
	placeholder,
	rows = 3,
	required,
	className,
}: TextAreaInputProps) {
	const id = useId();
	return (
		<FormField label={label} htmlFor={id} required={required}>
			<textarea
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={rows}
				className={`${inputBaseClass} ${className || ""}`}
				placeholder={placeholder}
				required={required}
			/>
		</FormField>
	);
}

interface SelectInputProps<T extends string> {
	label: string;
	value: T;
	onChange: (value: T) => void;
	options: readonly T[];
	getOptionLabel?: (option: T) => string;
}

export function SelectInput<T extends string>({
	label,
	value,
	onChange,
	options,
	getOptionLabel = (o) => o.charAt(0).toUpperCase() + o.slice(1),
}: SelectInputProps<T>) {
	const id = useId();
	return (
		<FormField label={label} htmlFor={id}>
			<select
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value as T)}
				className={inputBaseClass}
			>
				{options.map((option) => (
					<option key={option} value={option}>
						{getOptionLabel(option)}
					</option>
				))}
			</select>
		</FormField>
	);
}

interface CheckboxInputProps {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}

export function CheckboxInput({
	label,
	checked,
	onChange,
}: CheckboxInputProps) {
	const id = useId();
	return (
		<div className="flex items-center gap-3">
			<input
				id={id}
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="w-4 h-4 bg-neutral-900 border-neutral-800 rounded focus:ring-neutral-600"
			/>
			<label htmlFor={id} className="text-sm">
				{label}
			</label>
		</div>
	);
}

interface ColorPickerProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

export function ColorPicker({
	label,
	value,
	onChange,
	placeholder = "#ff6b6b",
}: ColorPickerProps) {
	const id = useId();
	return (
		<FormField label={label} htmlFor={id}>
			<div className="flex gap-2">
				<input
					id={id}
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className={`flex-1 ${inputBaseClass}`}
					placeholder={placeholder}
				/>
				<input
					type="color"
					value={value || "#ffffff"}
					onChange={(e) => onChange(e.target.value)}
					className="w-12 h-12 rounded-lg cursor-pointer bg-neutral-900 border border-neutral-800"
				/>
			</div>
		</FormField>
	);
}

interface NumberInputProps {
	label: string;
	value: number;
	onChange: (value: number) => void;
}

export function NumberInput({ label, value, onChange }: NumberInputProps) {
	const id = useId();
	return (
		<FormField label={label} htmlFor={id}>
			<input
				id={id}
				type="number"
				value={value}
				onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
				className={inputBaseClass}
			/>
		</FormField>
	);
}
