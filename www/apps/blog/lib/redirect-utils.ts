export const BASE_PATH = "/blog";

export function getFullPath(path: string): string {
	if (path.startsWith(BASE_PATH)) {
		return path;
	}
	return `${BASE_PATH}${path}`;
}
