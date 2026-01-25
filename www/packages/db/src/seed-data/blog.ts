import type { NewPost } from "../schema/blog/post";

export const blogPostsSeedData: Omit<NewPost, "authorId">[] = [];
