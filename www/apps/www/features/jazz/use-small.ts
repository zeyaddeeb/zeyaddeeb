"use client";

import { useEffect, useState } from "react";

export function useSmall(query = "(max-width: 900px)") {
	const [small, setSmall] = useState(false);

	useEffect(() => {
		const media = window.matchMedia(query);
		const update = () => setSmall(media.matches);

		update();
		media.addEventListener("change", update);

		return () => media.removeEventListener("change", update);
	}, [query]);

	return small;
}
