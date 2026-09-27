interface WriteNoticeProps {
	title: string;
	message: string;
}

export function WriteNotice({ title, message }: WriteNoticeProps) {
	return (
		<main className="min-h-screen bg-neutral-950 text-white px-6 py-12">
			<div className="max-w-2xl mx-auto text-center">
				<h1 className="text-3xl font-bold text-red-500">{title}</h1>
				<p className="mt-4 text-neutral-400">{message}</p>
			</div>
		</main>
	);
}

export function AccessDenied() {
	return (
		<WriteNotice
			title="Access Denied"
			message="You don't have permission to access this page."
		/>
	);
}
