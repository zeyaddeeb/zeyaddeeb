import type { NavItem } from "@zeyaddeeb/ui";
import Link from "next/link";

const navItems: NavItem[] = [
	{ label: "About", href: "/about" },
	{ label: "Experiments", href: "/experiments" },
	{ label: "Blog", href: "/blog" },
];

export default function StoryLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<StoryHeader navItems={navItems} />
			{children}
		</>
	);
}

function StoryHeader({ navItems }: { navItems: NavItem[] }) {
	return (
		<header className="fixed inset-x-0 top-0 z-50 border-b border-white/15 bg-[#090909]/92 text-[#f5f0e8] backdrop-blur-xl">
			<nav className="grid h-[76px] grid-cols-[76px_1fr] md:grid-cols-[92px_1fr_auto]">
				<Link
					href="/"
					className="flex h-full items-center justify-center bg-[#f5f0e8] text-[2.1rem] uppercase leading-none text-[#090909] transition-colors hover:bg-[#ff4d2e] hover:text-[#f5f0e8]"
					style={{ fontFamily: "var(--font-anton, inherit)" }}
					aria-label="Home"
				>
					Z
				</Link>

				<div className="hidden min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center border-r border-white/15 px-5 md:grid lg:px-7">
					<div className="min-w-0">
						<p className="font-mono text-[0.52rem] uppercase leading-none tracking-[0.34em] text-white/42">
							Scrollytelling experiment
						</p>
						<p
							className="mt-2 truncate text-[1.05rem] uppercase leading-none tracking-normal text-white"
							style={{ fontFamily: "var(--font-anton, inherit)" }}
						>
							From floppy to cloud
						</p>
					</div>
					<div className="hidden items-center gap-3 font-mono text-[0.52rem] uppercase tracking-[0.28em] text-white/46 lg:flex">
						<span>08 chapters</span>
						<span className="h-px w-12 bg-[#ff4d2e]" />
						<span>Personal chronology</span>
					</div>
				</div>

				<div className="grid grid-cols-3 md:flex">
					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							target={item.external ? "_blank" : undefined}
							rel={item.external ? "noopener noreferrer" : undefined}
							className="flex h-full items-center justify-center border-l border-white/15 px-3 font-mono text-[0.56rem] uppercase tracking-[0.22em] text-white/62 transition-colors hover:bg-[#f5f0e8] hover:text-[#090909] md:min-w-32 md:px-5"
						>
							{item.label}
						</Link>
					))}
				</div>
			</nav>
		</header>
	);
}
