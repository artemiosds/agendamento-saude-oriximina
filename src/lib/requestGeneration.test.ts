import { describe, expect, it } from "vitest";
import { createRequestGeneration, isRequestCurrent } from "@/lib/requestGeneration";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("createRequestGeneration", () => {
  it("ignores an older response when a newer filter request finishes first", async () => {
    const requests = createRequestGeneration();
    const oldResponse = deferred<string>();
    const currentResponse = deferred<string>();
    const applied: string[] = [];
    const oldId = requests.next();
    const currentId = requests.next();

    const oldTask = oldResponse.promise.then((value) => {
      if (requests.isCurrent(oldId)) applied.push(value);
    });
    const currentTask = currentResponse.promise.then((value) => {
      if (requests.isCurrent(currentId)) applied.push(value);
    });

    currentResponse.resolve("filtro atual");
    await currentTask;
    oldResponse.resolve("filtro anterior");
    await oldTask;

    expect(applied).toEqual(["filtro atual"]);
  });

  it("invalidates pending work when its owner unmounts or changes scope", async () => {
    const requests = createRequestGeneration();
    const response = deferred<string>();
    const applied: string[] = [];
    const requestId = requests.next();
    const task = response.promise.then((value) => {
      if (requests.isCurrent(requestId)) applied.push(value);
    });

    requests.invalidate();
    response.resolve("unidade anterior");
    await task;

    expect(applied).toEqual([]);
  });

  it("rejects a still-latest response when page, filters, unit, or selected cycle changed", () => {
    const requests = createRequestGeneration();
    const requestId = requests.next();

    expect(isRequestCurrent(requests, requestId, "unit-a|page-1|status-all", "unit-b|page-1|status-all")).toBe(false);
    expect(isRequestCurrent(requests, requestId, "unit-a|page-1|status-all", "unit-a|page-2|status-all")).toBe(false);
    expect(isRequestCurrent(requests, requestId, "cycle-a", "cycle-b")).toBe(false);
    expect(isRequestCurrent(requests, requestId, "unit-a|page-1|status-all", "unit-a|page-1|status-all")).toBe(true);
  });
});
