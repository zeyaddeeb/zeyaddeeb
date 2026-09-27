export const COLLECTION_ITEM_TYPES = [
	"wikipedia",
	"art",
	"book",
	"youtube",
	"product",
	"music",
	"article",
	"podcast",
	"movie",
	"github",
	"other",
] as const;

export const GRID_SIZES = ["small", "medium", "large"] as const;
export type GridSize = (typeof GRID_SIZES)[number];
