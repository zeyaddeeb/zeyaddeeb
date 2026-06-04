import Link from "next/link";

const navItems = [
	{ label: "Work", href: "#work" },
	{ label: "Stack", href: "#stack" },
	{ label: "Contact", href: "#contact" },
];

export default function ResumeLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<header className="fixed inset-x-0 top-0 z-50 border-b border-[#111]/15 bg-[#f3efe5]/88 text-[#111] backdrop-blur-xl">
				<nav className="grid h-[72px] grid-cols-[72px_1fr] md:grid-cols-[88px_1fr_auto]">
					<Link
						href="/"
						className="flex h-full items-center justify-center bg-[#111] text-[2rem] uppercase leading-none text-[#f3efe5] transition-colors hover:bg-[#0b7c74]"
						style={{ fontFamily: "var(--font-anton, inherit)" }}
						aria-label="Home"
					>
						Z
					</Link>

					<div className="hidden min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center border-r border-[#111]/15 px-5 md:grid lg:px-7">
						<div className="min-w-0">
							<p className="font-mono text-[0.52rem] uppercase leading-none tracking-[0.34em] text-[#111]/45">
								Resume / curriculum vitae
							</p>
							<p
								className="mt-2 truncate text-[1.04rem] uppercase leading-none text-[#111]"
								style={{ fontFamily: "var(--font-anton, inherit)" }}
							>
								Zeyad Deeb
							</p>
						</div>
						<div className="hidden items-center gap-3 font-mono text-[0.52rem] uppercase tracking-[0.28em] text-[#111]/46 lg:flex">
							<span>Brooklyn, NY</span>
							<span className="h-px w-12 bg-[#0b7c74]" />
							<span>AI / Systems / Product</span>
						</div>
					</div>

					<div className="grid grid-cols-3 md:flex">
						{navItems.map((item) => (
							<a
								key={item.href}
								href={item.href}
								className="flex h-full items-center justify-center border-l border-[#111]/15 px-3 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-[#111]/62 transition-colors hover:bg-[#111] hover:text-[#f3efe5] md:min-w-28 md:px-5"
							>
								{item.label}
							</a>
						))}
					</div>
				</nav>
			</header>
			{children}
		</>
	);
}
