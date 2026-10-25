import { experimentMetadata } from "@/features/catalog/catalog";
import { ExperimentFrame } from "@/features/frame/experiment-frame";
import GameOfLifeLab from "@/features/life/canvas";

export const metadata = experimentMetadata(
	"game-of-life",
	"Conway's Game of Life computed in Rust compiled to WebAssembly, with a live JavaScript benchmark and a canvas you can draw on.",
);

export default function GameOfLifePage() {
	return (
		<ExperimentFrame
			id="game-of-life"
			intro="Draw on the grid to add cells. Run the simulation, or switch between Rust and JavaScript to compare their execution times."
			aside={
				<div className="notes-columns">
					<section>
						<h3>The rules</h3>
						<ul className="notes-list">
							<li>A live cell with fewer than two neighbors dies.</li>
							<li>A live cell with two or three neighbors survives.</li>
							<li>A live cell with more than three neighbors dies.</li>
							<li>A dead cell with exactly three neighbors is born.</li>
						</ul>
					</section>
					<section>
						<h3>Why WASM</h3>
						<p>
							Every generation touches every cell and its eight neighbors. Rust
							does that on a contiguous buffer with no allocation; JavaScript
							can read the result straight out of linear memory, and the canvas
							uses that buffer to draw the cells.
						</p>
					</section>
				</div>
			}
		>
			<GameOfLifeLab />
		</ExperimentFrame>
	);
}
