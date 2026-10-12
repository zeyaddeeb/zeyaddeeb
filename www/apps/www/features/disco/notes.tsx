import { filmData } from "./film-data";
import { Note } from "./note";
import { Out } from "./out";
import "./notes.css";

const fewest = Math.min(...filmData.map((film) => film.moves.length));
const most = Math.max(...filmData.map((film) => film.moves.length));
const refused = (joins: string) => joins.split("0").length - 1;
const clock = (seconds: number) =>
	`${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;

export function Notes() {
	return (
		<div className="dd-notes">
			<div className="dd-notes__grid">
				<Note title="The original" open>
					<p>
						On January 7, 2003, Microsoft put Plus! Digital Media Edition on
						sale for $19.95. One of its parts was Plus! Dancer, which, in the
						company’s words, “turns the desktop into a dance floor with
						lifelike, high-definition 3-D characters that groove in time to the
						music that’s playing.” A small figure stood above the taskbar, on
						top of whatever you were doing, and danced.
					</p>
					<p>
						By October Microsoft counted “more than 2 million downloaded.” In
						Chrome and Edge the screen icon beside the clock does what the
						original did: it lifts the dancers into a small window that stays
						above your other work.
					</p>
				</Note>
				<Note title="The dancers">
					<p>
						Amanda, Kenny, Cobey, Josh, and Nickole &amp; Marcelo are the
						original performers, filmed for Microsoft. Their video and
						transparency masks were preserved by Sam Henri Gold’s{" "}
						<Out href="https://github.com/samhenrigold/MacPlusDancer">
							MacPlusDancer
						</Out>
						. The dancers and their footage belong to Microsoft; this is an
						independent tribute.
					</p>
					<p>
						The films are 320 by 240 pixels, and the dancer in them is about 150
						pixels tall. Each frame was enlarged by Real-ESRGAN, a model that
						redraws detail, then set down at twice the original size. The
						outline still comes from Microsoft’s own mask. What you see is
						sharper than 2003 and partly invented: a face a few pixels wide is
						the model’s guess.
					</p>
				</Note>
				<Note title="What is inside a dancer" wide>
					<div className="dd-notes__split">
						<div>
							<p>
								Each dancer’s file still carries its instructions, and they are
								the reason this page exists. A dancer is not one long film. It
								is a deck of {fewest} to {most} short moves, and every move
								begins and ends in the same stance on the same spot, so any move
								can be cut straight to any other.
							</p>
							<p>
								A table in the file has a yes or a no for every pair of moves.
								Almost all are yes. One move is set apart, and it turns out to
								be the entrance: Kenny walks on. The file also lists five
								speeds, 26, 28, 30, 32 and 34 frames a second. That is
								everything the 2003 player had to work with: deal a move, and
								run the film up to 13 percent faster or slower.
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
				<Note title="Dealing the deck">
					<p>
						The page deals the way the file allows. A dancer comes on with the
						entrance, then takes a move it has not done yet that the table
						permits after the last one, and goes through the whole deck before
						starting again. Two copies of the film run side by side, one playing
						and one already waiting on the first frame of the next move, so the
						cut costs nothing.
					</p>
					<p>
						The cards are those moves. Click one and it is danced next; click
						more and they queue. A card is dimmed when the table refuses it
						after the move before. I read the table as “this move may follow
						that one”; the file does not say which way round it runs.
					</p>
				</Note>
				<Note title="Keeping time">
					<p>
						The file gives no tempo, so the page does not guess one. When a move
						is about to start it works out how many beats of the tune the move
						would span at filmed speed, rounds that to a whole number, and runs
						the film a little faster or slower, inside its 26 to 34 frames a
						second, so the move ends exactly on a beat and the next begins
						there. Kenny’s first move is 259 frames; at 103 beats a minute it is
						fitted to 15 beats.
					</p>
					<p>
						When it deals, the page prefers moves that can be fitted at the
						tempo playing. A very short move sometimes cannot be, and then the
						next one starts late and the dancer has to find the beat again. The
						marks in the panel are drawn when a move starts, so what lines up is
						what happened. Steps inside a move are the dancer’s own; nothing
						here places them.
					</p>
				</Note>
				<Note title="The music">
					<p>
						There are no sound files. Each tune is a few hundred notes of data,
						played by oscillators and noise in the browser, and is meant to
						sound like the .mid files that sat in C:\WINDOWS\Media. Korobeiniki
						is a Russian folk song from the 1860s, and the Charleston tune
						starts from the rhythm James P. Johnson gave that dance in 1923.
						Everything else was written for this page in the manner of its
						style.
					</p>
					<p>
						Windows Media Player 9 had a Play Speed slider marked Slow, Normal
						and Fast. Microsoft’s notes for programmers say audio is hard to
						follow below 0.5 or above 1.5, which is the range of the slider
						here. Because these are notes and not recordings, changing speed
						does not change pitch.
					</p>
				</Note>
				<Note title="Tapping and moving">
					<p>
						Tapping takes the middle value of your last five gaps as the tempo,
						treats a gap near twice that as a missed tap, and starts over after
						two seconds of silence. The beat then carries on without you.
					</p>
					<p>
						Drag a dancer to move it, or focus it and use the arrow keys;
						double-click sends it back to the taskbar. Each film frame is cut
						out on the graphics card: Microsoft’s mask becomes the transparency,
						tightened a little so no dark fringe shows. The start button carries
						this site’s three shapes, not the Windows flag, and the wallpaper is
						Charles O’Rear’s 1996 photograph Bliss.
					</p>
				</Note>
				<Note title="What it does not do">
					<p>
						It does not listen to the room. The dancers follow this page’s own
						player or your taps, and cannot hear what else is playing on your
						computer. When a tune is too far from a dancer’s tempo for 26 to 34
						frames a second, even at half or double time, the panel says it is
						out of reach.
					</p>
					<p>
						I do not know how the 2003 player chose the next move or the speed;
						the file shows what it was allowed to do, not what it did. The
						enlarged films are easier on the eye but are no longer exactly what
						Microsoft shipped.
					</p>
				</Note>
				<Note title="Sources" wide>
					<ul className="dd-sources">
						<li>
							Microsoft,{" "}
							<Out href="https://news.microsoft.com/source/2002/12/16/microsoft-announces-plus-digital-media-edition-the-ultimate-photo-music-and-movie-enhancement-pack-for-windows-xp/">
								Microsoft Announces Plus! Digital Media Edition
							</Out>
							, December 16, 2002, and{" "}
							<Out href="https://news.microsoft.com/source/2003/10/14/microsoft-announces-updated-microsoft-plus-digital-media-edition-with-new-plus-photo-story-2/">
								the October 14, 2003 update
							</Out>
							.
						</li>
						<li>
							Sam Henri Gold,{" "}
							<Out href="https://github.com/samhenrigold/MacPlusDancer">
								MacPlusDancer
							</Out>
							: the original footage, masks and file tags (SegmentInfo,
							ConnectionTable, FrameRates). Artwork copyright Microsoft
							Corporation.
						</li>
						<li>
							Xintao Wang, Liangbin Xie, Chao Dong and Ying Shan,{" "}
							<Out href="https://github.com/xinntao/Real-ESRGAN">
								Real-ESRGAN
							</Out>
							: Training real-world blind super-resolution with pure synthetic
							data, ICCV Workshops 2021.
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
