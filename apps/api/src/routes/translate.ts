import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePerm } from "../auth/jwt";
import { translateText } from "../lib/translate";
import { parseWithSchema } from "./hrUtils";

const translateBodySchema = z.object({
  text: z.string(),
  target: z.enum(["zh", "en"])
});

export async function registerTranslateRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", app.authenticate);

  app.post("/translate", { preHandler: requirePerm("recruitment.view") }, async (request) => {
    const body = parseWithSchema(translateBodySchema, request.body);
    if (!body.text.trim()) return { text: "" };

    try {
      const translated = await translateText(body.text, body.target);
      return { text: translated?.text ?? "" };
    } catch {
      return { text: "" };
    }
  });
}
