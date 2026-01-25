"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithEmail } from "@/lib/actions/auth";
import { getFullPath } from "@/lib/redirect-utils";

export default function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setIsLoading(true);
		setError(null);

		try {
			const result = await signInWithEmail(email, password);

			if (result.error) {
				setError(result.error);
				setIsLoading(false);
				return;
			}

			router.refresh();
			window.location.href = getFullPath("/write/dashboard");
		} catch {
			setError("An error occurred. Please try again.");
			setIsLoading(false);
		}
	};

	return (
		<main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6">
			<div className="w-full max-w-md">
				<h1 className="text-3xl font-bold text-center mb-8">Sign In</h1>

				{error && (
					<div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className="space-y-6">
					<div>
						<label htmlFor="email" className="block text-sm font-medium mb-2">
							Email
						</label>
						<input
							id="email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 transition-colors"
							placeholder="you@example.com"
							required
						/>
					</div>

					<div>
						<label
							htmlFor="password"
							className="block text-sm font-medium mb-2"
						>
							Password
						</label>
						<input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							className="w-full px-4 py-3 bg-neutral-900 border border-neutral-800 rounded-lg focus:outline-none focus:border-neutral-600 transition-colors"
							placeholder="••••••••"
							required
						/>
					</div>

					<button
						type="submit"
						disabled={isLoading}
						className="w-full px-6 py-3 bg-white text-black font-medium rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isLoading ? "Signing in..." : "Sign In"}
					</button>
				</form>

				<p className="mt-8 text-center text-neutral-500 text-sm">
					Only authorized users can access this area.
				</p>
			</div>
		</main>
	);
}
