import { Express } from "express";
import swaggerUi from "swagger-ui-express";
import { getSwaggerDocs } from "./registry";

type SwaggerDocsSource = Record<string, unknown> | (() => Record<string, unknown>);

function resolveSwaggerDocs(source?: SwaggerDocsSource): Record<string, unknown> {
  if (!source) return getSwaggerDocs();
  return typeof source === "function" ? source() : source;
}

/**
 * Setup Swagger UI routes for the Express app.
 * Gọi sau khi routes đã draw; mặc định dùng `getSwaggerDocs()` (chỉ path `/api/*`).
 */
export function setupSwaggerUI(
  app: Express,
  swaggerDocs?: SwaggerDocsSource,
  path = "/docs",
) {
  const readDocs = () => resolveSwaggerDocs(swaggerDocs);

  app.get("/swagger.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(readDocs());
  });

  app.use(
    path,
    swaggerUi.serve,
    swaggerUi.setup(readDocs(), {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    }),
  );
}
