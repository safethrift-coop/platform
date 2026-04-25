import path from "path";
import { PrismaPg } from "@prisma/adapter-pg";

export default {
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    adapter: new PrismaPg({
      connectionString:
        process.env["DATABASE_URL"] ??
        "postgresql://safethrift:safethrift_dev_password@localhost:5432/safethrift_dev",
    }),
  },
};
