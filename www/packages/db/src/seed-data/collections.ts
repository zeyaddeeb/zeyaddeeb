import type { NewCollectionItem } from "../schema/collections/collection-item";

export const collectionItemsSeedData: Omit<NewCollectionItem, "authorId">[] = [
	{
		type: "book",
		title: "Gödel, Escher, Bach: An Eternal Golden Braid",
		slug: "godel-escher-bach",
		description:
			"Douglas Hofstadter's exploration of consciousness and self-reference through the lens of mathematics, art, and music.",
		url: "https://en.wikipedia.org/wiki/G%C3%B6del,_Escher,_Bach",
		imageUrl:
			"https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Godel%2C_Escher%2C_Bach_%28first_edition%29.jpg/500px-Godel%2C_Escher%2C_Bach_%28first_edition%29.jpg",
		thumbnailUrl: null,
		accentColor: "#8B4513",
		gridSize: "large",
		displayOrder: 1,
		metadata: {
			author: "Douglas Hofstadter",
			publishedYear: 1979,
			genre: ["Philosophy", "Computer Science", "Mathematics"],
			quote:
				"In the end, we self-perceiving, self-inventing, locked-in mirages are little miracles of self-reference.",
		},
		tags: ["consciousness", "mathematics", "philosophy", "ai"],
		featured: false,
		published: true,
	},
];
