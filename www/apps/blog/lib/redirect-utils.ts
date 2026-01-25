import { redirect as nextRedirect } from "next/navigation";

export const BASE_PATH = "/blog";

export function redirect(path: string): never {
	return nextRedirect(path);
}

export function getFullPath(path: string): string {
	if (path.startsWith(BASE_PATH)) {
		return path;
	}
	return `${BASE_PATH}${path}`;
}
