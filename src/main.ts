import { bootstrapApplication } from "./core/bootstrap";

void bootstrapApplication().catch((error: unknown): void => {
  console.error("[main] Application startup error:", error);
});
