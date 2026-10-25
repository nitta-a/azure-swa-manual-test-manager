import type { TestRunItem } from "@manual-test-manager/domain";
import { ETagConflictError, type Versioned } from "@manual-test-manager/storage";
import type { ServiceContext } from "./context.js";

export async function recoverItems(context: ServiceContext, runId: string): Promise<Array<Versioned<TestRunItem>>> {
  const items = await context.repositories.items.listByRun(runId);
  return Promise.all(
    items.map(async (item) => {
      if (!item.value.pendingExecution) return item;
      await context.repositories.executions.create(item.value.pendingExecution);
      const restored = { ...item.value };
      delete restored.pendingExecution;
      try {
        return await context.repositories.items.update(restored, item.etag);
      } catch (error) {
        if (!(error instanceof ETagConflictError)) throw error;
        // A concurrent recovery or execution won; never overwrite its result.
        const current = await context.repositories.items.get(runId, item.value.id);
        if (!current) throw new Error("test item disappeared during recovery");
        return current;
      }
    }),
  );
}
