interface PictureWindows {
	requestWindow(size: { width: number; height: number }): Promise<Window>;
}

export interface Popped {
	view: Window;
	canvas: HTMLCanvasElement;
}

const pictures = () =>
	(window as unknown as { documentPictureInPicture?: PictureWindows })
		.documentPictureInPicture;

export const canPopOut = () => Boolean(pictures());

export async function popOut(taskbar: string): Promise<Popped | null> {
	const view = await pictures()?.requestWindow({ width: 320, height: 340 });

	if (!view) return null;

	const page = view.document;
	const wallpaper = new URL("/desktop-disco/bliss.jpg", window.location.href);
	const bar = page.createElement("div");
	const canvas = page.createElement("canvas");

	page.title = "Desktop Disco";
	page.body.style.cssText = `margin:0;overflow:hidden;background:#3a6ea5 url("${wallpaper.href}") center/cover`;
	bar.style.cssText = `position:fixed;inset:auto 0 0;height:30px;background:${taskbar}`;
	canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%";
	page.body.append(bar, canvas);

	return { view, canvas };
}
