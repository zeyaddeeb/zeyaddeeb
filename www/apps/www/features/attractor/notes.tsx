import { LifeArrow } from "@zeyaddeeb/ui";
import Link from "next/link";
import { Out } from "@/features/frame/out";
import "./notes.css";

export function Notes() {
	return (
		<div className="at-notes">
			<h3>The Malkus waterwheel and the Lorenz system</h3>
			<p>
				Willem Malkus and Lou Howard constructed a leaky waterwheel at MIT as a
				mechanical realization of Edward Lorenz’s equations. Expanding the rim’s
				water distribution in a Fourier series (Strogatz,{" "}
				<em>Nonlinear Dynamics and Chaos</em>, §9.1), only the first harmonic{" "}
				<code>a₁ sin θ + b₁ cos θ</code> exerts torque:
			</p>
			<p className="at-notes__math">
				ȧ₁ = ω b₁ − K a₁
				<br />
				ḃ₁ = −ω a₁ − K b₁ + q₁
				<br />
				ω̇ = (−ν ω + π g r a₁) / I
			</p>
			<p>
				With leak rate <em>K</em>, damping <em>ν</em>, moment of inertia{" "}
				<em>I</em>, and inflow <em>q₁</em>, rescaling time by 1/<em>K</em> and
				setting <code>x = ω/K</code>, <code>y = (πgr/Kν) a₁</code>, and{" "}
				<code>z = ρ − (πgr/Kν) b₁</code> yields the Lorenz system{" "}
				<code>ẋ = σ(y − x)</code>, <code>ẏ = ρx − y − xz</code>,{" "}
				<code>ż = xy − βz</code> with <code>σ = 10</code>,{" "}
				<code>ρ = πgr q₁/(K²ν)</code>, and <code>β = 1</code>.
			</p>

			<h3>Regimes across flow rate ρ</h3>
			<ul className="notes-list">
				<li>
					ρ &lt; 1: the origin is globally stable and the wheel comes to rest.
				</li>
				<li>
					1 &lt; ρ &lt; 8.18: pitchfork bifurcation into two stable fixed points
					corresponding to steady clockwise or counterclockwise rotation.
				</li>
				<li>
					8.18 &lt; ρ &lt; 17.5: past the homoclinic bifurcation at 8.18, basin
					boundaries fold and a strange attractor coexists with the stable
					rotations above ρ ≈ 14.9.
				</li>
				<li>
					ρ &gt; 17.5: subcritical Hopf bifurcation at{" "}
					<code>σ(σ + β + 3)/(σ − β − 1) = 17.5</code> destabilizes steady
					rotation into chaotic reversals, interrupted by periodic limit-cycle
					windows around 26.75–27.75, 40–41.5, and 326–362.
				</li>
			</ul>

			<h3>Simulation and sensitivity</h3>
			<p>
				<code>attractor.rs</code> integrates the system in WebAssembly using
				fourth-order Runge–Kutta (<code>dt = 0.005</code>), alongside a{" "}
				<code>Swarm</code> of perturbed trajectories and a three-decimal rounded
				twin modeled on Lorenz’s 1961 Royal McBee LGP-30 printout rerun. Warwick
				Tucker proved in 2002 via validated numerics that the Lorenz attractor
				is genuinely chaotic rather than a floating-point artifact (see{" "}
				<Link href="/experiments/proofs" className="notes-out">
					No Goals
					<LifeArrow direction="right" seed={12} className="notes-out__arrow" />
				</Link>
				).
			</p>

			<h3>Sources</h3>
			<ol className="notes-sources">
				<li>
					Edward N. Lorenz, “Deterministic Nonperiodic Flow,”{" "}
					<em>Journal of the Atmospheric Sciences</em> 20 (1963): 130–141.
				</li>
				<li>
					Steven H. Strogatz, <em>Nonlinear Dynamics and Chaos</em>, §9.1.
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
