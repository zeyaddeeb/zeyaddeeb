import { initAuth } from "../src/index";

export const auth = initAuth({
	baseUrl: "http://localhost:3001",
	productionUrl: "http://localhost:3001",
	secret: "secret",
});
