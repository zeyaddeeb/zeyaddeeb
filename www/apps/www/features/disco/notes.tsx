import { Note } from "@/features/frame/note";
import { Out } from "@/features/frame/out";
import { filmData } from "./film-data";
import "./notes.css";

const fewest = Math.min(...filmData.map((film) => film.moves.length));
const most = Math.max(...filmData.map((film) => film.moves.length));
const refused = (joins: string) => joins.split("0").length - 1;
const clock = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

export function Notes() {
	return (
		<div className="dd-notes">
			<div className="notes-grid">
				<Note title="The original" open>
					<p>
						Microsoft released Plus! Digital Media Edition for Windows XP in
						January 2003, including Plus! Dancer: small full-motion video
						dancers that stood above the taskbar. Video and alpha masks for
						Amanda, Kenny, Cobey, Josh, and Nickole &amp; Marcelo were preserved
						by Sam Henri Gold’s{" "}
						<Out href="https://github.com/samhenrigold/MacPlusDancer">
							MacPlusDancer
						</Out>
						. Each 320×240 frame here was upscaled 2× with Real-ESRGAN while
						retaining Microsoft’s original alpha mask.
					</p>
				</Note>
				<Note title="Beat matching and synthesis">
					<p>
						Each file allows playback at 26, 28, 30, 32, or 34 fps (±13% around
						30 fps). Before a clip starts, the player rounds its natural
						duration to the nearest whole number of beats and adjusts playback
						rate within that range so the clip lands on the beat. Two video
						elements run in parallel to pre-cue the next clip for zero-latency
						cuts.
					</p>
					<p>
						Backing tracks are synthesized in the browser with Web Audio
						oscillators and noise, modeled after Windows XP’s built-in MIDI
						files. Tap tempo uses the median of your last five tap intervals.
					</p>
				</Note>
				<Note title="Segment tables" wide>
					<div className="dd-notes__split">
						<div>
							<p>
								Each dancer file is a deck of {fewest} to {most} short clips
								that begin and end in a neutral stance, paired with a transition
								matrix (<code>ConnectionTable</code>) marking which clips may
								follow which. An entrance clip plays first, followed by an
								unvisited valid transition until the deck cycles. Clicking cards
								queues specific moves; incompatible transitions are dimmed.
							</p>
						</div>
						<table className="dd-measured">
							<thead>
								<tr>
									<th scope="col">Dancer</th>
									<th scope="col">Style</th>
									<th scope="col">Moves</th>
									<th scope="col">Refused joins</th>
									<th scope="col">Runs for</th>
								</tr>
							</thead>
							<tbody>
								{filmData.map((film) => (
									<tr key={film.id}>
										<th scope="row">{film.name}</th>
										<td>{film.style}</td>
										<td>{film.moves.length}</td>
										<td>{refused(film.joins)}</td>
										<td>{clock(film.seconds)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Note>
				<Note title="Sources" wide>
					<ul className="notes-sources">
						<li>
							Microsoft,{" "}
							<Out href="https://news.microsoft.com/source/2002/12/16/microsoft-announces-plus-digital-media-edition-the-ultimate-photo-music-and-movie-enhancement-pack-for-windows-xp/">
								Plus! Digital Media Edition announcement
							</Out>{" "}
							(2002) and{" "}
							<Out href="https://news.microsoft.com/source/2003/10/14/microsoft-announces-updated-microsoft-plus-digital-media-edition-with-new-plus-photo-story-2/">
								October 2003 update
							</Out>
							.
						</li>
						<li>
							Sam Henri Gold,{" "}
							<Out href="https://github.com/samhenrigold/MacPlusDancer">
								MacPlusDancer
							</Out>{" "}
							(footage, masks, and segment metadata; artwork © Microsoft
							Corporation).
						</li>
						<li>
							Xintao Wang et al.,{" "}
							<Out href="https://github.com/xinntao/Real-ESRGAN">
								Real-ESRGAN
							</Out>
							, ICCV Workshops 2021.
						</li>
						<li>
							Microsoft,{" "}
							<Out href="https://learn.microsoft.com/en-us/windows/win32/wmp/wmplibiwmpsettings-iwmpsettings-rate--vb-and-c">
								IWMPSettings.rate
							</Out>
							, Windows Media Player SDK.
						</li>
					</ul>
				</Note>
			</div>
		</div>
	);
}
