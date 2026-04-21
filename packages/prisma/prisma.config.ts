import path from "path";

export default {
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://safethrift:safethrift_dev_password@localhost:5434/safethrift_dev",
  },
};
