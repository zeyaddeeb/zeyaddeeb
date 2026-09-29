import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import "./notes.css";

function Out({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a href={href} className="at-out">
			{children}
			<LifeArrow direction="up-right" className="at-out__arrow" />
		</a>
	);
}

export function Notes() {
	return (
		<div className="at-notes">
			<h3>What an attractor is</h3>
			<p>
				Leave a system alone and it drifts toward a few favorite ways of
				behaving. A swinging pendulum with friction ends up hanging still. A
				pendulum clock ends up ticking at its own beat, however hard you first
				pushed it. Those end states are attractors. The{" "}
				<Out href="https://en.wikipedia.org/wiki/Attractor">
					Wikipedia article
				</Out>{" "}
				sorts them into kinds: a point (resting), a loop (a clock), and the
				strange ones that never repeat but never wander off either. This wheel
				has all three.
			</p>

			<h3>The wheel is the Lorenz system</h3>
			<p>
				Willem Malkus and Lou Howard built a wheel of leaky cups at MIT to act
				out Edward Lorenz’s weather equations. Steven Strogatz derives why it
				works in <em>Nonlinear Dynamics and Chaos</em> (section 9.1). Write the
				water on the rim as a Fourier series. Only the first harmonic, a₁ sin θ
				+ b₁ cos θ, drives the wheel, and it obeys
			</p>
			<p className="at-notes__math">
				ȧ₁ = ω b₁ − K a₁
				<br />
				ḃ₁ = −ω a₁ − K b₁ + q₁
				<br />
				ω̇ = (−ν ω + π g r a₁) / I
			</p>
			<p>
				Here K is the leak rate, ν the friction, I the inertia and q₁ how
				unevenly the tap pours. Measure time in units of 1/K and set x = ω/K, y
				= (πgr/Kν) a₁ and z = ρ − (πgr/Kν) b₁. These become Lorenz’s equations,
				ẋ = σ(y − x), ẏ = ρx − y − xz, ż = xy − βz, with σ = ν/(IK), ρ = πgr
				q₁/(K²ν) and β = 1. Lorenz’s own β = 8/3 came from the shape of his
				convection rolls. The wheel’s β is 1 because both halves of the water
				drain at the same rate. So this page’s butterfly is the wheel’s, a
				little different from the famous picture. The water slider is ρ, and σ
				is fixed at 10.
			</p>
			<p>
				a₁ and b₁ say where the water’s weight sits. That is why the white dot
				in the wheel and the path next to it are the same motion seen two ways.
				Each cup’s level on screen is a₁ sin θ + b₁ cos θ plus a constant,
				sampled at the cup.
			</p>

			<h3>What the tap covers</h3>
			<p>
				Every threshold below was measured with this page’s own Rust code, not
				copied from the classic β = 8/3 values.
			</p>
			<ul className="at-notes__list">
				<li>
					<strong>ρ below 1:</strong> the wheel rests. The leaks win before the
					top gets heavy enough to tip it.
				</li>
				<li>
					<strong>1 to 8.18:</strong> it tips and turns steadily the way it
					started to fall. These are two fixed points, one per direction.
				</li>
				<li>
					<strong>8.18 to about 14.9:</strong> after the homoclinic point at
					8.18, the wheel coming out of rest swings past and settles the other
					way. Which way a start ends up folds into thin interleaved bands, so a
					few wheels started in one spot can split, and transients get long.
				</li>
				<li>
					<strong>About 14.9 to 17.5:</strong> a strange attractor appears while
					steady turning is still stable. Some starts settle into turning, and
					their neighbors tumble forever.
				</li>
				<li>
					<strong>Above 17.5:</strong> the steady turns become unstable. That is
					the Hopf point σ(σ + β + 3)/(σ − β − 1), which for σ = 10 and β = 1 is
					exactly 17.5.
				</li>
				<li>
					<strong>Clock windows:</strong> at about 26.75–27.75, 40–41.5 and
					326–362, the wheel locks into a repeating back-and-forth, a limit
					cycle. The page checks for this by timing the reversals: at 27 and 345
					they repeat to within 2%, at 28.5 they don’t.
				</li>
			</ul>
			<p>
				The water slider is square-root scaled up to 45, then jumps to 316–350
				so the widest clock window fits. The five buttons under it jump to 0.6,
				5, 12, 28 and 340. The two narrow clock windows near 27 and 40 are
				marked on the slider as short ticks.
			</p>

			<h3>How the pictures are made</h3>
			<p>
				A small Rust module, <code>attractor.rs</code>, compiled to WebAssembly,
				integrates the equations with fourth-order Runge–Kutta at a step of
				0.005 time units. Playback runs slower as the tap opens, so the wheel
				stays readable, and Faster doubles it. That’s why the rounding panel
				measures time in seconds on your screen, not in model time.
			</p>
			<p>
				Twins run in a Rust <code>Swarm</code> alongside the main wheel. “Add
				100 twins” scatters them uniformly within ±0.15 of the wheel’s three
				numbers, which is under 1% of its spin at the default flow. Tapping the
				path starts 40 within ±1.5% of the view. The path only shows spin and
				height, so a tap sets the third number, the lean, equal to the spin, the
				relation that holds at both steady turns. A wheel counts as settled once
				it comes inside a small ball around a steady turn. The ball shrinks
				toward the Hopf point at 17.5, and the Rust tests check that every start
				counted as settled is still there 600 time units later. They also check
				that at ρ = 28, neighboring starts on a grid disagree about their final
				direction more than 30% of the time, against under 10% at ρ = 5.
			</p>

			<h3>The rounding error</h3>
			<p>
				Lorenz’s 1961 rerun used his 12-variable weather model on a Royal McBee
				LGP-30, not these three equations. The copy here plays the same trick on
				the wheel: it takes the wheel’s three numbers, rounds them to three
				decimals as his printout did, and runs both. The pace is fitted to the
				straight part of the log-scale gap, while it is between ten times the
				first gap and a tenth of the attractor’s size. At low water the gap
				shrinks instead, because a steady turn pulls every nearby start onto
				itself.
			</p>
			<p>
				Whether this “butterfly” is really a strange attractor, and not a trick
				of rounding, stayed open for decades. Warwick Tucker settled it for
				Lorenz’s classic case in 2002 with a computer-assisted proof. The{" "}
				<Link href="/experiments/proofs" className="at-out">
					proofs experiment
					<LifeArrow direction="right" seed={12} className="at-out__arrow" />
				</Link>{" "}
				is about proofs like that.
			</p>

			<h3>Sources</h3>
			<ol className="at-sources">
				<li>
					Edward N. Lorenz, “Deterministic Nonperiodic Flow,”{" "}
					<em>Journal of the Atmospheric Sciences</em> 20 (1963): 130–141.
				</li>
				<li>
					Steven H. Strogatz, <em>Nonlinear Dynamics and Chaos</em>, section
					9.1, “A Chaotic Waterwheel.”
				</li>
				<li>
					James Gleick, <em>Chaos: Making a New Science</em> (1987), for the
					printout story.
				</li>
				<li>
					Warwick Tucker, “A Rigorous ODE Solver and Smale’s 14th Problem,”{" "}
					<em>Foundations of Computational Mathematics</em> 2 (2002): 53–117.
				</li>
				<li>
					<Out href="https://en.wikipedia.org/wiki/Malkus_waterwheel">
						Malkus waterwheel
					</Out>{" "}
					and{" "}
					<Out href="https://en.wikipedia.org/wiki/Lorenz_system">
						Lorenz system
					</Out>{" "}
					on Wikipedia.
				</li>
			</ol>
		</div>
	);
}
