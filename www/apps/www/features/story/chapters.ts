export type ScreenId =
	| "post"
	| "dos"
	| "floppy"
	| "basic"
	| "source"
	| "python"
	| "cluster"
	| "rust"
	| "prompt";

export interface Chapter {
	id: ScreenId;
	era: string;
	title: string;
	program: string;
	body: string;
	quote: string;
	materials: string[];
	hint: string;
}

export const chapters: Chapter[] = [
	{
		id: "post",
		era: "Mid 1990s",
		title: "Building blocks",
		program: "POST",
		body: "The first time I built a PC from parts, it was like putting together a puzzle with no picture on the box. Each component either clicked into place or didn’t fit at all. When it finally powered on, it felt like I had created something from nothing.",
		quote: "The machine was something I put together with my own hands.",
		materials: ["486 DX2", "8 MB RAM", "120 MB HDD", "SVGA"],
		hint: "Power on. The machine counts the memory it finds.",
	},
	{
		id: "dos",
		era: "Late 1990s",
		title: "Blinking cursor",
		program: "COMMAND.COM",
		body: "It started with a black screen and a cursor. No instructions, no clues, just a quiet invitation to type. All I wanted was to play Prince of Persia, but first I had to learn how to talk to the machine.",
		quote: "The first interface was a blank slate.",
		materials: ["MS-DOS 6.22", "DIR", "CD", "Patience"],
		hint: "Click the screen and type dir. The game is in there somewhere.",
	},
	{
		id: "floppy",
		era: "Late 1990s",
		title: "Prince of Persia",
		program: "PRINCE.EXE",
		body: "Two floppy disks and thirty minutes of anticipation before the world appeared. A pixelated prince leapt over guards, missed ledges, and fell into spikes. It was the first time software felt less like a tool and more like a place someone had imagined into existence.",
		quote: "Loading became part of the myth.",
		materials: ["Two 3.5″ floppies", "Disk swap", "60 minutes"],
		hint: "Loading is slow on purpose. Swap the disk when it asks.",
	},
	{
		id: "source",
		era: "2003",
		title: "Markup fever",
		program: "index.html",
		body: "Right-click, View Source. Suddenly the surface of the web had a skeleton. A library book taught me HTML, then CSS, and the page stopped being magic without becoming less magical.",
		quote: "The web was readable by anyone curious enough.",
		materials: ["HTML 4", "CSS", "Notepad", "View Source"],
		hint: "The source is the page. Edit one side and watch the other.",
	},
	{
		id: "python",
		era: "2008–2016",
		title: "func()",
		program: "python2.7",
		body: "I started with Python 2 because it was the language of a popular Minecraft modding tutorial. It felt like a more polite version of JavaScript, with fewer ways to shoot myself in the foot. But as I built more, I found libraries that did way more than I expected, and the weird parts of Python became a map to new possibilities.",
		quote: "The language was a toolbox with some hidden compartments.",
		materials: ["Python 2.7", "pip", "The Zen"],
		hint: "A session, replayed: one function, then import this.",
	},
	{
		id: "cluster",
		era: "2016–2020",
		title: "kubectl apply",
		program: "kubectl get pods -w",
		body: "Docker made the application portable. Kubernetes made the system explicit. I stopped thinking only in functions and started thinking in rollout, recovery, traces, and blast radius.",
		quote: "The shape of software got bigger.",
		materials: ["Docker", "Kubernetes", "Tracing"],
		hint: "Six replicas are desired. Delete a pod and watch the controller replace it.",
	},
	{
		id: "rust",
		era: "2020–now",
		title: "Borrow checked",
		program: "life.wasm",
		body: "Rust was exacting in the best way. No garbage collector, no undefined behavior, no vague ownership. Every error message was a small lesson in building with more care.",
		quote: "The compiler made rigor feel humane.",
		materials: ["Rust", "wasm-bindgen", "Ownership"],
		hint: "Conway’s Life, computed in Rust and compiled to WebAssembly. Draw on it.",
	},
	{
		id: "prompt",
		era: "Now",
		title: "What comes next",
		program: "sh",
		body: "Kubernetes, Rust, AI. Real-time collaboration, distributed inference, language models that write and read code. The old cursor is still here, but now it feels like a doorway.",
		quote: "The prompt is another beginning.",
		materials: ["AI", "CRDTs", "Realtime"],
		hint: "Type help. The prompt opens onto the rest of the site.",
	},
];

export const chapterIndex = (id: ScreenId) =>
	chapters.findIndex((c) => c.id === id);
