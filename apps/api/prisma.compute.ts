import { defineComputeConfig } from "@prisma/compute-sdk/config";

export default defineComputeConfig({
  app: {
    name: "chainos-api",
    framework: "nestjs",
    httpPort: 3001,
  },
});
