import type { Metadata } from "next";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import GameOfLifeLab from "./canvas";

export const metadata: Metadata = {
	title: "Game of Life",
	description:
		"Conway's Game of Life computed in Rust compiled to WebAssembly, with a live JavaScript benchmark and a canvas you can draw on.",
};

export default function GameOfLifePage() {
	return (
		<ExperimentFrame
			id="game-of-life"
			intro="Draw on the grid to add cells. Run the simulation, or switch between Rust and JavaScript to compare their execution times."
			aside={
				<div className="grid gap-8 md:grid-cols-2">
					<div>
						<h3 className="eyebrow mb-3">The rules</h3>
						<ul className="grid gap-2 font-serif text-base text-paper-2">
							<li>A live cell with fewer than two neighbours dies.</li>
							<li>A live cell with two or three neighbours survives.</li>
							<li>A live cell with more than three neighbours dies.</li>
							<li>A dead cell with exactly three neighbours is born.</li>
						</ul>
					</div>
					<div>
						<h3 className="eyebrow mb-3">Why WASM</h3>
						<p className="font-serif text-base text-paper-2">
							Every generation touches every cell and its eight neighbours. Rust
							does that on a contiguous buffer with no allocation; JavaScript
							can read the result straight out of linear memory, and the canvas
							uses that buffer to draw the cells.
						</p>
					</div>
				</div>
			}
		>
			<GameOfLifeLab />
		</ExperimentFrame>
	);
}
