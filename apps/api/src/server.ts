import { buildApp } from "./app";
import { env } from "./env";

const app = await buildApp();

try {
  const address = await app.listen({
    port: env.PORT,
    host: "0.0.0.0"
  });

  app.log.info(`API listening at ${address}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
