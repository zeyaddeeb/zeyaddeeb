export function Footer() {
	return (
		<footer className="border-t border-neutral-800 px-6 py-8">
			<div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-neutral-500 md:flex-row">
				<p>© 2026 Zeyad Deeb. All rights reserved.</p>
				<div className="flex gap-6 uppercase tracking-widest">
					<a
						href="https://github.com/zeyaddeeb"
						className="transition-colors hover:text-white"
					>
						GitHub
					</a>
					<a
						href="https://linkedin.com/in/zeyaddeeb"
						className="transition-colors hover:text-white"
					>
						LinkedIn
					</a>
					<a
						href="https://twitter.com/zeyad_deeb"
						className="transition-colors hover:text-white"
					>
						Twitter
					</a>
				</div>
			</div>
		</footer>
	);
}
