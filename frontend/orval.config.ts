import { defineConfig } from "orval";

export default defineConfig({
  api: {
    input: {
      target: "http://localhost:8000/openapi.json",
    },
    output: {
      target: "./src/api/endpoints.ts",
      schemas: "./src/api/models",
      client: "react-query",
      httpClient: "fetch",
      mode: "tags-split",
      override: {
        query: {
          useQuery: true,
        },
        useDates: true,
      },
    },
  },
});
